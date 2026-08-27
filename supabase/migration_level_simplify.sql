-- ============================================================
-- [기능] 2026-08-27 — 레벨 간소화 + 좋문가 관리자 승인제
--
-- 바뀌는 것:
--   활동 레벨 7단계 → 3단계 (백수 → 한량 → 여포). 그 위 좋문가는 XP 로 못 딴다.
--   좋문가는 분야별 자동판정(가입일·평가수·장문·추천 4조건)을 없애고
--   관리자가 직접 지정하는 단일 배지로 바꾼다 → profiles.expert 한 칸.
--
-- 왜 컬럼 하나로 끝나나:
--   profiles_update 정책(migration_rls_fix2.sql)이 이미 `id = auth.uid() or is_admin()` 이라
--   관리자는 남의 profiles 행을 고칠 수 있다. banned 를 다루던 경로와 완전히 같다.
--   대신 본인이 자기 자신을 좋문가로 만들 수 있으면 안 되므로,
--   role·banned 를 잠그던 guard_privileged_columns 트리거에 expert 를 추가한다.
--   (이 트리거가 없으면 아무 사용자나 자기 행에 expert=true 를 써 넣을 수 있다)
--
-- 멱등. Supabase SQL Editor 에 통째로 붙여 실행.
-- ============================================================

-- ── 1) 좋문가 플래그 ────────────────────────────────────────
alter table public.profiles
  add column if not exists expert boolean not null default false;

comment on column public.profiles.expert is '좋문가 — 관리자가 직접 지정. XP 로는 도달 불가.';

-- ── 2) 본인이 자기 자신에게 못 주도록 잠근다 ────────────────
-- migration_rls_fix.sql 의 함수에 expert 만 추가한 판. 나머지 동작은 그대로다.
-- SECURITY INVOKER(기본) 여야 current_user 가 실제 호출자로 잡힌다.
create or replace function public.guard_privileged_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if public.is_admin() then return new; end if;

  if tg_op = 'INSERT' then
    new.role   := 'user';
    new.banned := false;
  else
    new.role   := old.role;
    new.banned := old.banned;
  end if;
  return new;
end $$;

-- profiles 에만 expert 가 있다(users 는 레거시 게스트 테이블이라 없음).
-- 그래서 컬럼을 잠그는 판은 profiles 전용 트리거로 따로 둔다.
create or replace function public.guard_expert_column()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if public.is_admin() then return new; end if;

  if tg_op = 'INSERT' then
    new.expert := false;
  else
    new.expert := old.expert;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_expert on public.profiles;
create trigger trg_guard_expert
  before insert or update on public.profiles
  for each row execute function public.guard_expert_column();

-- PostgREST 스키마 캐시 리로드 (새 컬럼 인식)
notify pgrst, 'reload schema';
