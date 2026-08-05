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
`ingest` / `sync:ott` / `dedupe` / `enrich` 는 `.env`의 `SUPABASE_SERVICE_KEY` 필요.
