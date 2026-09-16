-- ============================================================
-- [마이그레이션] 제작국·원어 컬럼 추가 (2026-09-16)
--
-- 왜:
--   작품 둘러보기의 '한국 / 외국' 필터가 **원어 제목에 한글이 있는가**로 갈랐다.
--   DB 에 제작국도 원어도 없어서 갖고 있는 값으로 때운 것이었는데, 실측해 보니
--   표본 194편 중 9편(4.6%)이 틀렸다 — 2,125편으로 치면 약 100편이다.
--
--   틀리는 방식이 둘이고, 둘 다 사람이 바로 알아본다:
--     ① 원어 제목이 영어인 한국 작품 → 외국으로 감
--        (K-Beauty Pop Up, see your eyes, aespa·Red Velvet 콘서트 실황)
--     ② 원어 제목이 비어 있어 **한국어 번역 제목**으로 판정 → 한국으로 감
--        (킬 빌: 2부, 파이트 클럽, 장고: 분노의 추적자)
--   ②가 특히 나쁘다. 누가 봐도 외국 영화인 것이 '한국' 칸에 들어앉는다.
--
--   TMDB 는 처음부터 정답을 주고 있었다(original_language · origin_country /
--   production_countries). 수집 스크립트가 저장하지 않았을 뿐이다. 그 두 칸을 만든다.
--
-- 새 기준: **제작국에 KR 이 있거나 원어가 한국어면 한국 작품.**
--   두 값 다 없는 행(손으로 넣은 웹툰·웹소설 등)은 예전처럼 제목의 한글로 본다.
--
-- 안전: 컬럼 추가뿐이다. 값은 전부 null 로 시작하고, 앱은 null 이면 옛 판별로
--   돌아가므로 이 SQL 을 돌리기 전에도 화면이 깨지지 않는다(아키텍처 불변식 ⑤).
--   채우는 것은 `npm run backfill:origin -- --apply` 가 따로 한다.
--
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ============================================================

alter table public.contents add column if not exists "originalLanguage" text;
alter table public.contents add column if not exists "originCountries" text[];

comment on column public.contents."originalLanguage" is
  'TMDB original_language (ISO 639-1). 한국 작품 판별의 근거 중 하나.';
comment on column public.contents."originCountries" is
  'TMDB origin_country(TV) / production_countries(영화)의 ISO 3166-1 목록. KR 이 있으면 한국 작품.';

-- ============================================================
-- 적용 확인
--   select column_name, data_type
--     from information_schema.columns
--    where table_name = 'contents'
--      and column_name in ('originalLanguage', 'originCountries');
--   → 두 줄(text, ARRAY)이 나오면 정상
--
--   -- 채운 뒤 세어 보기 (backfill 전에는 둘 다 0)
--   select count(*) filter (where "originalLanguage" is not null) as 원어있음,
--          count(*) filter (where 'KR' = any("originCountries"))  as 한국제작
--     from public.contents;
-- ============================================================
