-- ============================================================
-- [마이그레이션] 관심 담은 사람이 새 글을 올리면 알린다 (2026-09-12)
--
-- 왜:
--   관심(팔로우) 기능은 있는데 알림이 없었다. 관심 피드(/follows)에 직접 들어가
--   확인해야만 새 글을 봤다 — 그러려면 이미 사이트에 와 있어야 한다. 다시 오게 만드는
--   장치가 아니라 이미 온 사람을 위한 장치였던 셈이다.
--
-- ⚠️ **누가 나를 관심에 담았는지는 끝까지 밝히지 않는다.**
--   이 서비스는 팔로워 수를 세지 않는다(세는 순간 그게 점수가 된다 —
--   src/components/profile/ProfileShowcase.tsx 의 결정).
--   그래서 알림을 **서버에서** 만든다. 글 쓴 사람의 브라우저가 "나를 담은 사람" 목록을
--   조회하는 순간 그 명단이 그 사람에게 드러난다. 트리거(security definer)는
--   명단을 아무에게도 보여주지 않고 알림 행만 남긴다.
--
--   반대로 '누가 나를 관심에 담았다' 알림은 만들지 않는다. 그건 팔로워의 존재를
--   알리는 일이라 위 원칙과 정면으로 어긋난다.
--
-- ⚠️ camelCase 컬럼은 큰따옴표 필수. Supabase SQL Editor 에서 실행. 멱등.
-- ============================================================

-- 1) 알림 설정 한 칸 — 다른 알림 설정과 같은 규칙(없거나 null 이면 켜진 것)
alter table public.profiles
  add column if not exists "notifyFollow" boolean not null default true;

-- 2) 글이 올라오면 그 사람을 관심에 담은 이들에게 알림
create or replace function public.notify_followers_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author text;
  v_label  text;
begin
  -- 유동닉 글은 알릴 주인이 없다
  if new."authorId" is null then return new; end if;

  select nickname into v_author from public.profiles where id = new."authorId";
  if v_author is null then return new; end if;

  -- 알림 문구에 넣을 글 이름 — 제목이 없으면 본문 앞부분 (src/utils/notify.ts 의 postLabel 과 같은 규칙)
  v_label := btrim(regexp_replace(coalesce(nullif(btrim(new.title), ''), new.body, '글'), '\s+', ' ', 'g'));
  if length(v_label) > 20 then v_label := left(v_label, 20) || '…'; end if;

  insert into public.notifications ("id", "userId", "type", "reviewId", "message", "read", "createdAt")
  select gen_random_uuid()::text, p.id, 'post', new.id,
         format('관심 있는 %s님이 새 글을 올렸어요: ''%s''', v_author, v_label),
         false, now()
    from public.profiles p
   where p.follows @> array[new."authorId"]::text[]
     and p.id <> new."authorId";   -- 자기 글로 자기한테 알리지 않는다

  return new;
exception when others then
  -- 알림이 안 가는 것보다 글이 안 써지는 게 훨씬 나쁘다
  raise warning '[notify_followers_on_post] %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_notify_followers_on_post on public.discussions;
create trigger trg_notify_followers_on_post
  after insert on public.discussions
  for each row execute function public.notify_followers_on_post();

-- ============================================================
-- 적용 확인
--   select tgname from pg_trigger where tgrelid = 'public.discussions'::regclass;
--   → trg_notify_followers_on_post 가 보이면 성공
--
--   -- 관심 관계가 있는지 (없으면 알림도 안 생긴다)
--   select count(*) from public.profiles where array_length(follows, 1) > 0;
--
-- 롤백
--   drop trigger if exists trg_notify_followers_on_post on public.discussions;
--   drop function if exists public.notify_followers_on_post();
--   alter table public.profiles drop column if exists "notifyFollow";
-- ============================================================
