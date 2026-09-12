-- ============================================================
-- [마이그레이션] '관심에 담았다' 알림을 서버가 만든다 (2026-09-13)
--
-- 왜 옮기는가:
--   담는 사람의 브라우저가 알림 행을 넣는 구조였는데, 실제로 한 명이 담았을 때
--   알림이 만들어지지 않았다. 그 사람은 홈 화면 PWA 로 쓰고 있었고, 서비스워커가
--   옛 자산을 캐시하고 있어서 새 코드가 돌지 않았다.
--   **클라이언트 버전에 기대는 알림은 언젠가 이렇게 조용히 빠진다.**
--   profiles.follows 가 바뀌는 것은 서버가 확실히 안다 — 거기서 만든다.
--   (관심 있는 사람의 새 글 알림도 같은 이유로 트리거다)
--
-- 중복 방지: 같은 사람에게 **하루 안에** 보낸 '관심' 알림이 있으면 다시 보내지 않는다.
--   담기→빼기→담기를 반복하면 상대 폰이 도배된다(실제로 25초 사이에 두 번 갔다).
--   처음엔 7일로 뒀는데 그건 정상적인 재담기까지 막는다 — 도배만 막으면 된다.
--
-- 팔로워 수·명단은 여전히 어디에도 보여주지 않는다. 알림만 간다.
--
-- ⚠️ camelCase 컬럼은 큰따옴표 필수. Supabase SQL Editor 에서 실행. 멱등.
-- ============================================================

create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new    text[];
  v_actor  text;
  v_target text;
begin
  -- 새로 담긴 id 들만 (뺀 것은 알리지 않는다 — 상대가 알 이유가 없는 일이다)
  v_new := array(
    select unnest(coalesce(new.follows, '{}'::text[]))
    except
    select unnest(coalesce(old.follows, '{}'::text[]))
  );
  if array_length(v_new, 1) is null then return new; end if;

  select nickname into v_actor from public.profiles where id = new.id;
  if v_actor is null then return new; end if;

  foreach v_target in array v_new loop
    -- 자기 자신은 건너뛴다
    continue when v_target = new.id;
    -- 없는 계정(탈퇴)에는 넣지 않는다
    continue when not exists (select 1 from public.profiles where id = v_target);
    -- 하루 안에 같은 사람에게 이미 보냈으면 건너뛴다
    continue when exists (
      select 1 from public.notifications
       where "userId" = v_target and "type" = 'follow' and "reviewId" = new.id
         and "createdAt" > now() - interval '1 day'
    );

    insert into public.notifications ("id", "userId", "type", "reviewId", "message", "read", "createdAt")
    values (gen_random_uuid()::text, v_target, 'follow', new.id,
            format('%s님이 당신을 관심에 담았어요.', v_actor), false, now());
  end loop;

  return new;
exception when others then
  -- 알림이 안 가는 것보다 관심 담기가 실패하는 게 훨씬 나쁘다
  raise warning '[notify_on_follow] %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_notify_on_follow on public.profiles;
create trigger trg_notify_on_follow
  after update of follows on public.profiles
  for each row execute function public.notify_on_follow();

-- ============================================================
-- 적용 확인
--   select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass;
--   → trg_notify_on_follow 가 보이면 성공
--
-- 롤백
--   drop trigger if exists trg_notify_on_follow on public.profiles;
--   drop function if exists public.notify_on_follow();
-- ============================================================
