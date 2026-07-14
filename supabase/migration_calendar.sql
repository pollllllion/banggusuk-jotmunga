-- ============================================================
-- [마이그레이션] 개봉·공개 캘린더 지원 (2026-07)
--
-- ⚠️ 실제 운영 DB의 contents 테이블은 camelCase 컬럼명을 사용합니다.
--    (posterUrl, releaseYear, avgRating ...) → 따옴표로 감싸야 합니다.
--    Supabase 대시보드 → SQL Editor 에 아래를 붙여넣고 실행하세요.
-- ============================================================

-- 1) 대표 출시일 컬럼 추가 (캘린더 핵심 필드)
alter table public.contents
  add column if not exists "releaseDate" date;

-- 2) 공개예정(upcoming) 상태 허용
--    기존 status 체크 제약이 있으면 교체합니다.
--    (제약 이름이 다르면 아래 drop 줄의 이름만 바꿔주세요.
--     Supabase → Table editor → contents → 제약조건에서 확인 가능)
alter table public.contents
  drop constraint if exists contents_status_check;
alter table public.contents
  add constraint contents_status_check
  check (status is null or status in ('upcoming', 'ongoing', 'completed'));

-- 3) 캘린더 조회 최적화 인덱스
create index if not exists idx_contents_release
  on public.contents ("releaseDate");

-- 확인용:
-- select title, type, "releaseDate", status from public.contents
--   where "releaseDate" is not null order by "releaseDate";
