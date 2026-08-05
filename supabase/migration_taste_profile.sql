-- ────────────────────────────────────────────────────────────
-- 공개 취향 프로필: profiles 에 취향 컬럼 추가
--   - "tasteBio"          text   : 취향 한 줄 소개
--   - "favoriteWorks"     text[] : 인생작품 (content id 목록)
--   - "favoriteGenres"    text[] : 선호 장르
--   - "favoriteDirectors" text[] : 좋아하는 감독/작가
-- 전부 공개(다른 유저가 읽음). profiles 는 이미 전체 select 가능하므로 별도 정책 불필요.
-- 본인 프로필 update 정책도 이미 있어 클라이언트 저장이 그대로 통과한다.
-- 컬럼이 없으면 클라이언트는 안전하게 no-op(캐시만) 한다.
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists "tasteBio"          text,
  add column if not exists "favoriteWorks"     text[] not null default '{}',
  add column if not exists "favoriteGenres"    text[] not null default '{}',
  add column if not exists "favoriteDirectors" text[] not null default '{}';

notify pgrst, 'reload schema';
