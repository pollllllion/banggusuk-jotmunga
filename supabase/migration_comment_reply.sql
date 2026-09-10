-- ============================================================
-- 댓글 답글(대댓글) — discussion_comments 에 부모 칸 + 삭제 표시
-- 2026-09-10
-- ============================================================
-- 무엇을:
--   1) "parentId" — null 이면 원댓글, 값이 있으면 그 댓글에 달린 답글.
--      깊이는 1단계까지만 쓴다(답글의 답글도 같은 원댓글에 붙인다) — 화면에서 정한다.
--      DB 는 그걸 강제하지 않는다. 나중에 마음이 바뀌어도 스키마를 다시 안 건드리려고.
--   2) "deleted" — 답글이 달린 원댓글을 지울 때 행을 남기고 이 표시만 켠다.
--      화면에는 "삭제된 댓글입니다" 자리가 남고, 답글은 원래 자리에 그대로 붙어 있다.
--      답글이 없는 댓글은 예전처럼 진짜로 지운다(빈 자리를 남길 이유가 없다).
--   3) soft_delete_guest_discussion_comment — 유동닉 댓글용 같은 동작.
--      유동닉 행은 "authorId" 가 null 이라 RLS update 가 막는다 → 비번 확인 RPC 로 돈다.
--
-- 왜 추가형인가 (배포 순서 주의):
--   두 칸 다 기본값이 있어서 **마이그레이션을 먼저** 돌리고 배포해야 한다.
--   칸이 없는 상태로 새 코드가 뜨면 답글 등록·삭제가 400 으로 떨어진다.
--   반대로 이 SQL 을 먼저 돌려도 지금 떠 있는 옛 코드는 두 칸을 아예 안 보내므로 아무 일도 안 생긴다.
--
-- on delete set null (cascade 아님):
--   지금 설계에서는 답글 달린 원댓글이 실제로 지워지지 않지만(2번), 관리자가 DB 에서 직접
--   지우는 경우까지 생각하면 답글이 딸려 사라지지 않는 쪽이 맞다. 남이 쓴 글이기 때문이다.
--
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
--       (Claude 는 DDL 을 REST 로 못 돌린다 — 사람이 한 번 눌러야 한다)
-- ============================================================

-- 1) 부모 칸
alter table public.discussion_comments
  add column if not exists "parentId" text
  references public.discussion_comments(id) on delete set null;

create index if not exists idx_disc_comments_parent
  on public.discussion_comments ("parentId");

-- 2) 삭제 표시
alter table public.discussion_comments
  add column if not exists "deleted" boolean not null default false;

-- 3) 유동닉 댓글 삭제 표시 (비번 확인 후 본문을 비우고 표시만 켠다)
--    guest_pw_ok 는 migration_guest_pw_bcrypt 가 만든 비번 확인 함수다(bcrypt·구 sha256 둘 다 통과).
create or replace function public.soft_delete_guest_discussion_comment(
  p_id text, p_password text
)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  select public.guest_pw_ok("guestPwHash", p_password) into ok
    from public.discussion_comments where id = p_id;
  if ok is not true then return false; end if;

  -- 본문은 지운다. 남겨 둘 이유가 없고, 남기면 '삭제했다'가 거짓말이 된다.
  update public.discussion_comments
     set body = '', "deleted" = true
   where id = p_id;
  return true;
end; $$;

grant execute on function public.soft_delete_guest_discussion_comment(text, text) to anon, authenticated;

-- ============================================================
-- 적용 후 확인 (둘 다 에러 없이 돌면 성공)
--   select id, "parentId", "deleted" from public.discussion_comments limit 1;
-- ============================================================
