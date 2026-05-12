import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { record_id, address } = (await request.json()) as { record_id: number; address: string };
  if (!record_id || !address) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Naver API keys not configured' }, { status: 500 });
  }

  const url = `https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: {
      'x-ncp-apigw-api-key-id': clientId,
      'x-ncp-apigw-api-key': clientSecret,
    },
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Geocoding API error' }, { status: 500 });
  }

  const json = await res.json();
  const first = json.addresses?.[0];
  if (!first) {
    return NextResponse.json({ error: 'No result' }, { status: 404 });
  }

  const lat = parseFloat(first.y);
  const lng = parseFloat(first.x);

  const admin = createAdminClient();
  await admin.from('meter_records').update({ lat, lng }).eq('id', record_id);

  return NextResponse.json({ lat, lng });
}
