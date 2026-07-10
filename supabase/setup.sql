-- ============================================================
-- 방구석좋문가 Supabase 셋업 (스키마 + 공개 접근 정책)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 RUN 하세요.
-- (컬럼명은 앱 코드와 1:1로 맞추기 위해 camelCase 사용)
-- ============================================================

create table if not exists public.users (
  "id" text primary key,
  "nickname" text not null,
  "email" text,
  "role" text not null default 'user',
  "banned" boolean not null default false,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.contents (
  "id" text primary key,
  "type" text not null,
  "title" text not null,
  "posterUrl" text,
  "synopsis" text default '',
  "genres" text[] not null default '{}',
  "creators" text[] not null default '{}',
  "platform" text,
  "releaseYear" int,
  "status" text,
  "popularity" int default 0,
  "avgRating" numeric not null default 0,
  "reviewCount" int not null default 0,
  "createdBy" text,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.reviews (
  "id" text primary key,
  "contentId" text not null,
  "authorId" text,
  "rating" int not null,
  "title" text not null,
  "body" text not null,
  "spoiler" boolean not null default false,
  "tags" text[] not null default '{}',
  "likes" text[] not null default '{}',
  "dislikes" text[] not null default '{}',
  "views" int not null default 0,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz
);

create table if not exists public.comments (
  "id" text primary key,
  "reviewId" text not null,
  "authorId" text,
  "parentId" text,
  "content" text not null,
  "likes" text[] not null default '{}',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz
);

create table if not exists public.bookmarks (
  "userId" text not null,
  "contentId" text not null,
  "createdAt" timestamptz not null default now(),
  primary key ("userId", "contentId")
);

create table if not exists public.blocks (
  "blockerId" text not null,
  "blockedId" text not null,
  "createdAt" timestamptz not null default now(),
  primary key ("blockerId", "blockedId")
);

create table if not exists public.notifications (
  "id" text primary key,
  "userId" text not null,
  "type" text not null,
  "reviewId" text,
  "message" text not null,
  "read" boolean not null default false,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.reports (
  "id" text primary key,
  "reporterId" text,
  "targetType" text not null,
  "targetId" text not null,
  "reason" text not null,
  "detail" text default '',
  "status" text not null default 'pending',
  "createdAt" timestamptz not null default now()
);

create table if not exists public.announcements (
  "id" text primary key,
  "authorId" text,
  "title" text not null,
  "content" text not null,
  "createdAt" timestamptz not null default now()
);

-- ── 공개 접근 정책 (프로토타입용: 공개 키로 읽기/쓰기 허용) ──
-- ⚠️ 프로토타입 기준. 정식 서비스 전엔 권한을 좁히는 게 좋습니다.
do $$
declare t text;
begin
  foreach t in array array['users','contents','reviews','comments','bookmarks','blocks','notifications','reports','announcements']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "public_all" on public.%I;', t);
    execute format('create policy "public_all" on public.%I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;
