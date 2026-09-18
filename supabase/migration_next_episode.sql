-- ────────────────────────────────────────────────────────────
-- 다음 회차 — 방영 중인 시리즈의 "다음 공개 회차" 날짜·번호
--   - contents."nextEpisodeDate"   (date) 다음 회차 공개일. 없으면 null
--   - contents."nextEpisodeNumber" (int)  그 회차 번호
--   값은 scripts/sync-next-episodes.mjs 가 TMDB 의 next_episode_to_air 에서 매일 채운다
--   (ingest 워크플로). 회차가 다 나갔거나 TMDB 에 다음 날짜가 없으면 null 로 되돌린다.
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
--
-- 적용 전에도 앱·스크립트는 죽지 않는다:
--   · 앱은 이 두 칸을 시작 로드 컬럼 목록(CONTENT_LIST_COLS)에 넣지 않고 따로 조회한다 —
--     칸이 없으면 그 조회만 실패하고 "다음 회차" 표시가 안 나올 뿐이다
--   · 스크립트는 칸이 없으면 안내만 찍고 정상 종료한다
-- RLS: contents 의 기존 정책(읽기 공개 · 쓰기 관리자/서비스롤)을 그대로 탄다. 새 정책 없음.
-- ────────────────────────────────────────────────────────────

alter table public.contents
  add column if not exists "nextEpisodeDate" date,
  add column if not exists "nextEpisodeNumber" int;

-- 앱은 "오늘 이후 다음 회차가 있는 작품"만 조회한다 — 전체 2천여 행 중 수십 행
create index if not exists contents_next_episode_date_idx
  on public.contents ("nextEpisodeDate")
  where "nextEpisodeDate" is not null;

-- 확인용
-- select title, "nextEpisodeDate", "nextEpisodeNumber" from public.contents
--   where "nextEpisodeDate" is not null order by "nextEpisodeDate";
