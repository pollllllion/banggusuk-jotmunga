-- ============================================================
-- [마이그레이션] '본 작품'을 프로필에서 공개 (2026-09-09)
--
-- 지금 watched 는 **본인만** 조회할 수 있다(migration_watched.sql).
-- 그래서 남의 프로필에서는 '본 작품' 칸이 아예 뜨지 않는다.
--
-- 이걸 적용하면 **누구나 남이 본 작품 목록을 볼 수 있게 된다.**
-- 쓰기(추가·수정·삭제)는 그대로 본인만이다 — 읽기만 연다.
--
-- ⚠️ 판단이 필요한 변경이다:
--    · 작성한 토론글은 원래 공개다. 본 작품은 지금까지 비공개였다.
--    · "이 사람이 뭘 봤는지"는 취향 정보라, 공개로 바꾸면 이미 등록해 둔
--      사람들의 기록이 소급해서 공개된다. 개인정보 처리방침의 '공개되는 정보'
--      항목(src/shared/staticPages.mjs)에 한 줄 추가하는 게 맞다.
--    · 되돌리려면 맨 아래 롤백을 실행하면 된다.
--
-- 적용 전에도 화면은 오류 없이 동작한다 — 남의 것은 빈 목록으로 와서
-- '본 작품' 칸이 그냥 안 보일 뿐이다.
--
-- ⚠️ camelCase 컬럼은 큰따옴표 필수. Supabase SQL Editor 에서 실행.
-- ============================================================

drop policy if exists watched_select_own on public.watched;

-- 읽기: 누구나 (프로필에서 남의 '본 작품'을 본다)
drop policy if exists watched_select_all on public.watched;
create policy watched_select_all on public.watched
  for select using (true);

-- 쓰기는 그대로 본인만 — 아래는 이미 있는 정책이라 손대지 않는다.
--   watched_insert_own · watched_update_own · watched_delete_own

comment on table public.watched is
  '내가 본 작품. 읽기는 공개(프로필 노출), 쓰기는 본인만.';

-- ============================================================
-- 적용 확인 (select 정책이 watched_select_all 하나여야 한다)
--   select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'watched';
--
-- 롤백 — 다시 비공개로
--   drop policy if exists watched_select_all on public.watched;
--   create policy watched_select_own on public.watched
--     for select using ("userId" = auth.uid()::text);
-- ============================================================
