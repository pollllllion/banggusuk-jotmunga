-- ────────────────────────────────────────────────────────────
-- ensure_content: 드라마 시즌 id(tmdb-dr-<숫자>-s<시즌>) 허용 (2026-09-14)
--   검색 결과에 시즌2+ 가 따로 펼쳐져 나오게 되면서(src/utils/tmdb.ts withSeasons),
--   찜·토론 글쓰기·통합검색에서 시즌을 고르면 이 id 로 행을 만든다.
--   캘린더 동기화(scripts/tmdb-lib.mjs buildContentId)의 시즌 행과 같은 규칙이라 중복이 안 생긴다.
--   바뀐 점:
--     · id 형식: tmdb-mv-<숫자> | tmdb-dr-<숫자> | tmdb-dr-<숫자>-s<숫자>
--     · tmdbId 는 앞쪽 숫자에서 뽑는다 (예전 '([0-9]+)$' 는 시즌 id 에서 시즌 번호를 집는다)
--     · 시즌 행이면 seasonNumber / eventType='season_release' 도 채운다
--   본 작품 등록(register_watched)은 id 형식을 막지 않아 손댈 필요 없다.
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ────────────────────────────────────────────────────────────

create or replace function public.ensure_content(
  p_content_id   text,
  p_type         text,
  p_title        text,
  p_poster_url   text   default null,
  p_release_year int    default null,
  p_synopsis     text   default null,
  p_platform     text   default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     text := auth.uid()::text;
  v_content public.contents;
  v_season  int;
begin
  if p_content_id !~ '^(tmdb-mv-[0-9]+|tmdb-dr-[0-9]+(-s[0-9]+)?)$' then
    raise exception 'TMDB 작품 id 형식이 아닙니다.';
  end if;
  if p_type not in ('movie', 'drama', 'variety') then
    raise exception '지원하지 않는 작품 타입입니다.';
  end if;
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception '제목이 필요합니다.';
  end if;
  if length(btrim(p_title)) > 200 then
    raise exception '제목이 너무 깁니다.';
  end if;
  if p_poster_url is not null and p_poster_url !~ '^https://image\.tmdb\.org/' then
    raise exception '포스터 주소가 올바르지 않습니다.';
  end if;

  select * into v_content from public.contents where id = p_content_id;
  if found then
    return to_jsonb(v_content);
  end if;

  v_season := (regexp_match(p_content_id, '-s([0-9]+)$'))[1]::int;

  insert into public.contents (
    id, type, title, "posterUrl", synopsis, genres, creators,
    platform, "releaseYear", "releaseDate", status, popularity,
    "avgRating", "reviewCount", "createdBy", "createdAt", verified,
    "tmdbId", "mediaType", "seasonNumber", "eventType"
  ) values (
    p_content_id, p_type, btrim(p_title), p_poster_url, coalesce(p_synopsis, ''),
    '{}', '{}',
    p_platform, p_release_year, null, null, 0,
    0, 0, coalesce(v_uid, 'guest'), now(), false,
    (regexp_match(p_content_id, '^tmdb-[a-z]{2}-([0-9]+)'))[1]::int,
    case when p_content_id like 'tmdb-mv-%' then 'movie' else 'tv' end,
    v_season,
    case when v_season is not null then 'season_release' else null end
  )
  -- 동시에 같은 작품을 누른 경우 중복 생성 방지
  on conflict (id) do nothing
  returning * into v_content;

  if v_content.id is null then
    select * into v_content from public.contents where id = p_content_id;
  end if;

  return to_jsonb(v_content);
end;
$$;

grant execute on function public.ensure_content(text, text, text, text, int, text, text) to anon, authenticated;

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
