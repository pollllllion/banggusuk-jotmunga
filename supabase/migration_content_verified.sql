-- ────────────────────────────────────────────────────────────
-- 작품 "공식 인증" 마크
--   - contents.verified (bool) — 관리자가 인증한 작품
--   - 백필: TMDB 작품 + 관리자가 만든 작품은 자동 인증(true)
--   - update_my_content 갱신: 인증된 작품은 사용자가 수정 못 하게(관리자 전용)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- 선행: migration_update_my_content.sql
-- ────────────────────────────────────────────────────────────

-- 1) 컬럼 추가 -----------------------------------------------------
alter table public.contents
  add column if not exists "verified" boolean not null default false;

-- 2) 백필: 기존 작품 중 신뢰 가능한 것 자동 인증 ------------------
--    TMDB 자동수집 작품(tmdb-*) + 관리자(profiles.role='admin')가 등록한 작품
update public.contents
   set "verified" = true
 where "verified" = false
   and (
     id like 'tmdb-%'
     or "createdBy" in (select id from public.profiles where role = 'admin')
   );

-- 3) update_my_content 갱신: 인증된 작품은 사용자 수정 차단 --------
create or replace function public.update_my_content(
  p_content_id   text,
  p_title        text    default null,
  p_poster_url   text    default null,
  p_platform     text    default null,
  p_release_year int     default null
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

  -- 자동 수집(TMDB) 공용 작품은 수정 불가
  if p_content_id like 'tmdb-%' then
    raise exception '자동 수집(TMDB) 작품은 수정할 수 없어요.';
  end if;

  select * into v_content from public.contents where id = p_content_id;
  if not found then
    raise exception '작품을 찾을 수 없습니다.';
  end if;

  -- 본인이 등록한 작품만 수정 가능
  if v_content."createdBy" is distinct from v_uid then
    raise exception '내가 등록한 작품만 수정할 수 있어요.';
  end if;

  -- 관리자가 인증한 작품은 사용자가 수정 불가 (인증 후 내용 바꿔치기 방지)
  if v_content."verified" then
    raise exception '인증된 작품은 관리자만 수정할 수 있어요.';
  end if;

  update public.contents set
    title         = coalesce(nullif(btrim(p_title), ''), title),
    "posterUrl"   = nullif(btrim(p_poster_url), ''),
    platform      = nullif(btrim(p_platform), ''),
    "releaseYear" = p_release_year
  where id = p_content_id
  returning * into v_content;

  return to_jsonb(v_content);
end;
$$;

grant execute on function public.update_my_content(text, text, text, text, int) to authenticated;

notify pgrst, 'reload schema';
