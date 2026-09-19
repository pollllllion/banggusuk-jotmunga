-- ============================================================
-- [마이그레이션] 숏폼 캘린더 선정 + 유입 검색어 전체 보기 (2026-09-19)
--
-- 1) contents."calendarPick"
--    숏폼은 양산형이 대부분이라 전부 캘린더에 올리면 달력이 묻힌다. 그래서 수집기가
--    점수(검색 유입·TMDB 평가·배우 인지도·인기도)로 골라 이 칸을 켠다
--    (scripts/sync-tmdb-ott.mjs shortPickScore). 관리자가 '캘린더 올리기/내리기'로
--    고치면 manualOverride 도 같이 켜져서 다음 동기화가 그 결정을 덮지 않는다.
--    앱은 이 칸을 시작 로드 목록(CONTENT_LIST_COLS)이 아니라 따로 받는다(src/api/cache.ts
--    loadCalendarPicks) — 적용 전에도 앱이 죽지 않고, 숏폼이 캘린더에 안 뜰 뿐이다.
--
-- 2) search_queries_summary 의 검색어 상한 50 → 1000
--    관리자 통계의 '숏폼 비중'은 전체 검색어 대비라서 상위 50개만으로는 틀린 값이 나온다
--    (구글은 15일에 검색어 307개).
--
-- ⚠️ camelCase 컬럼은 큰따옴표 필수. Supabase SQL Editor 에서 실행. 멱등.
-- ============================================================

alter table public.contents add column if not exists "calendarPick" boolean not null default false;

create index if not exists idx_contents_calendar_pick
  on public.contents("calendarPick") where "calendarPick";

create or replace function public.search_queries_summary(p_days integer default 28)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := (now() at time zone 'Asia/Seoul')::date - greatest(1, least(p_days, 365));
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception '관리자만 볼 수 있습니다';
  end if;

  select jsonb_build_object(
    'days', greatest(1, least(p_days, 365)),
    'google', (
      select coalesce(jsonb_agg(d order by (d->>'clicks')::bigint desc, (d->>'impressions')::bigint desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'query', "query",
          'clicks', sum("clicks"),
          'impressions', sum("impressions"),
          -- 노출수로 가중한 평균 순위. 그냥 평균 내면 노출 1회짜리가 순위를 흔든다
          'position', round(
            case when sum("impressions") > 0
                 then sum("position" * "impressions") / sum("impressions")
                 else avg("position") end, 1)
        ) as d
        from search_queries
        where "source" = 'google' and "day" >= v_from
        group by "query"
        order by sum("clicks") desc, sum("impressions") desc
        limit 1000
      ) t
    ),
    'naver', (
      select coalesce(jsonb_agg(d order by (d->>'clicks')::bigint desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'query', "query",
          'clicks', sum("clicks"),
          'impressions', sum("impressions")
        ) as d
        from search_queries
        where "source" = 'naver' and "day" >= v_from
        group by "query"
        order by sum("clicks") desc
        limit 1000
      ) t
    ),
    'updatedAt', (select max("updatedAt") from search_queries)
  ) into v_result;

  return v_result;
end $$;

grant execute on function public.search_queries_summary(integer) to authenticated;

-- ============================================================
-- 적용 확인
--   select count(*) filter (where "calendarPick") as "선정", count(*) as "숏폼"
--     from public.contents where type = 'shortform';
--   → 처음엔 선정 0. 수집기(SHORT_ONLY=1 node scripts/sync-tmdb-ott.mjs)를 한 번 돌리면 채워진다
--
-- 롤백
--   alter table public.contents drop column if exists "calendarPick";
--   (search_queries_summary 는 migration_search_queries.sql 을 다시 실행하면 limit 50 으로 돌아간다)
-- ============================================================
