-- ============================================================
-- [마이그레이션] 통계 기간을 한국 시간 00시에서 끊는다 (2026-09-17)
--
-- 전에는 기간 시작이 `now() - N일` 이었다 — 지금이 15:20 이면 '오늘'이
-- **어제 15:20 부터**였다. 그래서
--   · 숫자가 바뀌는 기준 시각이 볼 때마다 달랐고
--   · '오늘' 방문자에 어제 오후~밤 방문자가 섞여 나왔다
--     (일자별 표에도 어제 줄이 반쪽짜리로 같이 떴다)
-- → 기간 시작을 KST 자정으로 고정한다. '오늘' = 오늘 00:00~지금,
--   7일 = 오늘 포함 달력 7일. 세션 id 도 KST 날짜로 새로 만들므로(analytics.ts)
--   이제 '오늘 방문자' = 오늘 만들어진 세션 수와 정확히 맞는다.
--
-- 테이블은 안 건드린다. 집계 함수만 교체. 멱등.
-- migration_analytics_bots.sql 을 먼저 적용해야 한다. Supabase SQL Editor 에서 실행.
-- ============================================================

create or replace function public.analytics_summary(p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(p_days, 365));
  -- 한국 시간 자정에서 끊는다. '오늘'(1일) = 오늘 00:00 부터, 7일 = 오늘 포함 달력 7일.
  -- (전에는 now() - N일 이라 '오늘'이 어제 이 시각부터였고, 어제·오늘 방문자가 한 숫자에 섞였다)
  v_from timestamptz := (date_trunc('day', now() at time zone 'Asia/Seoul')
                         - make_interval(days => v_days - 1)) at time zone 'Asia/Seoul';
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception '관리자만 볼 수 있습니다';
  end if;

  select jsonb_build_object(
    'days', v_days,
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
--   select public.analytics_summary(1)->'daily';   -- 오늘 날짜 한 줄만 나와야 한다
--
-- 롤백
--   migration_analytics_bots.sql 의 analytics_summary 를 다시 실행
-- ============================================================
