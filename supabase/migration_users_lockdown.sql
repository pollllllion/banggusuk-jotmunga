-- ============================================================
-- [마이그레이션] users(레거시 게스트) 테이블 쓰기 잠금 (2026-09-09)
--
-- 문제:
--   users 는 유동닉 신원을 담던 표인데 RLS 가 `for all using (true) with check (true)`
--   였다. anon 키 하나로 **모든 행을 고치거나 지울 수 있었다.**
--   2026-09-09 기준 5,971행. 지워지면 그 id 로 남은 옛 글의 작성자 표시가 깨진다.
--
--   실제로 필요한 행은 그중 **1행**뿐이었다 — 글·댓글이 참조하는 유동닉 작성자는 한 명이고,
--   나머지 5,970행은 "들어왔다 나간 방문자" 기록이다.
--
-- 코드 쪽 변경(먼저 배포되어 있어야 한다):
--   유동닉 신원을 localStorage 로 옮겨서(src/lib/guestIdentity.ts) 방문자마다 행을
--   만들지 않는다. 유동닉 글은 guestName 을 글 행에 직접 들고 있어서 이 표가 없어도
--   이름이 보인다. 이 표는 이제 **옛 행을 읽기만** 한다.
--
-- 이 마이그레이션이 하는 일:
--   select 는 열어 둔다(옛 글의 작성자 이름을 남들도 봐야 한다).
--   insert/update/delete 는 관리자만.
--
-- ⚠️ camelCase 컬럼은 반드시 큰따옴표. Supabase SQL Editor 에서 실행.
-- 롤백: 맨 아래 주석 참고.
-- ============================================================

alter table public.users enable row level security;

-- 옛 정책(전면 개방) 제거
drop policy if exists users_all on public.users;

-- 읽기는 그대로 열어 둔다 — 옛 글의 작성자 닉네임 표시에 필요하다
create policy users_select on public.users
  for select using (true);

-- 쓰기는 관리자만. 앱은 더 이상 이 표에 쓰지 않는다.
create policy users_insert on public.users
  for insert with check (public.is_admin());
create policy users_update on public.users
  for update using (public.is_admin()) with check (public.is_admin());
create policy users_delete on public.users
  for delete using (public.is_admin());

comment on table public.users is
  '레거시 게스트(유동닉) 신원. 읽기 전용 — 신원은 이제 브라우저 localStorage 에 있다(lib/guestIdentity.ts).';


-- ============================================================
-- (선택) 참조되지 않는 방문자 행 청소
--
-- **바로 돌리지 말 것.** 위 코드 변경이 배포되고 며칠 지난 뒤에 돌린다.
-- 옛 키(bangjot_anon_id)만 가진 방문자가 다시 들어오면 그때 자기 닉네임을
-- localStorage 로 옮겨 간다 — 그 전에 지우면 닉네임이 '방문객####' 로 초기화된다.
-- (글을 쓴 적 있는 사람의 행은 아래 조건이 알아서 남긴다)
--
-- 지우기 전에 몇 행이 지워지는지 먼저 세어 볼 것:
--
--   select count(*) from public.users u
--   where not exists (select 1 from public.discussions         t where t."authorId"  = u.id)
--     and not exists (select 1 from public.discussion_comments t where t."authorId"  = u.id)
--     and not exists (select 1 from public.reviews             t where t."authorId"  = u.id)
--     and not exists (select 1 from public.comments            t where t."authorId"  = u.id)
--     and not exists (select 1 from public.reports             t where t."reporterId" = u.id)
--     and not exists (select 1 from public.blocks              t where t."blockerId"  = u.id or t."blockedId" = u.id);
--
-- 숫자를 확인했으면 같은 조건으로 delete:
--
--   delete from public.users u
--   where not exists (select 1 from public.discussions         t where t."authorId"  = u.id)
--     and not exists (select 1 from public.discussion_comments t where t."authorId"  = u.id)
--     and not exists (select 1 from public.reviews             t where t."authorId"  = u.id)
--     and not exists (select 1 from public.comments            t where t."authorId"  = u.id)
--     and not exists (select 1 from public.reports             t where t."reporterId" = u.id)
--     and not exists (select 1 from public.blocks              t where t."blockerId"  = u.id or t."blockedId" = u.id);
-- ============================================================


-- ── 롤백 (문제가 생겼을 때만) ────────────────────────────────
-- drop policy if exists users_select on public.users;
-- drop policy if exists users_insert on public.users;
-- drop policy if exists users_update on public.users;
-- drop policy if exists users_delete on public.users;
-- create policy users_all on public.users for all using (true) with check (true);
