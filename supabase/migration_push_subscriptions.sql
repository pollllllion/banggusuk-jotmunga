-- ============================================================
-- [웹푸시] 2026-08-17 — 찜한 작품 공개일 알림
--
-- 브라우저가 발급한 푸시 구독을 저장한다. 구독 하나 = 기기·브라우저 하나라
-- 한 사람이 여러 행을 가질 수 있다(폰 + 노트북).
--
-- endpoint 가 곧 고유 식별자다(푸시 서비스가 준 URL). 재구독하면 같은 값이
-- 다시 오므로 PK 로 두고 upsert 한다.
--
-- 멱등. Supabase SQL Editor 에 통째로 붙여 실행.
-- ⚠️ camelCase 컬럼은 큰따옴표 필수.
-- ============================================================

create table if not exists public.push_subscriptions (
  "endpoint"   text primary key,
  "userId"     text not null,
  "p256dh"     text not null,
  "auth"       text not null,
  "userAgent"  text,
  "createdAt"  timestamptz not null default now(),
  "lastOkAt"   timestamptz,
  "failCount"  integer not null default 0
);

create index if not exists idx_push_subs_user on public.push_subscriptions("userId");

-- 같은 작품 공개 알림을 두 번 보내지 않기 위한 발송 이력.
-- 발송 스크립트(서비스 키)만 쓰고, 클라이언트는 건드리지 않는다.
create table if not exists public.push_sent (
  "userId"     text not null,
  "contentId"  text not null,
  "kind"       text not null default 'release',
  "sentAt"     timestamptz not null default now(),
  primary key ("userId", "contentId", "kind")
);

-- ── RLS: 본인 구독만 ────────────────────────────────────────
-- 서비스 키(발송 스크립트)는 RLS 를 우회하므로 별도 정책이 필요 없다.
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subs_select on public.push_subscriptions;
drop policy if exists push_subs_insert on public.push_subscriptions;
drop policy if exists push_subs_update on public.push_subscriptions;
drop policy if exists push_subs_delete on public.push_subscriptions;
create policy push_subs_select on public.push_subscriptions for select using ("userId" = auth.uid()::text);
create policy push_subs_insert on public.push_subscriptions for insert with check ("userId" = auth.uid()::text);
create policy push_subs_update on public.push_subscriptions for update
  using ("userId" = auth.uid()::text) with check ("userId" = auth.uid()::text);
create policy push_subs_delete on public.push_subscriptions for delete using ("userId" = auth.uid()::text);

-- push_sent 는 클라이언트가 볼 일이 없다. RLS 만 켜고 정책은 두지 않는다
-- (정책이 없으면 anon·authenticated 는 아무것도 못 읽고 못 쓴다).
alter table public.push_sent enable row level security;
drop policy if exists push_sent_all on public.push_sent;

-- ============================================================
-- 적용 후 확인 (둘 다 t 여야 한다)
--   select relname, relrowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace
--     and relname in ('push_subscriptions','push_sent');
-- ============================================================
