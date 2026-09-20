-- ────────────────────────────────────────────────────────────
-- 누적관객수 (영화진흥위원회 KOFIC) — 한국에서 극장 개봉한 영화만
--   - contents."koficAudience"  (bigint)      누적관객수. 없으면 null
--   - contents."koficMovieCd"   (text)        KOFIC 영화코드 — 어느 영화에 붙였는지 되짚는 열쇠
--   - contents."koficUpdatedAt" (timestamptz) 마지막으로 받아 적은 시각
--   값은 scripts/sync-kofic.mjs 가 일별 박스오피스에서 매일 채운다(ingest 워크플로).
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
--
-- 적용 전에도 앱·스크립트는 죽지 않는다:
--   · 앱은 상세 조회가 이 칸 때문에 실패하면 이 칸을 빼고 한 번 더 부른다(api/contents.ts)
--   · 스크립트는 칸이 없으면 안내만 찍고 정상 종료한다
-- RLS: contents 의 기존 정책(읽기 공개 · 쓰기 관리자/서비스롤)을 그대로 탄다. 새 정책 없음.
-- ────────────────────────────────────────────────────────────

alter table public.contents
  add column if not exists "koficAudience" bigint,
  add column if not exists "koficMovieCd" text,
  add column if not exists "koficUpdatedAt" timestamptz;

-- 동기화 스크립트가 "이미 적힌 영화"를 코드로 되짚는다 — 전체 중 수백 행
create index if not exists contents_kofic_movie_cd_idx
  on public.contents ("koficMovieCd")
  where "koficMovieCd" is not null;

-- 확인용
-- select title, "releaseDate", "koficAudience", "koficUpdatedAt" from public.contents
--   where "koficAudience" is not null order by "koficAudience" desc limit 30;
