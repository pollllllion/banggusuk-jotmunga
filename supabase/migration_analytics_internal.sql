-- ============================================================
-- [마이그레이션] 방문 통계에서 '우리'를 걷어낸다 (2026-09-12)
--
-- 왜:
--   관리자는 둘(마도사·셀리더), 기기는 넷뿐인데 방문자 수가 그보다 훨씬 크게 찍혔다.
--   원인은 두 가지였다.
--     ① 우리가 우리 사이트를 돌아다닌 기록 — 로그아웃 상태로 봐도 그대로 쌓인다
--     ② 검색엔진 크롤러 — 구글이 1,292개를 색인하는 중이라 작품 페이지를 계속 연다.
--        크롤러도 JS 를 실행하므로 우리 기록 코드가 그대로 돌아간다
--   ②는 클라이언트에서 아예 안 남기게 막았고(src/utils/analytics.ts),
--   ①은 남기되 "우리 것"이라고 표시해 집계에서 뺀다. 지우지 않는 이유는
--   나중에 "우리 것 포함해서 보기"를 하려면 원본이 있어야 하기 때문이다.
--
-- ⚠️ camelCase 컬럼은 큰따옴표 필수. Supabase SQL Editor 에서 실행. 멱등.
-- ============================================================

alter table public.page_views
  add column if not exists "internal" boolean not null default false;

comment on column public.page_views."internal" is
  '관리자 본인 기기의 기록. 집계에서 뺀다(지우지는 않는다).';

create index if not exists idx_page_views_internal
  on public.page_views("createdAt" desc) where not "internal";

-- ── 지난 기록 소급 표시 ─────────────────────────────────────
-- ① 관리자로 로그인한 적이 있는 세션.
--    sid 는 그날치 기기 식별자라, 그 세션의 나머지(로그아웃 상태로 본 것 포함)도 같은 기기다.
update public.page_views v
   set "internal" = true
 where not v."internal"
   and v."sid" in (
     select pv."sid" from public.page_views pv
      join public.profiles p on p."id" = pv."uid"
     where p."role" = 'admin'
   );

-- ② 개발하면서 남긴 기록.
--    dev 서버(localhost)에서 클릭한 것도 같은 DB 에 쌓였다. 그 세션은 관리자 계정이
--    아니라 시험용 계정으로 로그인해 있어서 ①에 안 걸린다. 남는 특징이 이렇다 —
--    하루에 20뷰 넘게, 5종류 이상 화면을, 유입 경로 없이(직접) 돌아다닌다.
--    진짜 방문자는 이렇게 안 논다(검색에서 들어오거나, 한두 화면만 보고 나간다).
--    ⚠️ 열심히 둘러본 진짜 사용자를 지울 위험이 있는 규칙이라 **이번 한 번만** 쓴다.
--    앞으로는 localhost 를 아예 기록하지 않으므로(src/utils/analytics.ts) 다시 쓸 일이 없다.
update public.page_views v
   set "internal" = true
 where not v."internal"
   and v."sid" in (
     select "sid" from public.page_views
     group by "sid"
     having count(*) >= 20
        and count(distinct split_part("path", '/', 2)) >= 5
        and count(*) filter (where "ref" is not null and "ref" <> '') = 0
   );

-- ============================================================
-- 집계 함수 — internal 을 뺀 숫자가 기본값이다.
-- 바깥 검색에서 들어온 방문자(searchVisitors)를 따로 센다. 봇을 안 남기게 된 뒤로는
-- 이 값이 '순수 유입 일반인'에 가장 가깝다.
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
        'views', count(*) filter (where not "internal"),
        'visitors', count(distinct "sid") filter (where not "internal"),
        'members', count(distinct "uid") filter (where "uid" is not null and not "internal"),
        -- 우리 기기 몫 — 화면에 "이만큼 뺐다"고 밝히려고 같이 준다
        'internalViews', count(*) filter (where "internal"),
        'internalVisitors', count(distinct "sid") filter (where "internal"),
        -- 검색엔진에서 넘어온 세션 = 밖에서 우리를 찾아온 사람
        'searchVisitors', count(distinct "sid") filter (
          where not "internal" and "ref" ~* '(naver|google|daum|bing|yahoo|duckduckgo|zum\.com|kakao)'
        )
      ) from page_views where "createdAt" >= v_from
    ),
    'daily', (
      select coalesce(jsonb_agg(d order by d->>'day'), '[]'::jsonb) from (
        select jsonb_build_object(
          'day', to_char(("createdAt" at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD'),
          'views', count(*),
          'visitors', count(distinct "sid")
        ) as d
        from page_views where "createdAt" >= v_from and not "internal"
        group by ("createdAt" at time zone 'Asia/Seoul')::date
      ) t
    ),
    'topPaths', (
      select coalesce(jsonb_agg(d order by (d->>'views')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('path', "path", 'views', count(*), 'visitors', count(distinct "sid")) as d
        from page_views where "createdAt" >= v_from and not "internal"
        group by "path" order by count(*) desc limit 20
      ) t
    ),
    'topRefs', (
      select coalesce(jsonb_agg(d order by (d->>'views')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('ref', coalesce(nullif("ref", ''), '(직접 방문)'), 'views', count(*)) as d
        from page_views where "createdAt" >= v_from and not "internal"
        group by coalesce(nullif("ref", ''), '(직접 방문)') order by count(*) desc limit 20
      ) t
    ),
    'topQueries', (
      select coalesce(jsonb_agg(d order by (d->>'count')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('q', "q", 'count', count(*)) as d
        from page_views
        where "createdAt" >= v_from and not "internal" and "q" is not null and length(btrim("q")) > 0
        group by "q" order by count(*) desc limit 30
      ) t
    )
  ) into v_result;

  return v_result;
end $$;

grant execute on function public.analytics_summary(integer) to anon, authenticated;

-- ============================================================
-- 적용 확인 (관리자로 로그인한 상태에서)
--   select public.analytics_summary(30)->'totals';
--   select count(*) filter (where "internal") as 우리,
--          count(*) filter (where not "internal") as 나머지
--     from public.page_views;
--
-- 롤백
--   alter table public.page_views drop column if exists "internal";
--   (그 뒤 migration_analytics.sql 의 analytics_summary 를 다시 실행)
-- ============================================================
