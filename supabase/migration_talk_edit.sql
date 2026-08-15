-- ============================================================
-- [마이그레이션] 토론글 수정 + 본문 서식 (2026-08)
--
--   1) discussions."updatedAt" — 고쳐 쓴 글에 "(수정됨)" 을 붙이기 위한 시각
--   2) discussions."bodyHtml"  — 서식(굵게·크기·색) 있는 본문. body 는 평문 사본으로
--      계속 유지한다(목록 미리보기·검색·공유 설명이 평문을 쓰므로).
--   3) verify_guest_post()      — 유동닉 비번만 확인 (수정 화면 들어갈 때)
--   4) update_guest_discussion() — 유동닉 글 수정. 비번을 서버에서 검증한다
--
-- 고정닉(계정) 글은 기존 RLS(discussions_update: 본인 or 관리자)로 그냥 되지만,
-- 유동닉 글은 authorId 가 null 이라 anon 이 직접 update 할 수 없다 → 아래 함수로만 고친다.
--
-- ⚠️ Supabase 대시보드 → SQL Editor 에 붙여넣고 "Run without RLS" 로 실행하세요.
-- ============================================================

alter table public.discussions
  add column if not exists "updatedAt" timestamptz;

alter table public.discussions
  add column if not exists "bodyHtml" text;

-- 유동닉 비번 확인만 (삭제·수정 전 게이트)
create or replace function public.verify_guest_post(p_table text, p_id text, p_password text)
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
  return coalesce(ok, false);
end; $$;

grant execute on function public.verify_guest_post(text, text, text) to anon, authenticated;

-- 유동닉 토론글 수정 (비번 검증). 성공 시 true.
-- 작품(contentId)·작성자·비번은 건드리지 않는다.
create or replace function public.update_guest_discussion(
  p_id        text,
  p_password  text,
  p_title     text,
  p_body      text,
  p_body_html text,
  p_rating    int,
  p_spoiler   boolean,
  p_images    text[]
)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  select "guestPwHash" is not null and "guestPwHash" = encode(digest(p_password, 'sha256'), 'hex')
    into ok from public.discussions where id = p_id;
  if ok is not true then return false; end if;

  update public.discussions set
    title       = p_title,
    body        = p_body,
    "bodyHtml"  = p_body_html,
    rating      = p_rating,
    spoiler     = coalesce(p_spoiler, false),
    images      = coalesce(p_images, '{}'),
    "updatedAt" = now()
  where id = p_id;
  return true;
end; $$;

grant execute on function public.update_guest_discussion(text, text, text, text, text, int, boolean, text[]) to anon, authenticated;

-- 댓글도 고쳐 쓸 수 있게 (본문만)
alter table public.discussion_comments
  add column if not exists "updatedAt" timestamptz;

create or replace function public.update_guest_discussion_comment(
  p_id text, p_password text, p_body text
)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  select "guestPwHash" is not null and "guestPwHash" = encode(digest(p_password, 'sha256'), 'hex')
    into ok from public.discussion_comments where id = p_id;
  if ok is not true then return false; end if;

  update public.discussion_comments set body = p_body, "updatedAt" = now() where id = p_id;
  return true;
end; $$;

grant execute on function public.update_guest_discussion_comment(text, text, text) to anon, authenticated;
