-- ============================================================
-- [마이그레이션] 활동 알림 설정 (2026-09-09)
--
-- 댓글·답글·추천 알림을 사용자가 끌 수 있게 한다.
--
-- 왜 profiles 에 두는가 (localStorage 가 아니라):
--   알림 행을 만드는 건 **행동한 사람의 브라우저**다(댓글을 단 쪽).
--   그 브라우저가 받는 사람의 설정을 읽을 수 있어야 "이 사람은 껐다"를 판단한다.
--   profiles 는 select 가 열려 있어서(profiles_select using(true)) 그게 가능하다.
--
-- 기본값은 전부 true — 지금 동작(항상 옴)과 같게 두고, 끄고 싶은 사람만 끈다.
--
-- ⚠️ camelCase 컬럼은 반드시 큰따옴표. Supabase SQL Editor 에서 실행.
-- ============================================================

alter table public.profiles
  add column if not exists "notifyComment" boolean not null default true,
  add column if not exists "notifyReply"   boolean not null default true,
  add column if not exists "notifyLike"    boolean not null default true;

comment on column public.profiles."notifyComment" is '내 글에 댓글이 달리면 알림';
comment on column public.profiles."notifyReply"  is '내가 댓글 단 글에 새 댓글이 달리면 알림';
comment on column public.profiles."notifyLike"   is '내 글·댓글이 추천되면 알림';

-- 본인만 고칠 수 있다: profiles_update 정책(id = auth.uid() or is_admin())이 이미 그렇게 한다.
-- role·banned·expert 를 잠그는 guard 트리거들은 이 세 칸을 건드리지 않으므로 그대로 두면 된다.

-- ── 롤백 ─────────────────────────────────────────────────────
-- alter table public.profiles
--   drop column if exists "notifyComment",
--   drop column if exists "notifyReply",
--   drop column if exists "notifyLike";
