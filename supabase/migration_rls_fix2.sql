-- ============================================================
-- [보안 수정 2차] 2026-08-17 — 1차(migration_rls_fix.sql)가 안 먹은 이유
--
-- setup.sql(프로토타입 단계)이 아래 9개 테이블에 "public_all" 정책을 만들어 뒀다:
--   users, contents, reviews, comments, bookmarks, blocks,
--   notifications, reports, announcements
--   → create policy "public_all" ... for all to anon, authenticated
--        using (true) with check (true)
--
-- RLS 정책은 OR 로 합쳐진다(permissive). 그래서 나중에 만든
-- contents_insert(is_admin()) 같은 정책이 있어도 public_all 하나가 남아 있으면
-- 전부 통과한다. RLS 를 켜 놨는데도 아무나 쓸 수 있던 진짜 원인이 이거다.
--
-- 실측으로 확인된 것:
--   · anon 이 작품(contents) 을 실제로 DELETE 함
--   · anon 이 남의 리뷰(reviews) 본문을 UPDATE 함
--   · notifications / reports / bookmarks / blocks 도 같은 상태
--     (지금 행이 0건이라 조회 결과가 비어 보였을 뿐, 데이터가 쌓이면 전부 노출)
--
-- 이 스크립트: public_all 을 전부 제거하고 테이블별 정책을 다시 깐다.
-- 멱등. Supabase SQL Editor 에 통째로 붙여 실행.
-- ⚠️ camelCase 컬럼은 큰따옴표 필수.
-- ============================================================

-- ── 1) public_all 정책 일괄 제거 ────────────────────────────
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public' and policyname = 'public_all'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    raise notice 'dropped public_all on %', r.tablename;
  end loop;
end $$;

-- ── 2) 테이블별 정책 재적용 (drop → create 라 몇 번 돌려도 같은 결과) ──

-- profiles: 조회는 누구나, 수정은 본인/관리자 (role·banned 는 1차 트리거가 잠금)
alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_select on public.profiles for select using (true);
create policy profiles_insert on public.profiles for insert with check (id = auth.uid()::text);
create policy profiles_update on public.profiles for update
  using (id = auth.uid()::text or is_admin()) with check (id = auth.uid()::text or is_admin());

-- reviews: 조회 누구나 / 작성은 본인·유동닉 / 수정·삭제는 본인·관리자
-- (유동닉 글 수정·삭제는 비밀번호를 확인하는 SECURITY DEFINER RPC 로만)
alter table public.reviews enable row level security;
drop policy if exists reviews_select on public.reviews;
drop policy if exists reviews_insert on public.reviews;
drop policy if exists reviews_update on public.reviews;
drop policy if exists reviews_delete on public.reviews;
create policy reviews_select on public.reviews for select using (true);
create policy reviews_insert on public.reviews for insert with check (
  ("authorId" = auth.uid()::text) or ("authorId" is null and "guestName" is not null)
);
create policy reviews_update on public.reviews for update
  using ("authorId" = auth.uid()::text or is_admin()) with check ("authorId" = auth.uid()::text or is_admin());
create policy reviews_delete on public.reviews for delete
  using ("authorId" = auth.uid()::text or is_admin());

-- comments
alter table public.comments enable row level security;
drop policy if exists comments_select on public.comments;
drop policy if exists comments_insert on public.comments;
drop policy if exists comments_update on public.comments;
drop policy if exists comments_delete on public.comments;
create policy comments_select on public.comments for select using (true);
create policy comments_insert on public.comments for insert with check (
  ("authorId" = auth.uid()::text) or ("authorId" is null and "guestName" is not null)
);
create policy comments_update on public.comments for update
  using ("authorId" = auth.uid()::text or is_admin()) with check ("authorId" = auth.uid()::text or is_admin());
create policy comments_delete on public.comments for delete
  using ("authorId" = auth.uid()::text or is_admin());

-- bookmarks: 본인 것만 (계정 전용)
alter table public.bookmarks enable row level security;
drop policy if exists bookmarks_select on public.bookmarks;
drop policy if exists bookmarks_insert on public.bookmarks;
drop policy if exists bookmarks_delete on public.bookmarks;
create policy bookmarks_select on public.bookmarks for select using ("userId" = auth.uid()::text);
create policy bookmarks_insert on public.bookmarks for insert with check ("userId" = auth.uid()::text);
create policy bookmarks_delete on public.bookmarks for delete using ("userId" = auth.uid()::text);

-- blocks: 본인 것만
alter table public.blocks enable row level security;
drop policy if exists blocks_select on public.blocks;
drop policy if exists blocks_insert on public.blocks;
drop policy if exists blocks_delete on public.blocks;
create policy blocks_select on public.blocks for select using ("blockerId" = auth.uid()::text);
create policy blocks_insert on public.blocks for insert with check ("blockerId" = auth.uid()::text);
create policy blocks_delete on public.blocks for delete using ("blockerId" = auth.uid()::text);

-- notifications: 내 알림만 조회/수정/삭제. 생성은 누구나(남에게 알림을 보내야 하므로)
alter table public.notifications enable row level security;
drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_insert on public.notifications;
drop policy if exists notifications_update on public.notifications;
drop policy if exists notifications_delete on public.notifications;
create policy notifications_select on public.notifications for select using ("userId" = auth.uid()::text);
create policy notifications_insert on public.notifications for insert with check (true);
create policy notifications_update on public.notifications for update using ("userId" = auth.uid()::text);
create policy notifications_delete on public.notifications for delete using ("userId" = auth.uid()::text);

-- reports: 신고는 누구나, 열람·처리는 신고자 본인과 관리자만
alter table public.reports enable row level security;
drop policy if exists reports_select on public.reports;
drop policy if exists reports_insert on public.reports;
drop policy if exists reports_update on public.reports;
create policy reports_select on public.reports for select using ("reporterId" = auth.uid()::text or is_admin());
create policy reports_insert on public.reports for insert with check (true);
create policy reports_update on public.reports for update using (is_admin());

-- users(레거시 게스트): 설계상 개방 유지. role/banned 는 1차 트리거가 잠금.
alter table public.users enable row level security;
drop policy if exists users_all on public.users;
create policy users_all on public.users for all using (true) with check (true);

-- contents / announcements 는 1차에서 깔았지만 public_all 에 가려 있었다 → 그대로 유효.

-- ============================================================
-- 적용 후 확인: 아래를 실행하면 public_all 이 0건이어야 한다
--   select tablename, policyname, cmd from pg_policies
--   where schemaname='public' order by tablename, policyname;
-- ============================================================
