-- ============================================================
-- [운영] 2026-08-17 — ① 마이그레이션 적용 이력 ② 알림·신고 폭주 방지
--
-- ① supabase/*.sql 은 SQL Editor 에 손으로 붙여 실행한다. 파일이 27개를 넘어가면서
--    "이거 적용했었나?"를 알 방법이 없어졌다. 적용 이력을 DB 에 남긴다.
--    `npm run migrate:status` 가 파일 목록과 이 테이블을 대조해준다.
--
-- ② notifications / reports 는 설계상 누구나 INSERT 할 수 있다
--    (남에게 알림을 보내야 하고, 유동닉도 신고할 수 있어야 하므로).
--    RLS 로는 횟수를 못 막으니 트리거로 상한만 건다. 정상 사용에는 안 걸리는 값이다.
--
-- 멱등. Supabase SQL Editor 에 통째로 붙여 실행.
-- ============================================================

-- ── ① 마이그레이션 적용 이력 ────────────────────────────────
create table if not exists public.applied_migrations (
  filename   text primary key,
  sha256     text not null,
  applied_at timestamptz not null default now(),
  note       text
);

alter table public.applied_migrations enable row level security;
drop policy if exists applied_migrations_read on public.applied_migrations;
-- 읽기는 관리자만. 쓰기는 service_role(스크립트)만 — 정책이 없으면 anon/authenticated 는 아무것도 못 한다.
create policy applied_migrations_read on public.applied_migrations for select using (is_admin());

-- 이미 운영 DB 에 적용해 둔 것들을 기록해 둔다(해시는 스크립트가 처음 실행될 때 채운다).
insert into public.applied_migrations (filename, sha256, note) values
  ('setup.sql',                         '', '초기 스키마 (프로토타입)'),
  ('schema.sql',                        '', '스캐폴딩 참고용 — 실제 적용 안 함'),
  ('migration_profiles.sql',            '', ''),
  ('migration_rls_prep.sql',            '', ''),
  ('migration_rls_enable.sql',          '', ''),
  ('migration_guest_posts.sql',         '', ''),
  ('migration_like_rpcs.sql',           '', ''),
  ('migration_watched.sql',             '', ''),
  ('migration_watched_year.sql',        '', ''),
  ('migration_calendar.sql',            '', ''),
  ('migration_ott_calendar.sql',        '', ''),
  ('migration_ott_detail.sql',          '', ''),
  ('migration_release_pattern.sql',     '', ''),
  ('migration_content_verified.sql',    '', ''),
  ('migration_ensure_content.sql',      '', ''),
  ('migration_update_my_content.sql',   '', ''),
  ('migration_merge_content.sql',       '', ''),
  ('migration_discussions.sql',         '', ''),
  ('migration_discussion_board.sql',    '', ''),
  ('migration_discussion_views.sql',    '', ''),
  ('migration_talk_edit.sql',           '', ''),
  ('migration_talk_media.sql',          '', ''),
  ('migration_talk_ratings.sql',        '', ''),
  ('migration_taste_profile.sql',       '', ''),
  ('migration_attendance_streak.sql',   '', ''),
  ('migration_delete_account.sql',      '', ''),
  ('migration_rls_fix.sql',             '', '2026-08-17 보안'),
  ('migration_rls_fix2.sql',            '', '2026-08-17 보안'),
  ('migration_guest_pw_bcrypt.sql',     '', '2026-08-17 보안'),
  ('migration_ledger_and_ratelimit.sql','', '2026-08-17 운영')
on conflict (filename) do nothing;

-- rls_disable 은 롤백용이라 "적용됨"으로 기록하지 않는다.

-- ── ② 알림 폭주 방지 ────────────────────────────────────────
-- 한 사람이 받는 알림이 1시간에 200건을 넘으면 더 안 받는다.
-- (정상 사용에서는 도달할 수 없는 값 — 스팸 스크립트만 걸린다)
--
-- ⚠️ security definer 여야 한다. invoker 로 두면 함수 안의 select 에도 RLS 가 걸려
--    비로그인(anon)은 "내 알림만" 보이는 정책 때문에 카운트가 항상 0 → 상한이 안 걸린다.
--    (2026-08-17 실측으로 확인: 로그인 사용자만 막히고 anon 은 201건이 전부 통과했다)
--    definer 안에서는 current_user 가 소유자라 역할 구분이 안 되므로 예외를 두지 않는다.
--    스크립트(service_role)는 알림·신고를 만들지 않으므로 문제없다.
create or replace function public.cap_notification_flood()
returns trigger language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  select count(*) into recent
    from public.notifications
   where "userId" = new."userId"
     and "createdAt" > now() - interval '1 hour';
  if recent >= 200 then
    raise exception '알림이 너무 많습니다. 잠시 후 다시 시도해주세요.' using errcode = '54000';
  end if;
  return new;
end $$;

drop trigger if exists trg_cap_notifications on public.notifications;
create trigger trg_cap_notifications
  before insert on public.notifications
  for each row execute function public.cap_notification_flood();

-- ── ② 신고 폭주 방지 ────────────────────────────────────────
-- 같은 신고자가 1시간에 50건을 넘기면 막는다. 같은 대상 중복 신고도 막는다.
create or replace function public.cap_report_flood()
returns trigger language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  if exists (
    select 1 from public.reports
     where "reporterId" = new."reporterId"
       and "targetType" = new."targetType"
       and "targetId"   = new."targetId"
  ) then
    raise exception '이미 신고한 대상입니다.' using errcode = '54000';
  end if;

  select count(*) into recent
    from public.reports
   where "reporterId" = new."reporterId"
     and "createdAt" > now() - interval '1 hour';
  if recent >= 50 then
    raise exception '신고가 너무 많습니다. 잠시 후 다시 시도해주세요.' using errcode = '54000';
  end if;
  return new;
end $$;

drop trigger if exists trg_cap_reports on public.reports;
create trigger trg_cap_reports
  before insert on public.reports
  for each row execute function public.cap_report_flood();
