-- ============================================================
-- 추천 작품 · 관심 피드 — profiles 에 칸 둘
-- 2026-09-10
-- ============================================================
-- 무엇을:
--   "recommendedWorks" — 내가 손으로 고른 추천작 (content id 목록, 차례가 곧 화면 차례)
--   "follows"          — 내가 관심 등록한 사람들 (profile id 목록)
--
-- 왜 text[] 인가:
--   둘 다 '고른 것들의 차례 있는 목록' 이고 항목마다 딸린 값이 없다.
--   인생작품(favoriteWorks)과 같은 모양이라 읽고 쓰는 코드도 그대로 닮는다.
--   (내 토론은 글마다 공개/비공개가 붙어서 jsonb 였다 — 여기는 그럴 것이 없다)
--
-- 왜 follows 를 profiles 에 두나 (관계 표가 아니라):
--   '내가 누구를 보나' 는 내 설정이고, 남이 나를 보는지는 이 서비스가 쓰지 않는다.
--   팔로워 수를 세거나 알림을 보낼 일이 생기면 그때 표로 옮긴다 — 지금은 한 칸이면 된다.
--
-- 왜 추가형인가 (배포 순서 주의):
--   기본값이 있어 **마이그레이션을 먼저** 돌리고 배포해야 한다.
--   칸이 없는 상태로 새 코드가 뜨면 저장이 400 으로 떨어진다.
--   반대로 이 SQL 을 먼저 돌려도 지금 떠 있는 옛 코드는 이 칸을 안 보내므로 아무 일도 안 생긴다.
--
-- 권한: profiles_update 정책이 이미 '본인 행만' 이라 따로 손댈 것이 없다.
--       profiles_select 는 전부 공개라 남의 추천작·관심 목록도 읽힌다 —
--       추천작은 원래 보여주려는 것이고, 관심 목록은 화면에 안 그린다(누구를 보는지는 안 밝힌다).
--
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ============================================================

alter table public.profiles
  add column if not exists "recommendedWorks" text[] not null default '{}',
  add column if not exists "follows"          text[] not null default '{}';

-- 적용 후 확인 (에러 없이 돌면 성공)
--   select id, nickname, "recommendedWorks", "follows" from public.profiles limit 1;
