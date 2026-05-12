'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export type MeterRecord = {
  id: number;
  block: string;
  row_no: string | null;
  name: string | null;
  address: string | null;
  old_meter_number: string | null;
  meter_number: string | null;
  reading: string | null;
  sealed: string | null;
  location: string | null;
  usage_type: string | null;
  floor: string | null;
  note: string | null;
  survey_date: string | null;
  cover_type: string | null;
  water_supply_type: string | null;
  meter_condition: string | null;
  image1_id: string | null;
  image2_id: string | null;
  image3_id: string | null;
  image4_id: string | null;
  manufacturer: string | null;
  relocation_needed: string | null;
  replacement_needed: string | null;
  water_tank_capacity: string | null;
  water_pressure: string | null;
  meter_type: string | null;
  reading_method: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
};

export type MeterInsert = Omit<MeterRecord, 'id' | 'created_at'>;

async function requireAuth() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
}

export type SortCol = 'row_no' | 'address' | 'survey_date';
export type SortDir = 'asc' | 'desc';

export type StatusFilter = 'processed' | 'unprocessed' | 'closed';

// 6개 필드 전부 입력 AND 호폐 아님
const ALL_FILLED =
  'meter_number.not.is.null,reading.not.is.null,sealed.not.is.null,location.not.is.null,usage_type.not.is.null,floor.not.is.null';
// 하나라도 비어있음
const ANY_EMPTY =
  'meter_number.is.null,reading.is.null,sealed.is.null,location.is.null,usage_type.is.null,floor.is.null';
// 호폐 아님 (null 포함)
const NOT_CLOSED = 'note.is.null,note.neq.호폐';

export async function getMeterRecords(
  page: number,
  pageSize: number,
  block?: string,
  search?: string,
  sortCol: SortCol = 'row_no',
  sortDir: SortDir = 'asc',
  status?: StatusFilter,
  dateFrom?: string,
  dateTo?: string,
) {
  const admin = createAdminClient();
  const asc = sortDir === 'asc';

  let mainQuery = admin
    .from('meter_records')
    .select('*', { count: 'exact' })
    .order(sortCol, { ascending: asc, nullsFirst: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  let totalQuery = admin.from('meter_records').select('*', { count: 'exact', head: true });
  let closedQuery = admin.from('meter_records').select('*', { count: 'exact', head: true }).eq('note', '호폐');
  let processedQuery = admin.from('meter_records').select('*', { count: 'exact', head: true })
    .or(NOT_CLOSED).not('meter_number', 'is', null).not('reading', 'is', null)
    .not('sealed', 'is', null).not('location', 'is', null)
    .not('usage_type', 'is', null).not('floor', 'is', null);

  if (block) {
    mainQuery = mainQuery.eq('block', block);
    totalQuery = totalQuery.eq('block', block);
    closedQuery = closedQuery.eq('block', block);
    processedQuery = processedQuery.eq('block', block);
  }
  if (search) {
    const term = `%${search}%`;
    const sf = `row_no.ilike.${term},address.ilike.${term},old_meter_number.ilike.${term}`;
    mainQuery = mainQuery.or(sf);
    totalQuery = totalQuery.or(sf);
    closedQuery = closedQuery.or(sf);
    processedQuery = processedQuery.or(sf);
  }

  // 상태 필터는 메인 쿼리에만 적용
  if (status === 'closed') {
    mainQuery = mainQuery.eq('note', '호폐');
  } else if (status === 'processed') {
    mainQuery = mainQuery.or(NOT_CLOSED).not('meter_number', 'is', null)
      .not('reading', 'is', null).not('sealed', 'is', null)
      .not('location', 'is', null).not('usage_type', 'is', null).not('floor', 'is', null);
  } else if (status === 'unprocessed') {
    mainQuery = mainQuery.or(NOT_CLOSED).or(ANY_EMPTY);
  }

  if (dateFrom) {
    mainQuery     = mainQuery.gte('survey_date', dateFrom);
    totalQuery    = totalQuery.gte('survey_date', dateFrom);
    closedQuery   = closedQuery.gte('survey_date', dateFrom);
    processedQuery = processedQuery.gte('survey_date', dateFrom);
  }
  if (dateTo) {
    const nd = nextDay(dateTo);
    mainQuery     = mainQuery.lt('survey_date', nd);
    totalQuery    = totalQuery.lt('survey_date', nd);
    closedQuery   = closedQuery.lt('survey_date', nd);
    processedQuery = processedQuery.lt('survey_date', nd);
  }

  const [{ data, count, error }, { count: totalCount }, { count: closedCount }, { count: processedCount }] =
    await Promise.all([mainQuery, totalQuery, closedQuery, processedQuery]);

  return {
    data: (data ?? []) as MeterRecord[],
    count: count ?? 0,
    totalCount: totalCount ?? 0,
    processedCount: processedCount ?? 0,
    closedCount: closedCount ?? 0,
    error,
  };
}

export async function getBlockList(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('meter_records').select('block').order('block');
  const all = (data ?? []).map((r: { block: string }) => r.block);
  return [...new Set(all)];
}

export async function importFromExcel(block: string, rows: MeterInsert[]) {
  await requireAuth();
  const admin = createAdminClient();
  await admin.from('meter_records').delete().eq('block', block);
  const { error } = await admin.from('meter_records').insert(rows);
  if (error) return { error: error.message };
  revalidatePath('/admin/meter');
  return { success: true };
}

export async function updateMeterRecord(id: number, data: Partial<MeterInsert>) {
  await requireAuth();
  const admin = createAdminClient();
  const { error } = await admin.from('meter_records').update(data).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/meter');
  return { success: true };
}

export async function deleteMeterRecord(id: number) {
  await requireAuth();
  const admin = createAdminClient();
  const { error } = await admin.from('meter_records').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/meter');
  return { success: true };
}

export async function getMeterRecordsWithSurveyData(): Promise<MeterRecord[]> {
  await requireAuth();
  const admin = createAdminClient();
  const { data } = await admin
    .from('meter_records')
    .select('*')
    .or('meter_number.not.is.null,reading.not.is.null,sealed.not.is.null,note.eq.호폐')
    .order('block', { ascending: true })
    .order('row_no', { ascending: true, nullsFirst: false });
  return (data ?? []) as MeterRecord[];
}

export async function getMeterRecordsForExport(blocks: string[]): Promise<MeterRecord[]> {
  await requireAuth();
  const admin = createAdminClient();
  const { data } = await admin
    .from('meter_records')
    .select('*')
    .in('block', blocks);
  return (data ?? []) as MeterRecord[];
}

function nextDay(date: string) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function getCompletedRecords(dateFrom?: string, dateTo?: string): Promise<MeterRecord[]> {
  await requireAuth();
  const admin = createAdminClient();
  let query = admin
    .from('meter_records')
    .select('*')
    .or(
      `and(note.is.null,meter_number.not.is.null,reading.not.is.null,sealed.not.is.null,location.not.is.null,usage_type.not.is.null,floor.not.is.null),` +
      `and(note.neq.호폐,meter_number.not.is.null,reading.not.is.null,sealed.not.is.null,location.not.is.null,usage_type.not.is.null,floor.not.is.null),` +
      `note.eq.호폐`
    )
    .order('block', { ascending: true })
    .order('row_no', { ascending: true, nullsFirst: false });
  if (dateFrom) query = query.gte('survey_date', dateFrom);
  if (dateTo) query = query.lt('survey_date', nextDay(dateTo));
  const { data } = await query;
  return (data ?? []) as MeterRecord[];
}

export async function getRecordsWithImages(dateFrom?: string, dateTo?: string): Promise<Pick<MeterRecord, 'id' | 'block' | 'row_no' | 'image1_id' | 'image2_id' | 'image3_id' | 'image4_id' | 'survey_date'>[]> {
  await requireAuth();
  const admin = createAdminClient();
  let query = admin
    .from('meter_records')
    .select('id, block, row_no, image1_id, image2_id, image3_id, image4_id, survey_date')
    .or('image1_id.not.is.null,image2_id.not.is.null,image3_id.not.is.null,image4_id.not.is.null')
    .order('block', { ascending: true })
    .order('row_no', { ascending: true, nullsFirst: false });
  if (dateFrom) query = query.gte('survey_date', dateFrom);
  if (dateTo) query = query.lt('survey_date', nextDay(dateTo));
  const { data } = await query;
  return (data ?? []) as Pick<MeterRecord, 'id' | 'block' | 'row_no' | 'image1_id' | 'image2_id' | 'image3_id' | 'image4_id' | 'survey_date'>[];
}

export async function getMeterRecordsForMap(block?: string, status?: StatusFilter): Promise<MeterRecord[]> {
  await requireAuth();
  const admin = createAdminClient();
  let query = admin
    .from('meter_records')
    .select('*')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .order('block', { ascending: true })
    .order('row_no', { ascending: true, nullsFirst: false });
  if (block) query = query.eq('block', block);
  if (status === 'closed') {
    query = query.eq('note', '호폐');
  } else if (status === 'processed') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = (query.or(NOT_CLOSED) as any)
      .not('meter_number', 'is', null).not('reading', 'is', null)
      .not('sealed', 'is', null).not('location', 'is', null)
      .not('usage_type', 'is', null).not('floor', 'is', null);
  } else if (status === 'unprocessed') {
    query = query.or(NOT_CLOSED).or(ANY_EMPTY);
  }
  const { data } = await query;
  return (data ?? []) as MeterRecord[];
}

export async function getUngeocodedRecords(block?: string): Promise<Pick<MeterRecord, 'id' | 'address'>[]> {
  await requireAuth();
  const admin = createAdminClient();
  let query = admin
    .from('meter_records')
    .select('id, address')
    .or('lat.is.null,lng.is.null')
    .not('address', 'is', null);
  if (block) query = query.eq('block', block);
  const { data } = await query;
  return (data ?? []) as Pick<MeterRecord, 'id' | 'address'>[];
}
