# 방좋 (방구석좆문가 / ottcal.com) — 작업 규칙

Vite + TS + Supabase 정적 SPA. 두 대의 PC에서 번갈아 작업한다.

## 배포 (중요)

**`main`에 push하면 그게 곧 배포다. 누가 push하든 똑같이 배포된다.**

- 호스팅: **Cloudflare Workers Builds** (Worker 이름 `ottcal`, 도메인 `ottcal.com`)
- `main` push → Cloudflare가 GitHub 웹훅을 받아 자기 서버에서 `npm run build` → `npx wrangler deploy` 실행
- **로컬에 Cloudflare 계정·wrangler 로그인·API 토큰이 전혀 필요 없다.** GitHub push 권한만 있으면 된다
- 빌드 한도 월 500회 — 크레딧 아끼려고 배포를 모아칠 필요 없음
- **non-production 브랜치는 빌드가 꺼져 있다.** feature 브랜치에 push하면 배포되지 않는다 → 배포하려면 `main`에 머지해서 push
- 배포 로그/재시도가 필요할 때만 Cloudflare 대시보드가 필요하고, 그 계정은 홍인기 소유다. **평상시 배포에는 대시보드 접근이 필요 없다**

### 옛 정보 (무시할 것)

- ~~Netlify~~ 는 2026-07-27에 완전 폐기됐다. `netlify.toml`도 삭제됨
- ~~"배포는 Netlify Build Hook URL이 있는 PC에서만 가능"~~ → **틀림.** 지금은 push = 배포
- ~~"무료 플랜 월 20회 크레딧"~~, ~~"private repo 기여자 1명 제한"~~ → 전부 Netlify 시절 얘기

## 두 PC 오갈 때

- 시작 전 `git pull`, 끝나면 `git add -A && git commit && git push`
- `package.json`이 바뀌었으면 pull 후 `npm install`
- `.env`는 gitignore라 PC마다 로컬 생성 (repo는 public이므로 비밀값 커밋 금지)
- DB는 Supabase 클라우드 공유 — 마이그레이션은 한쪽에서 한 번만

## 스크립트

`npm run dev`(:3000) · `build`(prebuild=sitemap, postbuild=prerender) · `test`
`ingest` / `sync:ott` / `dedupe` / `enrich` / `personas:create` / `post` 는 `.env`의 `SUPABASE_SERVICE_KEY` 필요.

## 시드 페르소나로 글 올리기

"페르소나 ○○(닉네임)으로 이런 글 써줘" 같은 요청은 **직접 DB에 넣지 말고 큐 파일로 처리한다.**

1. 닉네임 → 키 매핑은 `scripts/personas.mjs` (고정닉 계정 20개, 각자 취향 메모 있음)
2. `scripts/queue.json`에 항목 추가 (없으면 `queue.example.json` 복사)
   - 글: `{ "as": "theater", "content": "작품명 일부 또는 id", "title": "...", "body": "...", "rating": 7, "spoiler": false, "minutesAgo": 180 }`
   - 댓글: `{ "as": "binge", "replyTo": "#1", "body": "..." }` — `#1`은 같은 큐의 1번 글
3. `npm run post -- --dry`로 작품 매칭 확인 → `npm run post`로 게시

- 글 톤은 페르소나 성향 메모에 맞춘다. `minutesAgo`를 흩뿌려 같은 시각에 몰리지 않게 한다.
- 스크립트가 자동으로 막는 것: 자기 글 자기 댓글, 1작품 1별점 중복(별점만 제거), 이미 올린 항목 재게시
- **`scripts/personas.local.json`(계정 비밀번호)이 없으면 게시 불가.** git에 없으므로 PC마다 직접 옮겨야 한다. 없으면 사용자에게 요청할 것 — 계정을 새로 만들지 말 것(`personas:create`는 이미 있는 계정을 건드리지 않지만 비번을 모르는 상태는 그대로다).
- 가계정끼리 서로 추천·댓글로 지표를 띄우지 않는다(레벨/좋문가 산정 왜곡).
