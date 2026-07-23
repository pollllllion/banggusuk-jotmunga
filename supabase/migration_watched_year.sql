-- ────────────────────────────────────────────────────────────
-- 내 피드: "내가 본 연도"(실제 시청 연도) 추가
--   - watched.watchedYear 컬럼 (nullable int) — 사용자가 그 작품을 본 연도
--   - watched UPDATE 정책 (본인 행만) — 시청 연도 수정용
--   - register_watched RPC 에 p_watched_year 파라미터 추가
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- 선행: migration_watched.sql (watched 테이블/register_watched 존재해야 함)
-- ────────────────────────────────────────────────────────────

-- 1) 컬럼 추가 -----------------------------------------------------
alter table public.watched
  add column if not exists "watchedYear" int;

-- 2) 본인 행만 수정 가능 (시청 연도 편집) --------------------------
drop policy if exists watched_update_own on public.watched;
create policy watched_update_own on public.watched
  for update using ("userId" = auth.uid()::text)
  with check ("userId" = auth.uid()::text);

-- 3) register_watched RPC 재정의 (p_watched_year 추가) -------------
--    파라미터 목록이 바뀌면 새 오버로드가 되어 PostgREST 호출이 모호해질 수 있으므로
--    기존 시그니처를 명시적으로 drop 후 재생성한다.
drop function if exists public.register_watched(text, text, text, text, text, int, text, text[], text[]);

create or replace function public.register_watched(
  p_content_id   text,
  p_type         text,
  p_title        text,
  p_poster_url   text    default null,
  p_platform     text    default null,
  p_release_year int     default null,
  p_synopsis     text    default null,
  p_genres       text[]  default '{}',
  p_creators     text[]  default '{}',
  p_watched_year int     default null
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

  -- 본 목록에 추가 (중복이면 시청 연도만 갱신)
  insert into public.watched ("userId", "contentId", "watchedYear")
  values (v_uid, p_content_id, p_watched_year)
  on conflict ("userId", "contentId")
    do update set "watchedYear" = coalesce(excluded."watchedYear", public.watched."watchedYear");

  return to_jsonb(v_content);
end;
$$;

grant execute on function public.register_watched(text, text, text, text, text, int, text, text[], text[], int) to authenticated;

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
