'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export type Region = { id: string; name: string; created_at: string };
export type RegionWithBlocks = Region & { blocks: string[] };
export type BlockRegion = { block: string; region_id: string | null };

async function requireAuth() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
}

export async function getRegions(): Promise<Region[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('regions').select('*').order('name');
  return (data ?? []) as Region[];
}

export async function getRegionsWithBlocks(): Promise<RegionWithBlocks[]> {
  const admin = createAdminClient();
  const [{ data: regions }, { data: blockRegions }] = await Promise.all([
    admin.from('regions').select('*').order('name'),
    admin.from('block_regions').select('block, region_id'),
  ]);

  const regionMap = new Map<string, string[]>();
  for (const r of (regions ?? []) as Region[]) {
    regionMap.set(r.id, []);
  }
  for (const br of (blockRegions ?? []) as { block: string; region_id: string }[]) {
    regionMap.get(br.region_id)?.push(br.block);
  }

  return ((regions ?? []) as Region[]).map((r) => ({
    ...r,
    blocks: (regionMap.get(r.id) ?? []).sort(),
  }));
}

export async function getBlockRegions(): Promise<BlockRegion[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('block_regions').select('block, region_id');
  return (data ?? []) as BlockRegion[];
}

export async function createRegion(name: string): Promise<{ error?: string }> {
  await requireAuth();
  const trimmed = name.trim();
  if (!trimmed) return { error: '지역명을 입력해주세요.' };
  const admin = createAdminClient();
  const { error } = await admin.from('regions').insert({ name: trimmed });
  if (error) return { error: error.message.includes('unique') ? '이미 존재하는 지역명입니다.' : error.message };
  revalidatePath('/admin/regions');
  return {};
}

export async function deleteRegion(id: string): Promise<{ error?: string }> {
  await requireAuth();
  const admin = createAdminClient();
  // block_regions에서 해당 region 할당 먼저 제거
  await admin.from('block_regions').delete().eq('region_id', id);
  const { error } = await admin.from('regions').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/regions');
  return {};
}

export async function assignBlockToRegion(block: string, regionId: string | null): Promise<{ error?: string }> {
  await requireAuth();
  const admin = createAdminClient();
  if (regionId === null) {
    await admin.from('block_regions').delete().eq('block', block);
  } else {
    const { error } = await admin.from('block_regions').upsert(
      { block, region_id: regionId },
      { onConflict: 'block' }
    );
    if (error) return { error: error.message };
  }
  revalidatePath('/admin/regions');
  revalidatePath('/admin/meter');
  return {};
}
