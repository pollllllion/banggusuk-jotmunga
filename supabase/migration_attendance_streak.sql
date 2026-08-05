-- ────────────────────────────────────────────────────────────
-- 출석 streak: profiles 에 연속 출석 / 방문일 컬럼 추가
--   - "lastVisit"  date : 마지막으로 방문(집계)한 날 (로컬 YYYY-MM-DD)
--   - streak       int  : 현재 연속 출석 일수
--   - "visitDays"  int  : 누적 방문일 수 (출석 XP 산정용)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
--
-- 별도 RLS 정책은 필요 없다: profiles 는 이미 "본인 행 update" 정책이 있어
-- (닉네임 수정이 동작함) 클라이언트의 profiles.update 가 그대로 통과한다.
-- 컬럼이 없을 때 클라이언트는 안전하게 no-op 하므로, 이 마이그레이션을
-- 적용하기 전까지는 출석 기능이 그냥 꺼져 있는 상태로 유지된다.
-- ────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists "lastVisit" date,
  add column if not exists streak      int not null default 0,
  add column if not exists "visitDays" int not null default 0;

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
