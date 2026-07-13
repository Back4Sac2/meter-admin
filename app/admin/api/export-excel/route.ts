import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import * as XLSX from "xlsx";
import type { MeterRecord } from "@/app/admin/meter/_actions";

export const maxDuration = 60;

function isCompleted(r: MeterRecord): boolean {
  if (r.note === "호폐" || r.note === "위치불명") return true;
  return !!(
    r.meter_number &&
    r.reading &&
    r.sealed &&
    r.location &&
    r.usage_type &&
    r.floor
  );
}

function parseSurveyDate(s: string | null): Date | null {
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const kor = s.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (kor) return new Date(new Date().getFullYear(), +kor[1] - 1, +kor[2]);
  return null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const block = searchParams.get("block");

  const admin = createAdminClient();
  const PAGE = 5000;
  const allData: MeterRecord[] = [];
  let from = 0;
  while (true) {
    let q = admin
      .from("meter_records")
      .select("*")
      .order("block", { ascending: true })
      .order("row_no", { ascending: true, nullsFirst: false })
      .range(from, from + PAGE - 1);
    if (block) q = q.eq("block", block);
    const { data, error } = await q;
    if (error)
      return new NextResponse("DB 조회 실패: " + error.message, { status: 500 });
    const page = (data ?? []) as MeterRecord[];
    allData.push(...page);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  let records = allData;

  if (dateFrom || dateTo) {
    const isoToDate = (s: string) => {
      const p = s.split("-");
      return new Date(+p[0], +p[1] - 1, +p[2]);
    };
    const from = dateFrom ? isoToDate(dateFrom) : null;
    const to = dateTo ? isoToDate(dateTo) : null;
    records = records.filter((r) => {
      const d = parseSurveyDate(r.survey_date);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }

  const rows = records.map((r) => ({
    도면번호: r.row_no ?? "",
    블록: r.block ?? "",
    성명: r.name ?? "",
    주소: r.address ?? "",
    기존기물번호: r.old_meter_number ?? "",
    신규기물번호: r.meter_number ?? "",
    지침: r.reading ?? "",
    최종지침: r.final_reading ?? "",
    봉인유무: r.sealed ?? "",
    위치: r.location ?? "",
    용도: r.usage_type ?? "",
    층: r.floor ?? "",
    비고: r.note ?? "",
    조사일: r.survey_date ?? "",
    뚜껑종류: r.cover_type ?? "",
    급수방식: r.water_supply_type ?? "",
    물탱크용량: r.water_tank_capacity ?? "",
    수압: r.water_pressure ?? "",
    계량기상태: r.meter_condition ?? "",
    제조사: r.manufacturer ?? "",
    계량기종류: r.meter_type ?? "",
    검침방식: r.reading_method ?? "",
    이설필요: r.relocation_needed ?? "",
    교체필요: r.replacement_needed ?? "",
    작업완료: isCompleted(r) ? "완료" : "",
    위도: r.lat ?? "",
    경도: r.lng ?? "",
    생성일: r.created_at ? r.created_at.slice(0, 10) : "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  // 열 너비 자동 조정
  const colWidths = [
    { wch: 8 },  // 도면번호
    { wch: 10 }, // 블록
    { wch: 10 }, // 성명
    { wch: 30 }, // 주소
    { wch: 14 }, // 기존기물번호
    { wch: 14 }, // 신규기물번호
    { wch: 8 },  // 지침
    { wch: 8 },  // 최종지침
    { wch: 8 },  // 봉인유무
    { wch: 14 }, // 위치
    { wch: 8 },  // 용도
    { wch: 6 },  // 층
    { wch: 10 }, // 비고
    { wch: 12 }, // 조사일
    { wch: 10 }, // 뚜껑종류
    { wch: 10 }, // 급수방식
    { wch: 10 }, // 물탱크용량
    { wch: 8 },  // 수압
    { wch: 10 }, // 계량기상태
    { wch: 10 }, // 제조사
    { wch: 10 }, // 계량기종류
    { wch: 10 }, // 검침방식
    { wch: 8 },  // 이설필요
    { wch: 8 },  // 교체필요
    { wch: 8 },  // 작업완료
    { wch: 12 }, // 위도
    { wch: 12 }, // 경도
    { wch: 12 }, // 생성일
  ];
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "야장데이터");

  const buf: Uint8Array = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const today = new Date().toISOString().slice(0, 10);
  const label = block ? `_${block}블록` : "";
  const fileName = encodeURIComponent(`야장데이터${label}_${today}.xlsx`);

  return new NextResponse(buf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
      "X-Record-Count": String(records.length),
    },
  });
}
