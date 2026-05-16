'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2, MapPin } from 'lucide-react';
import { type RegionWithBlocks, createRegion, deleteRegion, assignBlockToRegion } from './_actions';
import { useRouter } from 'next/navigation';

type Props = {
  regions: RegionWithBlocks[];
  allBlocks: string[];
};

export default function RegionsClient({ regions, allBlocks }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const blockRegionMap = new Map<string, string | null>();
  for (const r of regions) {
    for (const b of r.blocks) blockRegionMap.set(b, r.id);
  }
  const unassigned = allBlocks.filter((b) => !blockRegionMap.has(b));

  function refresh() {
    router.refresh();
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    startTransition(async () => {
      const res = await createRegion(newName.trim());
      if (res.error) { setError(res.error); return; }
      setNewName('');
      refresh();
    });
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`'${name}' 지역을 삭제하시겠습니까? 블록 할당이 모두 해제됩니다.`)) return;
    startTransition(async () => {
      await deleteRegion(id);
      refresh();
    });
  }

  function handleAssign(block: string, regionId: string | null) {
    startTransition(async () => {
      await assignBlockToRegion(block, regionId);
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* 지역 추가 폼 */}
      <form onSubmit={handleCreate} className="flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="새 지역명 (예: 진안, 금산)"
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 w-64"
        />
        <button
          type="submit"
          disabled={isPending || !newName.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={14} />
          추가
        </button>
        {error && <span className="text-red-400 text-sm">{error}</span>}
      </form>

      {/* 지역 목록 */}
      {regions.length === 0 ? (
        <div className="text-zinc-500 text-sm py-8 text-center border border-zinc-800 rounded-xl">
          지역을 추가해주세요.
        </div>
      ) : (
        <div className="space-y-3">
          {regions.map((region) => (
            <div key={region.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MapPin size={15} className="text-emerald-400" />
                  <span className="text-white font-semibold">{region.name}</span>
                  <span className="text-xs text-zinc-500">블록 {region.blocks.length}개</span>
                </div>
                <button
                  onClick={() => handleDelete(region.id, region.name)}
                  disabled={isPending}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <Trash2 size={13} />
                  삭제
                </button>
              </div>
              {/* 이 지역에 속한 블록들 */}
              <div className="flex flex-wrap gap-1.5">
                {region.blocks.length === 0 && (
                  <span className="text-xs text-zinc-600">할당된 블록 없음</span>
                )}
                {region.blocks.map((b) => (
                  <button
                    key={b}
                    onClick={() => handleAssign(b, null)}
                    disabled={isPending}
                    title="클릭하면 지역 해제"
                    className="px-2.5 py-1 text-xs bg-emerald-900/60 text-emerald-300 border border-emerald-800 rounded-lg font-mono hover:bg-red-900/40 hover:text-red-300 hover:border-red-800 transition-colors group"
                  >
                    {b} <span className="opacity-0 group-hover:opacity-100 transition-opacity">×</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 미분류 블록 */}
      {unassigned.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-zinc-400 font-semibold text-sm">미분류 블록</span>
            <span className="text-xs text-zinc-600">{unassigned.length}개</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((b) => (
              <div key={b} className="flex items-center gap-1">
                <span className="px-2.5 py-1 text-xs bg-zinc-800 text-zinc-400 rounded-lg font-mono">{b}</span>
                {regions.length > 0 && (
                  <select
                    disabled={isPending}
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) handleAssign(b, e.target.value); }}
                    className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 rounded px-1.5 py-1 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="" disabled>지역 지정</option>
                    {regions.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {allBlocks.length === 0 && (
        <div className="text-zinc-500 text-sm py-8 text-center border border-zinc-800 rounded-xl">
          엑셀 업로드로 블록을 먼저 등록해주세요.
        </div>
      )}
    </div>
  );
}
