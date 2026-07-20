-- ────────────────────────────────────────────────────────────
-- 내 피드: "내가 본 작품" 등록 기능
--   - watched 테이블 (유저 ↔ 작품 링크, 찜과 별개)
--   - register_watched RPC: 있으면 찾고 없으면 작품 생성 + 본 목록에 추가
--     (RLS로 contents는 관리자/서비스롤만 쓸 수 있으므로 SECURITY DEFINER로 안전하게 우회)
--   - 예능(variety) 타입 허용 (contents.type에 CHECK 제약 있으면 제거)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ────────────────────────────────────────────────────────────

-- 1) watched 테이블 ------------------------------------------------
create table if not exists public.watched (
  "userId"    text        not null,
  "contentId" text        not null,
  "createdAt" timestamptz not null default now(),
  primary key ("userId", "contentId")
);

alter table public.watched enable row level security;

-- 본인 것만 조회/추가/삭제 가능
drop policy if exists watched_select_own on public.watched;
create policy watched_select_own on public.watched
  for select using ("userId" = auth.uid()::text);

drop policy if exists watched_insert_own on public.watched;
create policy watched_insert_own on public.watched
  for insert with check ("userId" = auth.uid()::text);

drop policy if exists watched_delete_own on public.watched;
create policy watched_delete_own on public.watched
  for delete using ("userId" = auth.uid()::text);

-- 2) 예능(variety) 타입 허용 -------------------------------------
--    contents.type 에 movie/drama/webtoon/webnovel 만 허용하는 CHECK 제약이
--    있으면 variety 를 넣을 수 없으므로, type 관련 CHECK 제약을 찾아 제거한다.
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.contents'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%type%';
  if c is not null then
    execute format('alter table public.contents drop constraint %I', c);
    raise notice 'dropped check constraint % on contents.type', c;
  end if;
end$$;

-- 3) register_watched RPC ----------------------------------------
create or replace function public.register_watched(
  p_content_id  text,
  p_type        text,
  p_title       text,
  p_poster_url  text    default null,
  p_platform    text    default null,
  p_release_year int     default null,
  p_synopsis    text    default null,
  p_genres      text[]  default '{}',
  p_creators    text[]  default '{}'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     text := auth.uid()::text;
  v_content public.contents;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception '제목이 필요합니다.';
  end if;

  -- 이미 있는 작품이면 그대로 사용, 없으면 새로 생성
  select * into v_content from public.contents where id = p_content_id;
  if not found then
    insert into public.contents (
      id, type, title, "posterUrl", synopsis, genres, creators,
      platform, "releaseYear", "releaseDate", status, popularity,
      "avgRating", "reviewCount", "createdBy", "createdAt"
    ) values (
      p_content_id, p_type, btrim(p_title), p_poster_url, coalesce(p_synopsis, ''),
      coalesce(p_genres, '{}'), coalesce(p_creators, '{}'),
      p_platform, p_release_year, null, null, 0,
      0, 0, v_uid, now()
    )
    returning * into v_content;
  end if;

  -- 본 목록에 추가 (중복이면 무시)
  insert into public.watched ("userId", "contentId")
  values (v_uid, p_content_id)
  on conflict ("userId", "contentId") do nothing;

  return to_jsonb(v_content);
end;
$$;

grant execute on function public.register_watched(text, text, text, text, text, int, text, text[], text[]) to authenticated;

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
