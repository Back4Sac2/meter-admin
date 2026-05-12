'use client';

import { useState, useRef } from 'react';
import { Upload, Download, X, FileSpreadsheet, RefreshCw } from 'lucide-react';

export default function MeterTemplateFill() {
  const [fileName, setFileName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ filled: number } | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setFileName(f.name);
    setError(null);
    setLastResult(null);
    e.target.value = '';
  }

  function clearFile() {
    setFile(null);
    setFileName('');
    setError(null);
    setLastResult(null);
  }

  async function handleFill() {
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    setLastResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (dateFrom) formData.append('dateFrom', dateFrom);
      if (dateTo)   formData.append('dateTo', dateTo);

      const res = await fetch('/admin/api/template-fill', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const msg = await res.text();
        setError(msg || '서버 오류가 발생했습니다.');
        return;
      }

      const filled = Number(res.headers.get('X-Filled-Count') ?? 0);
      setLastResult({ filled });

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.replace(/(\.[^.]+)$/, '_작성완료$1');
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('처리 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-xs font-semibold text-zinc-400 mb-1">양식 엑셀 업로드</p>
        <p className="text-xs text-zinc-600 mb-3">수용가조사기록지 원본 파일을 올리면 DB 데이터를 채워서 다운로드합니다</p>
        {file ? (
          <div className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg">
            <FileSpreadsheet size={18} className="text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{fileName}</p>
              <p className="text-xs text-zinc-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
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
            <span className="text-sm text-zinc-400">수용가조사기록지 양식 파일 선택</span>
            <span className="text-xs text-zinc-600">.xlsx, .xls</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-zinc-400">날짜 필터 (선택)</p>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-zinc-500 hover:text-white transition-colors"
            >
              초기화
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-600 mb-3">비워두면 전체 날짜의 완료 데이터를 채웁니다</p>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs text-zinc-500 mb-1">시작일</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400 [color-scheme:dark]"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-zinc-500 mb-1">종료일</label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400 [color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-400/10 border border-red-400/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
      {lastResult && !error && (
        <div className="px-4 py-3 bg-zinc-800 rounded-lg text-sm text-zinc-300">
          <span className="text-emerald-400 font-semibold">{lastResult.filled.toLocaleString()}행</span> 채워넣기 완료
        </div>
      )}

      <button
        onClick={handleFill}
        disabled={!file || isProcessing}
        className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-400 text-zinc-950 font-semibold text-sm rounded-xl hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isProcessing
          ? <><RefreshCw size={15} className="animate-spin" />처리 중... (시간이 걸릴 수 있습니다)</>
          : <><Download size={15} />DB 데이터 채워서 다운로드</>}
      </button>
      {!file && (
        <p className="text-xs text-zinc-600 text-center">양식 파일을 먼저 업로드하세요</p>
      )}
    </div>
  );
}
