-- ============================================================
-- 내 피드 칸별 공개/비공개 — profiles 에 세 칸 추가
-- 2026-09-10
-- ============================================================
-- 무엇을:
--   "showRatings" · "showPosts" · "showWatched"
--   각각 '내가 매긴 별점' · '최근 남긴 글' · '본 작품' 을 남에게 보여줄지.
--   전부 기본 true — 지금까지 공개였던 것을 조용히 감추면 안 된다.
--
-- 어디에 듣나:
--   공개 프로필(/u/:id). 내 피드(/feed)는 본인만 보는 화면이라 비공개로 둬도
--   본인에게는 계속 보인다(대신 '비공개' 표시가 붙는다) — 감춘 것도 관리는 해야 한다.
--
-- 왜 세 칸인가:
--   알림 설정(notifyComment/notifyReply/notifyLike)이 이미 이 모양이다. jsonb 한 칸으로
--   묶으면 값을 읽는 쪽이 매번 파싱·기본값 처리를 해야 하고, 칸 하나 늘 때마다 그 코드가 는다.
--
-- 왜 추가형인가 (배포 순서 주의):
--   기본값이 있어 **마이그레이션을 먼저** 돌리고 배포해야 한다.
--   칸이 없는 상태로 새 코드가 뜨면 공개 설정 저장이 400 으로 떨어진다.
--   반대로 이 SQL 을 먼저 돌려도 지금 떠 있는 옛 코드는 이 칸을 안 보내므로 아무 일도 안 생긴다.
--
-- 권한: profiles_update 정책이 이미 '본인 행만' 이라 따로 손댈 것이 없다.
--
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ============================================================

alter table public.profiles
  add column if not exists "showRatings" boolean not null default true,
  add column if not exists "showPosts"   boolean not null default true,
  add column if not exists "showWatched" boolean not null default true;

-- 적용 후 확인 (에러 없이 돌면 성공)
--   select id, nickname, "showRatings", "showPosts", "showWatched" from public.profiles limit 1;
