-- ============================================================
-- [마이그레이션] 마지막 접속 시각 (2026-09-17)
--
-- 관리자 사용자 탭의 '최근 활동'이 출석만 한 사람은 "오늘"까지만 나왔다.
-- profiles."lastVisit" 이 날짜뿐이라 몇 시에 왔는지 어디에도 안 남기 때문이다.
--
-- 시각을 profiles 에 두지 않는 이유: profiles 는 누구나 읽는 표다. "이 사람이 방금
-- 접속했다"까지 공개할 이유가 없다. 그래서 표를 따로 두고 정책을 하나도 안 만든다
-- (RLS 켬 + 정책 없음 = 클라이언트는 읽기·쓰기 전부 불가). 드나드는 길은 함수 둘뿐.
--
--   touch_last_seen()   로그인한 본인 행만 now() 로 갱신 — 앱을 열 때마다 한 번
--   admin_user_list()   'lastSeenAt' 을 같이 내려 준다 (관리자만)
--
-- 멱등. Supabase SQL Editor 에서 실행. 적용 전에도 앱은 죽지 않는다(그 칸만 빈다).
-- ============================================================

create table if not exists public.user_last_seen (
  "userId" text primary key,
  "at"     timestamptz not null default now()
);

alter table public.user_last_seen enable row level security;
revoke all on table public.user_last_seen from anon, authenticated;

create or replace function public.touch_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.user_last_seen ("userId", "at")
  values (auth.uid()::text, now())
  on conflict ("userId") do update set "at" = excluded."at";
end $$;

revoke all on function public.touch_last_seen() from public;
grant execute on function public.touch_last_seen() to authenticated;

-- admin_user_list 에 lastSeenAt 추가 (나머지는 migration_admin_user_list.sql 그대로)
create or replace function public.admin_user_list()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception '관리자만 볼 수 있습니다';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',           p.id,
    'email',        a.email,
    'persona',      coalesce(a.email ilike '%@personas.ottcal.com', false),
    'lastSignInAt', a.last_sign_in_at,
    'lastSeenAt',   ls."at",
    'pushCount',    (select count(*) from public.push_subscriptions s where s."userId" = p.id::text)
  )), '[]'::jsonb)
  into v_result
  from public.profiles p
  left join auth.users a on a.id::text = p.id::text
  left join public.user_last_seen ls on ls."userId" = p.id::text;

  return v_result;
end $$;

revoke all on function public.admin_user_list() from public;
grant execute on function public.admin_user_list() to authenticated;

-- ============================================================
-- 적용 확인
--   select public.touch_last_seen();            -- SQL Editor 에선 auth.uid() 가 없어 아무 일도 안 한다(정상)
--   select * from public.user_last_seen;        -- 앱을 한 번 연 뒤 행이 생겼는지
--
-- 롤백
--   drop function if exists public.touch_last_seen();
--   drop table if exists public.user_last_seen;
--   그리고 migration_admin_user_list.sql 을 다시 실행
-- ============================================================
