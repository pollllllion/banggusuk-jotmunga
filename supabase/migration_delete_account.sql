-- ────────────────────────────────────────────────────────────
-- 회원 탈퇴 (개인정보 처리방침 3항과 동일하게 동작시키기)
--   - 작성 글·댓글은 남기되 작성자 표시를 지운다 (authorId/guestName/guestPwHash = null → 화면엔 '탈퇴한 사용자')
--   - 추천 기록(likes/dislikes 배열)에서 내 id 제거
--   - 찜·본작품·차단·알림 등 개인 데이터는 삭제
--   - 프로필 행과 auth 계정 자체를 삭제
--
-- 클라이언트는 anon 키로 auth.users 를 지울 수 없으므로 SECURITY DEFINER RPC 로 처리한다.
-- 본인 계정만 지운다 (auth.uid() 로만 동작 · 인자 없음).
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ────────────────────────────────────────────────────────────

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text := auth.uid()::text;
begin
  if uid is null then
    raise exception '로그인 상태가 아닙니다.';
  end if;

  -- 1) 게시물 익명화 (본문은 대화 맥락 보존을 위해 남긴다)
  update public.discussions
     set "authorId" = null, "guestName" = null, "guestPwHash" = null
   where "authorId" = uid;

  update public.discussion_comments
     set "authorId" = null, "guestName" = null, "guestPwHash" = null
   where "authorId" = uid;

  -- 레거시 리뷰 테이블 (토론글로 통합됐지만 롤백 대비로 남아 있음)
  update public.reviews
     set "authorId" = null, "guestName" = null, "guestPwHash" = null
   where "authorId" = uid;

  update public.comments
     set "authorId" = null, "guestName" = null, "guestPwHash" = null
   where "authorId" = uid;

  -- 2) 추천/비추천 기록에서 내 id 제거
  update public.discussions         set likes    = array_remove(likes, uid)    where uid = any(likes);
  update public.discussion_comments set likes    = array_remove(likes, uid)    where uid = any(likes);
  update public.comments            set likes    = array_remove(likes, uid)    where uid = any(likes);
  update public.reviews             set likes    = array_remove(likes, uid)    where uid = any(likes);
  update public.reviews             set dislikes = array_remove(dislikes, uid) where uid = any(dislikes);

  -- 3) 개인 데이터 삭제
  delete from public.bookmarks     where "userId"    = uid;
  delete from public.content_alerts where "userId"   = uid;
  delete from public.watched       where "userId"    = uid;
  delete from public.notifications where "userId"    = uid;
  delete from public.blocks        where "blockerId" = uid or "blockedId" = uid;

  -- 신고 이력은 처리 기록으로 남기되 신고자 표시는 지운다
  update public.reports       set "reporterId" = null where "reporterId" = uid;
  -- 내가 등록한 작품·공지는 남기고 등록자 표시만 지운다
  update public.contents      set "createdBy"  = null where "createdBy"  = uid;
  update public.announcements set "authorId"   = null where "authorId"   = uid;

  -- 4) 프로필 + 계정 삭제
  delete from public.profiles where id = uid;
  delete from auth.users      where id = uid::uuid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 별점이 달린 토론글이 익명화돼도 평점 자체는 유지된다(작성자만 지움).
-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
