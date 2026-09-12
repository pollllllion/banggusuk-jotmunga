-- ============================================================
-- [마이그레이션] 봇 트래픽을 따로 센다 (2026-09-12)
--
-- 앞선 migration_analytics_internal.sql 에서는 봇을 **아예 안 남겼는데**,
-- 그러면 "구글이 우리를 얼마나 긁고 있나"를 볼 수가 없다. 색인이 1개에서
-- 1,292개로 늘어나는 중이라 그 속도 자체가 봐야 할 지표다.
-- → 남기되 봇이라고 표시해서 사람 숫자와 섞이지 않게 한다.
--
-- User-Agent 원문은 여전히 저장하지 않는다. 남기는 건 **부류 이름**뿐이다
-- ('Googlebot' · '네이버 Yeti' · 'AI 크롤러' · '링크 미리보기' …).
--
-- ⚠️ camelCase 컬럼은 큰따옴표 필수. Supabase SQL Editor 에서 실행. 멱등.
--    migration_analytics_internal.sql 을 먼저 적용해야 한다.
-- ============================================================

alter table public.page_views
  add column if not exists "bot"     boolean not null default false,
  add column if not exists "botName" text;

-- "bot"     : 검색엔진 크롤러 등 사람이 아닌 방문. 사람 집계에서 뺀다.
-- "botName" : 봇 부류 이름만(Googlebot·네이버 Yeti 등). User-Agent 원문은 저장하지 않는다.
-- (COMMENT ON 구문은 Supabase SQL Editor 에서 한 번 구문 오류를 냈다 — 문서용이라 뺐다)

create index if not exists idx_page_views_human
  on public.page_views("createdAt" desc) where not "internal" and not "bot";

-- ── 지난 기록 소급 표시 (추정) ──────────────────────────────
-- 옛 기록에는 봇 표시가 없다. 남은 단서로 되짚으면 크롤러는 이렇게 생겼다 —
--   유입 경로 없음 · 작품 페이지만 · 한 세션에 1~2쪽 · 로그인 안 함.
-- 사람이 검색에서 들어오면 ref 가 남고, 직접 들어온 사람도 보통 다른 화면으로 넘어간다.
-- 이름은 알 수 없으므로 botName 은 비워 둔다('(표시 전 기록)' 으로 묶여 보인다).
update public.page_views v
   set "bot" = true
 where not v."bot" and not v."internal"
   and v."sid" in (
     select "sid" from public.page_views
      where not "internal"
      group by "sid"
     having count(*) <= 2
        and count(*) filter (where "ref" is not null and "ref" <> '') = 0
        and count(*) filter (where "path" not like '/content/%') = 0
        and count(*) filter (where "uid" is not null) = 0
   );

-- ============================================================
-- 집계 함수 — 기본 숫자는 '사람'만(우리 제외 · 봇 제외).
-- 봇은 bots 로 따로 준다.
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
        'views',    count(*)                 filter (where not "internal" and not "bot"),
        'visitors', count(distinct "sid")    filter (where not "internal" and not "bot"),
        'members',  count(distinct "uid")    filter (where "uid" is not null and not "internal" and not "bot"),
        'internalViews',    count(*)              filter (where "internal"),
        'internalVisitors', count(distinct "sid") filter (where "internal"),
        'botViews',         count(*)              filter (where "bot" and not "internal"),
        'botVisitors',      count(distinct "sid") filter (where "bot" and not "internal"),
        'searchVisitors', count(distinct "sid") filter (
          where not "internal" and not "bot"
            and "ref" ~* '(naver|google|daum|bing|yahoo|duckduckgo|zum\.com|kakao)'
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
        from page_views where "createdAt" >= v_from and not "internal" and not "bot"
        group by ("createdAt" at time zone 'Asia/Seoul')::date
      ) t
    ),
    'topPaths', (
      select coalesce(jsonb_agg(d order by (d->>'views')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('path', "path", 'views', count(*), 'visitors', count(distinct "sid")) as d
        from page_views where "createdAt" >= v_from and not "internal" and not "bot"
        group by "path" order by count(*) desc limit 20
      ) t
    ),
    'topRefs', (
      select coalesce(jsonb_agg(d order by (d->>'views')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('ref', coalesce(nullif("ref", ''), '(직접 방문)'), 'views', count(*)) as d
        from page_views where "createdAt" >= v_from and not "internal" and not "bot"
        group by coalesce(nullif("ref", ''), '(직접 방문)') order by count(*) desc limit 20
      ) t
    ),
    'topQueries', (
      select coalesce(jsonb_agg(d order by (d->>'count')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('q', "q", 'count', count(*)) as d
        from page_views
        where "createdAt" >= v_from and not "internal" and not "bot"
          and "q" is not null and length(btrim("q")) > 0
        group by "q" order by count(*) desc limit 30
      ) t
    ),
    -- 어느 봇이 얼마나 긁고 갔나. 색인 속도를 읽는 지표라 사람 숫자와 같은 화면에 둔다.
    'bots', (
      select coalesce(jsonb_agg(d order by (d->>'views')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'name', coalesce(nullif("botName", ''), '(표시 전 기록)'),
          'views', count(*),
          'paths', count(distinct "path")
        ) as d
        from page_views where "createdAt" >= v_from and "bot" and not "internal"
        group by coalesce(nullif("botName", ''), '(표시 전 기록)')
        order by count(*) desc limit 12
      ) t
    )
  ) into v_result;

  return v_result;
end $$;

grant execute on function public.analytics_summary(integer) to anon, authenticated;

-- ============================================================
-- 적용 확인 (관리자로 로그인한 상태에서)
--   select public.analytics_summary(30)->'totals';
--   select public.analytics_summary(30)->'bots';
--   select count(*) filter (where "bot") as 봇,
--          count(*) filter (where "internal") as 우리,
--          count(*) filter (where not "bot" and not "internal") as 사람
--     from public.page_views;
--
-- 롤백
--   alter table public.page_views drop column if exists "bot", drop column if exists "botName";
--   (그 뒤 migration_analytics_internal.sql 의 analytics_summary 를 다시 실행)
-- ============================================================
