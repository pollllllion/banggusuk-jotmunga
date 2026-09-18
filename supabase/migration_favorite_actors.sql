-- ────────────────────────────────────────────────────────────
-- 취향: 좋아하는 배우를 감독·작가와 따로 담는다
--   - profiles."favoriteActors" text[] : 좋아하는 배우
--   기존 "favoriteDirectors" 는 그대로 감독·작가용으로 쓴다(이름을 바꾸지 않는다 — 옛 코드·스냅샷 호환).
--   나누는 시점(2026-09-19)에 favoriteDirectors 를 채운 프로필이 0개라 옮길 데이터가 없다.
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- 선행: migration_taste_profile.sql
--
-- 전부 공개(다른 유저가 읽음). profiles 는 이미 전체 select 가능하고 본인 update 정책도 있어
-- 새 정책이 필요 없다.
-- 적용 전: 읽기는 멀쩡하다(없는 칸은 빈 목록으로 본다). 배우를 넣고 저장할 때만 실패 안내가 뜬다.
-- ────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists "favoriteActors" text[] not null default '{}';

notify pgrst, 'reload schema';
