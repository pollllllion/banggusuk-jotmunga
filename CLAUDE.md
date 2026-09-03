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

## 시드 만들기 — "오늘 시드 만들어줘"

밖에서 오가는 얘깃거리를 재료 삼아 페르소나 글·댓글 초안을 만든다. **게시는 하지 않는다.**

```
npm run signals           # ① 재료 수집 (YouTube · 무료)
"오늘 시드 만들어줘"       # ② Claude 가 논점 추출 + 글 작성 → queue.json
npm run post -- --dry     # ③ 사람이 읽어 보고 게시
npm run post
```

②를 스크립트가 아니라 세션에서 하는 이유: 스크립트가 직접 LLM 을 부르면 API 종량제라
돌릴 때마다 돈이 나간다(하루 500~1,000원). 어차피 큐는 사람이 읽고 올리는 구조라
사람이 붙으므로, 그 김에 세션에서 쓰면 추가 비용이 없다.

### ② 를 할 때 (Claude 용 절차)

1. `scripts/signals.local.json` 을 읽는다. 없으면 사용자에게 `npm run signals` 를 먼저 돌리라고 한다
2. 작품별 `comments` 에서 **논점만** 뽑는다 — 여러 사람이 반복해서 건드린 화제만.
   한 사람만 한 말, 실존 인물(유튜버·배우 개인·댓글 작성자) 지칭은 버린다
3. **원문은 여기서 끝이다.** 논점과 작품 메타데이터만 가지고 페르소나가 *처음부터 새로* 쓴다.
   댓글을 옮기거나 바꿔 쓰지 않는다 — 그건 2차 저작물이고 검색엔진엔 복제 콘텐츠다
4. `scripts/queue.json` 에 이어 붙인다. 글 1개당 **댓글 2~4개**, 댓글은 글쓴이와 다른 페르소나.
   맞장구만 시키지 말고 한 명쯤은 다른 의견을 낸다. `minutesAgo` 를 흩뿌린다
5. **`scripts/signals.local.json` 을 지운다** (원문을 남겨 두지 않는다)
6. 사용자에게 초안을 보여주고 `npm run post` 는 사용자가 확인한 뒤에

### 지켜야 할 선

- **시드 글에는 별점을 달지 않는다 (`rating: null`).** 글 본문은 창작이지만 별점은 화면에
  "이용자 평가"(`avgRating`·`reviewCount`)로 집계되는 수치다. 아무도 보지 않은 작품에 페르소나가
  매긴 별점은 지표를 지어내는 것이고, 글보다 이쪽이 기만적 관행에 가깝다. 취향·감상은 본문으로 쓴다
- 하루 **글 3개 · 글당 댓글 2~4개**. 대상은 수집기가 화제성으로 골라 준다(TMDB 인기도 + 한국 작품 +
  공개 임박 → 유튜브 반응량). 늘리려면 상수를 고칠 게 아니라 사람이 쓴 글이 먼저 그만큼 늘어야 한다
- **비율을 본다.** 정책이 문제 삼는 건 절대량이 아니라 "사이트 콘텐츠의 상당수가 시드인가" 다.
  사람 글이 안 느는데 시드만 쌓이면 그때가 위험 구간이다
- **자동 게시로 바꾸지 말 것.** 구글은 대량 생성 콘텐츠(scaled content abuse)를 색인 제외·수동 조치
  대상으로 보고, 애드센스도 같은 기준이다. 사람이 큐를 읽고 올리는 단계가 안전장치다
- `signals.local.json` 은 .gitignore 에 있다. public repo 라 원문이 올라가면 안 된다
