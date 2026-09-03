-- ============================================================
-- 자유방 — 작품에 묶이지 않는 글 (2026-09-03)
--
-- 왜: discussions 는 지금까지 "작품 하나에 달린 글"만 담았다("contentId" not null).
--     자유방은 작품 없이 아무 얘기나 쓰는 게시판이라 그 제약에 걸려 글이 저장조차 안 된다.
--
-- 왜 새 테이블을 안 만드나:
--     댓글(discussion_comments)·추천·조회수·신고·유동닉 비번 RPC(verify/update/delete_guest_post)
--     가 전부 discussions 를 기준으로 짜여 있다. 테이블을 새로 파면 그 전부를 한 벌 더 만들어야
--     하고, 글 하나가 어느 표에 있는지에 따라 코드가 갈린다. 게시판 구분은 컬럼 하나면 된다.
--
-- 평점 트리거(discussion_rating_aiud)는 손대지 않는다 — recompute_content_rating(null) 은
-- `where c.id = null` 이라 아무 행도 안 맞는 무해한 no-op 다.
--
-- 멱등이다. Supabase SQL Editor 에 통째로 붙여 실행.
-- 실행 후: npm run migrate:mark migration_free_board.sql
-- ============================================================

-- 1) 작품 없는 글을 허용 --------------------------------------
alter table public.discussions alter column "contentId" drop not null;

-- 2) 어느 게시판 글인지 ---------------------------------------
--    기본값 'talk' — 지금까지 쌓인 글은 전부 방구석토론방 글이다.
alter table public.discussions add column if not exists "board" text not null default 'talk';

alter table public.discussions drop constraint if exists discussions_board_chk;
alter table public.discussions add constraint discussions_board_chk
  check ("board" in ('talk', 'relay'));

-- 3) 토론방 글은 여전히 작품이 있어야 한다 ---------------------
--    1)에서 not null 을 푼 만큼, 원래 그 제약이 지키던 규칙을 여기서 되살린다.
--    이게 없으면 작품 없는 글이 토론방 목록으로 새어 들어간다.
alter table public.discussions drop constraint if exists discussions_talk_needs_content;
alter table public.discussions add constraint discussions_talk_needs_content
  check ("board" <> 'talk' or "contentId" is not null);

-- 4) 목록 조회용 인덱스 ---------------------------------------
create index if not exists idx_discussions_board
  on public.discussions ("board", "createdAt" desc);

-- ── 확인 ────────────────────────────────────────────────────
-- select "board", count(*) from public.discussions group by 1;          -- 전부 talk 여야 한다
-- select is_nullable from information_schema.columns
--  where table_name = 'discussions' and column_name = 'contentId';      -- YES
