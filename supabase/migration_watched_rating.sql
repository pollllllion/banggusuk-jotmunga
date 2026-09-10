-- ============================================================
-- 본 작품에서 바로 매기는 별점 — watched.rating
-- 2026-09-10
-- ============================================================
-- 무엇을:
--   1) watched 에 "rating" (1~10, 없으면 null)
--   2) 작품 평점 집계(recompute_content_rating)를 '토론글 별점 + 본 작품 별점' 으로 넓힌다
--   3) watched 의 별점이 바뀌면 그 작품 평점을 다시 세는 트리거
--
-- 왜 넓히나:
--   지금까지 별점은 토론글을 써야만 매길 수 있었다. 목록을 훑다가 후딱 매기는 별점도
--   같은 '이용자 평가'인데 집계에서 빠지면, 내가 매긴 별점이 두 종류가 되고
--   왜 어떤 건 반영되고 어떤 건 안 되는지 설명할 수가 없다.
--
-- 사람당 한 작품 하나로 묶는 규칙:
--   같은 사람이 그 작품에 **토론글 별점**과 **본 작품 별점**을 둘 다 가지고 있으면
--   토론글 쪽만 센다 — 글로 남긴 평가가 더 무겁고, 1작품 1별점 규칙과도 맞는다.
--   유동닉이 쓴 토론글 별점은 묶을 상대가 없으므로(계정이 없다) 그대로 센다.
--
-- 왜 추가형인가 (배포 순서 주의):
--   칸이 없는 상태로 새 코드가 뜨면 별점 저장이 400 으로 떨어진다 → **마이그레이션 먼저**.
--   반대로 이 SQL 을 먼저 돌리면 집계식만 넓어지는데, watched.rating 이 아직 전부 null 이라
--   결과는 지금과 똑같다. 안전하다.
--
-- 권한: watched 는 본인 행만 쓰기(RLS). 집계 함수는 security definer 라 그대로 돈다.
--
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ============================================================

-- 1) 칸
alter table public.watched
  add column if not exists "rating" smallint;

alter table public.watched drop constraint if exists watched_rating_range;
alter table public.watched
  add constraint watched_rating_range check ("rating" is null or ("rating" between 1 and 10));

-- 2) 집계 — 토론글 별점 + (그 사람이 글로 안 매긴) 본 작품 별점
create or replace function public.recompute_content_rating(p_content_id text)
returns void language sql security definer set search_path = public as $$
  with mixed as (
    select d.rating::numeric as rating
      from public.discussions d
     where d."contentId" = p_content_id and d.rating is not null
    union all
    select w.rating::numeric
      from public.watched w
     where w."contentId" = p_content_id and w.rating is not null
       and not exists (
         select 1 from public.discussions d2
          where d2."contentId" = p_content_id
            and d2.rating is not null
            and d2."authorId" = w."userId"
       )
  )
  update public.contents c set
    "avgRating"   = coalesce((select round(avg(rating), 1) from mixed), 0),
    "reviewCount" = coalesce((select count(*) from mixed), 0)
  where c.id = p_content_id;
$$;

-- 3) 본 작품 별점이 바뀌면 그 작품 평점을 다시 센다
create or replace function public.trg_watched_rating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_content_rating(old."contentId");
    return old;
  end if;
  perform public.recompute_content_rating(new."contentId");
  return new;
end; $$;

drop trigger if exists watched_rating_aiud on public.watched;
create trigger watched_rating_aiud
  after insert or update of "rating" or delete on public.watched
  for each row execute function public.trg_watched_rating();

-- 적용 후 확인 (에러 없이 돌면 성공)
--   select id, "contentId", "rating" from public.watched limit 1;
