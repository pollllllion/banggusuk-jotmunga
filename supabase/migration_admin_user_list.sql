-- ============================================================
-- [마이그레이션] 관리자 사용자 탭용 부가 정보 (2026-09-17)
--
-- profiles 는 누구나 읽는 표라 이메일을 안 담는다. 그래서 관리자 화면도 지금까지
-- 이메일 칸이 비어 있었고, 에디터(페르소나) 계정과 진짜 회원을 가려 볼 방법이 없었다.
-- auth.users 는 클라이언트가 못 읽으므로 관리자 전용 함수로 필요한 것만 꺼내 준다.
--
--   email         가입 이메일
--   persona       에디터 계정인가 — 이메일이 @personas.ottcal.com (scripts/personas.mjs)
--                 **판별을 서버에서 한다.** 명단이나 규칙을 앱 번들에 넣으면 누구나 읽는다
--   lastSignInAt  마지막 로그인 (auth 가 기록하는 값)
--   pushCount     웹푸시 구독 기기 수 — 알림을 켠 사람인가
--
-- 테이블은 안 건드린다. 함수 하나. 멱등. Supabase SQL Editor 에서 실행.
-- ============================================================

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
    'pushCount',    (select count(*) from public.push_subscriptions s where s."userId" = p.id::text)
  )), '[]'::jsonb)
  into v_result
  from public.profiles p
  left join auth.users a on a.id::text = p.id::text;

  return v_result;
end $$;

revoke all on function public.admin_user_list() from public;
grant execute on function public.admin_user_list() to authenticated;

-- ============================================================
-- 적용 확인 (관리자로 로그인한 상태에서)
--   select jsonb_array_length(public.admin_user_list());
--
-- 롤백
--   drop function if exists public.admin_user_list();
-- ============================================================
