-- ============================================================
-- [마이그레이션] 캘린더 상세정보 확장 (출연·채널·편성 등)
--
-- ⚠️ contents 테이블은 camelCase 컬럼명을 씁니다 → 큰따옴표로 감싼 camelCase 로 추가.
--    Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
--
-- 감독/연출(creators)·장르(genres)는 기존 컬럼을 재사용하므로 여기서 추가하지 않습니다.
-- (sync 스크립트가 채웁니다)
-- ============================================================

-- 출연진: [{ name, character, profilePath }, ...]  (상위 N명)
alter table public.contents add column if not exists "castMembers"       jsonb   not null default '[]'::jsonb;

-- 채널/방영사(TV): [{ name, logoPath }, ...]  (tvN·JTBC·Netflix 등)
alter table public.contents add column if not exists "networks"          jsonb   not null default '[]'::jsonb;

-- 편성 정보
alter table public.contents add column if not exists "runtime"           integer;   -- 러닝타임(분) · TV는 회차당
alter table public.contents add column if not exists "numberOfSeasons"   integer;   -- 시즌 수(TV)
alter table public.contents add column if not exists "numberOfEpisodes"  integer;   -- 총 회차(TV)

-- 확인용:
-- select title, creators, genres, "castMembers", "networks", runtime,
--        "numberOfSeasons", "numberOfEpisodes"
--   from public.contents where source = 'tmdb' and "castMembers" <> '[]'::jsonb limit 20;
