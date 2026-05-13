import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUploadPresignedUrl } from '@/lib/r2-storage';

// 모바일 앱 전용: Bearer 토큰으로 인증 후 presigned URL 반환
// Body: { recordId: number, ext: string }
// Returns: { uploadUrl: string, imageId: string }
export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Bearer 토큰으로 사용자 검증
  const admin = createAdminClient();
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { recordId, ext } = (await request.json()) as { recordId: number; ext: string };
  if (!recordId || !ext) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const imageId = `mobile/${recordId}/${Date.now()}.${safeExt}`;
  const contentType = safeExt === 'png' ? 'image/png' : 'image/jpeg';

  try {
    const uploadUrl = await getUploadPresignedUrl(imageId, contentType);
    return NextResponse.json({ uploadUrl, imageId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
