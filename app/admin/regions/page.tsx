import { getRegionsWithBlocks, getRegions } from './_actions';
import { getBlockList } from '@/app/admin/meter/_actions';
import RegionsClient from './RegionsClient';

export const metadata = { title: '분류관리' };

export default async function RegionsPage() {
  const [regions, allBlocks] = await Promise.all([
    getRegionsWithBlocks(),
    getBlockList(),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">분류관리</h1>
        <p className="text-sm text-zinc-500 mt-1">블록을 지역 단위로 묶어 관리합니다.</p>
      </div>
      <RegionsClient regions={regions} allBlocks={allBlocks} />
    </div>
  );
}
