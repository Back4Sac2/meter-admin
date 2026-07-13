'use client';

import { useState, useEffect } from 'react';
import { Download, RefreshCw } from 'lucide-react';

export default function MeterExcelExport() {
  const [blocks, setBlocks] = useState<string[]>([]);
  const [block, setBlock] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [lastCount, setLastCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/admin/api/blocks')
      .then((r) => r.json())
      .then(setBlocks)
      .catch(() => {});
  }, []);

  async function handleDownload() {
    setIsDownloading(true);
    setError(null);
    setLastCount(null);
    try {
      const params = new URLSearchParams();
      if (block) params.set('block', block);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`/admin/api/export-excel?${params}`);
      if (!res.ok) {
        setError((await res.text()) || '서버 오류가 발생했습니다.');
        return;
      }

      const count = Number(res.headers.get('X-Record-Count') ?? 0);
      setLastCount(count);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const today = new Date().toISOString().slice(0, 10);
      const label = block ? `_${block}블록` : '';
      const a = document.createElement('a');
      a.href = url;
      a.download = `야장데이터${label}_${today}.xlsx`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('처리 중 오류가 발생했습니다.');
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div>
          <p className="text-xs font-semibold text-zinc-400 mb-1">블록 필터 (선택)</p>
          <select
            value={block}
            onChange={(e) => setBlock(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400 transition-colors"
          >
            <option value="">전체 블록</option>
            {blocks.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div>
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
          <p className="text-xs text-zinc-600 mb-2">조사일 기준으로 필터링합니다</p>
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
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-400/10 border border-red-400/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
      {lastCount !== null && !error && (
        <div className="px-4 py-3 bg-zinc-800 rounded-lg text-sm text-zinc-300">
          <span className="text-emerald-400 font-semibold">{lastCount.toLocaleString()}건</span> 다운로드 완료
        </div>
      )}

      <button
        onClick={handleDownload}
        disabled={isDownloading}
        className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-400 text-zinc-950 font-semibold text-sm rounded-xl hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isDownloading
          ? <><RefreshCw size={15} className="animate-spin" />생성 중...</>
          : <><Download size={15} />DB 데이터 엑셀 다운로드</>}
      </button>
    </div>
  );
}
