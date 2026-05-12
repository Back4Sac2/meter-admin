'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, X, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { getCompletedRecords, type MeterRecord } from '@/app/admin/meter/_actions';

// 도면번호 + 지침 + 봉인유무가 모두 있어야 '처리됨'으로 간주
type ParsedRow = {
  row_no: string | null;
  block: string | null;
  old_meter_number: string | null;
  reading: string | null;   // 지침
  sealed: string | null;    // 봉인유무
};

function str(v: unknown): string | null {
  return v != null && String(v).trim() !== '' ? String(v).trim() : null;
}

function parseExcel(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: false });
        if (raw.length === 0) { resolve([]); return; }

        // 결과 엑셀 형식: 첫 행이 '블록', '도면번호' 헤더
        const isResultFormat = '블록' in (raw[0] as object) && '도면번호' in (raw[0] as object);

        const rows: ParsedRow[] = isResultFormat
          ? raw.map((r) => ({
              row_no: str(r['도면번호']),
              block: str(r['블록']),
              old_meter_number: str(r['기물번호(기존)']),
              reading: str(r['지침']),
              sealed: str(r['봉인유무']),
            }))
          : raw.slice(2).map((r) => ({  // 업로드 엑셀: 서브헤더 2행 스킵
              row_no: str(r['도면번호']),
              block: str(r['블록\r\n구분']),
              old_meter_number: str(r['__EMPTY_7']),
              reading: str(r['__EMPTY_13']),
              sealed: str(r['__EMPTY_14']),
            }));

        resolve(rows.filter((r) => r.row_no || r.block || r.old_meter_number));
      } catch {
        reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function buildExcludeKeys(rows: ParsedRow[]) {
  const byMeter = new Set<string>();
  const byPos = new Set<string>();
  for (const r of rows) {
    // 도면번호 + 지침 + 봉인유무가 모두 입력된 행만 제외 대상
    if (!r.row_no || !r.reading || !r.sealed) continue;
    if (r.old_meter_number) byMeter.add(r.old_meter_number);
    if (r.block && r.row_no) byPos.add(`${r.block}::${r.row_no}`);
  }
  return { byMeter, byPos };
}

function isExcluded(r: MeterRecord, keys: ReturnType<typeof buildExcludeKeys>) {
  if (r.old_meter_number && keys.byMeter.has(r.old_meter_number)) return true;
  if (r.block && r.row_no && keys.byPos.has(`${r.block}::${r.row_no}`)) return true;
  return false;
}

const inputCls = 'bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400 transition-colors';

export default function MeterExcelDiff() {
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ total: number; excluded: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setLastResult(null);
    try {
      const rows = await parseExcel(file);
      if (rows.length === 0) { setError('파일에 데이터가 없습니다.'); return; }
      setParsedRows(rows);
      setFileName(file.name);
    } catch (err) {
      setError((err as Error).message);
    }
    // 같은 파일 재업로드 허용
    e.target.value = '';
  }

  function clearFile() {
    setParsedRows(null);
    setFileName('');
    setLastResult(null);
    setError(null);
  }

  async function handleDownload() {
    if (!parsedRows) return;
    setIsDownloading(true);
    setError(null);
    setLastResult(null);
    try {
      const allRows = await getCompletedRecords(dateFrom || undefined, dateTo || undefined);
      if (allRows.length === 0) {
        setError('해당 기간에 처리된 데이터가 없습니다.');
        return;
      }
      const keys = buildExcludeKeys(parsedRows);
      const filtered = allRows.filter((r) => !isExcluded(r, keys));
      setLastResult({ total: allRows.length, excluded: allRows.length - filtered.length });

      if (filtered.length === 0) {
        setError(`기간 내 완료 ${allRows.length}개가 모두 기존 엑셀에 포함되어 있습니다. 새로 받을 항목이 없습니다.`);
        return;
      }

      const headers = ['블록', '도면번호', '성명', '도로명주소', '기물번호(기존)', '기물번호', '지침', '봉인유무', '위치', '사용형태', '층수', '비고', '조사일자', '보호통뚜껑양식', '급수방식', '계량기상태', '상태'];
      const sheetData = [
        headers,
        ...filtered.map((r) => [
          r.block, r.row_no ?? '', r.name ?? '', r.address ?? '',
          r.old_meter_number ?? '', r.meter_number ?? '', r.reading ?? '',
          r.sealed ?? '', r.location ?? '', r.usage_type ?? '', r.floor ?? '',
          r.note ?? '', r.survey_date?.slice(0, 10) ?? '', r.cover_type ?? '',
          r.water_supply_type ?? '', r.meter_condition ?? '',
          r.note === '호폐' ? '호폐' : '처리됨',
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length * 2, 12) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '처리결과');
      const label = dateFrom && dateTo ? `${dateFrom}~${dateTo}` : (dateFrom ?? dateTo ?? new Date().toISOString().slice(0, 10));
      XLSX.writeFile(wb, `야장결과_${label}.xlsx`);
    } finally {
      setIsDownloading(false);
    }
  }

  const canDownload = !!parsedRows && !isDownloading;

  return (
    <div className="max-w-lg space-y-4">

      {/* 엑셀 업로드 */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-xs font-semibold text-zinc-400 mb-3">1. 이미 제출한 엑셀 파일 업로드 <span className="font-normal text-zinc-600">(업로드용 또는 결과 엑셀 모두 가능)</span></p>
        {parsedRows ? (
          <div className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg">
            <FileSpreadsheet size={18} className="text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{fileName}</p>
              <p className="text-xs text-zinc-400">
                전체 {parsedRows.length.toLocaleString()}개 ·{' '}
                처리됨 <span className="text-emerald-400">{parsedRows.filter(r => r.row_no && r.reading && r.sealed).length.toLocaleString()}개</span> 제외 예정
              </p>
            </div>
            <button onClick={clearFile} className="text-zinc-500 hover:text-white transition-colors shrink-0">
              <X size={15} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-zinc-700 rounded-xl py-10 flex flex-col items-center gap-2 hover:border-emerald-400/50 transition-colors"
          >
            <Upload size={28} className="text-zinc-600" />
            <span className="text-sm text-zinc-400">클릭하여 엑셀 파일 선택</span>
            <span className="text-xs text-zinc-600">.xlsx, .xls</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
      </div>

      {/* 날짜 범위 */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-xs font-semibold text-zinc-400 mb-3">2. 날짜 범위 <span className="font-normal text-zinc-600">(비우면 전체)</span></p>
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} className={`flex-1 ${inputCls}`} />
          <span className="text-zinc-600 text-sm shrink-0">~</span>
          <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className={`flex-1 ${inputCls}`} />
        </div>
      </div>

      {/* 에러 / 결과 */}
      {error && (
        <div className="px-4 py-3 bg-red-400/10 border border-red-400/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
      {lastResult && !error && (
        <div className="px-4 py-3 bg-zinc-800 rounded-lg text-sm text-zinc-300">
          기간 내 완료 <span className="text-white font-semibold">{lastResult.total}개</span>
          {' '}중 기존 엑셀과 겹치는{' '}
          <span className="text-amber-400 font-semibold">{lastResult.excluded}개</span> 제외 →{' '}
          <span className="text-emerald-400 font-semibold">{lastResult.total - lastResult.excluded}개</span> 다운로드
        </div>
      )}

      {/* 다운로드 버튼 */}
      <button
        onClick={handleDownload}
        disabled={!canDownload}
        className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-400 text-zinc-950 font-semibold text-sm rounded-xl hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isDownloading
          ? <><RefreshCw size={15} className="animate-spin" />처리 중...</>
          : <><Download size={15} />결과 다운로드</>}
      </button>
      {!parsedRows && (
        <p className="text-xs text-zinc-600 text-center">엑셀 파일을 먼저 업로드하세요</p>
      )}
    </div>
  );
}
