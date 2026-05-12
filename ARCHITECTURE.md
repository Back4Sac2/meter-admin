# 아키텍처 문서

이 문서는 새로 투입된 개발자가 프로젝트의 기술적 선택과 구조를 빠르게 파악할 수 있도록 작성됐습니다.

---

## 전체 흐름

```
[현장 엑셀] → 업로드 → [Supabase DB: meter_records]
                              ↕ 조사원 입력 (웹 UI)
                              ↕ 사진 업로드 (R2)
              다운로드 ← [완성된 엑셀 / 차분 엑셀]
```

---

## 기술 선택 이유

### Next.js 16 App Router
서버 컴포넌트에서 DB를 직접 조회해 초기 렌더링 시 데이터를 함께 내려줍니다. 야장 목록처럼 데이터가 많은 페이지에서 클라이언트 로딩 스피너 없이 바로 표시됩니다. Server Actions로 폼 제출도 별도 API 없이 처리합니다.

### Supabase
인증과 DB를 하나의 서비스로 해결합니다. Supabase Auth로 세션을 관리하고, PostgreSQL을 직접 쿼리합니다. `createAdminClient()`(service role)는 서버에서만, `createClient()`(anon key)는 세션 확인에만 사용합니다.

### Cloudflare R2
현장 사진 저장소로 사용합니다. S3 호환 API를 지원해 `@aws-sdk/client-s3`로 그대로 연결됩니다. 이미지 업로드는 **Presigned URL** 방식으로, 브라우저 → R2 직접 전송하여 서버 Bandwidth를 소비하지 않습니다.

### Naver Maps API
국내 주소 기반 지오코딩에 최적화돼 있습니다. 도로명주소 → 위경도 변환(`/admin/api/geocode`)에 사용하고, 지도 표시는 Naver Maps JS SDK를 동적 로드합니다.

---

## 인증 구조

```
middleware.ts
  ├── /admin/login 이외의 모든 경로 → 미인증 시 /admin/login 리다이렉트
  └── /admin/login → 인증 상태면 /admin/meter 리다이렉트
```

각 API 라우트와 Server Action에서도 개별적으로 `supabase.auth.getUser()`로 재검증합니다. 미들웨어만 믿지 않는 이유는 쿠키 조작 방어를 위해서입니다.

---

## DB 스키마: `meter_records`

한 행 = 수용가 한 곳의 조사 레코드.

```
식별
  id              PK
  block           블록 구분 (엑셀 업로드 단위)
  row_no          도면번호
  name            성명 (업로드 시 마스킹 처리)
  address         도로명주소
  old_meter_number 기존 기물번호 (업로드 시 등록)

조사 결과 (현장 입력)
  meter_number    조사된 기물번호
  reading         지침
  sealed          봉인여부: '봉인' | '미봉인'
  location        위치: '옥내(건물앞)' 형식 (옥내/옥외 + 세부위치 조합)
  usage_type      사용형태
  floor           층수
  note            비고 ('호폐' = 폐전 처리)
  survey_date     조사일자

추가 정보
  cover_type      보호통뚜껑양식
  water_supply_type  급수방식: '직접' | '간접' | '물탱크' | '저수조'
  water_tank_capacity 물탱크 용량
  water_pressure  수압
  meter_condition 계량기 상태
  manufacturer    제작회사
  meter_type      계량기형식: '기계식' | '전자식'
  reading_method  검침방식
  relocation_needed  이설여부: '필요' | '불필요'
  replacement_needed 교체필요: '필요' | '불필요' (선택)

이미지 (R2 파일 경로)
  image1_id ~ image4_id

좌표
  lat, lng        Naver 지오코딩으로 채워짐

  created_at
```

**처리 완료 판정:** `meter_number`, `reading`, `sealed`, `location`, `usage_type`, `floor` 6개 전부 not null (또는 `note = '호폐'`)

---

## 엑셀 처리

### 업로드 (MeterExcelUpload.tsx)

엑셀을 파싱해 DB에 INSERT합니다. 두 가지 형식을 자동 감지합니다.

| 형식 | 감지 기준 | 파싱 방식 |
|---|---|---|
| **기존 형식** | 시트명에 `수도미터목록` 없음 | 헤더 키 이름으로 컬럼 매핑 |
| **대불 형식** | `수도미터목록` 시트 존재 | 컬럼 인덱스(0-based)로 직접 접근 |

같은 블록을 업로드하면 해당 블록 전체를 **DELETE 후 INSERT**합니다. 부분 업데이트가 아니라 전체 교체입니다.

### 양식 채우기 (template-fill/route.ts)

원본 xlsx 파일(양식)에 DB 데이터를 채워 넣습니다. `xlsx` 라이브러리 대신 **JSZip으로 XML을 직접 조작**합니다.

이유: xlsx 라이브러리로 파일을 읽고 쓰면 셀 서식(병합, 테두리, 색상)이 손실됩니다. xlsx는 내부적으로 `.zip` 파일이므로 JSZip으로 `xl/worksheets/sheet*.xml`을 직접 파싱·수정하면 원본 서식을 100% 보존할 수 있습니다.

매칭 우선순위: `block + row_no` (위치 기반) → `old_meter_number` (기물번호 기반)

---

## 이미지 업로드 흐름

```
1. 브라우저 → GET /admin/api/upload-meter-image?slot=1&row_no=...
              ← presigned URL (5분 유효)

2. 브라우저 → PUT presignedUrl (R2 직접 업로드, 서버 경유 없음)

3. 브라우저 → POST /admin/api/upload-meter-image { record_id, slot, file_path }
              → DB: meter_records.image{slot}_id = file_path
```

삭제 시: R2에서 파일 삭제 → DB 컬럼 null로 업데이트

---

## 컴포넌트 구조

```
MeterTable (목록, 필터, 페이지네이션, 다운로드)
  └── MeterEditModal (수정 모달)
        └── ImageSlotCard × 4 (이미지 슬롯)
  └── MeterMapView (지도 뷰)
        └── MeterEditModal (지도에서 클릭 시 수정)

MeterExcelDiff (차분 다운로드)
MeterTemplateFill (양식 채우기)
MeterExcelUpload (업로드 모달)
```

`MeterTable`은 클라이언트 컴포넌트이고, 상위 `meter/page.tsx`는 서버 컴포넌트입니다. 필터·정렬·페이지네이션은 모두 URL 쿼리스트링으로 관리하며, 상태 변경 시 `router.push()`로 URL을 업데이트하면 서버에서 다시 데이터를 조회합니다.

---

## 위치 데이터 형식

UI에서 2단계 선택 후 `옥내(건물앞)` 형식으로 저장합니다.

```
1단계: 옥내 / 옥외
2단계: 건물앞 / 건물뒤 / 건물좌 / 건물우 / 입구좌 / 입구우 / 기타
```

파싱: `/^(옥내|옥외)\((.+)\)$/` 정규식으로 옥내/옥외와 세부위치를 분리합니다.

---

## 관련 프로젝트

**booup-blog** (`F:/booup-blog`, `booup.dev`)에서 야장관리 기능을 분리했습니다. 동일한 Supabase 인스턴스와 R2 버킷을 공유하며, 코드베이스는 독립적으로 관리됩니다.
