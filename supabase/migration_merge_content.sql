-- ────────────────────────────────────────────────────────────
-- 중복 작품 병합 (관리자 전용)
--   merge_content(p_from, p_into): p_from 을 p_into 로 합치고 p_from 삭제.
--   참조 이동: watched · bookmarks · reviews · discussions 의 contentId 를 p_into 로.
--   watched/bookmarks 는 PK(userId,contentId)라 대상에 이미 있으면 원본 링크 제거 후 이전.
--   reviews 는 트리거로 대상 평점 자동 재집계됨(추가로 한 번 더 보정).
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.  선행: is_admin() (migration_rls_enable.sql)
-- ────────────────────────────────────────────────────────────

create or replace function public.merge_content(p_from text, p_into text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 작품을 병합할 수 있어요.';
  end if;
  if p_from is null or p_into is null or p_from = p_into then
    raise exception '병합 대상이 올바르지 않습니다.';
  end if;
  if not exists (select 1 from public.contents where id = p_from) then
    raise exception '합칠(원본) 작품을 찾을 수 없습니다.';
  end if;
  if not exists (select 1 from public.contents where id = p_into) then
    raise exception '남길(대상) 작품을 찾을 수 없습니다.';
  end if;

  -- watched: 대상에 이미 있는 유저는 원본 링크 삭제 후 나머지 이전
  delete from public.watched w
   where w."contentId" = p_from
     and exists (select 1 from public.watched w2
                  where w2."userId" = w."userId" and w2."contentId" = p_into);
  update public.watched set "contentId" = p_into where "contentId" = p_from;

  -- bookmarks: 동일 처리
  delete from public.bookmarks b
   where b."contentId" = p_from
     and exists (select 1 from public.bookmarks b2
                  where b2."userId" = b."userId" and b2."contentId" = p_into);
  update public.bookmarks set "contentId" = p_into where "contentId" = p_from;

  -- reviews / discussions: id 가 PK라 충돌 없음
  update public.reviews     set "contentId" = p_into where "contentId" = p_from;
  update public.discussions set "contentId" = p_into where "contentId" = p_from;

  -- 원본 작품 삭제
  delete from public.contents where id = p_from;

  -- 대상 평점/리뷰수 보정 재집계
  update public.contents c set
    "avgRating"   = coalesce((select round(avg(rating)::numeric, 1) from public.reviews where "contentId" = p_into), 0),
    "reviewCount" = (select count(*) from public.reviews where "contentId" = p_into)
  where c.id = p_into;
end;
$$;

grant execute on function public.merge_content(text, text) to authenticated;

notify pgrst, 'reload schema';
