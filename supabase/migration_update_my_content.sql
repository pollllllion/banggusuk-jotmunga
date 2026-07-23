-- ────────────────────────────────────────────────────────────
-- 내 피드: 내가 등록한 작품 정보 수정 (포스터 잘못 올린 것 고치기 등)
--   - update_my_content RPC: createdBy = auth.uid() 인 작품만 수정 허용
--     (contents 는 RLS로 관리자만 쓸 수 있으므로 SECURITY DEFINER 로 본인 작품만 안전하게 우회)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ────────────────────────────────────────────────────────────

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

  -- 자동 수집(TMDB) 공용 작품은 수정 불가 (모두에게 보이는 공용 데이터 보호)
  if p_content_id like 'tmdb-%' then
    raise exception '자동 수집(TMDB) 작품은 수정할 수 없어요.';
  end if;

  select * into v_content from public.contents where id = p_content_id;
  if not found then
    raise exception '작품을 찾을 수 없습니다.';
  end if;

  -- 본인이 등록(생성)한 작품만 수정 가능
  if v_content."createdBy" is distinct from v_uid then
    raise exception '내가 등록한 작품만 수정할 수 있어요.';
  end if;

  update public.contents set
    title         = coalesce(nullif(btrim(p_title), ''), title),  -- 제목은 비우기 금지(빈값이면 기존 유지)
    "posterUrl"   = nullif(btrim(p_poster_url), ''),               -- 빈값이면 포스터 제거(null)
    platform      = nullif(btrim(p_platform), ''),
    "releaseYear" = p_release_year
  where id = p_content_id
  returning * into v_content;

  return to_jsonb(v_content);
end;
$$;

grant execute on function public.update_my_content(text, text, text, text, int) to authenticated;

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
