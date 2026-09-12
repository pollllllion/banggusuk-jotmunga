-- ============================================================
-- [마이그레이션] 유입 검색어 보관 (2026-09-12)
--
-- 밖에서 뭘 검색해 들어왔는지는 **우리 사이트에서 알 수 없다.**
-- 브라우저가 referrer 에서 검색어를 지우고 도메인만 넘기기 때문이다
-- (src/utils/analytics.ts 의 긴 주석 참고). 그래서 검색엔진 쪽에서 받아 온다.
--
--   구글  Search Console API 로 매일 자동 수집 (scripts/fetch-gsc.mjs)
--   네이버 공식 API 가 없다. 서치어드바이저 화면에서 복사해 붙여넣으면 여기 쌓인다
--          (상위 30개 · 90일 보관이라 붙여넣어 두면 그 뒤로도 남는다)
--
-- ⚠️ camelCase 컬럼은 큰따옴표 필수. Supabase SQL Editor 에서 실행. 멱등.
-- ============================================================

create table if not exists public.search_queries (
  "source"      text        not null check ("source" in ('google', 'naver')),
  "day"         date        not null,
  "query"       text        not null,
  "clicks"      integer     not null default 0,
  "impressions" integer     not null default 0,
  "position"    numeric(6,2),                      -- 평균 노출 순위 (네이버는 없을 수 있다)
  "updatedAt"   timestamptz not null default now(),
  primary key ("source", "day", "query")
);

create index if not exists idx_search_queries_day
  on public.search_queries("day" desc);

-- ── RLS: 관리자만 보고 관리자만 넣는다 ──────────────────────
-- 자동 수집(GitHub Actions)은 service_role 로 붙어서 RLS 를 통과한다.
-- 여기 정책은 사람이 화면에서 네이버 검색어를 붙여넣는 경우를 위한 것이다.
alter table public.search_queries enable row level security;

drop policy if exists search_queries_select on public.search_queries;
create policy search_queries_select on public.search_queries
  for select to authenticated using (public.is_admin());

drop policy if exists search_queries_insert on public.search_queries;
create policy search_queries_insert on public.search_queries
  for insert to authenticated with check (public.is_admin());

drop policy if exists search_queries_update on public.search_queries;
create policy search_queries_update on public.search_queries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists search_queries_delete on public.search_queries;
create policy search_queries_delete on public.search_queries
  for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.search_queries to authenticated;

-- ============================================================
-- 집계 — 기간 안의 검색어를 합쳐서 준다.
-- 원본은 날짜별이라 그대로 보여주면 같은 말이 여러 줄로 흩어진다.
-- ============================================================
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
        limit 50
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
        limit 50
      ) t
    ),
    'updatedAt', (select max("updatedAt") from search_queries)
  ) into v_result;

  return v_result;
end $$;

grant execute on function public.search_queries_summary(integer) to authenticated;

-- ============================================================
-- 적용 확인 (관리자로 로그인한 상태에서)
--   select public.search_queries_summary(28);
--
-- 롤백
--   drop function if exists public.search_queries_summary(integer);
--   drop table if exists public.search_queries;
-- ============================================================
