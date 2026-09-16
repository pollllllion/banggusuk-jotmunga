-- ============================================================
-- [마이그레이션] 직접 등록에 숏폼·유튜브·기타 허용 (2026-09-16)
--
-- 왜:
--   create_manual_content 는 웹툰·웹소설만 받는다. 그런데 TMDB 에 없는 영상물이
--   그 둘만 있는 게 아니다 — 유튜브 웹드라마·숏폼은 TMDB 에 아예 없고
--   (sync:ott 실측: YouTube 를 대상 OTT 에 넣어도 한국 작품이 한 편도 안 잡힌다)
--   그래서 지금은 관리자만 넣을 수 있다. 사람이 "없는 작품 등록"을 눌러도
--   웹툰·웹소설이 아니면 길이 없었다.
--
-- 바뀌는 것은 **타입 검사 한 줄**뿐이다. 나머지(로그인 필수·제목 길이·포스터 검증·
-- 같은 제목이면 기존 행 반환·1시간 20개 제한)는 그대로 둔다.
--
-- ⚠️ camelCase 컬럼은 큰따옴표 필수. Supabase SQL Editor 에서 실행. 멱등.
--    선행: migration_manual_content.sql
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
  -- 영화·드라마·예능은 여기 없다. TMDB 검색으로 들어와야 tmdb-* id 를 받는데,
  -- 손으로 넣으면 uuid 행이 따로 생겨 같은 작품이 두 줄이 된다(dedupe 로 병합하던 그 중복).
  if p_type not in ('webtoon', 'webnovel', 'shortform', 'youtube', 'etc') then
    raise exception '직접 등록할 수 없는 작품 종류입니다.';
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

-- ============================================================
-- 적용 확인
--   select pg_get_functiondef(oid) like '%shortform%' as "숏폼 허용됨"
--     from pg_proc where proname = 'create_manual_content';
--   → t 면 성공
-- ============================================================
