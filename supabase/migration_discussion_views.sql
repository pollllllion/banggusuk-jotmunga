-- ────────────────────────────────────────────────────────────
-- 토론글 조회수 (인기글 점수용)
--   - discussions.views 추가
--   - 조회수 +1 RPC (남의 글도 올려야 하므로 SECURITY DEFINER · 클라 update 금지)
-- 컬럼이 없으면 클라이언트는 views=0 으로 보고 안전하게 동작한다.
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ────────────────────────────────────────────────────────────

alter table public.discussions
  add column if not exists views int not null default 0;

create or replace function public.increment_discussion_views(p_discussion_id text)
returns void language sql security definer set search_path = public as $$
  update public.discussions set views = views + 1 where id = p_discussion_id;
$$;

grant execute on function public.increment_discussion_views(text) to anon, authenticated;

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
