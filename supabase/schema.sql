-- ============================================================
-- 방구석좋문가 Supabase 스키마 (연결 준비용)
-- Supabase 대시보드 → SQL Editor 에 붙여넣어 실행하면 테이블이 생성됩니다.
-- 인증은 Supabase Auth(auth.users)를 사용하고, profiles가 이를 확장합니다.
-- ============================================================

-- ── 사용자 프로필 (auth.users 확장) ─────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text not null,
  role        text not null default 'user' check (role in ('admin','user')),
  banned      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── 작품 ────────────────────────────────────────────────────
create table if not exists public.contents (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in ('movie','drama','webtoon','webnovel')),
  title         text not null,
  poster_url    text,
  synopsis      text default '',
  genres        text[] not null default '{}',
  creators      text[] not null default '{}',
  platform      text,
  release_year  int,
  status        text check (status in ('ongoing','completed')),
  avg_rating    numeric(3,1) not null default 0,
  review_count  int not null default 0,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ── 리뷰 ────────────────────────────────────────────────────
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  content_id  uuid not null references public.contents(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  rating      int not null check (rating between 1 and 10),
  title       text not null,
  body        text not null,
  spoiler     boolean not null default false,
  tags        text[] not null default '{}',
  likes       uuid[] not null default '{}',
  dislikes    uuid[] not null default '{}',
  views       int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  unique (content_id, author_id)          -- 작품당 1인 1리뷰
);

-- ── 댓글 ────────────────────────────────────────────────────
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references public.reviews(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  parent_id   uuid references public.comments(id) on delete cascade,
  content     text not null,
  likes       uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

-- ── 찜(북마크) ──────────────────────────────────────────────
create table if not exists public.bookmarks (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  content_id  uuid not null references public.contents(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, content_id)
);

-- ── 차단 ────────────────────────────────────────────────────
create table if not exists public.blocks (
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

-- ── 알림 ────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null check (type in ('like','dislike','comment','reply')),
  review_id   uuid references public.reviews(id) on delete cascade,
  message     text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── 신고 ────────────────────────────────────────────────────
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid references public.profiles(id) on delete set null,
  target_type  text not null check (target_type in ('review','comment','content')),
  target_id    uuid not null,
  reason       text not null,
  detail       text default '',
  status       text not null default 'pending' check (status in ('pending','resolved','dismissed')),
  created_at   timestamptz not null default now()
);

-- ── 공지 ────────────────────────────────────────────────────
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid references public.profiles(id) on delete set null,
  title       text not null,
  content     text not null,
  created_at  timestamptz not null default now()
);

-- ── 인덱스 ──────────────────────────────────────────────────
create index if not exists idx_reviews_content on public.reviews(content_id);
create index if not exists idx_reviews_author  on public.reviews(author_id);
create index if not exists idx_comments_review on public.comments(review_id);
create index if not exists idx_notifs_user     on public.notifications(user_id);

-- ============================================================
-- RLS (Row Level Security) — 실제 전환 시 활성화 권장
-- 스캐폴딩 단계에서는 주석 처리해 둡니다. 필요할 때 열어서 조정하세요.
-- ============================================================
-- alter table public.profiles      enable row level security;
-- alter table public.contents      enable row level security;
-- alter table public.reviews       enable row level security;
-- alter table public.comments      enable row level security;
-- alter table public.bookmarks     enable row level security;
-- alter table public.blocks        enable row level security;
-- alter table public.notifications enable row level security;
-- alter table public.reports       enable row level security;
-- alter table public.announcements enable row level security;
--
-- 예시 정책:
-- create policy "작품은 누구나 조회" on public.contents for select using (true);
-- create policy "작품 등록은 관리자만" on public.contents for insert
--   with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
-- create policy "리뷰는 누구나 조회" on public.reviews for select using (true);
-- create policy "리뷰는 본인만 작성" on public.reviews for insert with check (author_id = auth.uid());
-- create policy "리뷰는 본인만 수정" on public.reviews for update using (author_id = auth.uid());
-- create policy "리뷰는 본인만 삭제" on public.reviews for delete using (author_id = auth.uid());
