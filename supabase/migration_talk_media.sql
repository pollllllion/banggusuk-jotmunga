-- ============================================================
-- [마이그레이션] 토론글 움짤/이미지 첨부 (2026-08)
--
-- 토론글에 GIF(움짤)·이미지를 붙일 수 있게 합니다.
--   1) discussions.images text[] — 첨부 파일 공개 URL 목록
--   2) storage 버킷 'talk-media' — 파일 실체는 여기에. DB엔 URL만 담는다
--      (GIF는 canvas 재인코딩이 불가해 base64로 못 줄인다. 게다가 앱은 시작할 때
--       discussions 전체를 캐시로 긁어오므로 본문에 data URL을 넣으면 첫 로딩이 무너진다.)
--
-- ⚠️ Supabase 대시보드 → SQL Editor 에 붙여넣고 "Run without RLS" 로 실행하세요.
-- ============================================================

-- 1) 첨부 URL 컬럼
alter table public.discussions
  add column if not exists images text[] not null default '{}';

-- 2) 공개 버킷 (20MB 제한 · 이미지 계열만)
--    움짤은 애니메이션을 살리려면 재인코딩을 못 해 원본 그대로 올라간다 → 한도를 넉넉히.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talk-media', 'talk-media', true, 20971520,
  array['image/gif', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 20971520,
  allowed_mime_types = array['image/gif', 'image/png', 'image/jpeg', 'image/webp'];

-- 3) 버킷 정책 — 읽기는 누구나, 올리기는 익명(유동닉)까지 허용.
--    유동닉 글쓰기를 허용하는 사이트라 업로드도 anon 에 열어야 한다.
--    삭제·수정은 아무에게도 열지 않는다(남의 짤 지우기 방지).
drop policy if exists talk_media_read on storage.objects;
drop policy if exists talk_media_insert on storage.objects;

create policy talk_media_read on storage.objects
  for select using (bucket_id = 'talk-media');

create policy talk_media_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'talk-media');
