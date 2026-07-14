-- ============================================================
-- [마이그레이션] 유동닉(게스트) 비번 모델 (디시 갤러리 방식) (2026-07)
--
-- 로그인 없이 닉네임+비밀번호로 글을 쓰고, 그 비번으로 삭제합니다.
-- guestName: 표시 닉네임, guestPwHash: 비번의 SHA-256 hex (클라이언트에서 해시)
-- 삭제는 서버 함수가 비번을 검증(pgcrypto)하므로 클라이언트 우회 불가.
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- ============================================================

create extension if not exists pgcrypto;

alter table public.reviews     add column if not exists "guestName"   text;
alter table public.reviews     add column if not exists "guestPwHash" text;
alter table public.discussions add column if not exists "guestName"   text;
alter table public.discussions add column if not exists "guestPwHash" text;
alter table public.comments    add column if not exists "guestName"   text;
alter table public.comments    add column if not exists "guestPwHash" text;

-- 유동닉 글 삭제 (비번 검증). 성공 시 true.
create or replace function public.delete_guest_post(p_table text, p_id text, p_password text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  if p_table not in ('reviews', 'discussions', 'comments') then
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

grant execute on function public.delete_guest_post(text, text, text) to anon, authenticated;
