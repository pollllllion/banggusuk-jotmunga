-- ============================================================
-- 큐레이션(기획 글) 테이블
-- ============================================================
-- 왜 만드나: 작품 페이지 2,100여 개는 TMDB 메타데이터라 검색엔진·애드센스 눈에
-- "복제 콘텐츠"다. 캘린더 DB 를 재료로 사람이 고르고 코멘트를 단 글이 있어야
-- 이 사이트만의 콘텐츠가 생긴다. (2026-08-31)
--
-- id 는 슬러그를 그대로 쓴다 — /curation/{id} 가 곧 URL 이고 프리렌더 경로다.
-- 프리렌더의 SAFE_ID 규칙 때문에 [A-Za-z0-9._~-] 만 허용한다.
--
-- 멱등이다. 여러 번 실행해도 안전. Supabase SQL Editor 에 통째로 붙여 실행.
-- 선행: is_admin() (migration_rls_enable.sql)
-- ============================================================

create table if not exists public.curations (
  id            text primary key,
  title         text        not null,
  summary       text        not null default '',
  body          text        not null default '',
  -- [{ contentId, note }] — 작품별 한 줄 코멘트. 이게 비면 발행을 막는다.
  items         jsonb       not null default '[]'::jsonb,
  "coverUrl"    text,
  status        text        not null default 'draft',
  "publishedAt" timestamptz,
  "authorId"    text,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);

-- 슬러그 형식 강제 — 프리렌더가 파일 경로로 쓰기 때문에 경로 탈출 문자를 막아야 한다
alter table public.curations drop constraint if exists curations_id_slug;
alter table public.curations add constraint curations_id_slug
  check (id ~ '^[A-Za-z0-9._~-]+$');

alter table public.curations drop constraint if exists curations_status_chk;
alter table public.curations add constraint curations_status_chk
  check (status in ('draft', 'published'));

create index if not exists curations_published_idx
  on public.curations (status, "publishedAt" desc);

-- ── RLS ─────────────────────────────────────────────────────
-- 읽기: 발행된 글만 누구나. 초안은 관리자만.
-- 쓰기: 관리자만.
-- ⚠️ setup.sql 의 public_all(using true) 패턴을 절대 쓰지 말 것 —
--    RLS 정책은 OR 로 합쳐져서 그거 하나면 아래 정책이 전부 무력화된다.
alter table public.curations enable row level security;

drop policy if exists curations_select on public.curations;
drop policy if exists curations_insert on public.curations;
drop policy if exists curations_update on public.curations;
drop policy if exists curations_delete on public.curations;

create policy curations_select on public.curations
  for select using (status = 'published' or public.is_admin());
create policy curations_insert on public.curations
  for insert with check (public.is_admin());
create policy curations_update on public.curations
  for update using (public.is_admin()) with check (public.is_admin());
create policy curations_delete on public.curations
  for delete using (public.is_admin());

-- ── 확인 ────────────────────────────────────────────────────
-- 아래 두 줄을 같이 실행해 정책이 4개 붙었는지 눈으로 확인할 것.
-- select policyname, cmd from pg_policies where tablename = 'curations' order by policyname;
-- select relrowsecurity from pg_class where relname = 'curations';
