-- ============================================================
-- 나만의 캘린더 — 시청 기록(일기) (2026-09-17)
-- ============================================================
-- 내 피드 '찜한 작품' 아래의 달력. 언제·어디서·누구랑·어디까지 봤는지와 메모를 남긴다.
--
-- watched(본 작품)와 따로 두는 이유: watched 는 (사람, 작품) 한 줄이라 다시 본 날을
-- 담을 수 없고, 읽기가 전체 공개다. 기록은 같은 작품을 여러 번 쌓고, 한 줄마다 공개를 정한다.
-- 기록을 남기면 앱이 본 작품에도 걸어 준다(없을 때만).
--
-- 추가형이다 — 배포보다 먼저 실행할 것.
-- 멱등이다. 여러 번 실행해도 안전. Supabase SQL Editor 에 통째로 붙여 실행.
-- 실행 후: npm run migrate:mark migration_watch_logs.sql
-- ============================================================

create table if not exists public.watch_logs (
  id            text        primary key,
  -- 탈퇴(delete_my_account)가 profiles 행을 지우면 기록도 같이 지워진다
  "userId"      text        not null references public.profiles(id) on delete cascade,
  "contentId"   text        not null,
  "watchedOn"   date        not null,
  place         text        not null default '',
  companions    text        not null default '',
  -- 어디까지 봤는지 (예: 3~5화, 끝까지) — 자유 입력
  progress      text        not null default '',
  memo          text        not null default '',
  "isPublic"    boolean     not null default false,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);

-- 길이 상한 — 한 사람이 행 하나에 수 MB 를 밀어 넣지 못하게
alter table public.watch_logs drop constraint if exists watch_logs_len;
alter table public.watch_logs add constraint watch_logs_len check (
  char_length(place) <= 60 and char_length(companions) <= 60
  and char_length(progress) <= 40 and char_length(memo) <= 3000
);

create index if not exists watch_logs_user_day_idx
  on public.watch_logs ("userId", "watchedOn");

-- ── RLS ─────────────────────────────────────────────────────
-- 읽기: 내 것 전부 + 남의 것은 공개로 둔 줄만. 쓰기: 본인만.
alter table public.watch_logs enable row level security;

drop policy if exists watch_logs_select on public.watch_logs;
drop policy if exists watch_logs_insert on public.watch_logs;
drop policy if exists watch_logs_update on public.watch_logs;
drop policy if exists watch_logs_delete on public.watch_logs;

create policy watch_logs_select on public.watch_logs
  for select using ("userId" = auth.uid()::text or "isPublic");
create policy watch_logs_insert on public.watch_logs
  for insert with check ("userId" = auth.uid()::text);
create policy watch_logs_update on public.watch_logs
  for update using ("userId" = auth.uid()::text) with check ("userId" = auth.uid()::text);
create policy watch_logs_delete on public.watch_logs
  for delete using ("userId" = auth.uid()::text);

-- ── 확인 ────────────────────────────────────────────────────
-- select policyname, cmd from pg_policies where tablename = 'watch_logs' order by policyname;
