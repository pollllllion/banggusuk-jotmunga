-- ────────────────────────────────────────────────────────────
-- 리뷰 → 토론글 통합 + 토론글 별점/스포일러
--   - discussions 에 rating(int, nullable) / spoiler(bool) 추가
--   - 기존 reviews 를 discussions 로 이관 (별점·본문·추천·작성자 유지)
--   - 기존 review 댓글(comments) 을 discussion_comments 로 이관 (대댓글은 평탄화)
--   - contents.avgRating / reviewCount 를 '별점 단 토론글' 기준으로 재집계
--   - 별점 변경 시 평점 자동 갱신 트리거(선택)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- reviews 테이블은 롤백 대비 남겨둔다 (검증 후 별도로 drop 가능).
-- ────────────────────────────────────────────────────────────

-- 1) 컬럼 추가 --------------------------------------------------
alter table public.discussions
  add column if not exists rating  int,
  add column if not exists spoiler boolean not null default false;

-- 2) reviews → discussions 이관 (id 유지 → 댓글 remap 에 사용) ---
insert into public.discussions
  (id, "contentId", "authorId", "guestName", "guestPwHash", title, body, likes, rating, spoiler, "createdAt")
select
  id, "contentId", "authorId", "guestName", "guestPwHash",
  coalesce(title, ''), body, coalesce(likes, '{}'), rating, coalesce(spoiler, false), "createdAt"
from public.reviews
on conflict (id) do nothing;

-- 3) review 댓글 → discussion_comments 이관 (parentId 는 평탄화) --
insert into public.discussion_comments
  (id, "discussionId", "authorId", "guestName", "guestPwHash", body, likes, "createdAt")
select
  id, "reviewId", "authorId", "guestName", "guestPwHash", content, coalesce(likes, '{}'), "createdAt"
from public.comments
on conflict (id) do nothing;

-- 4) 작품 평점 재집계 (별점 단 토론글 기준) ---------------------
update public.contents c set
  "avgRating" = coalesce(
    (select round(avg(d.rating)::numeric, 1) from public.discussions d
     where d."contentId" = c.id and d.rating is not null), 0),
  "reviewCount" = coalesce(
    (select count(*) from public.discussions d
     where d."contentId" = c.id and d.rating is not null), 0);

-- 5) (선택) 별점 변경 시 작품 평점 자동 갱신 트리거 --------------
--    클라이언트도 즉시 재집계하지만, 서버 정합성을 위해 권장.
create or replace function public.recompute_content_rating(p_content_id text)
returns void language sql security definer set search_path = public as $$
  update public.contents c set
    "avgRating" = coalesce((select round(avg(d.rating)::numeric,1) from public.discussions d
       where d."contentId" = p_content_id and d.rating is not null), 0),
    "reviewCount" = coalesce((select count(*) from public.discussions d
       where d."contentId" = p_content_id and d.rating is not null), 0)
  where c.id = p_content_id;
$$;

create or replace function public.trg_discussion_rating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_content_rating(old."contentId");
    return old;
  end if;
  perform public.recompute_content_rating(new."contentId");
  return new;
end; $$;

drop trigger if exists discussion_rating_aiud on public.discussions;
create trigger discussion_rating_aiud
  after insert or update of rating or delete on public.discussions
  for each row execute function public.trg_discussion_rating();

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
