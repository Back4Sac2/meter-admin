'use client';

import { useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Pencil, Download, ChevronLeft, ChevronRight, Search, X, Camera, ChevronUp, ChevronDown, ChevronsUpDown, Copy, Check, RefreshCw, MapPin, List, Map, Calendar } from 'lucide-react';
import { type MeterRecord, type SortCol, type SortDir, type StatusFilter } from '@/app/admin/meter/_actions';
import { type RegionWithBlocks } from '@/app/admin/regions/_actions';
import MeterEditModal from './MeterEditModal';
import MeterMapView from './MeterMapView';

type Props = {
  records: MeterRecord[];
  blocks: string[];
  selectedBlock: string | null;
  regions: RegionWithBlocks[];
  selectedRegion: string | null;
  search: string;
  total: number;
  page: number;
  pageSize: number;
  sortCol: SortCol;
  sortDir: SortDir;
  status: StatusFilter | null;
  processedCount: number;
  unprocessedCount: number;
  closedCount: number;
  dateFrom: string;
  dateTo: string;
};

function getPaginationRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}

function Val({ value }: { value: string | null }) {
  if (!value) return <span className="text-zinc-600">-</span>;
  return <span className="text-zinc-300">{value}</span>;
}

function getStatus(r: MeterRecord): 'processed' | 'unprocessed' | 'closed' {
  if (r.note === '호폐' || r.note === '위치불명') return 'closed';
  if (r.meter_number && r.reading && r.sealed && r.location && r.usage_type && r.floor) return 'processed';
  return 'unprocessed';
}


export default function MeterTable({
  records,
  blocks,
  selectedBlock,
  regions,
  selectedRegion,
  search,
  total,
  page,
  pageSize,
  sortCol,
  sortDir,
  status,
  processedCount,
  unprocessedCount,
  closedCount,
  dateFrom,
  dateTo,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [editingRecord, setEditingRecord] = useState<MeterRecord | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadDateFrom, setDownloadDateFrom] = useState('');
  const [downloadDateTo, setDownloadDateTo] = useState('');
  const [downloadBlock, setDownloadBlock] = useState('');
  const [isImageDownloading, setIsImageDownloading] = useState(false);
  const [imageProgress, setImageProgress] = useState<{ current: number; total: number } | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState(dateFrom);
  const [filterDateTo, setFilterDateTo] = useState(dateTo);
  const [searchInput, setSearchInput] = useState(search);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  function handleRefresh() {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 800);
  }

  async function handleImageDownload(dateFrom?: string, dateTo?: string, block?: string) {
    if (!('showSaveFilePicker' in window)) {
      alert('이 기능은 Chrome 또는 Edge 브라우저에서만 사용 가능합니다.');
      return;
    }
    setIsImageDownloading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (block) params.set('block', block);
      const listRes = await fetch(`/admin/api/image-list?${params}`);
      if (!listRes.ok) { alert(await listRes.text()); return; }
      const images: { path: string; filename: string; url: string | null }[] = await listRes.json();
      if (images.length === 0) { alert('해당 조건에 이미지가 없습니다.'); return; }

      const parts: string[] = [];
      if (block) parts.push(`블록${block}`);
      if (dateFrom && dateTo) parts.push(`${dateFrom}~${dateTo}`);
      else if (dateFrom) parts.push(dateFrom);
      else if (dateTo) parts.push(dateTo);
      if (parts.length === 0) parts.push(new Date().toISOString().slice(0, 10));
      const label = parts.join('_');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: `야장이미지_${label}.zip`,
        types: [{ description: 'ZIP 파일', accept: { 'application/zip': ['.zip'] } }],
      });
      const writable = await fileHandle.createWritable();

      const { Zip, ZipDeflate } = await import('fflate');

      let zipCtrl: ReadableStreamDefaultController<Uint8Array>;
      const zipStream = new ReadableStream<Uint8Array>({ start(c) { zipCtrl = c; } });
      const pipePromise = zipStream.pipeTo(writable);

      const zip = new Zip((err, data, final) => {
        if (err) { zipCtrl.error(err); return; }
        zipCtrl.enqueue(data);
        if (final) zipCtrl.close();
      });

      setImageProgress({ current: 0, total: images.length });
      for (let i = 0; i < images.length; i++) {
        const { path, filename, url } = images[i];
        // url이 있으면 R2에서 직접 받아 Vercel bandwidth 소비 없음
        const fetchUrl = url ?? `/admin/api/image-proxy?path=${encodeURIComponent(path)}`;
        const res = await fetch(fetchUrl);
        if (res.ok && res.body) {
          const zipFile = new ZipDeflate(filename, { level: 0 });
          zip.add(zipFile);
          const reader = res.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) { zipFile.push(new Uint8Array(0), true); break; }
            zipFile.push(value, false);
          }
        }
        setImageProgress({ current: i + 1, total: images.length });
      }

      zip.end();
      await pipePromise;
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') alert('이미지 다운로드 중 오류가 발생했습니다.');
    } finally {
      setIsImageDownloading(false);
      setImageProgress(null);
    }
  }

  function copyAddress(r: MeterRecord) {
    if (!r.address) return;
    navigator.clipboard.writeText(r.address);
    setCopiedId(r.id);
    setTimeout(() => setCopiedId(null), 1500);
  }
  const searchRef = useRef<HTMLInputElement>(null);

  const totalPages = Math.ceil(total / pageSize);
  const paginationRange = getPaginationRange(page, totalPages);

  function navigate(
    newPage: number,
    newBlock?: string | null,
    newSearch?: string,
    newSortCol?: SortCol,
    newSortDir?: SortDir,
    newStatus?: StatusFilter | null,
    newDateFrom?: string,
    newDateTo?: string,
    newRegion?: string | null,
  ) {
    const params = new URLSearchParams();
    const b = newBlock !== undefined ? newBlock : selectedBlock;
    const q = newSearch !== undefined ? newSearch : search;
    const sc = newSortCol !== undefined ? newSortCol : sortCol;
    const sd = newSortDir !== undefined ? newSortDir : sortDir;
    const st = newStatus !== undefined ? newStatus : status;
    const df = newDateFrom !== undefined ? newDateFrom : filterDateFrom;
    const dt = newDateTo !== undefined ? newDateTo : filterDateTo;
    const rg = newRegion !== undefined ? newRegion : selectedRegion;
    if (rg) params.set('region', rg);
    if (b) params.set('block', b);
    if (q) params.set('q', q);
    if (newPage > 1) params.set('page', String(newPage));
    if (sc !== 'row_no' || sd !== 'asc') { params.set('sort', sc); params.set('dir', sd); }
    if (st) params.set('status', st);
    if (df) params.set('dateFrom', df);
    if (dt) params.set('dateTo', dt);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleRegion(regionId: string | null) {
    // 지역 변경 시 블록 선택 초기화
    navigate(1, null, undefined, undefined, undefined, undefined, undefined, undefined, regionId);
  }

  function handleSort(col: SortCol) {
    const newDir: SortDir = sortCol === col && sortDir === 'asc' ? 'desc' : 'asc';
    navigate(1, undefined, undefined, col, newDir);
  }

  function handleStatus(s: StatusFilter | null) {
    navigate(1, undefined, undefined, undefined, undefined, s);
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <ChevronsUpDown size={12} className="text-zinc-600" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-emerald-400" />
      : <ChevronDown size={12} className="text-emerald-400" />;
  }

  function handleDateSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate(1, undefined, undefined, undefined, undefined, undefined, filterDateFrom, filterDateTo);
  }

  function clearDateFilter() {
    setFilterDateFrom('');
    setFilterDateTo('');
    navigate(1, undefined, undefined, undefined, undefined, undefined, '', '');
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate(1, undefined, searchInput.trim());
  }

  function clearSearch() {
    setSearchInput('');
    navigate(1, undefined, '');
  }

  const isEmpty = records.length === 0;

  // 지역 선택 시 해당 지역 블록만 표시
  const regionBlockSet = selectedRegion
    ? new Set(regions.find((r) => r.id === selectedRegion)?.blocks ?? [])
    : null;
  const visibleBlocks = regionBlockSet ? blocks.filter((b) => regionBlockSet.has(b)) : blocks;

  return (
    <div>
      {/* 지역 필터 */}
      {regions.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="text-xs text-zinc-600 mr-1">지역</span>
          {regions.map((r) => (
            <button
              key={r.id}
              onClick={() => handleRegion(r.id)}
              className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                selectedRegion === r.id
                  ? 'bg-indigo-500 text-white font-semibold'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
      {/* 블록 필터 + 업로드 */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <button
          onClick={() => navigate(1, null)}
          className={`px-2.5 py-1.5 text-xs rounded-lg font-mono transition-colors ${
            !selectedBlock
              ? 'bg-emerald-400 text-zinc-950 font-semibold'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          전체
        </button>
        {visibleBlocks.map((b) => (
          <button
            key={b}
            onClick={() => navigate(1, b)}
            className={`px-2.5 py-1.5 text-xs rounded-lg font-mono transition-colors ${
              selectedBlock === b
                ? 'bg-emerald-400 text-zinc-950 font-semibold'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {b}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {/* 뷰 모드 토글 */}
          <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-zinc-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <List size={13} />
              <span className="hidden sm:inline">목록</span>
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'map' ? 'bg-zinc-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Map size={13} />
              <span className="hidden sm:inline">지도</span>
            </button>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 text-zinc-400 hover:text-white text-sm rounded-lg hover:bg-zinc-700 transition-colors"
            title="새로고침"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">새로고침</span>
          </button>
          <button
            onClick={() => setShowDownloadModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-zinc-700 text-zinc-200 font-semibold text-sm rounded-lg hover:bg-zinc-600 transition-colors"
          >
            <Download size={14} />
            이미지 다운로드
          </button>
        </div>
      </div>

      {/* 상태 필터 */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap text-xs">
        {([
          { s: null,            label: '전체',    count: processedCount + unprocessedCount + closedCount, cls: 'bg-zinc-700 text-white' },
          { s: 'processed',     label: '처리됨',  count: processedCount,   cls: 'bg-emerald-400 text-zinc-950' },
          { s: 'unprocessed',   label: '미처리',  count: unprocessedCount, cls: 'bg-zinc-400 text-zinc-950' },
          { s: 'closed',        label: '종결',    count: closedCount,      cls: 'bg-amber-400 text-zinc-950' },
        ] as { s: StatusFilter | null; label: string; count: number; cls: string }[]).map(({ s, label, count, cls }) => (
          <button
            key={String(s)}
            onClick={() => handleStatus(s)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition-colors ${
              status === s ? cls : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${status === s ? 'bg-black/20' : 'bg-zinc-700 text-zinc-400'}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* 날짜 검색 */}
      <form onSubmit={handleDateSearch} className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="flex items-center gap-1 text-xs text-zinc-500 shrink-0">
          <Calendar size={12} />조사일자
        </span>
        <input
          type="date"
          value={filterDateFrom}
          max={filterDateTo || undefined}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400 transition-colors"
        />
        <span className="text-zinc-600 text-xs shrink-0">~</span>
        <input
          type="date"
          value={filterDateTo}
          min={filterDateFrom || undefined}
          onChange={(e) => setFilterDateTo(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400 transition-colors"
        />
        <button
          type="submit"
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs rounded-lg transition-colors shrink-0"
        >
          검색
        </button>
        {(filterDateFrom || filterDateTo) && (
          <button
            type="button"
            onClick={clearDateFilter}
            className="flex items-center gap-1 px-2 py-1.5 text-zinc-500 hover:text-white text-xs rounded-lg transition-colors"
          >
            <X size={12} />초기화
          </button>
        )}
      </form>

      {/* 검색창 */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            placeholder="도면번호 · 도로명주소 · 기물번호(기존) 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-8 py-2 text-base md:text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-400 transition-colors"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-sm rounded-lg transition-colors"
        >
          검색
        </button>
      </form>

      {search && (
        <p className="text-xs text-zinc-500 mb-3">
          <span className="text-emerald-400">"{search}"</span> 검색 결과 {total}개
        </p>
      )}

      {/* ─── 지도 모드 ─── */}
      {viewMode === 'map' ? (
        <MeterMapView selectedBlock={selectedBlock} status={status} />
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500 border border-zinc-800 rounded-lg">
          <p className="text-sm">데이터가 없습니다.</p>
          <p className="text-xs mt-1">엑셀 파일을 업로드하여 데이터를 가져오세요.</p>
        </div>
      ) : (
        <>
          {/* ─── 데스크톱 테이블 ─── */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-xs min-w-max">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-800">
                  <th className="sticky left-0 z-10 bg-zinc-900 px-3 py-2.5 w-12" />
                  <th
                    className="px-3 py-2.5 text-left font-semibold text-zinc-500 whitespace-nowrap cursor-pointer hover:text-zinc-300 select-none"
                    onClick={() => handleSort('row_no')}
                  >
                    <span className="flex items-center gap-1">도면번호 <SortIcon col="row_no" /></span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-zinc-500 whitespace-nowrap">성명</th>
                  <th
                    className="px-3 py-2.5 text-left font-semibold text-zinc-500 whitespace-nowrap cursor-pointer hover:text-zinc-300 select-none"
                    onClick={() => handleSort('address')}
                  >
                    <span className="flex items-center gap-1">도로명주소 <SortIcon col="address" /></span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-zinc-500 whitespace-nowrap">기물번호(기존)</th>
                  <th className="w-px bg-zinc-700" />
                  <th className="px-3 py-2.5 text-left font-semibold text-zinc-300 whitespace-nowrap">기물번호</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-zinc-300 whitespace-nowrap">지침</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-zinc-300 whitespace-nowrap">봉인유무</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-zinc-300 whitespace-nowrap">위치</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-zinc-300 whitespace-nowrap">사용형태</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-zinc-300 whitespace-nowrap">층수</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-zinc-300 whitespace-nowrap">비고</th>
                  <th
                    className="px-3 py-2.5 text-left font-semibold text-zinc-300 whitespace-nowrap cursor-pointer hover:text-white select-none"
                    onClick={() => handleSort('survey_date')}
                  >
                    <span className="flex items-center gap-1">조사일자 <SortIcon col="survey_date" /></span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-zinc-300 whitespace-nowrap">보호통뚜껑양식</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-zinc-300 whitespace-nowrap">급수방식</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-zinc-300 whitespace-nowrap">계량기상태</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-zinc-800 last:border-0 hover:bg-zinc-900/60 transition-colors ${getStatus(r) === 'processed' ? 'bg-emerald-950/20' : getStatus(r) === 'closed' ? 'bg-amber-950/20' : ''}`}
                  >
                    {/* 수정 버튼 — sticky */}
                    <td className={`sticky left-0 z-10 px-2 py-2 border-r border-zinc-800 ${getStatus(r) === 'processed' ? 'bg-emerald-950/40' : getStatus(r) === 'closed' ? 'bg-amber-950/40' : 'bg-zinc-950'}`}>
                      <button
                        onClick={() => setEditingRecord(r)}
                        className="flex items-center gap-1 px-2 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Pencil size={12} />
                        <span className="text-xs">수정</span>
                      </button>
                      <div className="flex items-center gap-2 px-2 mt-0.5">
                        {getStatus(r) === 'processed' && <span className="text-[10px] text-emerald-400 font-bold">✓</span>}
                        {getStatus(r) === 'closed' && <span className="text-[10px] text-amber-400 font-bold">{r.note}</span>}
                        {(r.image1_id || r.image2_id || r.image3_id || r.image4_id) && (
                          <span className="flex items-center gap-1">
                            <Camera size={10} className="text-emerald-400" />
                            <span className="text-[10px] text-emerald-400">
                              {[r.image1_id, r.image2_id, r.image3_id, r.image4_id].filter(Boolean).length}
                            </span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-zinc-500 font-mono">{r.row_no ?? '-'}</td>
                    <td className="px-3 py-2 text-zinc-500 whitespace-nowrap">{r.name ?? '-'}</td>
                    <td className="px-3 py-2 text-zinc-500 whitespace-nowrap max-w-[180px] truncate">{r.address ?? '-'}</td>
                    <td className="px-3 py-2 text-zinc-500 font-mono whitespace-nowrap">{r.old_meter_number ?? '-'}</td>
                    <td className="w-px bg-zinc-800" />
                    <td className="px-3 py-2 font-mono whitespace-nowrap"><Val value={r.meter_number} /></td>
                    <td className="px-3 py-2"><Val value={r.reading} /></td>
                    <td className="px-3 py-2"><Val value={r.sealed} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><Val value={r.location} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><Val value={r.usage_type} /></td>
                    <td className="px-3 py-2"><Val value={r.floor} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><Val value={r.note} /></td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap"><Val value={r.survey_date?.slice(0, 10) ?? null} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><Val value={r.cover_type} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><Val value={r.water_supply_type} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><Val value={r.meter_condition} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─── 모바일 정렬 바 ─── */}
          <div className="md:hidden flex items-center gap-1.5 mb-3 text-xs">
            <span className="text-zinc-600 shrink-0">정렬:</span>
            {([
              { col: 'row_no' as SortCol, label: '도면번호' },
              { col: 'address' as SortCol, label: '도로명주소' },
              { col: 'survey_date' as SortCol, label: '조사일자' },
            ]).map(({ col, label }) => (
              <button
                key={col}
                onClick={() => handleSort(col)}
                className={`flex items-center gap-0.5 px-2.5 py-1 rounded-lg transition-colors ${
                  sortCol === col
                    ? 'bg-emerald-400/20 text-emerald-400 font-semibold'
                    : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {label}
                {sortCol === col && (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
              </button>
            ))}
          </div>

          {/* ─── 모바일 카드 ─── */}
          <div className="md:hidden space-y-2">
            {records.map((r) => {
              const st = getStatus(r);
              const cardCls =
                st === 'processed' ? 'bg-emerald-950/30 border-emerald-900/60' :
                st === 'closed'    ? 'bg-amber-950/30 border-amber-900/60' :
                'bg-zinc-900 border-zinc-800';
              return (
                <div key={r.id} className={`border rounded-xl overflow-hidden ${cardCls}`}>
                  {/* 카드 상단 정보 */}
                  <div className="p-4">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          {r.row_no && (
                            <span className="text-zinc-500 text-xs font-mono shrink-0">도면{r.row_no}</span>
                          )}
                          {st === 'processed' && (
                            <span className="shrink-0 text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">완료</span>
                          )}
                          {st === 'closed' && (
                            <span className="shrink-0 text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full">{r.note}</span>
                          )}
                          {r.meter_number && (
                            <span className="text-zinc-300 text-xs font-mono truncate">{r.meter_number}</span>
                          )}
                        </div>
                        <p className="text-white text-sm font-semibold truncate">{r.address ?? '-'}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {r.address && (
                          <>
                            <button
                              onClick={() => copyAddress(r)}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                            >
                              {copiedId === r.id
                                ? <Check size={13} className="text-emerald-400" />
                                : <Copy size={13} />}
                            </button>
                            <button
                              onClick={() => {
                                const query = encodeURIComponent(r.address!);
                                window.location.href = `nmap://search?query=${query}`;
                              }}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 transition-colors"
                            >
                              <MapPin size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 수정 버튼 — 카드 하단 풀너비 */}
                  <button
                    onClick={() => setEditingRecord(r)}
                    className="w-full flex items-center justify-center gap-2 py-3 border-t border-zinc-800 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <Pencil size={14} />
                    수정
                  </button>
                </div>
              );
            })}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-zinc-500 text-xs">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total}개
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navigate(page - 1)}
                  disabled={page <= 1}
                  className="p-1.5 bg-zinc-800 text-zinc-400 hover:text-white rounded-lg disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="md:hidden px-3 py-1.5 text-xs text-zinc-400">
                  {page} / {totalPages}
                </span>
                <div className="hidden md:flex items-center gap-1">
                  {paginationRange.map((p, i) =>
                    p === '…' ? (
                      <span key={`ell-${i}`} className="px-2 text-zinc-600 text-xs">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => navigate(p as number)}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                          p === page
                            ? 'bg-emerald-400 text-zinc-950 font-semibold'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>
                <button
                  onClick={() => navigate(page + 1)}
                  disabled={page >= totalPages}
                  className="p-1.5 bg-zinc-800 text-zinc-400 hover:text-white rounded-lg disabled:opacity-30 transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showDownloadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowDownloadModal(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-sm">이미지 다운로드</h3>
              <button onClick={() => setShowDownloadModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <p className="text-xs text-zinc-400 mb-2">날짜 범위 (비우면 전체)</p>
                <div className="flex flex-col gap-1.5">
                  <input
                    type="date"
                    value={downloadDateFrom}
                    max={downloadDateTo || undefined}
                    onChange={(e) => setDownloadDateFrom(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400 transition-colors"
                  />
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-px bg-zinc-700" />
                    <span className="text-zinc-600 text-xs">~</span>
                    <div className="flex-1 h-px bg-zinc-700" />
                  </div>
                  <input
                    type="date"
                    value={downloadDateTo}
                    min={downloadDateFrom || undefined}
                    onChange={(e) => setDownloadDateTo(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400 transition-colors"
                  />
                </div>
              </div>
              <div>
                <p className="text-xs text-zinc-400 mb-2">블록 (이미지 다운로드에만 적용, 비우면 전체)</p>
                <select
                  value={downloadBlock}
                  onChange={(e) => setDownloadBlock(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400 transition-colors"
                >
                  <option value="">전체 블록</option>
                  {blocks.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => { setShowDownloadModal(false); await handleImageDownload(downloadDateFrom || undefined, downloadDateTo || undefined, downloadBlock || undefined); }}
                disabled={isImageDownloading}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors"
              >
                {isImageDownloading ? <RefreshCw size={14} className="animate-spin" /> : <Camera size={14} />}
                이미지 ZIP 다운로드
              </button>
            </div>
          </div>
        </div>
      )}
      {imageProgress && (
        <div className="fixed bottom-4 right-4 z-50 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 shadow-2xl w-64">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw size={13} className="animate-spin text-emerald-400 shrink-0" />
            <p className="text-sm text-white font-semibold">이미지 ZIP 생성 중</p>
          </div>
          <p className="text-xs text-zinc-400 mb-2">{imageProgress.current} / {imageProgress.total}개 완료</p>
          <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-200"
              style={{ width: `${(imageProgress.current / imageProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}
      {editingRecord && (
        <MeterEditModal record={editingRecord} onClose={() => setEditingRecord(null)} />
      )}
    </div>
  );
}
