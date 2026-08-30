-- ────────────────────────────────────────────────────────────
-- contents.verified 기본값을 true 로 (2026-08-31)
--
-- 왜: migration_content_verified.sql 은 "TMDB 작품 + 관리자가 만든 작품은
--     자동 인증" 이라고 적어 두고 **그때 있던 행만** 백필했다. 그 뒤로 새로
--     들어오는 행에 같은 규칙을 적용하는 곳이 없었다.
--     ingest-tmdb.mjs 는 verified 를 안 보내므로 컬럼 기본값(false)이 먹었고,
--     매일 자동수집되는 15~20건이 전부 미인증으로 쌓였다(2026-08-31 기준 155건).
--
-- 왜 기본값을 바꾸나(스크립트에 명시하지 않고):
--     ingest 는 merge-duplicates upsert 라, 거기서 verified=true 를 매번 보내면
--     관리자가 수동으로 누른 '인증취소'를 다음 수집이 통째로 되돌린다.
--     컬럼을 아예 안 보내면 INSERT 때만 기본값이 먹고 UPDATE 때는 기존 값이 남는다.
--
-- 사용자가 만든 작품은 영향 없다 — ensure_content RPC 가 verified=false 를
-- 명시적으로 넣기 때문이다. 관리자 등록 폼도 true 를 명시한다.
--
-- 멱등이다. Supabase SQL Editor 에 통째로 붙여 실행.
-- ────────────────────────────────────────────────────────────

-- 1) 앞으로 들어올 행 ------------------------------------------------
alter table public.contents alter column "verified" set default true;

-- 2) 그동안 쌓인 것 백필 — 원래 마이그레이션과 같은 규칙 ----------------
update public.contents
   set "verified" = true
 where "verified" = false
   and (
     id like 'tmdb-%'
     or "createdBy" = 'tmdb'
     or "createdBy" in (select id from public.profiles where role = 'admin')
   );

-- 3) 확인 -----------------------------------------------------------
-- 남는 미인증은 "사용자가 직접 등록한 작품"뿐이어야 한다.
select coalesce("createdBy", '(null)') as "createdBy", count(*)
  from public.contents
 where "verified" = false
 group by 1 order by 2 desc;

select column_default from information_schema.columns
 where table_name = 'contents' and column_name = 'verified';
