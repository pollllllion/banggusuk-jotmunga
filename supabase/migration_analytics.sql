-- ============================================================
-- [마이그레이션] 방문 통계 (2026-09-09)
--
-- 관리자 화면에서 방문자·페이지뷰·유입 경로·사이트 내 검색어를 본다.
--
-- 설계 원칙
--   · **개인을 식별하지 않는다.** IP·User-Agent 원문을 저장하지 않는다.
--     세션 구분은 브라우저가 만든 임의 문자열(sid)뿐이고, 하루 단위로 새로 만든다
--     — 그래야 "며칠에 걸친 한 사람 추적"이 애초에 불가능하다.
--   · 로그인한 사람은 uid 를 함께 남긴다(회원/비회원 비율을 보려고). 유동닉은 남기지 않는다.
--   · 집계는 **DB 함수**가 한다. 원본 행을 브라우저로 내려받아 세면
--     행이 늘수록 관리자 화면이 무거워지고, 그 자체가 개인정보를 옮기는 일이 된다.
--
-- ⚠️ camelCase 컬럼은 큰따옴표 필수. Supabase SQL Editor 에서 실행. 멱등.
-- ============================================================

create table if not exists public.page_views (
  "id"        bigserial primary key,
  "path"      text        not null,          -- '/talk' · '/content/xxx' (쿼리스트링 제외)
  "ref"       text,                          -- 유입 도메인만 ('google.com'). 전체 URL 은 안 남긴다
  "q"         text,                          -- 사이트 안 검색창에 친 말 (검색일 때만)
  "sid"       text        not null,          -- 그날치 임의 세션 id (방문자 수 근사)
  "uid"       text,                          -- 로그인 계정이면 그 id
  "createdAt" timestamptz not null default now()
);

create index if not exists idx_page_views_created on public.page_views("createdAt" desc);
create index if not exists idx_page_views_q on public.page_views("q") where "q" is not null;

comment on table public.page_views is
  '방문 통계. 개인 식별 정보(IP·UA)는 저장하지 않는다. sid 는 하루짜리 임의값.';

-- ── RLS: 누구나 쌓고, 읽는 건 관리자만 ──────────────────────
alter table public.page_views enable row level security;

drop policy if exists page_views_insert on public.page_views;
create policy page_views_insert on public.page_views
  for insert with check (true);

-- 원본 행은 관리자도 화면에서 직접 읽지 않는다(집계 함수만 쓴다). 그래도 점검용으로 열어 둔다.
drop policy if exists page_views_select on public.page_views;
create policy page_views_select on public.page_views
  for select using (public.is_admin());

-- 수정·삭제 정책 없음 = 아무도 못 고친다(정리는 아래 purge 함수로).

-- ============================================================
-- 집계 함수 — 관리자만. 원본을 내보내지 않고 숫자만 준다.
-- ============================================================
create or replace function public.analytics_summary(p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception '관리자만 볼 수 있습니다';
  end if;

  select jsonb_build_object(
    'days', greatest(1, least(p_days, 365)),
    'totals', (
      select jsonb_build_object(
        'views', count(*),
        'visitors', count(distinct "sid"),
        'members', count(distinct "uid") filter (where "uid" is not null)
      ) from page_views where "createdAt" >= v_from
    ),
    -- 일자별 (한국 시간 기준으로 끊는다 — 러너·DB 가 UTC 라 그냥 두면 하루가 밀린다)
    'daily', (
      select coalesce(jsonb_agg(d order by d->>'day'), '[]'::jsonb) from (
        select jsonb_build_object(
          'day', to_char(("createdAt" at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD'),
          'views', count(*),
          'visitors', count(distinct "sid")
        ) as d
        from page_views where "createdAt" >= v_from
        group by ("createdAt" at time zone 'Asia/Seoul')::date
      ) t
    ),
    'topPaths', (
      select coalesce(jsonb_agg(d order by (d->>'views')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('path', "path", 'views', count(*), 'visitors', count(distinct "sid")) as d
        from page_views where "createdAt" >= v_from
        group by "path" order by count(*) desc limit 20
      ) t
    ),
    'topRefs', (
      select coalesce(jsonb_agg(d order by (d->>'views')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('ref', coalesce(nullif("ref", ''), '(직접 방문)'), 'views', count(*)) as d
        from page_views where "createdAt" >= v_from
        group by coalesce(nullif("ref", ''), '(직접 방문)') order by count(*) desc limit 20
      ) t
    ),
    'topQueries', (
      select coalesce(jsonb_agg(d order by (d->>'count')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('q', "q", 'count', count(*)) as d
        from page_views where "createdAt" >= v_from and "q" is not null and length(btrim("q")) > 0
        group by "q" order by count(*) desc limit 30
      ) t
    )
  ) into v_result;

  return v_result;
end $$;

grant execute on function public.analytics_summary(integer) to anon, authenticated;

-- ============================================================
-- 오래된 기록 정리 — 통계는 최근 것만 쓸모 있고, 오래 남길수록 부담만 된다.
-- 관리자가 화면에서 부르거나, 나중에 크론에 걸어도 된다.
-- ============================================================
create or replace function public.purge_old_page_views(p_keep_days integer default 180)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_deleted integer;
begin
  if not public.is_admin() then
    raise exception '관리자만 실행할 수 있습니다';
  end if;
  delete from page_views
   where "createdAt" < now() - make_interval(days => greatest(30, p_keep_days));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

grant execute on function public.purge_old_page_views(integer) to authenticated;

-- ============================================================
-- 적용 확인
--   select public.analytics_summary(7);      -- 관리자로 로그인한 상태에서
--   select count(*) from public.page_views;
--
-- 롤백
--   drop function if exists public.analytics_summary(integer);
--   drop function if exists public.purge_old_page_views(integer);
--   drop table if exists public.page_views;
-- ============================================================
