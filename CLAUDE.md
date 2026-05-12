# meter-admin

수용가 조사 야장관리 전용 Next.js 앱. booup-blog에서 분리된 독립 프로젝트.

## 스택
- Next.js 16 App Router, TypeScript, Tailwind CSS v4
- Supabase (auth + DB), Cloudflare R2 (이미지 스토리지), Naver Maps API

## 핵심 파일 맵

```
proxy.ts                               # 인증 보호 — 미인증 시 /admin/login 리다이렉트 (Next.js 16: middleware.ts → proxy.ts)
app/
  admin/
    _actions.ts                        # loginAction, logoutAction (로그인 후 /admin/meter)
    login/page.tsx                     # 로그인 페이지 (진입점)
    meter/
      page.tsx                         # 야장관리 메인 (서버 컴포넌트)
      _actions.ts                      # DB CRUD, getMeterRecords, getCompletedRecords 등
    meter-excel/page.tsx               # 엑셀관리자 (차분 다운로드 / 양식 채우기)
    api/
      template-fill/route.ts           # 대불/기존 양식 채우기 — JSZip으로 xlsx 직접 조작
      upload-meter-image/route.ts      # R2 presigned URL 발급 + DB 이미지 경로 저장
      image-list/route.ts              # 이미지 목록 조회 (ZIP 다운로드용)
      image-proxy/route.ts             # R2 이미지 프록시
      geocode/route.ts                 # Naver Maps 지오코딩 → lat/lng DB 저장
components/admin/
  MeterTable.tsx                       # 야장 목록 테이블 (필터/정렬/페이지네이션/다운로드)
  MeterEditModal.tsx                   # 야장 레코드 수정 모달 (핵심 입력 UI)
  MeterExcelUpload.tsx                 # 엑셀 업로드 (기존/대불 형식 자동 감지)
  MeterExcelDiff.tsx                   # 차분 다운로드 (기제출 엑셀 비교)
  MeterTemplateFill.tsx                # 양식 채우기 UI
  MeterMapView.tsx                     # Naver Maps 지도 뷰
  AdminNav.tsx                         # 사이드바/상단바/하단탭바
lib/
  supabase/{admin,server,client}.ts    # Supabase 클라이언트
  r2-storage.ts                        # R2 업로드/삭제/presign
```

## DB 테이블: `meter_records`

주요 컬럼:
- `id`, `block`, `row_no`, `name`, `address`, `old_meter_number`
- `meter_number`, `reading`, `sealed` (봉인/미봉인), `location`
- `usage_type`, `floor`, `note`, `survey_date`
- `cover_type`, `water_supply_type`, `water_tank_capacity`, `water_pressure`
- `meter_condition`, `manufacturer`, `relocation_needed`, `replacement_needed`
- `meter_type`, `reading_method`
- `image1_id`~`image4_id` (R2 파일 경로)
- `lat`, `lng`, `created_at`

처리 완료 판정: `meter_number`, `reading`, `sealed`, `location`, `usage_type`, `floor` 6개 전부 not null (또는 `note = '호폐'`)

## 엑셀 형식

**기존 형식** (`xl/worksheets/sheet1.xml`, 데이터 4행~): 상수 `C` 참고  
**대불 형식** (`수도미터목록` 시트 존재 시 감지, 데이터 5행~): 상수 `DB` 참고  
→ template-fill/route.ts 상단 `C`, `DB` 상수에 컬럼 매핑 정의됨

## 위치 선택 구조 (MeterEditModal)

2단계: 옥내/옥외 → 건물앞/건물뒤/건물좌/건물우/입구좌/입구우/기타  
저장값 형식: `옥내(건물앞)`, `옥외(입구좌)` 등

## 환경변수 (Vercel에 세팅 필요)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
NEXT_PUBLIC_R2_PUBLIC_URL
NEXT_PUBLIC_NAVER_CLIENT_ID
NAVER_CLIENT_ID
NAVER_CLIENT_SECRET
```
