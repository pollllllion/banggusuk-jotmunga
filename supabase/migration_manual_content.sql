-- ============================================================
-- [기능] 2026-08-27 — 웹툰·웹소설 직접 등록 (검색 밖에서 작품 만들기)
--
-- 왜 새 함수가 필요한가:
--   토론 글쓰기에서 웹툰·웹소설로 글을 쓰려면 그 작품이 contents 에 있어야 하는데,
--   기존 두 경로가 다 막혀 있다.
--     · ensure_content       → id 가 `tmdb-(mv|dr)-숫자` 형식이어야 하고
--                              type 도 movie/drama/variety 만 허용한다.
--     · register_watched     → 만들 수는 있지만 '본 작품' 링크까지 같이 만든다.
--                              토론글을 쓴다고 시청 기록이 생기면 안 된다.
--   그래서 "작품만 만드는" 경로를 따로 판다. contents 는 RLS 로 관리자만 쓸 수 있으므로
--   security definer 로 우회하되, 아래를 강제한다.
--
-- 강제하는 것:
--   · type 은 webtoon/webnovel 만 (영화·드라마·예능은 TMDB 검색으로만 — 중복 행 방지)
--   · 로그인(고정닉) 필수 — 익명 허용 시 createdBy 가 전부 'guest' 로 뭉뚱그려져
--     상한이 무의미해지고 한 명이 막히면 전원이 막힌다
--   · 같은 타입 + 같은 제목(공백·문장부호 무시)이 이미 있으면 새로 만들지 않고 그 행을 반환
--   · 포스터는 https 또는 업로드 data URL 만, 400KB 상한
--   · 한 사람이 1시간에 20개까지
--
-- 멱등. Supabase SQL Editor 에 통째로 붙여 실행.
-- ============================================================

create or replace function public.create_manual_content(
  p_type       text,
  p_title      text,
  p_platform   text default null,
  p_poster_url text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    text := auth.uid()::text;
  v_title  text := btrim(coalesce(p_title, ''));
  v_norm   text;
  v_recent int;
  v_row    public.contents;
begin
  if v_uid is null then
    raise exception '작품 직접 등록은 로그인(고정닉) 후 이용할 수 있습니다.';
  end if;
  if p_type not in ('webtoon', 'webnovel') then
    raise exception '직접 등록은 웹툰·웹소설만 가능합니다.';
  end if;
  if length(v_title) = 0 then
    raise exception '제목이 필요합니다.';
  end if;
  if length(v_title) > 200 then
    raise exception '제목이 너무 깁니다.';
  end if;

  -- 포스터: 업로드는 base64 data URL 로 들어온다(PosterUploader). 직접 입력은 https 만.
  -- [:alnum:] 은 로케일을 타서 한글이 빠질 수 있으므로, 지울 것(공백·문장부호)을 지정한다.
  if coalesce(p_poster_url, '') <> '' then
    if p_poster_url !~ '^(https://|data:image/)' then
      raise exception '포스터 주소가 올바르지 않습니다.';
    end if;
    if length(p_poster_url) > 400000 then
      raise exception '포스터 이미지가 너무 큽니다. (400KB 이하)';
    end if;
  end if;

  v_norm := regexp_replace(lower(v_title), '[[:space:][:punct:]]', '', 'g');

  -- 이미 있는 같은 작품이면 그 행을 그대로 준다 (중복 행 방지 — dedupe 로 병합하던 그 중복)
  select * into v_row
    from public.contents
   where type = p_type
     and id not like 'tmdb-%'
     and regexp_replace(lower(btrim(title)), '[[:space:][:punct:]]', '', 'g') = v_norm
   limit 1;
  if found then
    return to_jsonb(v_row);
  end if;

  select count(*) into v_recent
    from public.contents
   where "createdBy" = v_uid
     and "createdAt" > now() - interval '1 hour';
  if v_recent >= 20 then
    raise exception '작품 등록이 너무 많습니다. 잠시 후 다시 시도해주세요.' using errcode = '54000';
  end if;

  insert into public.contents (
    id, type, title, "posterUrl", synopsis, genres, creators,
    platform, "releaseYear", "releaseDate", status, popularity,
    "avgRating", "reviewCount", "createdBy", "createdAt", verified
  ) values (
    replace(gen_random_uuid()::text, '-', ''),
    p_type, v_title, nullif(coalesce(p_poster_url, ''), ''), '', '{}', '{}',
    nullif(btrim(coalesce(p_platform, '')), ''), null, null, null, 0,
    0, 0, v_uid, now(), false
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.create_manual_content(text, text, text, text) to authenticated;

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
