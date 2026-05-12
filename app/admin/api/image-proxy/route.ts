import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const path = req.nextUrl.searchParams.get('path');
  if (!path) return new Response('Missing path', { status: 400 });

  const storageBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, '');
  if (!storageBase) return new Response('Storage URL not configured', { status: 500 });

  const res = await fetch(`${storageBase}/${path}`);
  if (!res.ok) return new Response('Image not found', { status: 404 });

  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
