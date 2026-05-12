'use client';

import { useState, useRef, useTransition } from 'react';
import * as XLSX from 'xlsx';
import { X, Upload, ChevronRight } from 'lucide-react';
import { importFromExcel, type MeterInsert } from '@/app/admin/meter/_actions';

// ─── 기존 형식 (금산군수용가조사기록지) ───────────────────────────────────────
const EXCEL_MAP_OLD: Record<string, keyof MeterInsert> = {
  '도면번호': 'row_no',
  '성명': 'name',
  '도로명주소': 'address',
  '블록\r\n구분': 'block',
  '__EMPTY_7': 'old_meter_number',
  '__EMPTY_8': 'meter_number',
  '__EMPTY_13': 'reading',
  '__EMPTY_14': 'sealed',
  '__EMPTY_15': 'meter_condition',
  '__EMPTY_16': 'cover_type',
  '__EMPTY_17': 'location',
  '__EMPTY_23': 'usage_type',
  '__EMPTY_26': 'floor',
  '비고': 'note',
  '조사일자': 'survey_date',
  '보호통뚜껑양식': 'cover_type',
};

// ─── 대불 형식 컬럼 인덱스 (0-based, "수도미터목록" 시트, 헤더 4행, 데이터 5행~) ─
const DB_COL = {
  ROW_NO: 0,        // A: 번호
  NAME: 2,          // C: 성명
  ADDRESS: 3,       // D: 주소
  OLD_METER: 5,     // F: 계량기번호 (기존)
  GIMUL_NO: 15,     // P: 기물번호 (조사된 실물 번호)
  READING: 13,      // N: 지침(금회)
  SEALED: 14,       // O: 봉인유무
  METER_COND: 19,   // T: 수도미터 상태
  MANUFACTURER: 20, // U: 제작 회사
  LOCATION: 22,     // W: 보호통위치
  COVER_TYPE: 23,   // X: 보호통상태
  RELOCATION: 24,   // Y: 이설필요여부
  W_DIRECT: 25,     // Z: 직접급수
  W_INDIRECT: 26,   // AA: 간접급수
  W_TANK: 27,       // AB: 물탱크 유/무
  TANK_CAP: 28,     // AC: 용량(㎥)
  USAGE_TYPE: 34,   // AI: 사용형태
  FLOOR: 37,        // AL: 건물층수
  NOTE: 39,         // AN: 기타내용
  BLOCK: 48,        // AW: 소블록
} as const;

const PREVIEW_COLS: { key: keyof MeterInsert; label: string }[] = [
  { key: 'row_no', label: 'NO' },
  { key: 'name', label: '성명' },
  { key: 'address', label: '주소' },
  { key: 'old_meter_number', label: '기물번호' },
  { key: 'reading', label: '지침' },
  { key: 'sealed', label: '봉인유무' },
];

type Props = { onClose: () => void };

function str(val: unknown): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function maskName(name: string | null): string | null {
  if (!name) return null;
  return name.length <= 1 ? name + '*' : name[0] + '*'.repeat(name.length - 1);
}

export default function MeterExcelUpload({ onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [allRows, setAllRows] = useState<MeterInsert[]>([]);
  const [blockOptions, setBlockOptions] = useState<string[]>([]);
  const [selectedBlock, setSelectedBlock] = useState('');
  const [filteredRows, setFilteredRows] = useState<MeterInsert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<'old' | 'daebul'>('old');
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buf = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(buf, { type: 'array' });

        // ── 대불 형식 감지: "수도미터목록" 시트 존재 여부 ──────────────────
        if (wb.SheetNames.includes('수도미터목록')) {
          parseDaebul(wb);
        } else {
          parseOld(wb);
        }
      } catch {
        setError('파일을 읽는 중 오류가 발생했습니다.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function parseDaebul(wb: XLSX.WorkBook) {
    const ws = wb.Sheets['수도미터목록'];
    // header:1 → 각 행이 배열, 헤더 4행 skip (데이터는 index 4부터)
    const allArrays = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
      raw: false,
    });

    const dataRows = allArrays.slice(4); // 5행부터

    if (dataRows.length === 0) {
      setError('수도미터목록 시트에 데이터가 없습니다.');
      return;
    }

    const parsed: MeterInsert[] = dataRows
      .filter((row) => row[DB_COL.ROW_NO] != null) // 번호(A) 있는 행만
      .map((row) => {
        // 급수방식: Z(직접) / AA(간접) / AB(물탱크 유/무)
        const wDirect = str(row[DB_COL.W_DIRECT]);
        const wIndirect = str(row[DB_COL.W_INDIRECT]);
        const wTank = str(row[DB_COL.W_TANK]);

        let water_supply_type: string | null = null;
        if (wDirect) water_supply_type = '직접';
        else if (wIndirect) water_supply_type = '간접';
        else if (wTank === '유') water_supply_type = '물탱크';

        const oldMeter = str(row[DB_COL.OLD_METER]);

        return {
          row_no: str(row[DB_COL.ROW_NO]),
          name: maskName(str(row[DB_COL.NAME])),
          address: str(row[DB_COL.ADDRESS]),
          block: str(row[DB_COL.BLOCK]),
          old_meter_number: oldMeter,
          meter_number: str(row[DB_COL.GIMUL_NO]),
          reading: str(row[DB_COL.READING]),
          sealed: str(row[DB_COL.SEALED]),
          meter_condition: str(row[DB_COL.METER_COND]),
          manufacturer: str(row[DB_COL.MANUFACTURER]),
          location: str(row[DB_COL.LOCATION]),
          cover_type: str(row[DB_COL.COVER_TYPE]),
          relocation_needed: str(row[DB_COL.RELOCATION]),
          water_supply_type,
          water_tank_capacity: str(row[DB_COL.TANK_CAP]),
          usage_type: str(row[DB_COL.USAGE_TYPE]),
          floor: str(row[DB_COL.FLOOR]),
          note: str(row[DB_COL.NOTE]),
          survey_date: null,
          image1_id: null,
          image2_id: null,
          image3_id: null,
          image4_id: null,
          water_pressure: null,
          lat: null,
          lng: null,
        } as MeterInsert;
      });

    const blocks = [
      ...new Set(parsed.map((r) => r.block).filter((b): b is string => !!b)),
    ].sort();

    if (blocks.length === 0) {
      setError("'소블록' 열을 찾을 수 없습니다. 대불 형식 파일을 확인하세요.");
      return;
    }

    setFormat('daebul');
    setAllRows(parsed);
    setBlockOptions(blocks);
    setStep(2);
  }

  function parseOld(wb: XLSX.WorkBook) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allParsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: null,
      raw: false,
    });

    // 서브헤더 2행 skip
    const dataRows = allParsed.slice(2);

    if (dataRows.length === 0) {
      setError('시트에 데이터가 없습니다.');
      return;
    }

    const parsed: MeterInsert[] = dataRows.map((r) => {
      const row: Partial<MeterInsert> = {};
      for (const [excelKey, dbKey] of Object.entries(EXCEL_MAP_OLD)) {
        const raw = r[excelKey];
        const val =
          raw !== null && raw !== undefined && String(raw).trim() !== ''
            ? String(raw).trim()
            : null;
        if (dbKey === 'name' && val) {
          (row as Record<string, unknown>)[dbKey] = maskName(val);
        } else {
          (row as Record<string, unknown>)[dbKey] = val;
        }
      }
      // 급수방식: 3개 컬럼 → 1개 필드
      const wDirect = r['__EMPTY_19'] != null && String(r['__EMPTY_19']).trim() ? String(r['__EMPTY_19']).trim() : null;
      const wTank   = r['__EMPTY_20'] != null && String(r['__EMPTY_20']).trim() ? String(r['__EMPTY_20']).trim() : null;
      const wCist   = r['__EMPTY_21'] != null && String(r['__EMPTY_21']).trim() ? String(r['__EMPTY_21']).trim() : null;
      if (wDirect) row.water_supply_type = wDirect;
      else if (wTank) row.water_supply_type = '물탱크';
      else if (wCist) row.water_supply_type = '저수조';
      else row.water_supply_type = null;

      // 신규 필드 기본값
      row.image4_id = null;
      row.manufacturer = null;
      row.relocation_needed = null;
      row.water_tank_capacity = null;
      row.water_pressure = null;

      return row as MeterInsert;
    });

    const blocks = [
      ...new Set(parsed.map((r) => r.block).filter((b): b is string => !!b)),
    ].sort();

    if (blocks.length === 0) {
      setError("'블록구분' 열을 찾을 수 없습니다. 엑셀 파일을 확인하세요.");
      return;
    }

    setFormat('old');
    setAllRows(parsed);
    setBlockOptions(blocks);
    setStep(2);
  }

  function handleBlockConfirm() {
    if (!selectedBlock) return;
    setFilteredRows(allRows.filter((r) => r.block === selectedBlock));
    setStep(3);
  }

  function handleImport() {
    startTransition(async () => {
      const result = await importFromExcel(selectedBlock, filteredRows);
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  const stepLabels = ['파일 선택', '블록 선택', '미리보기'];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div className="flex items-center gap-4">
            <h2 className="text-white font-semibold">엑셀 업로드</h2>
            {step > 1 && (
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${format === 'daebul' ? 'bg-blue-400/20 text-blue-400' : 'bg-zinc-700 text-zinc-400'}`}>
                {format === 'daebul' ? '대불 형식' : '기존 형식'}
              </span>
            )}
            <div className="flex items-center gap-1.5 text-xs">
              {stepLabels.map((label, i) => {
                const s = (i + 1) as 1 | 2 | 3;
                return (
                  <span key={s} className="flex items-center gap-1.5">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center font-semibold ${
                        step >= s ? 'bg-emerald-400 text-zinc-950' : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {s}
                    </span>
                    <span className={step >= s ? 'text-zinc-300' : 'text-zinc-600'}>{label}</span>
                    {s < 3 && <ChevronRight size={12} className="text-zinc-700" />}
                  </span>
                );
              })}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 px-3 py-2 bg-red-400/10 border border-red-400/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            <div
              className="border-2 border-dashed border-zinc-700 rounded-xl flex flex-col items-center justify-center py-20 cursor-pointer hover:border-emerald-400/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={36} className="text-zinc-600 mb-3" />
              <p className="text-white font-medium">클릭하여 엑셀 파일 선택</p>
              <p className="text-zinc-500 text-sm mt-1">.xlsx, .xls 지원 · 기존/대불 형식 자동 감지</p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFile}
                className="hidden"
              />
            </div>
          )}

          {step === 2 && (
            <div>
              <p className="text-zinc-400 text-sm mb-5">
                파일에서{' '}
                <span className="text-white font-semibold">{blockOptions.length}개</span>의 블록을
                찾았습니다. 가져올 블록을 선택하세요.
              </p>
              <div className="flex flex-wrap gap-2">
                {blockOptions.map((b) => (
                  <button
                    key={b}
                    onClick={() => setSelectedBlock(b)}
                    className={`px-4 py-2 rounded-lg font-mono text-sm font-semibold transition-colors ${
                      selectedBlock === b
                        ? 'bg-emerald-400 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
              {selectedBlock && (
                <p className="mt-5 text-zinc-500 text-sm">
                  선택:{' '}
                  <span className="text-emerald-400 font-mono font-semibold">{selectedBlock}</span>
                  {' — '}
                  {allRows.filter((r) => r.block === selectedBlock).length}개 레코드
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <p className="text-zinc-400 text-sm mb-3">
                <span className="text-emerald-400 font-mono font-semibold">{selectedBlock}</span>{' '}
                블록의 <span className="text-white font-semibold">{filteredRows.length}개</span>{' '}
                레코드를 가져옵니다.
                <span className="text-zinc-600 ml-2 text-xs">기존 데이터는 덮어씁니다.</span>
              </p>
              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-zinc-950 border-b border-zinc-800">
                      <th className="px-3 py-2 text-left text-zinc-500 w-8">#</th>
                      {PREVIEW_COLS.map((c) => (
                        <th
                          key={c.key}
                          className="px-3 py-2 text-left text-zinc-400 whitespace-nowrap"
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b border-zinc-800 last:border-0">
                        <td className="px-3 py-2 text-zinc-600">{i + 1}</td>
                        {PREVIEW_COLS.map((c) => (
                          <td key={c.key} className="px-3 py-2 text-zinc-300 whitespace-nowrap">
                            {(row[c.key] as string) ?? '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredRows.length > 10 && (
                <p className="text-zinc-600 text-xs mt-2 text-center">
                  처음 10개 미리보기 · 전체 {filteredRows.length}개 가져옵니다
                </p>
              )}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-zinc-800 flex justify-end gap-2">
          <button
            onClick={step === 1 ? onClose : () => setStep((s) => (s - 1) as 1 | 2 | 3)}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            {step === 1 ? '취소' : '이전'}
          </button>
          {step === 2 && (
            <button
              onClick={handleBlockConfirm}
              disabled={!selectedBlock}
              className="px-4 py-2 text-sm font-semibold bg-emerald-400 text-zinc-950 hover:bg-emerald-300 rounded-lg disabled:opacity-40 transition-colors"
            >
              다음
            </button>
          )}
          {step === 3 && (
            <button
              onClick={handleImport}
              disabled={isPending}
              className="px-4 py-2 text-sm font-semibold bg-emerald-400 text-zinc-950 hover:bg-emerald-300 rounded-lg disabled:opacity-40 transition-colors"
            >
              {isPending ? '가져오는 중...' : '가져오기'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
