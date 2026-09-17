-- ============================================================
-- [마이그레이션] 회원 분석 — 관리자 사용자 탭 (2026-09-17)
--
-- "이 회원이 어떤 작품에 공개알림을 걸었고, 뭘 검색했고, 뭘 봤나" 와
-- "회원 전체로 보면 어떤 작품·검색어가 많은가" 를 관리자 화면에서 본다.
--
-- 새로 쌓는 것은 user_events 하나뿐이다. 나머지는 이미 있는 표를 읽는다.
--   page_views      로그인 상태의 화면 이동·검색어 (uid 가 붙어 있다)
--   content_alerts  공개알림 · bookmarks 찜 · watched 본 작품 · push_subscriptions 알림 기기
--   user_events     ★신규 — 표에 흔적이 안 남는 행동: 검색 제안에서 고른 작품, 찜·알림 **해제**,
--                   푸시 켬/끔. (켠 것은 표에 남지만 끈 것은 행이 지워져서 알 길이 없었다)
--
-- 원칙은 그대로다
--   · 회원(로그인 계정)만. 비회원·유동닉은 누구인지 남기지 않는다
--   · IP·User-Agent 는 저장하지 않는다
--   · 원본 행은 관리자 전용 함수로만 나간다. 표는 클라이언트가 못 읽는다
--   · 180일이 지나면 지운다 (개인정보 처리방침에 적은 기간). 지금까지 purge 함수를 부르는 곳이
--     없어서 약속만 있고 실행이 없었다 — 관리자가 사용자 탭을 열 때 같이 지우게 했다
--   · 탈퇴하면 같이 지운다 (delete_my_account 패치 — 맨 아래)
--
-- ⚠️ camelCase 컬럼은 큰따옴표 필수. Supabase SQL Editor 에 통째로 붙여 실행. 멱등.
--    migration_last_seen.sql 을 먼저 적용해야 한다 (user_last_seen 을 읽는다).
-- ============================================================

create table if not exists public.user_events (
  "id"        bigserial primary key,
  "uid"       text        not null,
  "name"      text        not null check (length("name") between 1 and 40),
  "target"    text        check ("target" is null or length("target") <= 200),   -- 대개 contentId
  "meta"      jsonb       check ("meta" is null or pg_column_size("meta") <= 1000),
  "createdAt" timestamptz not null default now()
);

create index if not exists idx_user_events_uid on public.user_events("uid", "createdAt" desc);
create index if not exists idx_page_views_uid on public.page_views("uid", "createdAt" desc) where "uid" is not null;

alter table public.user_events enable row level security;

-- 본인 이름으로만 쌓는다. page_views 와 달리 uid 를 남이 지어 넣을 수 없다.
drop policy if exists user_events_insert on public.user_events;
create policy user_events_insert on public.user_events
  for insert to authenticated with check ("uid" = auth.uid()::text);

-- select·update·delete 정책 없음 = 클라이언트는 못 읽고 못 고친다 (아래 함수로만 나간다)
revoke all on table public.user_events from anon, authenticated;
grant insert on public.user_events to authenticated;
grant usage, select on sequence public.user_events_id_seq to authenticated;

-- ============================================================
-- 에디터(페르소나)·관리자를 뺀 '진짜 회원' id 목록 — 아래 두 함수가 같이 쓴다
-- ============================================================
create or replace function public._real_member_ids()
returns text[]
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(array_agg(p.id::text), '{}')
    from public.profiles p
    left join auth.users a on a.id::text = p.id::text
   where coalesce(a.email, '') not ilike '%@personas.ottcal.com'
     and coalesce(p.role, 'user') <> 'admin'
$$;

revoke all on function public._real_member_ids() from public, anon, authenticated;

-- ============================================================
-- 회원 한 명 — 사용자 탭에서 '분석' 을 펼쳤을 때
-- ============================================================
create or replace function public.admin_user_insight(p_user_id text)
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

  select jsonb_build_object(
    -- 방문 요약
    'totals', (
      select jsonb_build_object(
        'views',      count(*),
        'activeDays', count(distinct ("createdAt" at time zone 'Asia/Seoul')::date),
        'sessions',   count(distinct "sid"),
        'firstAt',    min("createdAt"),
        'lastAt',     max("createdAt")
      ) from page_views where "uid" = p_user_id
    ),
    'lastSeenAt', (select "at" from user_last_seen where "userId" = p_user_id),

    -- 공개알림 · 찜 · 본 작품
    'alerts', (
      select coalesce(jsonb_agg(d order by d->>'createdAt' desc), '[]'::jsonb) from (
        select jsonb_build_object('contentId', a."contentId", 'title', c.title, 'type', c.type,
                                  'releaseDate', c."releaseDate", 'createdAt', a."createdAt") as d
          from content_alerts a left join contents c on c.id = a."contentId"
         where a."userId" = p_user_id
      ) t
    ),
    'bookmarks', (
      select coalesce(jsonb_agg(d order by d->>'createdAt' desc), '[]'::jsonb) from (
        select jsonb_build_object('contentId', b."contentId", 'title', c.title, 'type', c.type, 'createdAt', b."createdAt") as d
          from bookmarks b left join contents c on c.id = b."contentId"
         where b."userId" = p_user_id
         order by b."createdAt" desc limit 50
      ) t
    ),
    'bookmarkCount', (select count(*) from bookmarks where "userId" = p_user_id),
    'watched', (
      select coalesce(jsonb_agg(d order by d->>'createdAt' desc), '[]'::jsonb) from (
        select jsonb_build_object('contentId', w."contentId", 'title', c.title, 'type', c.type,
                                  'rating', w."rating", 'createdAt', w."createdAt") as d
          from watched w left join contents c on c.id = w."contentId"
         where w."userId" = p_user_id
         order by w."createdAt" desc limit 30
      ) t
    ),
    'watchedCount', (select count(*) from watched where "userId" = p_user_id),
    -- 취향 — 본 작품의 종류별 개수 (영화/드라마/웹툰…)
    'watchedTypes', (
      select coalesce(jsonb_agg(d order by (d->>'count')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('type', coalesce(c.type, '(없는 작품)'), 'count', count(*)) as d
          from watched w left join contents c on c.id = w."contentId"
         where w."userId" = p_user_id group by coalesce(c.type, '(없는 작품)')
      ) t
    ),

    -- 검색 — 검색 결과 화면까지 간 것(page_views.q) + 제안에서 바로 고른 것(search_pick)
    'searches', (
      select coalesce(jsonb_agg(d order by d->>'at' desc), '[]'::jsonb) from (
        (select jsonb_build_object('q', "q", 'at', "createdAt", 'picked', null) as d, "createdAt" as ts
           from page_views where "uid" = p_user_id and "q" is not null and length(btrim("q")) > 0)
        union all
        (select jsonb_build_object('q', e."meta"->>'q', 'at', e."createdAt",
                                   'picked', coalesce(c.title, e."meta"->>'title', e."target")) as d, e."createdAt" as ts
           from user_events e left join contents c on c.id = e."target"
          where e."uid" = p_user_id and e."name" = 'search_pick')
        order by ts desc limit 60
      ) t
    ),

    -- 많이 들여다본 작품 (상세 화면 방문 수)
    'topContents', (
      select coalesce(jsonb_agg(d order by (d->>'views')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('contentId', substring(v."path" from 10), 'title', max(c.title),
                                  'views', count(*), 'lastAt', max(v."createdAt")) as d
          from page_views v left join contents c on c.id = substring(v."path" from 10)
         where v."uid" = p_user_id and v."path" like '/content/%'
         group by substring(v."path" from 10) order by count(*) desc limit 15
      ) t
    ),
    -- 어느 메뉴를 주로 쓰나 (경로 첫 마디)
    'sections', (
      select coalesce(jsonb_agg(d order by (d->>'views')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('section', '/' || split_part("path", '/', 2), 'views', count(*)) as d
          from page_views where "uid" = p_user_id
         group by split_part("path", '/', 2) order by count(*) desc limit 12
      ) t
    ),
    -- 몇 시에 오나 (한국 시간 0~23시)
    'hours', (
      select coalesce(jsonb_agg(d order by (d->>'hour')::int), '[]'::jsonb) from (
        select jsonb_build_object('hour', extract(hour from "createdAt" at time zone 'Asia/Seoul')::int, 'views', count(*)) as d
          from page_views where "uid" = p_user_id
         group by extract(hour from "createdAt" at time zone 'Asia/Seoul')::int
      ) t
    ),
    -- 최근 30일 날짜별
    'daily', (
      select coalesce(jsonb_agg(d order by d->>'day'), '[]'::jsonb) from (
        select jsonb_build_object('day', to_char(("createdAt" at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD'), 'views', count(*)) as d
          from page_views where "uid" = p_user_id and "createdAt" >= now() - interval '30 days'
         group by ("createdAt" at time zone 'Asia/Seoul')::date
      ) t
    ),
    -- 어디서 들어오나
    'refs', (
      select coalesce(jsonb_agg(d order by (d->>'views')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('ref', "ref", 'views', count(*)) as d
          from page_views where "uid" = p_user_id and "ref" is not null and "ref" <> ''
         group by "ref" order by count(*) desc limit 8
      ) t
    ),
    -- 최근 발자취
    'trail', (
      select coalesce(jsonb_agg(d order by d->>'at' desc), '[]'::jsonb) from (
        select jsonb_build_object('path', v."path", 'q', v."q", 'at', v."createdAt",
                                  'title', case when v."path" like '/content/%' then c.title
                                                when v."path" like '/talk/%' then dd.title end) as d
          from page_views v
          left join contents c on v."path" like '/content/%' and c.id = substring(v."path" from 10)
          left join discussions dd on v."path" like '/talk/%' and dd.id = substring(v."path" from 7)
         where v."uid" = p_user_id
         order by v."createdAt" desc limit 80
      ) t
    ),
    -- 행동 기록 (해제·푸시 등)
    'events', (
      select coalesce(jsonb_agg(d order by d->>'at' desc), '[]'::jsonb) from (
        select jsonb_build_object('name', e."name", 'target', e."target", 'title', c.title, 'meta', e."meta", 'at', e."createdAt") as d
          from user_events e left join contents c on c.id = e."target"
         where e."uid" = p_user_id and e."name" <> 'search_pick'
         order by e."createdAt" desc limit 50
      ) t
    ),

    -- 알림 기기 · 관계 · 신고
    'push', (
      select jsonb_build_object('devices', count(*), 'lastOkAt', max("lastOkAt"), 'failing', count(*) filter (where "failCount" > 0))
        from push_subscriptions where "userId" = p_user_id
    ),
    'social', jsonb_build_object(
      'following',  (select coalesce(array_length("follows", 1), 0) from profiles where id::text = p_user_id),
      'followers',  (select count(*) from profiles where p_user_id = any("follows")),
      'likesGiven', (select count(*) from discussions where p_user_id = any(likes))
                  + (select count(*) from discussion_comments where p_user_id = any(likes)),
      'reportsFiled', (select count(*) from reports where "reporterId" = p_user_id),
      'reportsReceived', (
        select count(*) from reports r
         where r."targetId" in (select id from discussions where "authorId" = p_user_id)
            or r."targetId" in (select id from discussion_comments where "authorId" = p_user_id)
      )
    )
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.admin_user_insight(text) from public, anon;
grant execute on function public.admin_user_insight(text) to authenticated;

-- ============================================================
-- 회원 전체 — 사용자 탭 맨 위 '회원 종합'
-- 에디터(페르소나)·관리자는 뺀다. 넣으면 우리가 누른 것이 회원 취향처럼 보인다.
-- ============================================================
create or replace function public.admin_members_overview(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(p_days, 180));
  -- 한국 시간 자정에서 끊는다 — '오늘'(1일) = 오늘 00:00 부터, 7일 = 오늘 포함 달력 7일.
  -- 통계 탭(migration_analytics_midnight.sql)과 같은 기준이라 두 화면의 숫자가 어긋나지 않는다.
  v_from timestamptz := (date_trunc('day', now() at time zone 'Asia/Seoul')
                         - make_interval(days => greatest(1, least(p_days, 180)) - 1)) at time zone 'Asia/Seoul';
  v_real text[];
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception '관리자만 볼 수 있습니다';
  end if;

  v_real := public._real_member_ids();

  select jsonb_build_object(
    'days', v_days,
    -- 가입 → 실제로 쓰는 데까지 몇 명이 남나
    'funnel', jsonb_build_object(
      'members',   coalesce(array_length(v_real, 1), 0),
      'newInDays', (select count(*) from profiles where id::text = any(v_real) and "createdAt" >= v_from),
      'active7',   (select count(distinct "uid") from page_views where "uid" = any(v_real) and "createdAt" >= now() - interval '7 days'),
      'activeInDays', (select count(distinct "uid") from page_views where "uid" = any(v_real) and "createdAt" >= v_from),
      'wrote',     (select count(distinct "authorId") from discussions where "authorId" = any(v_real)),
      'commented', (select count(distinct "authorId") from discussion_comments where "authorId" = any(v_real)),
      'watched',   (select count(distinct "userId") from watched where "userId" = any(v_real)),
      'bookmarked',(select count(distinct "userId") from bookmarks where "userId" = any(v_real)),
      'alerted',   (select count(distinct "userId") from content_alerts where "userId" = any(v_real)),
      'pushOn',    (select count(distinct "userId") from push_subscriptions where "userId" = any(v_real)),
      'appUsers',  (select count(*) from profiles where id::text = any(v_real) and coalesce(array_length("appInstalledOn", 1), 0) > 0)
    ),
    -- 날짜별 접속 회원 수 · 가입 수
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', to_char(g.day, 'YYYY-MM-DD'),
               'active', coalesce(a.n, 0), 'signups', coalesce(s.n, 0)) order by g.day), '[]'::jsonb)
        from generate_series((v_from at time zone 'Asia/Seoul')::date, (now() at time zone 'Asia/Seoul')::date, interval '1 day') as g(day)
        left join (select ("createdAt" at time zone 'Asia/Seoul')::date as day, count(distinct "uid") as n
                     from page_views where "uid" = any(v_real) and "createdAt" >= v_from group by 1) a on a.day = g.day::date
        left join (select ("createdAt" at time zone 'Asia/Seoul')::date as day, count(*) as n
                     from profiles where id::text = any(v_real) and "createdAt" >= v_from group by 1) s on s.day = g.day::date
    ),
    -- 공개알림이 많이 걸린 작품 — 회원들이 뭘 기다리나
    'topAlerts', (
      select coalesce(jsonb_agg(d order by (d->>'count')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('contentId', a."contentId", 'title', max(c.title), 'type', max(c.type),
                                  'releaseDate', max(c."releaseDate"::text), 'count', count(*)) as d
          from content_alerts a left join contents c on c.id = a."contentId"
         where a."userId" = any(v_real)
         group by a."contentId" order by count(*) desc limit 15
      ) t
    ),
    'topBookmarks', (
      select coalesce(jsonb_agg(d order by (d->>'count')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('contentId', b."contentId", 'title', max(c.title), 'type', max(c.type), 'count', count(*)) as d
          from bookmarks b left join contents c on c.id = b."contentId"
         where b."userId" = any(v_real)
         group by b."contentId" order by count(*) desc limit 15
      ) t
    ),
    -- 회원이 검색한 말 (검색 화면 + 제안에서 바로 고른 것)
    'topQueries', (
      select coalesce(jsonb_agg(d order by (d->>'count')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('q', q, 'count', count(*), 'members', count(distinct uid)) as d from (
          select lower(btrim("q")) as q, "uid" as uid from page_views
           where "uid" = any(v_real) and "createdAt" >= v_from and "q" is not null and length(btrim("q")) > 0
          union all
          select lower(btrim("meta"->>'q')), "uid" from user_events
           where "uid" = any(v_real) and "createdAt" >= v_from and "name" = 'search_pick' and length(btrim(coalesce("meta"->>'q', ''))) > 0
        ) s group by q order by count(*) desc limit 30
      ) t
    ),
    -- 회원이 많이 본 작품 상세
    'topContents', (
      select coalesce(jsonb_agg(d order by (d->>'members')::bigint desc, (d->>'views')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('contentId', substring(v."path" from 10), 'title', max(c.title),
                                  'views', count(*), 'members', count(distinct v."uid")) as d
          from page_views v left join contents c on c.id = substring(v."path" from 10)
         where v."uid" = any(v_real) and v."createdAt" >= v_from and v."path" like '/content/%'
         group by substring(v."path" from 10) order by count(distinct v."uid") desc, count(*) desc limit 15
      ) t
    ),
    'sections', (
      select coalesce(jsonb_agg(d order by (d->>'views')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('section', '/' || split_part("path", '/', 2), 'views', count(*), 'members', count(distinct "uid")) as d
          from page_views where "uid" = any(v_real) and "createdAt" >= v_from
         group by split_part("path", '/', 2) order by count(*) desc limit 12
      ) t
    ),
    'hours', (
      select coalesce(jsonb_agg(d order by (d->>'hour')::int), '[]'::jsonb) from (
        select jsonb_build_object('hour', extract(hour from "createdAt" at time zone 'Asia/Seoul')::int, 'views', count(*)) as d
          from page_views where "uid" = any(v_real) and "createdAt" >= v_from
         group by extract(hour from "createdAt" at time zone 'Asia/Seoul')::int
      ) t
    ),
    -- 알림·찜을 **끈** 작품 — 기대가 식은 작품을 본다
    'topDropped', (
      select coalesce(jsonb_agg(d order by (d->>'count')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('contentId', e."target", 'title', max(c.title), 'name', e."name", 'count', count(*)) as d
          from user_events e left join contents c on c.id = e."target"
         where e."uid" = any(v_real) and e."createdAt" >= v_from and e."name" in ('alert_off', 'bookmark_off')
         group by e."target", e."name" order by count(*) desc limit 10
      ) t
    )
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.admin_members_overview(integer) from public, anon;
grant execute on function public.admin_members_overview(integer) to authenticated;

-- ============================================================
-- 180일 보관 — 관리자가 사용자 탭을 열 때(admin_user_list) 같이 지운다.
-- 크론을 따로 두지 않으려고 여기 얹었다. 지울 게 없으면 인덱스만 보고 끝난다.
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

  delete from public.page_views  where "createdAt" < now() - interval '180 days';
  delete from public.user_events where "createdAt" < now() - interval '180 days';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',           p.id,
    'email',        a.email,
    'persona',      coalesce(a.email ilike '%@personas.ottcal.com', false),
    'lastSignInAt', a.last_sign_in_at,
    'lastSeenAt',   ls."at",
    'pushCount',    (select count(*) from public.push_subscriptions s where s."userId" = p.id::text),
    'alertCount',   (select count(*) from public.content_alerts c where c."userId" = p.id::text),
    'views30',      (select count(*) from public.page_views v where v."uid" = p.id::text and v."createdAt" >= now() - interval '30 days')
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
-- 탈퇴하면 같이 지운다 — delete_my_account 본문에 세 줄을 끼운다
-- (함수 전문을 다시 적으면 원본과 갈라진다. migration_content_alerts.sql 과 같은 방식)
-- 함수 안 변수 이름이 uid 라 "uid" 컬럼과 부딪힌다 → 변수 대신 auth.uid() 를 쓴다.
-- ============================================================
do $mig$
declare
  src text;
  patched text;
begin
  select prosrc into src from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'delete_my_account';

  if src is null then
    raise notice '[user_insight] delete_my_account 가 없습니다 — migration_delete_account.sql 을 먼저 실행하세요.';
  elsif position('user_events' in src) > 0 then
    raise notice '[user_insight] delete_my_account 는 이미 반영돼 있습니다.';
  else
    patched := regexp_replace(
      src,
      '(delete from public\.bookmarks[^;]*;)',
      '\1' || chr(10)
        || '  delete from public.user_events    e where e."uid"    = auth.uid()::text;' || chr(10)
        || '  delete from public.user_last_seen s where s."userId" = auth.uid()::text;' || chr(10)
        || '  update public.page_views v set "uid" = null where v."uid" = auth.uid()::text;'
    );
    if patched = src then
      raise warning '[user_insight] delete_my_account 본문에서 bookmarks 삭제문을 못 찾았습니다. 수동으로 추가하세요.';
    else
      execute format(
        'create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path = public as %L',
        patched);
      raise notice '[user_insight] delete_my_account 갱신 완료.';
    end if;
  end if;
end
$mig$;

notify pgrst, 'reload schema';

-- ============================================================
-- 적용 확인 (SQL Editor 는 관리자가 아니라서 함수는 '관리자만' 으로 막힌다 — 정상)
--   select count(*) from public.user_events;
--   select position('user_events' in prosrc) > 0 from pg_proc where proname = 'delete_my_account';   -- t
--
-- 롤백
--   drop function if exists public.admin_user_insight(text);
--   drop function if exists public.admin_members_overview(integer);
--   drop function if exists public._real_member_ids();
--   drop table if exists public.user_events;
--   그리고 migration_last_seen.sql 을 다시 실행 (admin_user_list 원복)
-- ============================================================
