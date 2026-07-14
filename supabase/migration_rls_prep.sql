-- ============================================================
-- [마이그레이션] RLS 사전작업: 조회수 RPC + 평점 집계 트리거 (2026-07)
--
-- RLS를 켜면 "남의 글 UPDATE" 가 막히므로, 아래 두 가지를 서버로 옮깁니다.
--  1) 조회수 증가: 아무나 남의 리뷰 조회수를 올릴 수 있어야 함 → SECURITY DEFINER RPC
--  2) 평점 집계: 리뷰가 바뀌면 contents.avgRating/reviewCount 갱신인데,
--     contents는 관리자만 쓰게 잠글 것이므로 클라이언트가 못 씀 → 트리거로 처리
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- ============================================================

-- 1) 리뷰 조회수 +1
create or replace function public.increment_review_views(p_review_id text)
returns void language sql security definer set search_path = public as $$
  update public.reviews set views = views + 1 where id = p_review_id;
$$;
grant execute on function public.increment_review_views(text) to anon, authenticated;

-- 2) 리뷰 변경 시 contents 평점/리뷰수 자동 재집계
create or replace function public.recompute_content_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare cid text;
begin
  cid := coalesce(new."contentId", old."contentId");
  update public.contents c set
    "avgRating"   = coalesce((select round(avg(rating)::numeric, 1) from public.reviews where "contentId" = cid), 0),
    "reviewCount" = (select count(*) from public.reviews where "contentId" = cid)
  where c.id = cid;
  return null;
end; $$;

drop trigger if exists trg_recompute_rating on public.reviews;
create trigger trg_recompute_rating
after insert or update or delete on public.reviews
for each row execute function public.recompute_content_rating();
