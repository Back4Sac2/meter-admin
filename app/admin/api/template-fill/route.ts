import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import JSZip from "jszip";
import type { MeterRecord } from "@/app/admin/meter/_actions";

export const maxDuration = 60;

// ─── 기존 형식 컬럼 ────────────────────────────────────────────────────────────
const C = {
  ROW_NO: "B",
  BLOCK: "E",
  OLD_METER_NO: "U",
  METER_NO: "V",
  READING: "AA",
  SEALED: "AB",
  METER_COND: "AC",
  BOX_COND: "AD",
  LOCATION: "AE",
  WATER_DIRECT: "AG",
  WATER_TANK: "AH",
  WATER_CISTERN: "AI",
  USAGE_TYPE: "AL",
  FLOOR: "AO",
  NOTE: "AP",
  SURVEY_DATE: "AQ",
  COVER_TYPE: "AT",
} as const;

// ─── 대불 형식 컬럼 ────────────────────────────────────────────────────────────
const DB = {
  ROW_NO: "A",
  OLD_METER_NO: "F", // 계량기번호 (기존)
  METER_NO: "P", // 기물번호 (신규 입력값)
  WATER_PRESSURE: "M", // 수압(도면) - 측정 수압 입력
  READING: "N",
  SEALED: "O",
  METER_COND: "T",
  MANUFACTURER: "U",
  LOCATION: "W",
  COVER_TYPE: "X",
  RELOCATION: "Y",
  W_DIRECT: "Z",
  W_INDIRECT: "AA",
  W_TANK: "AB",
  TANK_CAP: "AC",
  METER_TYPE: "Q",
  READING_METHOD: "R",
  USAGE_TYPE: "AI",
  FLOOR: "AL",
  NOTE: "AN",
  BLOCK: "AW",
  SURVEY_DATE: "AY",
  REPLACEMENT: "V",
} as const;

// 기존(금산) 형식: 옥내(건물앞) → 건물앞(옥내)
function reverseLocation(loc: string | null | undefined): string | null {
  if (!loc) return null;
  const m = loc.match(/^(옥내|옥외)\((.+)\)$/);
  if (m) return `${m[2]}(${m[1]})`;
  return loc;
}

function xmlEscape(s: string): string {
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colNum(s: string): number {
  let n = 0;
  for (const c of s) n = n * 26 + c.charCodeAt(0) - 64;
  return n;
}

function parseSharedStrings(xml: string): string[] {
  const result: string[] = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = "";
    for (const t of m[1].matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)) {
      text += t[1];
    }
    result.push(text);
  }
  return result;
}

function getCellStr(
  rowXml: string,
  col: string,
  rowNum: number,
  ss: string[]
): string | null {
  const ref = col + rowNum;
  const m = rowXml.match(
    new RegExp(`<c\\b[^>]*\\br="${ref}"[^>]*(?:/>|>[\\s\\S]*?<\\/c>)`)
  );
  if (!m) return null;
  const cell = m[0];
  const type = (cell.match(/\bt="([^"]+)"/) ?? [])[1] ?? "";

  if (type === "s") {
    const v = (cell.match(/<v>(\d+)<\/v>/) ?? [])[1];
    return v != null ? ss[parseInt(v)] ?? null : null;
  }
  if (type === "inlineStr") {
    return (cell.match(/<t>([^<]*)<\/t>/) ?? [])[1] ?? null;
  }
  return (cell.match(/<v>([^<]*)<\/v>/) ?? [])[1] ?? null;
}

function getOrAddSS(
  ss: string[],
  ssMap: Map<string, number>,
  value: string
): number {
  const existing = ssMap.get(value);
  if (existing !== undefined) return existing;
  const idx = ss.length;
  ss.push(value);
  ssMap.set(value, idx);
  return idx;
}

function setCellStr(
  rowXml: string,
  col: string,
  rowNum: number,
  value: string,
  ss: string[],
  ssMap: Map<string, number>
): string {
  const ref = col + rowNum;
  const idx = getOrAddSS(ss, ssMap, value);
  // [^>]*? lazy: '/' in '/>' 를 삼키지 않도록 — self-closing 빈 셀도 정확히 매칭
  const cellRe = new RegExp(
    `<c\\b[^>]*\\br="${ref}"[^>]*?(?:/>|>[\\s\\S]*?<\\/c>)`
  );
  const m = rowXml.match(cellRe);

  if (m) {
    const sAttr = (m[0].match(/\bs="([^"]+)"/) ?? [])[1];
    const newCell = `<c r="${ref}"${
      sAttr ? ` s="${sAttr}"` : ""
    } t="s"><v>${idx}</v></c>`;
    return rowXml.replace(cellRe, newCell);
  }

  const myCol = colNum(col);
  const allCellsRe = /<c\b[^>]*\br="([A-Z]+)\d+"/g;
  let insertAt = rowXml.lastIndexOf("</row>");
  let mc: RegExpExecArray | null;
  while ((mc = allCellsRe.exec(rowXml)) !== null) {
    if (colNum(mc[1]) > myCol) {
      insertAt = mc.index;
      break;
    }
  }
  const newCell = `<c r="${ref}" t="s"><v>${idx}</v></c>`;
  return rowXml.slice(0, insertAt) + newCell + rowXml.slice(insertAt);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new NextResponse("파일 읽기 실패", { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return new NextResponse("파일이 없습니다", { status: 400 });

  const buffer = await file.arrayBuffer();
  const dateFrom = formData.get("dateFrom") as string | null;
  const dateTo = formData.get("dateTo") as string | null;

  function parseSurveyDate(s: string | null): Date | null {
    if (!s) return null;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
    const kor = s.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (kor) return new Date(new Date().getFullYear(), +kor[1] - 1, +kor[2]);
    return null;
  }

  const admin = createAdminClient();
  // 부분 입력 레코드도 byPos 매핑에 포함 (6개 필드 완료 여부와 무관하게 survey_date 있는 것 전부)
  const PAGE = 5000;
  const allData: MeterRecord[] = [];
  let pageFrom = 0;
  while (true) {
    const { data, error } = await admin
      .from("meter_records")
      .select("*")
      .or(
        "meter_number.not.is.null,reading.not.is.null,sealed.not.is.null,location.not.is.null,usage_type.not.is.null,floor.not.is.null,note.eq.호폐,note.eq.위치불명"
      )
      .order("block", { ascending: true })
      .order("row_no", { ascending: true, nullsFirst: false })
      .range(pageFrom, pageFrom + PAGE - 1);
    if (error)
      return new NextResponse("DB 조회 실패: " + error.message, { status: 500 });
    const page = (data ?? []) as MeterRecord[];
    allData.push(...page);
    if (page.length < PAGE) break;
    pageFrom += PAGE;
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

  // 완료 여부 판단 — filled 카운트에만 사용
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

  const byMeter = new Map<string, MeterRecord>();
  const byPos = new Map<string, MeterRecord>();
  for (const r of records) {
    if (r.old_meter_number) byMeter.set(r.old_meter_number, r);
    if (r.block && r.row_no) byPos.set(`${r.block}::${r.row_no}`, r);
  }

  const zip = await JSZip.loadAsync(buffer);

  const ssXml = (await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "";
  const ss = parseSharedStrings(ssXml);
  const ssMap = new Map<string, number>(ss.map((v, i) => [v, i]));
  const origSsLen = ss.length;

  // ── 시트 경로 결정 + 대불 형식 감지 ─────────────────────────────────────────
  // workbook.xml에서 시트명 → r:id, rels에서 r:id → 파일경로 매핑
  const workbookXml =
    (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const relsXml =
    (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";

  const sheetRidMap = new Map<string, string>();
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*/g)) {
    const name = (m[0].match(/\bname="([^"]+)"/) ?? [])[1];
    const rid = (m[0].match(/\br:id="([^"]+)"/) ?? [])[1];
    if (name && rid) sheetRidMap.set(name, rid);
  }

  const ridPathMap = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*/g)) {
    const id = (m[0].match(/\bId="([^"]+)"/) ?? [])[1];
    const target = (m[0].match(/\bTarget="([^"]+)"/) ?? [])[1];
    if (id && target) ridPathMap.set(id, target);
  }

  // "수도미터목록" 시트가 있으면 대불 형식 (5번째 시트라도 정확히 찾음)
  const daebulRid = sheetRidMap.get("수도미터목록");
  const isDaebul = !!daebulRid;

  let sheetPath: string;
  if (isDaebul && daebulRid) {
    const target = ridPathMap.get(daebulRid) ?? "worksheets/sheet1.xml";
    sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  } else {
    sheetPath = "xl/worksheets/sheet1.xml";
    for (const m of relsXml.matchAll(/<Relationship\b[^>]+>/g)) {
      if (m[0].includes('/worksheet"') || m[0].includes("/worksheet ")) {
        const t = (m[0].match(/Target="([^"]+)"/) ?? [])[1];
        if (t) {
          sheetPath = t.startsWith("/") ? t.slice(1) : `xl/${t}`;
          break;
        }
      }
    }
  }

  const wsFile = zip.file(sheetPath);
  if (!wsFile)
    return new NextResponse("시트를 찾을 수 없습니다", { status: 400 });
  let wsXml = await wsFile.async("string");

  const DATA_START_ROW = isDaebul ? 5 : 4;

  let filled = 0;
  const filledIds = new Set<number>();

  wsXml = wsXml.replace(
    /<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g,
    (rowXml, rn) => {
      const rowNum = parseInt(rn);
      if (rowNum < DATA_START_ROW) return rowXml;

      let rec: MeterRecord | undefined;

      if (isDaebul) {
        // 대불 형식: P=기물번호, A=번호, AW=소블록
        const oldMeter = getCellStr(rowXml, DB.OLD_METER_NO, rowNum, ss);
        const rowNo = getCellStr(rowXml, DB.ROW_NO, rowNum, ss);
        const blockVal = getCellStr(rowXml, DB.BLOCK, rowNum, ss);

        if (!oldMeter && !rowNo) return rowXml;
        // 위치 정보 있으면 byPos만 사용 (폴백 없음 — 같은 계량기번호 중복 행에 잘못된 레코드 매칭 방지)
        if (blockVal && rowNo) {
          rec = byPos.get(`${blockVal}::${rowNo}`);
        } else if (oldMeter) {
          rec = byMeter.get(oldMeter);
        }
        if (!rec) return rowXml;

        if (!filledIds.has(rec.id)) {
          if (isCompleted(rec)) filled++;
          filledIds.add(rec.id);
        }
        let row = rowXml;
        const set = (col: string, val: string | null | undefined) => {
          if (val) row = setCellStr(row, col, rowNum, val, ss, ssMap);
        };

        set(DB.OLD_METER_NO, rec.old_meter_number);
        set(DB.METER_NO, rec.meter_number ?? rec.old_meter_number);
        set(DB.WATER_PRESSURE, rec.water_pressure);
        set(DB.BLOCK, rec.block);
        set(DB.READING, rec.reading);
        set(DB.SEALED, rec.sealed);
        set(DB.METER_COND, rec.meter_condition);
        set(DB.MANUFACTURER, rec.manufacturer);
        set(DB.LOCATION, rec.location);
        set(DB.COVER_TYPE, rec.cover_type);
        set(DB.RELOCATION, rec.relocation_needed);

        if (rec.water_supply_type === "물탱크") {
          set(DB.W_TANK, "유");
          set(DB.TANK_CAP, rec.water_tank_capacity);
        } else if (rec.water_supply_type === "직접") {
          set(DB.W_DIRECT, "○");
          set(DB.TANK_CAP, "직접급수");
        } else if (rec.water_supply_type === "간접") {
          set(DB.W_INDIRECT, "○");
          set(DB.TANK_CAP, "직접급수");
        } else {
          set(DB.TANK_CAP, "직접급수");
        }

        set(DB.METER_TYPE, rec.meter_type);
        if (rec.meter_type === "기계식") {
          set(DB.READING_METHOD, "인력검침");
        } else {
          set(DB.READING_METHOD, rec.reading_method);
        }
        set(DB.USAGE_TYPE, rec.usage_type);
        set(DB.FLOOR, rec.floor);
        set(DB.NOTE, rec.note);
        set(DB.REPLACEMENT, rec.replacement_needed);

        {
          const d =
            parseSurveyDate(rec.survey_date) ?? parseSurveyDate(rec.created_at);
          if (d) {
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
              2,
              "0"
            )}-${String(d.getDate()).padStart(2, "0")}`;
            set(DB.SURVEY_DATE, iso);
          }
        }

        return row;
      } else {
        // 기존 형식
        const oldMeter = getCellStr(rowXml, C.OLD_METER_NO, rowNum, ss);
        const block = getCellStr(rowXml, C.BLOCK, rowNum, ss);
        const rowNo = getCellStr(rowXml, C.ROW_NO, rowNum, ss);

        if (!oldMeter && !block && !rowNo) return rowXml;
        if (block && rowNo) {
          rec = byPos.get(`${block}::${rowNo}`);
        } else if (oldMeter) {
          rec = byMeter.get(oldMeter);
        }
        if (!rec) return rowXml;

        if (!filledIds.has(rec.id)) {
          if (isCompleted(rec)) filled++;
          filledIds.add(rec.id);
        }
        let row = rowXml;
        const set = (col: string, val: string | null | undefined) => {
          if (val) row = setCellStr(row, col, rowNum, val, ss, ssMap);
        };

        if (rec.meter_number) set(C.METER_NO, rec.meter_number);
        set(C.READING, rec.reading);
        set(C.SEALED, rec.sealed);
        set(C.METER_COND, rec.meter_condition);
        set(C.BOX_COND, rec.cover_type);
        set(C.LOCATION, reverseLocation(rec.location));
        set(C.USAGE_TYPE, rec.usage_type);
        set(C.FLOOR, rec.floor);
        set(C.NOTE, rec.note);
        set(C.COVER_TYPE, rec.cover_type);

        {
          const d =
            parseSurveyDate(rec.survey_date) ?? parseSurveyDate(rec.created_at);
          if (d) {
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
              2,
              "0"
            )}-${String(d.getDate()).padStart(2, "0")}`;
            set(C.SURVEY_DATE, iso);
          }
        }

        if (rec.water_supply_type === "물탱크") set(C.WATER_TANK, "○");
        else if (rec.water_supply_type === "저수조") set(C.WATER_CISTERN, "○");
        else if (rec.water_supply_type) set(C.WATER_DIRECT, "○");

        return row;
      }
    }
  );

  zip.file(sheetPath, wsXml);

  if (ss.length > origSsLen) {
    const newEntries = ss
      .slice(origSsLen)
      .map((v) => `<si><t xml:space="preserve">${xmlEscape(v)}</t></si>`)
      .join("");
    const updated = ssXml
      .replace(/(<sst[^>]+count=)"(\d+)"/, (_, p) => `${p}"${ss.length}"`)
      .replace(/(<sst[^>]+uniqueCount=)"(\d+)"/, (_, p) => `${p}"${ss.length}"`)
      .replace("</sst>", newEntries + "</sst>");
    zip.file("xl/sharedStrings.xml", updated);
  }

  zip.remove("xl/calcChain.xml");

  const out = await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const safeName = encodeURIComponent(
    file.name.replace(/(\.[^.]+)$/, "_작성완료$1")
  );

  return new NextResponse(out, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${safeName}`,
      "X-Filled-Count": String(filled),
    },
  });
}
