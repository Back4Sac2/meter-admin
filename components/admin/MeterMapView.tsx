'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { LocateFixed, RefreshCw, X } from 'lucide-react';
import {
  getMeterRecordsForMap,
  getUngeocodedRecords,
  type MeterRecord,
  type StatusFilter,
} from '@/app/admin/meter/_actions';
import MeterEditModal from './MeterEditModal';

declare global {
  interface Window { naver: any; }
}

function getStatus(r: MeterRecord): 'processed' | 'unprocessed' | 'closed' {
  if (r.note === '호폐') return 'closed';
  if (r.meter_number && r.reading && r.sealed && r.location && r.usage_type && r.floor) return 'processed';
  return 'unprocessed';
}

const STATUS_COLOR: Record<string, string> = {
  processed: '#34d399',
  unprocessed: '#52525b',
  closed: '#fbbf24',
};

const STATUS_LABEL: Record<string, string> = {
  processed: '처리됨',
  unprocessed: '미처리',
  closed: '호폐',
};

// 그룹 내 가장 주의가 필요한 상태 색상 반환 (미처리 > 호폐 > 처리됨)
function getGroupColor(group: MeterRecord[]): string {
  if (group.some(r => getStatus(r) === 'unprocessed')) return STATUS_COLOR.unprocessed;
  if (group.some(r => getStatus(r) === 'closed')) return STATUS_COLOR.closed;
  return STATUS_COLOR.processed;
}

// 이 줌 레벨 미만이면 마커 숨김 (성능 최적화)
const MIN_ZOOM_FOR_MARKERS = 14;

function naverMaps() {
  return window.naver?.maps ?? null;
}

export default function MeterMapView({
  selectedBlock,
  status,
}: {
  selectedBlock: string | null;
  status: StatusFilter | null;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  // `${lat},${lng}` → marker: 같은 위치 레코드를 그룹으로 관리
  const activeMarkers = useRef<Map<string, any>>(new Map());
  const userMarker = useRef<any>(null);
  // idle 이벤트 핸들러에서 최신 records에 접근하기 위한 ref
  const recordsRef = useRef<MeterRecord[]>([]);

  const [records, setRecords] = useState<MeterRecord[]>([]);
  const [ungeocodedCount, setUngeocodedCount] = useState(0);
  const [editingRecord, setEditingRecord] = useState<MeterRecord | null>(null);
  // 같은 위치에 여러 레코드가 있을 때 선택 목록
  const [overlapRecords, setOverlapRecords] = useState<MeterRecord[] | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState<{ current: number; total: number } | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mapZoom, setMapZoom] = useState(17);

  // records state → ref 동기화 (idle 핸들러용)
  useEffect(() => { recordsRef.current = records; }, [records]);

  // Naver Maps SDK 로드
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (naverMaps()) { setSdkReady(true); return; }

    (window as any).__naverMapReady = () => setSdkReady(true);

    if (!document.querySelector('script[data-naver-maps]')) {
      const script = document.createElement('script');
      script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_CLIENT_ID}&callback=__naverMapReady`;
      script.setAttribute('data-naver-maps', '');
      document.head.appendChild(script);
    }

    const poll = setInterval(() => {
      if (naverMaps()) { setSdkReady(true); clearInterval(poll); }
    }, 150);
    return () => clearInterval(poll);
  }, []);

  const locateUser = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  useEffect(() => { locateUser(); }, [locateUser]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const [data, ungeocoded] = await Promise.all([
      getMeterRecordsForMap(selectedBlock ?? undefined, status ?? undefined),
      getUngeocodedRecords(selectedBlock ?? undefined),
    ]);
    setRecords(data);
    setUngeocodedCount(ungeocoded.length);
    setLoading(false);
  }, [selectedBlock, status]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  // 지도 초기화 (SDK 준비 + div 마운트 시 1회)
  useEffect(() => {
    const nm = naverMaps();
    if (!sdkReady || !nm || !mapRef.current || mapInstance.current) return;
    const center = userPos
      ? new nm.LatLng(userPos.lat, userPos.lng)
      : new nm.LatLng(37.5665, 126.9780);
    mapInstance.current = new nm.Map(mapRef.current, {
      center,
      zoom: 17,
      mapTypeId: 'normal',
    });
  }, [sdkReady, userPos]);

  // 위치 변경 시 지도 중심 이동
  useEffect(() => {
    const nm = naverMaps();
    if (!nm || !mapInstance.current || !userPos) return;
    mapInstance.current.setCenter(new nm.LatLng(userPos.lat, userPos.lng));
  }, [userPos]);

  // 내 위치 마커
  useEffect(() => {
    const nm = naverMaps();
    if (!sdkReady || !nm || !mapInstance.current || !userPos) return;
    if (userMarker.current) userMarker.current.setMap(null);
    userMarker.current = new nm.Marker({
      position: new nm.LatLng(userPos.lat, userPos.lng),
      map: mapInstance.current,
      icon: {
        content: '<div style="width:18px;height:18px;background:#60a5fa;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px rgba(96,165,250,0.35);"></div>',
        anchor: new nm.Point(9, 9),
      },
      zIndex: 200,
    });
  }, [sdkReady, userPos]);

  // 뷰포트 내 레코드를 위치별로 그룹화하여 마커 렌더링
  const renderVisibleMarkers = useCallback(() => {
    const nm = naverMaps();
    if (!nm || !mapInstance.current) return;

    const map = mapInstance.current;
    const bounds = map.getBounds();
    const currentZoom = map.getZoom();
    setMapZoom(currentZoom);

    if (currentZoom < MIN_ZOOM_FOR_MARKERS) {
      activeMarkers.current.forEach(m => m.setMap(null));
      activeMarkers.current.clear();
      return;
    }

    const recs = recordsRef.current;

    // 뷰포트 내 레코드를 위치 키(`lat,lng`)로 그룹화
    const visibleGroups = new Map<string, MeterRecord[]>();
    recs.forEach(r => {
      if (r.lat == null || r.lng == null) return;
      if (!bounds.hasLatLng(new nm.LatLng(r.lat, r.lng))) return;
      const posKey = `${r.lat},${r.lng}`;
      const group = visibleGroups.get(posKey) ?? [];
      group.push(r);
      visibleGroups.set(posKey, group);
    });

    // 뷰포트 밖으로 나간 마커 제거
    const toRemove: string[] = [];
    activeMarkers.current.forEach((_, posKey) => {
      if (!visibleGroups.has(posKey)) toRemove.push(posKey);
    });
    toRemove.forEach(posKey => {
      activeMarkers.current.get(posKey)?.setMap(null);
      activeMarkers.current.delete(posKey);
    });

    // 새로 보이는 위치 그룹 마커 생성
    visibleGroups.forEach((group, posKey) => {
      if (activeMarkers.current.has(posKey)) return;
      const first = group[0];
      const isMultiple = group.length > 1;
      const color = isMultiple ? getGroupColor(group) : STATUS_COLOR[getStatus(first)];

      const content = isMultiple
        ? `<div style="width:20px;height:20px;background:${color};border-radius:50%;border:2px solid rgba(0,0,0,0.5);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:white;line-height:1;">${group.length}</div>`
        : `<div style="width:11px;height:11px;background:${color};border-radius:50%;border:2px solid rgba(0,0,0,0.4);cursor:pointer;"></div>`;

      const anchor = isMultiple ? 10 : 5;
      const marker = new nm.Marker({
        position: new nm.LatLng(first.lat!, first.lng!),
        map,
        icon: { content, anchor: new nm.Point(anchor, anchor) },
        zIndex: 100,
      });

      nm.Event.addListener(marker, 'click', () => {
        if (group.length === 1) {
          setEditingRecord(group[0]);
        } else {
          setOverlapRecords(group);
        }
      });

      activeMarkers.current.set(posKey, marker);
    });
  }, []); // ref 기반이라 deps 불필요

  // records 변경 또는 SDK 준비 시: 마커 전체 초기화 후 재렌더 + idle 이벤트 등록
  useEffect(() => {
    const nm = naverMaps();
    if (!sdkReady || !nm || !mapInstance.current) return;

    activeMarkers.current.forEach(m => m.setMap(null));
    activeMarkers.current.clear();
    renderVisibleMarkers();

    const listener = nm.Event.addListener(mapInstance.current, 'idle', renderVisibleMarkers);
    return () => nm.Event.removeListener(listener);
  }, [sdkReady, records, renderVisibleMarkers]);

  async function handleGeocoding() {
    setGeocoding(true);
    const toProcess = await getUngeocodedRecords(selectedBlock ?? undefined);
    setGeocodeProgress({ current: 0, total: toProcess.length });
    for (let i = 0; i < toProcess.length; i++) {
      const r = toProcess[i];
      if (!r.address) { setGeocodeProgress({ current: i + 1, total: toProcess.length }); continue; }
      try {
        await fetch('/admin/api/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record_id: r.id, address: r.address }),
        });
      } catch {}
      setGeocodeProgress({ current: i + 1, total: toProcess.length });
    }
    await loadRecords();
    setGeocoding(false);
    setGeocodeProgress(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 상태 바 */}
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <span className="text-zinc-500">
          좌표 있음 <span className="text-emerald-400 font-semibold">{records.length}</span>개
          {ungeocodedCount > 0 && (
            <> · 없음 <span className="text-zinc-400 font-semibold">{ungeocodedCount}</span>개</>
          )}
        </span>
        {ungeocodedCount > 0 && (
          <button
            onClick={handleGeocoding}
            disabled={geocoding}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-zinc-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {geocoding ? (
              <>
                <RefreshCw size={12} className="animate-spin" />
                {geocodeProgress ? `${geocodeProgress.current} / ${geocodeProgress.total}` : '준비 중...'}
              </>
            ) : '좌표 업데이트'}
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1 text-zinc-500"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />처리됨</span>
          <span className="flex items-center gap-1 text-zinc-500"><span className="w-2.5 h-2.5 rounded-full bg-zinc-500 inline-block" />미처리</span>
          <span className="flex items-center gap-1 text-zinc-500"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />호폐</span>
        </div>
      </div>

      {/* 지도 */}
      <div className="relative rounded-xl overflow-hidden border border-zinc-800" style={{ height: '65dvh' }}>
        {(loading || !sdkReady) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-900/90">
            <RefreshCw size={20} className="animate-spin text-zinc-400" />
            {!sdkReady && <p className="text-xs text-zinc-500">지도 로딩 중...</p>}
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />
        {mapZoom < MIN_ZOOM_FOR_MARKERS && !loading && sdkReady && (
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 bg-zinc-900/90 border border-zinc-700 text-zinc-400 text-xs rounded-lg whitespace-nowrap pointer-events-none">
            더 확대하면 마커가 표시됩니다
          </div>
        )}
        <button
          onClick={locateUser}
          disabled={locating}
          className="absolute bottom-4 right-4 z-10 p-2.5 bg-zinc-900/90 border border-zinc-700 text-zinc-300 hover:text-white rounded-xl transition-colors disabled:opacity-50"
          title="내 위치로 이동"
        >
          <LocateFixed size={16} className={locating ? 'animate-pulse' : ''} />
        </button>
      </div>

      {/* 같은 위치 레코드 선택 바텀시트 */}
      {overlapRecords && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={() => setOverlapRecords(null)}
        >
          <div
            className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-t-2xl p-4 pb-safe"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-zinc-200">
                같은 위치 계량기 {overlapRecords.length}개
              </span>
              <button
                onClick={() => setOverlapRecords(null)}
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              {overlapRecords.map(r => {
                const st = getStatus(r);
                return (
                  <button
                    key={r.id}
                    onClick={() => { setOverlapRecords(null); setEditingRecord(r); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800 text-left transition-colors"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: STATUS_COLOR[st] }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{r.name ?? '이름 없음'}</p>
                      <p className="text-xs text-zinc-500 truncate">{r.address ?? r.row_no ?? '-'}</p>
                    </div>
                    <span className="text-xs text-zinc-500 flex-shrink-0">{STATUS_LABEL[st]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {editingRecord && (
        <MeterEditModal
          record={editingRecord}
          onClose={async () => {
            setEditingRecord(null);
            await loadRecords();
          }}
        />
      )}
    </div>
  );
}
