-- ============================================================
-- meter_records 성능 인덱스
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- ============================================================

-- 1. 블록 필터 (가장 자주 쓰이는 필터)
CREATE INDEX IF NOT EXISTS idx_mr_block
  ON meter_records (block);

-- 2. 블록 + 도면번호 복합 인덱스 (기본 정렬: block 필터 + row_no 정렬)
CREATE INDEX IF NOT EXISTS idx_mr_block_row_no
  ON meter_records (block, row_no NULLS LAST);

-- 3. 도면번호 단독 정렬 (블록 미선택 시)
CREATE INDEX IF NOT EXISTS idx_mr_row_no
  ON meter_records (row_no NULLS LAST);

-- 4. 조사일자 필터 + 정렬
CREATE INDEX IF NOT EXISTS idx_mr_survey_date
  ON meter_records (survey_date NULLS LAST);

-- 5. 종결 상태 필터 (note 컬럼)
CREATE INDEX IF NOT EXISTS idx_mr_note
  ON meter_records (note);

-- 6. 처리완료 부분 인덱스 — processedQuery COUNT 최적화
--    6개 필드 모두 입력된 행만 인덱스에 포함 → closed 상태 카운트 쿼리 고속화
CREATE INDEX IF NOT EXISTS idx_mr_completed_partial
  ON meter_records (block, survey_date)
  WHERE meter_number  IS NOT NULL
    AND reading       IS NOT NULL
    AND sealed        IS NOT NULL
    AND location      IS NOT NULL
    AND usage_type    IS NOT NULL
    AND floor         IS NOT NULL;

-- ============================================================
-- ILIKE 검색 최적화 (pg_trgm)
-- "%검색어%" 형태는 B-tree 인덱스를 사용할 수 없음.
-- GIN trigram 인덱스로 대폭 개선 가능.
-- ============================================================

-- pg_trgm 확장 활성화 (이미 활성화된 경우 무시됨)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_mr_address_trgm
  ON meter_records USING gin (address gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_mr_row_no_trgm
  ON meter_records USING gin (row_no gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_mr_old_meter_trgm
  ON meter_records USING gin (old_meter_number gin_trgm_ops);
