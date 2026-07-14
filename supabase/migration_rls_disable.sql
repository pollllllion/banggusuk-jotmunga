-- ============================================================
-- [롤백] RLS 즉시 끄기 — 앱이 막히면 이걸 SQL Editor에 붙여 실행
-- 정책은 남겨두고 RLS만 비활성화(정책은 무시됨). 필요시 다시 enable 하면 복구.
-- ============================================================
alter table public.profiles      disable row level security;
alter table public.contents      disable row level security;
alter table public.reviews       disable row level security;
alter table public.comments      disable row level security;
alter table public.discussions   disable row level security;
alter table public.bookmarks     disable row level security;
alter table public.blocks        disable row level security;
alter table public.notifications disable row level security;
alter table public.reports       disable row level security;
alter table public.announcements disable row level security;
alter table public.users         disable row level security;
