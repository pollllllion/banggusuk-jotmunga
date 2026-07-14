-- ============================================================
-- [마이그레이션] Supabase Auth 프로필 (고정닉 계정) (2026-07)
--
-- Supabase Auth로 로그인한 사용자(고정닉)의 공개 프로필입니다.
-- id = auth.uid()를 text로 저장 (앱 전체가 text id 규약이라 통일).
-- Supabase 대시보드 → SQL Editor → "Run without RLS" 로 실행하세요.
--
-- ⚠️ 함께: Authentication → Sign In/Providers → Email → "Confirm email" 을 OFF 해야
--    가입 즉시 로그인됩니다 (지금은 ON이라 이메일 인증 링크 필요).
-- ============================================================

create table if not exists public.profiles (
  id          text primary key,      -- auth.uid()::text
  nickname    text not null,
  role        text not null default 'user' check (role in ('admin','user')),
  banned      boolean not null default false,
  "createdAt" timestamptz not null default now()
);
