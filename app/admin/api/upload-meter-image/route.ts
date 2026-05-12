import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getUploadPresignedUrl, deleteFromStorage } from '@/lib/r2-storage';

// GET: presigned URL 발급 (파일 크기 제한 없음)
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const recordId = searchParams.get('record_id');
  const slot = searchParams.get('slot') as '1' | '2' | '3' | '4' | null;
  const rowNo = searchParams.get('row_no');
  const contentType = searchParams.get('content_type') ?? 'image/jpeg';

  if (!recordId || !slot || !rowNo) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const rawExt = contentType.split('/')[1] ?? 'jpg';
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
  const filePath = `${rowNo}-${slot}.${ext}`;

  try {
    const presignedUrl = await getUploadPresignedUrl(filePath, contentType);
    return NextResponse.json({ presignedUrl, filePath });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST: 브라우저→R2 직접 업로드 완료 후 DB에 경로 저장
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { record_id, slot, file_path } = (await request.json()) as {
    record_id: number;
    slot: 1 | 2 | 3 | 4;
    file_path: string;
  };

  if (!record_id || !slot || !file_path) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const admin = createAdminClient();
  const column = slot === 1 ? 'image1_id' : slot === 2 ? 'image2_id' : slot === 3 ? 'image3_id' : 'image4_id';
  const { error } = await admin
    .from('meter_records')
    .update({ [column]: file_path })
    .eq('id', Number(record_id));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ filePath: file_path });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { record_id, slot, file_path } = (await request.json()) as {
    record_id: number;
    slot: 1 | 2 | 3 | 4;
    file_path: string;
  };

  try {
    await deleteFromStorage(file_path);
  } catch {}

  const admin = createAdminClient();
  const column = slot === 1 ? 'image1_id' : slot === 2 ? 'image2_id' : slot === 3 ? 'image3_id' : 'image4_id';
  await admin.from('meter_records').update({ [column]: null }).eq('id', record_id);

  return NextResponse.json({ success: true });
}
