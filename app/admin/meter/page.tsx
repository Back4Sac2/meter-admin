import { getMeterRecords, getBlockList, type SortCol, type SortDir, type StatusFilter } from './_actions';
import { getRegionsWithBlocks } from '@/app/admin/regions/_actions';
import MeterTable from '@/components/admin/MeterTable';

export const metadata = { title: '야장관리' };

const PAGE_SIZE = 20;
const VALID_SORT_COLS: SortCol[] = ['row_no', 'address', 'survey_date'];
const VALID_SORT_DIRS: SortDir[] = ['asc', 'desc'];
const VALID_STATUSES: StatusFilter[] = ['processed', 'unprocessed', 'closed'];

export default async function MeterPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; block?: string; q?: string; sort?: string; dir?: string; status?: string; dateFrom?: string; dateTo?: string; region?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const block = params.block;
  const regionId = params.region;
  const search = params.q?.trim() || undefined;
  const sortCol = (VALID_SORT_COLS.includes(params.sort as SortCol) ? params.sort : 'row_no') as SortCol;
  const sortDir = (VALID_SORT_DIRS.includes(params.dir as SortDir) ? params.dir : 'asc') as SortDir;
  const status = (VALID_STATUSES.includes(params.status as StatusFilter) ? params.status : undefined) as StatusFilter | undefined;
  const dateFrom = params.dateFrom?.trim() || undefined;
  const dateTo = params.dateTo?.trim() || undefined;

  const [regions, blocks] = await Promise.all([getRegionsWithBlocks(), getBlockList()]);

  const selectedRegion = regionId ? regions.find((r) => r.id === regionId) : undefined;
  // 지역 선택 시 해당 지역 블록 목록으로 필터 (단일 블록 선택 중이면 block 필터 우선)
  const blockIn = selectedRegion && !block ? selectedRegion.blocks : undefined;

  const { data, count, totalCount, processedCount, closedCount } = await getMeterRecords(
    page, PAGE_SIZE, block, search, sortCol, sortDir, status, dateFrom, dateTo, blockIn,
  );

  const unprocessedCount = totalCount - processedCount - closedCount;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">야장관리</h1>
          <p className="text-sm mt-1 flex items-center gap-2">
            <span className="text-emerald-400">처리 {processedCount}개</span>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-500">미처리 {unprocessedCount}개</span>
            <span className="text-zinc-700">|</span>
            <span className="text-amber-500">호폐 {closedCount}개</span>
          </p>
        </div>
      </div>
      <MeterTable
        records={data}
        blocks={blocks}
        selectedBlock={block ?? null}
        regions={regions}
        selectedRegion={regionId ?? null}
        search={search ?? ''}
        total={count}
        page={page}
        pageSize={PAGE_SIZE}
        sortCol={sortCol}
        sortDir={sortDir}
        status={status ?? null}
        processedCount={processedCount}
        unprocessedCount={unprocessedCount}
        closedCount={closedCount}
        dateFrom={dateFrom ?? ''}
        dateTo={dateTo ?? ''}
      />
    </div>
  );
}
