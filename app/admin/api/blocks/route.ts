import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const admin = createAdminClient();
  const PAGE = 5000;
  const blockSet = new Set<string>();
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from("meter_records")
      .select("block")
      .order("block", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return new NextResponse("DB 조회 실패", { status: 500 });
    const page = data ?? [];
    for (const r of page) if (r.block) blockSet.add(r.block);
    if (page.length < PAGE) break;
    from += PAGE;
  }
  const blocks = [...blockSet].sort();

  return NextResponse.json(blocks);
}
