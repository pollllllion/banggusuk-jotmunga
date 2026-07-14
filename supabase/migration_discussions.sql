-- ============================================================
-- [마이그레이션] 출시 전 수다방 (기대평·떡밥 게시판) (2026-07)
--
-- 작품(content) 단위로 달리는 가벼운 글 목록입니다.
-- 리뷰(reviews)와 달리 평점이 없고, 출시 전 작품에서 기대평/떡밥을 나눕니다.
--
-- ⚠️ 라이브 DB는 모든 id가 text 입니다 (앱이 uuid() 헬퍼로 문자열 id 생성).
--    contents.id / profiles.id 등이 'c1','u1','tmdb-mv-123' 형태라 uuid가 아님.
--    Supabase 대시보드 → SQL Editor 에 붙여넣고 "Run without RLS" 로 실행하세요.
-- ============================================================

create table if not exists public.discussions (
  id          text primary key,
  "contentId" text not null references public.contents(id) on delete cascade,
  "authorId"  text,               -- 사용자 탈퇴 시 'deleted'로 치환되므로 FK 없음
  body        text not null,
  likes       text[] not null default '{}',
  "createdAt" timestamptz not null default now()
);

create index if not exists idx_discussions_content
  on public.discussions ("contentId");
