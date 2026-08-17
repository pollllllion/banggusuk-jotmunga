-- ============================================================
-- [보안 수정 3차] 2026-08-17 — 유동닉 비밀번호 해시 강화 (bcrypt)
--
-- 문제: guestPwHash 는 "비번의 SHA-256 hex"였고, discussions/comments 는
--       select 가 누구나(true) 라서 그 해시가 브라우저로 그대로 내려간다.
--       실측: 운영 DB 샘플 3건의 해시를 받아 오프라인 대입 → 2초 만에 3건 다
--       평문 복원(전부 4자리 숫자). = 누구나 남의 유동닉 글을 수정·삭제 가능.
--
-- 조치: 저장값을 bcrypt(cost 11)로 감싼다. salt 가 붙고 한 번 검증에 ~0.2초가
--       걸리므로, 해시가 노출돼도 4자리 비번 1만 개를 다 돌리는 데 수십 분~수 시간이
--       걸린다(기존 2초 → 실질 차단). 클라이언트 코드는 손댈 필요 없다.
--       · 저장:   BEFORE INSERT/UPDATE 트리거가 받은 값을 bcrypt 로 다시 감쌈
--       · 검증:   guest_pw_ok() 하나로 통일. 옛 sha256 행도 그대로 검증됨(호환)
--
-- 덤: delete_guest_post 화이트리스트에 'discussion_comments' 가 빠져 있어
--     유동닉 댓글 삭제가 'invalid table' 로 실패하던 버그도 같이 고친다.
--
-- 멱등. Supabase SQL Editor 에 통째로 붙여 실행.
-- ============================================================

create extension if not exists pgcrypto;

-- ── 공통 검증 함수 ──────────────────────────────────────────
-- 저장값이 bcrypt('$2a$'…)면 bcrypt 로, 아직 옛 sha256 hex 면 그대로 비교한다.
create or replace function public.guest_pw_ok(p_stored text, p_password text)
returns boolean language sql stable set search_path = public, extensions as $$
  select case
    when p_stored is null or p_password is null then false
    when p_stored like '$2%' then p_stored = crypt(encode(digest(p_password, 'sha256'), 'hex'), p_stored)
    else p_stored = encode(digest(p_password, 'sha256'), 'hex')
  end;
$$;
grant execute on function public.guest_pw_ok(text, text) to anon, authenticated;

-- ── 저장 시 자동 bcrypt ─────────────────────────────────────
create or replace function public.hash_guest_pw()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  if new."guestPwHash" is not null and new."guestPwHash" not like '$2%' then
    new."guestPwHash" := crypt(new."guestPwHash", gen_salt('bf', 11));
  end if;
  return new;
end $$;

drop trigger if exists trg_hash_guest_pw_reviews on public.reviews;
create trigger trg_hash_guest_pw_reviews before insert or update on public.reviews
  for each row execute function public.hash_guest_pw();

drop trigger if exists trg_hash_guest_pw_comments on public.comments;
create trigger trg_hash_guest_pw_comments before insert or update on public.comments
  for each row execute function public.hash_guest_pw();

drop trigger if exists trg_hash_guest_pw_discussions on public.discussions;
create trigger trg_hash_guest_pw_discussions before insert or update on public.discussions
  for each row execute function public.hash_guest_pw();

drop trigger if exists trg_hash_guest_pw_disc_comments on public.discussion_comments;
create trigger trg_hash_guest_pw_disc_comments before insert or update on public.discussion_comments
  for each row execute function public.hash_guest_pw();

-- ── 기존 행 일괄 전환 (이미 bcrypt 인 행은 건너뜀) ──────────
update public.reviews             set "guestPwHash" = "guestPwHash" where "guestPwHash" is not null;
update public.comments            set "guestPwHash" = "guestPwHash" where "guestPwHash" is not null;
update public.discussions         set "guestPwHash" = "guestPwHash" where "guestPwHash" is not null;
update public.discussion_comments set "guestPwHash" = "guestPwHash" where "guestPwHash" is not null;

-- ── 검증 함수들을 guest_pw_ok 로 통일 ───────────────────────
create or replace function public.verify_guest_post(p_table text, p_id text, p_password text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  if p_table not in ('reviews', 'discussions', 'comments', 'discussion_comments') then
    raise exception 'invalid table';
  end if;
  execute format('select public.guest_pw_ok("guestPwHash", $1) from public.%I where id = $2', p_table)
    into ok using p_password, p_id;
  return coalesce(ok, false);
end; $$;

-- discussion_comments 누락 수정 (유동닉 댓글 삭제가 안 되던 원인)
create or replace function public.delete_guest_post(p_table text, p_id text, p_password text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  if p_table not in ('reviews', 'discussions', 'comments', 'discussion_comments') then
    raise exception 'invalid table';
  end if;
  execute format('select public.guest_pw_ok("guestPwHash", $1) from public.%I where id = $2', p_table)
    into ok using p_password, p_id;
  if ok is not true then return false; end if;
  execute format('delete from public.%I where id = $1', p_table) using p_id;
  return true;
end; $$;

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
  select public.guest_pw_ok("guestPwHash", p_password) into ok
    from public.discussions where id = p_id;
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

create or replace function public.update_guest_discussion_comment(
  p_id text, p_password text, p_body text
)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  select public.guest_pw_ok("guestPwHash", p_password) into ok
    from public.discussion_comments where id = p_id;
  if ok is not true then return false; end if;

  update public.discussion_comments set body = p_body, "updatedAt" = now() where id = p_id;
  return true;
end; $$;

-- ============================================================
-- 적용 후 확인: 아래가 전부 t 여야 한다 (해시가 bcrypt 로 바뀌었는지)
--   select count(*) filter (where "guestPwHash" like '$2%') = count(*)
--     from public.discussions where "guestPwHash" is not null;
-- ============================================================
