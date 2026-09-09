-- ============================================================
-- [마이그레이션] 유입 검색어 (2026-09-09)
--
-- "밖에서 뭘 검색해서 들어왔나"를 기록한다.
--   네이버·다음·줌·네이트는 referrer URL 에 검색어를 남긴다 → 잡을 수 있다
--   구글은 2011년부터 지운다                                  → **영원히 못 잡는다**
--                                                              (Search Console 에서 봐야 한다)
--
-- 이미 있던 q 칸과 헷갈리지 말 것:
--   "refq"  밖에서 검색해 들어온 말
--   "q"     우리 사이트 검색창에 친 말
--
-- referrer 전체 URL 은 저장하지 않는다 — 도메인과 검색어만 꺼내고 나머지는 버린다.
--
-- ⚠️ migration_analytics.sql 을 먼저 적용했어야 한다. 멱등.
-- ============================================================

alter table public.page_views
  add column if not exists "refq" text;

comment on column public.page_views."refq" is
  '유입 검색어(검색엔진이 referrer 로 넘겨준 경우만). 구글은 넘기지 않는다.';

create index if not exists idx_page_views_refq
  on public.page_views("refq") where "refq" is not null;

-- ── 집계 함수에 '유입 검색어' 추가 ──────────────────────────
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
    -- 밖에서 검색해 들어온 말 (네이버·다음 등)
    'topRefQueries', (
      select coalesce(jsonb_agg(d order by (d->>'count')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('q', "refq", 'ref', min("ref"), 'count', count(*)) as d
        from page_views
        where "createdAt" >= v_from and "refq" is not null and length(btrim("refq")) > 0
        group by "refq" order by count(*) desc limit 30
      ) t
    ),
    -- 우리 사이트 검색창에 친 말
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
-- 적용 확인 (관리자로 로그인한 상태에서)
--   select public.analytics_summary(7) -> 'topRefQueries';
--
-- 롤백
--   alter table public.page_views drop column if exists "refq";
--   (집계 함수는 migration_analytics.sql 의 판을 다시 실행하면 된다)
-- ============================================================
