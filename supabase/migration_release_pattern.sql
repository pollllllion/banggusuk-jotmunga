-- 공개 패턴 수동 입력 컬럼 (예: "매주 수·목 공개")
-- 캘린더 모달에서 TMDB 자동 유추가 안 되는 작품(웹툰/웹소설·회차데이터 없는 신작)에 직접 표시.
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행. (일반 public 테이블이라 ownership 문제 없음 · 멱등)

alter table public.contents add column if not exists "releasePattern" text;
