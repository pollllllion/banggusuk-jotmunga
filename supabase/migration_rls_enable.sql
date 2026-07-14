-- ============================================================
-- [마이그레이션] RLS 정책 + 활성화 (2026-07)  ★보안 스위치★
--
-- 계정(고정닉)=auth.uid()::text 소유. 유동닉=수정/삭제는 RPC로만.
-- contents/announcements=관리자만 쓰기. 좋아요/조회수/평점/유동닉삭제는 RPC·트리거(정의자권한).
-- 문제 시 migration_rls_disable.sql 로 즉시 롤백.
-- ⚠️ camelCase 컬럼은 반드시 큰따옴표. Supabase SQL Editor에서 실행.
-- ============================================================

-- 관리자 여부 (프로필 RLS 재귀 방지 위해 SECURITY DEFINER)
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid()::text and role = 'admin');
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ── profiles ────────────────────────────────────────────────
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select using (true);
create policy profiles_insert on public.profiles for insert with check (id = auth.uid()::text);
create policy profiles_update on public.profiles for update using (id = auth.uid()::text or is_admin()) with check (id = auth.uid()::text or is_admin());

-- ── contents (관리자만 쓰기) ─────────────────────────────────
alter table public.contents enable row level security;
create policy contents_select on public.contents for select using (true);
create policy contents_insert on public.contents for insert with check (is_admin());
create policy contents_update on public.contents for update using (is_admin()) with check (is_admin());
create policy contents_delete on public.contents for delete using (is_admin());

-- ── reviews (본인/유동닉) ────────────────────────────────────
alter table public.reviews enable row level security;
create policy reviews_select on public.reviews for select using (true);
create policy reviews_insert on public.reviews for insert with check (
  ("authorId" = auth.uid()::text) or ("authorId" is null and "guestName" is not null)
);
create policy reviews_update on public.reviews for update using ("authorId" = auth.uid()::text or is_admin()) with check ("authorId" = auth.uid()::text or is_admin());
create policy reviews_delete on public.reviews for delete using ("authorId" = auth.uid()::text or is_admin());

-- ── comments (본인/유동닉) ───────────────────────────────────
alter table public.comments enable row level security;
create policy comments_select on public.comments for select using (true);
create policy comments_insert on public.comments for insert with check (
  ("authorId" = auth.uid()::text) or ("authorId" is null and "guestName" is not null)
);
create policy comments_update on public.comments for update using ("authorId" = auth.uid()::text or is_admin()) with check ("authorId" = auth.uid()::text or is_admin());
create policy comments_delete on public.comments for delete using ("authorId" = auth.uid()::text or is_admin());

-- ── discussions (본인/유동닉) ────────────────────────────────
alter table public.discussions enable row level security;
create policy discussions_select on public.discussions for select using (true);
create policy discussions_insert on public.discussions for insert with check (
  ("authorId" = auth.uid()::text) or ("authorId" is null and "guestName" is not null)
);
create policy discussions_update on public.discussions for update using ("authorId" = auth.uid()::text or is_admin()) with check ("authorId" = auth.uid()::text or is_admin());
create policy discussions_delete on public.discussions for delete using ("authorId" = auth.uid()::text or is_admin());

-- ── bookmarks (본인만, 계정 전용) ────────────────────────────
alter table public.bookmarks enable row level security;
create policy bookmarks_select on public.bookmarks for select using ("userId" = auth.uid()::text);
create policy bookmarks_insert on public.bookmarks for insert with check ("userId" = auth.uid()::text);
create policy bookmarks_delete on public.bookmarks for delete using ("userId" = auth.uid()::text);

-- ── blocks (본인만) ──────────────────────────────────────────
alter table public.blocks enable row level security;
create policy blocks_select on public.blocks for select using ("blockerId" = auth.uid()::text);
create policy blocks_insert on public.blocks for insert with check ("blockerId" = auth.uid()::text);
create policy blocks_delete on public.blocks for delete using ("blockerId" = auth.uid()::text);

-- ── notifications (내 알림만 조회/수정, 생성은 누구나) ────────
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select using ("userId" = auth.uid()::text);
create policy notifications_insert on public.notifications for insert with check (true);
create policy notifications_update on public.notifications for update using ("userId" = auth.uid()::text);
create policy notifications_delete on public.notifications for delete using ("userId" = auth.uid()::text);

-- ── reports (생성은 누구나, 조회/처리는 본인·관리자) ─────────
alter table public.reports enable row level security;
create policy reports_select on public.reports for select using ("reporterId" = auth.uid()::text or is_admin());
create policy reports_insert on public.reports for insert with check (true);
create policy reports_update on public.reports for update using (is_admin());

-- ── announcements (관리자만 쓰기) ────────────────────────────
alter table public.announcements enable row level security;
create policy announcements_select on public.announcements for select using (true);
create policy announcements_insert on public.announcements for insert with check (is_admin());
create policy announcements_update on public.announcements for update using (is_admin());
create policy announcements_delete on public.announcements for delete using (is_admin());

-- ── users (레거시 게스트 세션 테이블: 비밀번호 미저장, 개방 유지) ─
alter table public.users enable row level security;
create policy users_all on public.users for all using (true) with check (true);
