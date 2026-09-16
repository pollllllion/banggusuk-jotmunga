-- ============================================================
-- [마이그레이션] 작품 종류에 '숏폼드라마'(shortform) 추가 (2026-09-16)
--
-- 왜:
--   작품 둘러보기에 숏폼드라마 필터를 넣으려는데, 그걸 가려낼 데이터가 없었다.
--   러닝타임으로 자동 판별해 봤더니 20분 이하 드라마 46편 중 절반이 어린이
--   애니메이션이었고(넘버블록스·스파이디), 애초에 러닝타임이 있는 드라마가
--   1,011편 중 229편(23%)뿐이라 자동 판별로는 될 일이 아니었다.
--   → 종류를 하나 더 두고 사람이 지정한다.
--
-- ⚠️ 이 파일은 **대개 아무 일도 하지 않는다.**
--   contents.type 의 CHECK 제약은 예능(variety)을 추가하던 2026-08 에
--   migration_watched.sql 이 이미 통째로 떼어냈다. 그래서 'shortform' 은
--   지금 상태로도 그냥 들어간다. 이 파일은 그 뒤에 누군가 제약을 되살렸을
--   경우를 위한 보험이다 — 돌려도 안전하고(멱등), 걸린 게 없으면 조용히 끝난다.
--
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ============================================================

do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.contents'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%type%'
     and pg_get_constraintdef(oid) not ilike '%shortform%';
  if c is not null then
    execute format('alter table public.contents drop constraint %I', c);
    raise notice '떼어냄: contents.type 의 CHECK 제약 %', c;
  else
    raise notice 'contents.type 에 걸린 CHECK 제약이 없습니다 — 할 일 없음';
  end if;
end$$;

-- ============================================================
-- 적용 확인
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.contents'::regclass and contype = 'c';
--   → type 관련 줄이 없으면 정상(예능 때부터 그랬다)
--
--   -- 숏폼드라마로 지정된 작품 세기 (지정 전에는 0)
--   select count(*) from public.contents where type = 'shortform';
-- ============================================================
