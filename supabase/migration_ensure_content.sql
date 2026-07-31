-- ────────────────────────────────────────────────────────────
-- 통합검색 TMDB 폴백: 검색 결과를 누르면 그 작품만 즉시 등록
--   ensure_content(...): 있으면 그 행을 돌려주고, 없으면 만들어서 돌려준다.
--   contents 는 RLS 로 관리자/서비스롤만 쓸 수 있어 SECURITY DEFINER 로 우회하되,
--   아무 행이나 못 만들도록 아래를 강제한다:
--     · id 는 반드시 tmdb-mv-<숫자> / tmdb-dr-<숫자> 형식 (동기화 스크립트와 같은 규칙)
--     · type 은 movie/drama/variety
--     · 포스터는 image.tmdb.org 만
--   유동닉(비로그인)도 검색해서 볼 수 있어야 하므로 anon 에도 실행 권한을 준다.
--   register_watched 와 달리 '본 작품' 링크는 만들지 않는다(검색은 시청 기록이 아니므로).
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
begin
  if p_content_id !~ '^tmdb-(mv|dr)-[0-9]+$' then
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

  insert into public.contents (
    id, type, title, "posterUrl", synopsis, genres, creators,
    platform, "releaseYear", "releaseDate", status, popularity,
    "avgRating", "reviewCount", "createdBy", "createdAt", verified,
    "tmdbId", "mediaType"
  ) values (
    p_content_id, p_type, btrim(p_title), p_poster_url, coalesce(p_synopsis, ''),
    '{}', '{}',
    p_platform, p_release_year, null, null, 0,
    0, 0, coalesce(v_uid, 'guest'), now(), false,
    (regexp_match(p_content_id, '([0-9]+)$'))[1]::int,
    case when p_content_id like 'tmdb-mv-%' then 'movie' else 'tv' end
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
