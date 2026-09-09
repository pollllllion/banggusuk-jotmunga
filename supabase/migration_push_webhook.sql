-- ============================================================
-- [마이그레이션] 활동 알림 → 폰 푸시 연결 (2026-09-09)
--
-- notifications 에 행이 생기면 Edge Function(push-on-activity)을 부른다.
-- Supabase 대시보드의 Database → Webhooks 폼과 같은 일을 SQL 로 한다
-- (폼에 8칸을 채우는 것보다 이게 한 번에 끝난다).
--
-- ⚠️ 아래 두 값을 자기 값으로 바꾼 뒤 실행할 것:
--      <ANON_KEY>          Project Settings → API → anon public
--      <PUSH_HOOK_SECRET>  Edge Functions → Secrets 에 넣은 것과 **같은 값**
--    이 파일은 public 리포에 올라가므로 실제 값을 적어 커밋하지 말 것.
--
-- 먼저 Edge Function 이 배포돼 있어야 한다 (supabase/README-push.md 참고).
-- 멱등 — 다시 실행해도 안전하다.
-- ============================================================

-- Postgres 에서 바깥으로 HTTP 를 보내는 확장 (대시보드 Webhooks 도 이걸 쓴다)
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_push_on_activity()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- 실패해도 알림 행 INSERT 자체는 성공해야 한다(종 아이콘은 떠야 하므로).
  -- net.http_post 는 큐에 넣고 바로 반환하니 글쓰기가 느려지지도 않는다.
  perform net.http_post(
    url := 'https://ggswwptjbwvesjkowwsc.supabase.co/functions/v1/push-on-activity',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'X-Hook-Secret', '<PUSH_HOOK_SECRET>'
    ),
    -- Edge Function 이 기대하는 모양 = 대시보드 웹훅이 보내는 모양과 같다
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'schema', 'public',
      'record', to_jsonb(new)
    )
  );
  return new;
exception when others then
  -- 푸시가 안 가는 것보다 알림 행이 안 만들어지는 게 훨씬 나쁘다
  raise warning '[push webhook] %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_push_on_activity on public.notifications;
create trigger trg_push_on_activity
  after insert on public.notifications
  for each row execute function public.notify_push_on_activity();

-- ============================================================
-- 적용 확인
--   select tgname from pg_trigger where tgrelid = 'public.notifications'::regclass;
--   → trg_push_on_activity 가 보이면 성공
--
-- 최근 호출 결과 보기 (pg_net 응답 로그)
--   select id, status_code, created from net._http_response order by created desc limit 5;
--
-- 롤백
--   drop trigger if exists trg_push_on_activity on public.notifications;
--   drop function if exists public.notify_push_on_activity();
-- ============================================================
