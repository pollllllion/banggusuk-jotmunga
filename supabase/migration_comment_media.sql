-- ============================================================
-- 댓글·답글에 사진·움짤·동영상·유튜브 붙이기
-- 2026-09-22
-- ============================================================
-- 무엇을:
--   1) discussion_comments."bodyHtml" — 서식 있는 댓글 본문(<img>·<div data-vid>·<div data-yt>).
--      글(discussions.bodyHtml)과 똑같은 방식이다. 평문 body 는 그대로 남긴다 —
--      검색·알림 미리보기·프리렌더가 읽는 칸이라 앱 전용 형식으로 바꾸면 안 된다
--      (CLAUDE.md 아키텍처 불변식 4번).
--   2) update_guest_discussion_comment 의 4-인자 판 — 유동닉이 고쳐 쓸 때 bodyHtml 까지 저장.
--
-- 파일은 Supabase 가 아니라 Cloudflare R2 에 있다 (worker/ · utils/mediaHost.ts):
--   글·댓글 공통으로 사진·움짤 50MB · 동영상 100MB · 4개. 전송 요금이 없어서 댓글도 글만큼 연다.
--   이 SQL 은 파일이 아니라 **본문 칸**만 늘린다. 동영상은 본문에 주소가 아니라 R2 키(data-vid)로 남는다.
--
-- ⚠️ 적용 안 해도 앱은 안 죽는다 (추가형):
--   TS 쪽 bodyHtml 은 옵셔널이라, 이 SQL 을 안 돌린 상태로 새 코드가 떠도 댓글 등록은
--   된다(짤만 저장이 안 되고 글자는 남는다). 그래도 **배포 전에 먼저 돌리는 걸 권한다** —
--   반대로 이 SQL 만 먼저 돌리면 지금 떠 있는 옛 코드는 이 칸을 아예 안 보내므로 아무 일도 안 생긴다.
--
-- ⚠️ 이 SQL 을 돌린 뒤 scripts/clean-media.mjs 가 bodyHtml 을 읽는지 확인할 것.
--   안 읽으면 청소기가 댓글 짤을 '아무도 안 쓰는 파일'로 보고 24시간 뒤 지운다.
--   (이번 커밋에 같이 고쳐 뒀다 — referencedNames() 의 discussion_comments 줄)
--
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ============================================================

-- 1) 서식 있는 댓글 본문
alter table public.discussion_comments
  add column if not exists "bodyHtml" text;

-- 2) 유동닉 댓글 수정 — bodyHtml 까지 받는 판을 '추가'한다.
--
--    기존 3-인자 함수(migration_talk_edit)는 지우지 않는다. 지우면 아직 옛 번들을 띄워 둔
--    브라우저에서 댓글 수정이 그 순간 깨진다. 포스트그레스는 인자 수가 다르면 다른 함수로 보고,
--    PostgREST 는 보낸 인자 이름으로 어느 쪽을 부를지 고른다 — 둘이 나란히 살아 있어도 안전하다.
--
--    비번 확인은 guest_pw_ok 를 쓴다(migration_guest_pw_bcrypt). 3-인자 옛 판은 sha256 을
--    직접 비교하던 시절 것이라, bcrypt 로 옮겨 간 계정의 비번을 통과시키지 못한다.
create or replace function public.update_guest_discussion_comment(
  p_id text, p_password text, p_body text, p_body_html text
)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  select public.guest_pw_ok("guestPwHash", p_password) into ok
    from public.discussion_comments where id = p_id;
  if ok is not true then return false; end if;

  update public.discussion_comments
     set body        = p_body,
         "bodyHtml"  = p_body_html,
         "updatedAt" = now()
   where id = p_id;
  return true;
end; $$;

grant execute on function public.update_guest_discussion_comment(text, text, text, text) to anon, authenticated;

-- ============================================================
-- 적용 후 확인 (에러 없이 돌면 성공)
--   select id, "bodyHtml" from public.discussion_comments limit 1;
--   select proname, pronargs from pg_proc where proname = 'update_guest_discussion_comment';
--     → 3 과 4 두 줄이 나오면 정상(옛 판 + 새 판)
-- ============================================================
