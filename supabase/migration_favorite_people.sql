-- ────────────────────────────────────────────────────────────
-- 취향: 좋아하는 감독·작가·배우를 "누구인지" 까지 담는다
--   - profiles."favoritePeople" jsonb : [{ name, role, tmdbId, profilePath }]
--       role        'maker'(감독·작가) | 'actor'(배우)
--       tmdbId      TMDB 인물 번호. 검색에 안 나와 이름만 적어 넣은 사람은 null
--       profilePath TMDB 사진 경로(예: "/abc.jpg"). 없으면 null
--   이름만 담던 "favoriteDirectors"·"favoriteActors"(text[]) 는 지우지 않는다 — 저장할 때 이름을
--   같이 비춰 적는다(옛 자산을 캐시한 PWA 가 그 칸을 읽는다). 기준은 favoritePeople 이다.
--   나누는 시점(2026-09-19)에 두 칸을 채운 프로필이 0개라 옮길 데이터가 없다.
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- 선행: migration_taste_profile.sql · migration_favorite_actors.sql
--
-- 전부 공개(다른 유저가 읽음). profiles 는 이미 전체 select 가능하고 본인 update 정책도 있어
-- 새 정책이 필요 없다. 한 사람당 최대 40명 × 100바이트 남짓이라 시작 로드에 부담이 없다.
-- 적용 전: 읽기는 멀쩡하다(없는 칸은 빈 목록). 사람을 넣고 저장할 때만 실패 안내가 뜬다.
-- ────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists "favoritePeople" jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
