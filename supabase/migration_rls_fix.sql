-- ============================================================
-- [보안 수정] 2026-08-17 — 운영 DB 실측에서 확인된 구멍 3개
--
-- 실측 방법: publishable(anon) 키만으로 PostgREST 를 직접 호출해봤다.
-- 그 키는 빌드된 JS 번들 안에 들어 있으므로 "누구나 가진 키"다.
--
--  ① contents / announcements 에 RLS 가 안 걸려 있었다.
--     → 비로그인 상태로 작품 INSERT / UPDATE / DELETE 가 전부 통과.
--       프로브 행을 만들어 anon 으로 DELETE 하니 실제로 지워졌다.
--       현재 작품 2,013건이 아무나 지울 수 있는 상태였다.
--     (migration_rls_enable.sql 에 정책이 정의돼 있는데 이 두 테이블만
--      적용이 안 됐거나 이후 rls_disable 로 꺼진 채 남았다.)
--
--  ② profiles 의 role / banned 를 본인이 UPDATE 할 수 있었다.
--     profiles_update 정책은 "본인 행"만 검사하고 컬럼은 안 가린다.
--     → 가입한 사람 누구나 role='admin' 자가 승격, banned=false 자가 해제 가능.
--
--  ③ users(레거시 게스트) 는 users_all(true) 라 아무나 아무 행을 수정 가능.
--     그 테이블에도 role 컬럼이 있고 AdminGuard 는 user.role 만 본다.
--     → 게스트가 자기 행을 role='admin' 으로 바꾸면 관리자 화면에 들어간다.
--
-- 멱등이다. 여러 번 실행해도 안전. Supabase SQL Editor 에 통째로 붙여 실행.
-- 롤백은 migration_rls_disable.sql (단, 그러면 위 구멍이 다시 열린다).
-- ⚠️ camelCase 컬럼은 큰따옴표 필수.
-- ============================================================

-- 관리자 판정 (이미 있으면 그대로 재생성)
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid()::text and role = 'admin');
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ── ① contents: 읽기는 누구나, 쓰기는 관리자만 ──────────────
-- 일반 사용자의 작품 등록/수정은 전부 SECURITY DEFINER RPC 를 거친다
-- (register_watched / ensure_content / update_my_content / merge_content),
-- 클라이언트가 contents 를 직접 upsert 하는 경로는 관리자 화면뿐이다.
alter table public.contents enable row level security;
drop policy if exists contents_select on public.contents;
drop policy if exists contents_insert on public.contents;
drop policy if exists contents_update on public.contents;
drop policy if exists contents_delete on public.contents;
create policy contents_select on public.contents for select using (true);
create policy contents_insert on public.contents for insert with check (is_admin());
create policy contents_update on public.contents for update using (is_admin()) with check (is_admin());
create policy contents_delete on public.contents for delete using (is_admin());

-- ── ① announcements: 읽기는 누구나, 쓰기는 관리자만 ─────────
alter table public.announcements enable row level security;
drop policy if exists announcements_select on public.announcements;
drop policy if exists announcements_insert on public.announcements;
drop policy if exists announcements_update on public.announcements;
drop policy if exists announcements_delete on public.announcements;
create policy announcements_select on public.announcements for select using (true);
create policy announcements_insert on public.announcements for insert with check (is_admin());
create policy announcements_update on public.announcements for update using (is_admin());
create policy announcements_delete on public.announcements for delete using (is_admin());

-- ── ②③ 권한 컬럼 잠금 (role / banned) ───────────────────────
-- RLS 정책은 "어느 행을 쓸 수 있나"만 정하지 "어느 컬럼"은 못 정한다.
-- 본인 행 수정은 열어둔 채로 role/banned 만 못 바꾸게 트리거로 고정한다.
-- SECURITY INVOKER(기본) 이어야 current_user 가 실제 호출자(anon/authenticated)로 잡힌다.
-- service_role·postgres 등 그 외 역할은 그대로 통과 → 스크립트·SQL Editor·관리자 작업 영향 없음.
create or replace function public.guard_privileged_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if public.is_admin() then return new; end if;

  if tg_op = 'INSERT' then
    new.role := 'user';
    new.banned := false;
  else
    new.role := old.role;
    new.banned := old.banned;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_profiles on public.profiles;
create trigger trg_guard_profiles
  before insert or update on public.profiles
  for each row execute function public.guard_privileged_columns();

drop trigger if exists trg_guard_users on public.users;
create trigger trg_guard_users
  before insert or update on public.users
  for each row execute function public.guard_privileged_columns();

-- ── 나머지 테이블: RLS 켜짐 상태 재확인 (이미 켜져 있으면 무해) ──
alter table public.profiles            enable row level security;
alter table public.reviews             enable row level security;
alter table public.comments            enable row level security;
alter table public.discussions         enable row level security;
alter table public.discussion_comments enable row level security;
alter table public.bookmarks           enable row level security;
alter table public.watched             enable row level security;
alter table public.blocks              enable row level security;
alter table public.notifications       enable row level security;
alter table public.reports             enable row level security;
alter table public.users               enable row level security;

-- users(게스트) 는 설계상 개방 유지 — 위 트리거로 role/banned 만 잠갔다.
drop policy if exists users_all on public.users;
create policy users_all on public.users for all using (true) with check (true);

-- ============================================================
-- 적용 후 확인 (아래를 실행하면 전부 t 여야 한다)
--   select relname, relrowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace
--     and relname in ('contents','announcements','profiles','users','reviews',
--                     'comments','discussions','discussion_comments',
--                     'bookmarks','watched','blocks','notifications','reports');
-- ============================================================
