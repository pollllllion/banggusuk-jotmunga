-- ============================================================
-- [마이그레이션] 좋아요/추천 RPC (RLS 대비) (2026-07)
--
-- 좋아요는 "남의 글 행"의 배열을 바꾸는 작업이라, RLS에서 "본인 글만 수정"을
-- 걸면 막힙니다. 그래서 서버 함수(SECURITY DEFINER)로 auth.uid()를 검증하고
-- 해당 글의 likes/dislikes 배열만 안전하게 토글합니다.
-- → RLS는 reviews/discussions/comments 직접 UPDATE를 본인 글로 제한하고,
--   좋아요는 이 함수로만 처리 (추천 = 로그인 사용자만).
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- ============================================================

-- 리뷰 공감/비공감 (value: 1=공감, -1=비공감)
create or replace function public.toggle_review_vote(p_review_id text, p_value int)
returns void language plpgsql security definer set search_path = public as $$
declare uid text := auth.uid()::text;
begin
  if uid is null then raise exception 'login required'; end if;
  if p_value = 1 then
    update public.reviews set
      dislikes = array_remove(dislikes, uid),
      likes = case when uid = any(likes) then array_remove(likes, uid) else array_append(likes, uid) end
    where id = p_review_id;
  elsif p_value = -1 then
    update public.reviews set
      likes = array_remove(likes, uid),
      dislikes = case when uid = any(dislikes) then array_remove(dislikes, uid) else array_append(dislikes, uid) end
    where id = p_review_id;
  end if;
end; $$;

-- 수다방 공감
create or replace function public.toggle_discussion_like(p_discussion_id text)
returns void language plpgsql security definer set search_path = public as $$
declare uid text := auth.uid()::text;
begin
  if uid is null then raise exception 'login required'; end if;
  update public.discussions set
    likes = case when uid = any(likes) then array_remove(likes, uid) else array_append(likes, uid) end
  where id = p_discussion_id;
end; $$;

-- 댓글 공감
create or replace function public.toggle_comment_like(p_comment_id text)
returns void language plpgsql security definer set search_path = public as $$
declare uid text := auth.uid()::text;
begin
  if uid is null then raise exception 'login required'; end if;
  update public.comments set
    likes = case when uid = any(likes) then array_remove(likes, uid) else array_append(likes, uid) end
  where id = p_comment_id;
end; $$;

grant execute on function public.toggle_review_vote(text, int) to anon, authenticated;
grant execute on function public.toggle_discussion_like(text) to anon, authenticated;
grant execute on function public.toggle_comment_like(text) to anon, authenticated;
