-- ============================================================
-- [마이그레이션] TMDB 에서 온 작품은 등록되는 순간 인증된다 (2026-09-12)
--
-- 왜:
--   관리자 화면의 '미인증' 목록에 쌓이던 것들이 전부 TMDB 검색으로 담은 작품이었다
--   (크라임씬 제로·감자연구소·마이데몬·해리 포터·미생·나의 해방일지 — 모두 tmdbId 있음).
--   사용자가 '본 작품 등록'에서 TMDB 를 검색해 고른 것이므로 실재가 이미 확인된 작품이다.
--   사람이 한 줄씩 눌러 인증할 이유가 없다 — 누르지 않는 날이 곧 쌓이는 날이다.
--
--   손으로 확인할 값어치가 있는 건 tmdbId 가 없는 수기 등록(웹툰·웹소설)뿐이다.
--   그건 지금처럼 '미인증'으로 남아 관리자 눈에 걸린다.
--
-- ⚠️ camelCase 컬럼은 큰따옴표 필수. Supabase SQL Editor 에서 실행. 멱등.
--    선행: migration_watched_year.sql (register_watched 최신 시그니처)
-- ============================================================

-- ── 이미 쌓인 것 정리 ───────────────────────────────────────
-- id 가 tmdb-xx-숫자 꼴이면 TMDB 에서 온 행이다. tmdbId 가 비어 있으면 id 에서 되찾는다.
update public.contents
   set "verified" = true,
       "tmdbId"   = coalesce("tmdbId", (regexp_match(id, '^tmdb-[a-z]{2}-(\d+)'))[1]::bigint),
       "source"   = coalesce("source", 'tmdb')
 where coalesce("verified", false) = false
   and id ~ '^tmdb-[a-z]{2}-\d+';

-- ── 앞으로 들어올 것 ────────────────────────────────────────
-- register_watched 가 작품 행을 새로 만들 때 TMDB 출처면 인증 표시까지 함께 남긴다.
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
  v_tmdb    boolean := p_content_id ~ '^tmdb-[a-z]{2}-\d+';
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
      "avgRating", "reviewCount", "createdBy", "createdAt",
      -- TMDB 검색에서 고른 작품은 실재가 이미 확인된 것이다. 관리자 대기열에 넣지 않는다.
      -- 수기 등록(tmdbId 없음)만 '미인증'으로 남아 사람 눈에 걸린다.
      "verified", "tmdbId", "source"
    ) values (
      p_content_id, p_type, btrim(p_title), p_poster_url, coalesce(p_synopsis, ''),
      coalesce(p_genres, '{}'), coalesce(p_creators, '{}'),
      p_platform, p_release_year, null, null, 0,
      0, 0, v_uid, now(),
      v_tmdb,
      case when v_tmdb then (regexp_match(p_content_id, '^tmdb-[a-z]{2}-(\d+)'))[1]::bigint else null end,
      case when v_tmdb then 'tmdb' else null end
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

-- ============================================================
-- 적용 확인
--   select count(*) filter (where not coalesce("verified", false)) as 미인증,
--          count(*) filter (where not coalesce("verified", false) and "tmdbId" is not null) as "미인증인데 TMDB"
--     from public.contents;
--   → '미인증인데 TMDB' 가 0 이면 성공. 남은 미인증은 수기 등록뿐이다.
-- ============================================================
