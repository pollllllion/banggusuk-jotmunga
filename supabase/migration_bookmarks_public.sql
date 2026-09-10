-- ============================================================
-- [마이그레이션] '찜한 작품'을 프로필에서 공개 (2026-09-10)
--
-- 두 가지를 한다:
--   (1) profiles."showBookmarks" 추가 — 찜 목록을 남에게 보여줄지 (기본 true)
--   (2) bookmarks 읽기 정책을 공개로 — 지금은 **본인만** 조회된다
--
-- (1)만 넣고 (2)를 안 하면 스위치는 켜져도 남의 프로필에서 찜 칸이 늘 비어 있다
-- (RLS 가 남의 행을 빈 배열로 돌려주므로 오류는 안 난다).
--
-- ⚠️ (2)는 판단이 필요한 변경이다 — 본 작품 공개(migration_watched_public.sql)와 같은 성격:
--    · "이 사람이 뭘 찜해 뒀는지"는 취향 정보라, 공개로 바꾸면 지금까지 담아 둔
--      사람들의 기록이 소급해서 공개된다.
--    · 대신 칸마다 스위치가 있어(showWatched · showRatings · showBookmarks) 각자 끌 수 있다.
--    · 개인정보 처리방침의 '공개되는 정보' 문장에 찜·본 작품을 이미 덧붙여 뒀다
--      (src/shared/staticPages.mjs).
--    · 되돌리려면 맨 아래 롤백을 실행한다.
--
-- 배포 순서: **이 SQL 을 먼저 돌리고** 배포한다. 추가형이라 옛 코드는 이 칸을 안 보내
-- 아무 일도 안 생기고, 칸이 없는 채로 새 코드가 뜨면 공개 설정 저장이 400 으로 떨어진다.
--
-- ⚠️ camelCase 컬럼은 큰따옴표 필수. Supabase SQL Editor 에서 실행.
-- ============================================================

-- (1) 공개 스위치 — 기본 true (지금까지 공개였던 것을 조용히 감추지 않는다)
alter table public.profiles
  add column if not exists "showBookmarks" boolean not null default true;

-- (2) 읽기: 누구나 (프로필에서 남의 '찜한 작품'을 본다). 쓰기는 그대로 본인만.
drop policy if exists bookmarks_select on public.bookmarks;
drop policy if exists bookmarks_select_all on public.bookmarks;
create policy bookmarks_select_all on public.bookmarks
  for select using (true);

comment on table public.bookmarks is
  '찜한 작품. 읽기는 공개(프로필 노출, 본인이 끌 수 있음), 쓰기는 본인만.';

-- ============================================================
-- 적용 확인
--   select id, nickname, "showBookmarks" from public.profiles limit 1;
--   select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'bookmarks';
--
-- 롤백 — 다시 비공개로 (컬럼은 남겨 둬도 무해하다)
--   drop policy if exists bookmarks_select_all on public.bookmarks;
--   create policy bookmarks_select on public.bookmarks
--     for select using ("userId" = auth.uid()::text);
-- ============================================================
