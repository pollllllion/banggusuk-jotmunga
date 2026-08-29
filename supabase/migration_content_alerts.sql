-- ============================================================
-- [기능] 2026-08-29 — 공개알림을 찜에서 떼어낸다
--
-- 왜 나누나:
--   지금은 발송 스크립트가 bookmarks 를 보고 푸시를 쏜다.
--   그래서 "나중에 볼 것 저장"과 "공개일에 알려줘"가 한 버튼에 묶여 있고,
--   작품 상세 버튼이 '찜 · 공개알림' 이라 알림까지 신청된 것처럼 읽힌다.
--   실제로는 설정에서 브라우저 푸시를 따로 켜야 하는데 그 단계가 안 보인다.
--   → 찜(bookmarks)은 저장 전용으로 두고, 알림 대상은 이 테이블이 정한다.
--
-- bookmarks 와 모양이 같은 이유:
--   같은 복합키(userId, contentId), 같은 RLS(본인 것만).
--   cache.ts 의 pkCols·conflictCols·persist 분기가 bookmarks 를 그대로 따라가므로
--   구조를 어긋나게 두면 그쪽에 예외를 하나 더 만들어야 한다.
--
-- 기존 찜은 알림으로 옮기지 않는다 — 켠 적 없는 알림이 켜져 있으면 안 된다.
-- 다만 '공개 예정작을 찜해 둔 것'은 알림 의도로 누른 것이 맞으므로 그것만 승계한다.
-- (아래 마지막 블록. 한 번만 의미가 있고, 두 번 돌려도 중복은 안 생긴다)
--
-- 멱등. Supabase SQL Editor 에 통째로 붙여 실행.
-- ⚠️ camelCase 컬럼은 큰따옴표 필수.
-- ============================================================

create table if not exists public.content_alerts (
  "userId"    text not null,
  "contentId" text not null,
  "createdAt" timestamptz not null default now(),
  primary key ("userId", "contentId")
);

create index if not exists idx_content_alerts_content on public.content_alerts("contentId");

-- ── RLS: 본인 것만 (계정 전용) ──────────────────────────────
-- 발송 스크립트는 서비스 키라 RLS 를 우회한다.
alter table public.content_alerts enable row level security;
drop policy if exists content_alerts_select on public.content_alerts;
drop policy if exists content_alerts_insert on public.content_alerts;
drop policy if exists content_alerts_delete on public.content_alerts;
create policy content_alerts_select on public.content_alerts for select using ("userId" = auth.uid()::text);
create policy content_alerts_insert on public.content_alerts for insert with check ("userId" = auth.uid()::text);
create policy content_alerts_delete on public.content_alerts for delete using ("userId" = auth.uid()::text);

-- ── 계정 삭제 시 같이 지운다 ────────────────────────────────
-- delete_my_account 가 훑는 목록에 이 테이블이 없으면 탈퇴 후에도 알림 행이 남는다.
-- 함수 전문을 여기 다시 적으면 원본(migration_delete_account.sql)과 갈라지므로,
-- 이미 DB 에 있는 본문에 한 줄만 끼워 넣는다. 못 끼웠으면 조용히 넘어가지 말고 알린다.
do $mig$
declare
  src text;
  patched text;
begin
  select prosrc into src from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'delete_my_account';

  if src is null then
    raise notice '[content_alerts] delete_my_account 가 없습니다 — migration_delete_account.sql 을 먼저 실행하세요.';
  elsif position('content_alerts' in src) > 0 then
    raise notice '[content_alerts] delete_my_account 는 이미 반영돼 있습니다.';
  else
    patched := regexp_replace(
      src,
      '(delete from public\.bookmarks[^;]*;)',
      '\1' || chr(10) || '  delete from public.content_alerts where "userId"   = uid;'
    );
    if patched = src then
      raise warning '[content_alerts] delete_my_account 본문에서 bookmarks 삭제문을 못 찾았습니다. 수동으로 한 줄 추가하세요: delete from public.content_alerts where "userId" = uid;';
    else
      execute format(
        'create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path = public as %L',
        patched);
      raise notice '[content_alerts] delete_my_account 갱신 완료.';
    end if;
  end if;
end
$mig$;

-- ── 공개 예정작 찜 → 알림 승계 (1회성, 재실행 안전) ─────────
insert into public.content_alerts ("userId", "contentId", "createdAt")
select b."userId", b."contentId", b."createdAt"
  from public.bookmarks b
  join public.contents c on c.id = b."contentId"
 where coalesce(
         case when c."manualOverride" then c."manualReleaseDate" else null end,
         c."releaseDate"
       ) >= (now() at time zone 'Asia/Seoul')::date
on conflict do nothing;

-- ============================================================
-- 적용 후 확인
--   select count(*) from public.content_alerts;
--   select relname, relrowsecurity from pg_class
--    where relnamespace = 'public'::regnamespace and relname = 'content_alerts';   -- t 여야 한다
-- ============================================================
