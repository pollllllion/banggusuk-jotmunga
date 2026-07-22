-- ============================================================
-- [마이그레이션] 방구석토론방 게시판화 (제목 + 댓글) (2026-07)
--
-- 기존 수다방(discussions)을 커뮤니티 게시판으로 확장합니다.
--   · 게시글에 제목(title) 추가
--   · 게시글 댓글(discussion_comments) 테이블 신설 (고정닉/유동닉)
-- ⚠️ 라이브 DB는 모든 id가 text, 컬럼은 camelCase(큰따옴표).
--    Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
-- ============================================================

-- 1) 게시글 제목
alter table public.discussions add column if not exists "title" text;

-- 2) 게시글 댓글 테이블
create table if not exists public.discussion_comments (
  id             text primary key,
  "discussionId" text not null references public.discussions(id) on delete cascade,
  "authorId"     text,               -- 고정닉 auth uid, 유동닉이면 null
  "guestName"    text,               -- 유동닉 표시명
  "guestPwHash"  text,               -- 유동닉 비번 SHA-256 hex
  body           text not null,
  likes          text[] not null default '{}',
  "createdAt"    timestamptz not null default now()
);
create index if not exists idx_disc_comments_discussion
  on public.discussion_comments ("discussionId");

-- RLS: 조회 공개, 작성은 본인(고정닉)/유동닉, 수정·삭제는 본인/관리자
alter table public.discussion_comments enable row level security;
drop policy if exists disc_comments_select on public.discussion_comments;
drop policy if exists disc_comments_insert on public.discussion_comments;
drop policy if exists disc_comments_update on public.discussion_comments;
drop policy if exists disc_comments_delete on public.discussion_comments;
create policy disc_comments_select on public.discussion_comments for select using (true);
create policy disc_comments_insert on public.discussion_comments for insert with check (
  ("authorId" = auth.uid()::text) or ("authorId" is null and "guestName" is not null)
);
create policy disc_comments_update on public.discussion_comments for update
  using ("authorId" = auth.uid()::text or is_admin())
  with check ("authorId" = auth.uid()::text or is_admin());
create policy disc_comments_delete on public.discussion_comments for delete
  using ("authorId" = auth.uid()::text or is_admin());

-- 3) 댓글 공감 RPC (추천 = 로그인 사용자만)
create or replace function public.toggle_discussion_comment_like(p_comment_id text)
returns void language plpgsql security definer set search_path = public as $$
declare uid text := auth.uid()::text;
begin
  if uid is null then raise exception 'login required'; end if;
  update public.discussion_comments set
    likes = case when uid = any(likes) then array_remove(likes, uid) else array_append(likes, uid) end
  where id = p_comment_id;
end; $$;
grant execute on function public.toggle_discussion_comment_like(text) to anon, authenticated;

-- 4) 유동닉 삭제 대상에 discussion_comments 추가 (비번 검증은 기존 함수 재정의)
create or replace function public.delete_guest_post(p_table text, p_id text, p_password text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  if p_table not in ('reviews', 'discussions', 'comments', 'discussion_comments') then
    raise exception 'invalid table';
  end if;
  execute format(
    'select "guestPwHash" is not null and "guestPwHash" = encode(digest($1, ''sha256''), ''hex'') from public.%I where id = $2',
    p_table
  ) into ok using p_password, p_id;
  if ok is not true then return false; end if;
  execute format('delete from public.%I where id = $1', p_table) using p_id;
  return true;
end; $$;
