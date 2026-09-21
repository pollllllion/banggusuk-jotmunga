/**
 * 주간 OTT 업계 브리핑 — OpenAI(Responses API + web_search)가 지난 7일을 조사하고 텔레그램으로 보낸다.
 * 매주 월 08:00 KST, .github/workflows/weekly-briefing.yml.
 *
 *   npm run briefing              전체: 조사 → 브리핑 → 텔레그램
 *   npm run briefing -- --test    텔레그램 테스트 한 통만 (OpenAI 안 부름)
 *   npm run briefing -- --dry-run 조사·생성만 하고 콘솔에 출력 (텔레그램 안 보냄)
 *
 * env: OPENAI_API_KEY · BRIEFING_TELEGRAM_BOT_TOKEN · BRIEFING_TELEGRAM_CHAT_ID
 *      텔레그램은 브리핑 전용 봇·방이다. 퀀트 알림 봇(TELEGRAM_*)으로 새지 않게 일부러 이름을 갈랐다 — 대체값 없음
 *      OPENAI_MODEL(기본 gpt-5.6-sol) · OPENAI_REASONING_EFFORT(기본 medium)
 *
 * 모델 ID 는 공식 문서(developers.openai.com/api/docs/models/gpt-5.6-sol, 2026-09-21 확인) 기준이다.
 * 실행 때마다 GET /v1/models/{id} 로 이 키에서 실제 쓸 수 있는지 먼저 확인하고, 없으면 조사 전에 멈춘다.
 *
 * 웹검색 + 추론은 수 분 걸릴 수 있어 background 모드로 만들고 폴링한다
 * (Node fetch 는 응답 헤더를 5분 넘게 기다리지 않는다).
 */
import { sendTelegram } from './telegram-lib.mjs'

const TG = { token: process.env.BRIEFING_TELEGRAM_BOT_TOKEN, chatId: process.env.BRIEFING_TELEGRAM_CHAT_ID }
const send = text => sendTelegram(text, TG)

const args = process.argv.slice(2)
const TEST = args.includes('--test')
const DRY = args.includes('--dry-run')

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-sol'
const EFFORT = process.env.OPENAI_REASONING_EFFORT || 'medium'
const API = 'https://api.openai.com/v1'
const POLL_MS = 5000
const MAX_WAIT_MS = 20 * 60 * 1000

// KST 기준 날짜
const kst = d => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10)
const now = new Date()
const TODAY = kst(now)
const FROM = kst(new Date(now.getTime() - 7 * 86400e3))

const INSTRUCTIONS = `너는 OTTCAL(ottcal.com)의 업계 동향 분석가다.
OTTCAL은 한국 사용자를 위한 OTT·극장 개봉/공개일 캘린더이자 작품 발견 서비스다.
- 넷플릭스·티빙·웨이브·쿠팡플레이·디즈니+·왓챠·애플TV+ 공개작과 극장 개봉작의 공개일을 캘린더로 보여준다
- 숏폼 드라마 앱(DramaBox·ReelShort·ShortMax·Vigloo 등)의 작품도 다룬다
- 작품 메타데이터·포스터·다음 회차 정보는 TMDB API에서 자동 수집한다(포스터는 image.tmdb.org)
- 누적 관객수는 영화진흥위원회 KOBIS(KOFIC) 오픈 API, 예고편은 YouTube 임베드를 쓴다
- 검색 유입은 네이버·구글이다

원칙:
1. 공식 발표·보도자료·공식 블로그·개발자 문서·API 문서·약관·변경 로그를 먼저 찾고 우선 인용한다. 언론 보도는 공식 출처가 없을 때만 쓰고 그렇다고 밝힌다.
2. 기간 안(명시된 7일)에 발표·시행·공개된 변화만 다룬다. 날짜가 확인되지 않으면 쓰지 않거나 "날짜 미확인"이라 적는다.
3. 공식 확인이 안 된 내용(루머·보도 인용)은 "보도에 따르면", "~로 알려짐", "확인 필요"처럼 확정하지 않는 표현을 쓴다. 추측을 사실처럼 쓰지 않는다.
4. 출처 URL을 지어내지 않는다. 실제로 검색해서 연 페이지의 URL만 쓴다.
5. 일반 OTT 뉴스, 작품 홍보·흥행·리뷰, 주가·실적 기사는 제외한다. OTTCAL의 (a) 공개일 캘린더 정확도 (b) 작품 발견/검색 유입 (c) 메타데이터·이미지 수집과 재사용 권리 (d) 플랫폼 커버리지(서비스 출시·종료·합병·요금제·국내 진출)에 실제 영향을 줄 변화만 고른다.
6. 해당하는 변화가 3건보다 적으면 억지로 채우지 말고 있는 만큼만 쓰고, 없으면 "이번 주는 OTTCAL에 영향 줄 변화 없음"이라고 쓴다.`

const TASK = `기간: ${FROM} ~ ${TODAY} (KST, 지난 7일)

다음을 웹 검색으로 조사하라.
A. 플랫폼 변화: Netflix, TVING, Wavve, Coupang Play, Disney+, Watcha, Apple TV+ 그리고 숏폼 드라마 플랫폼 DramaBox, ReelShort, ShortMax, Vigloo (그 밖에 한국에서 성장 중인 숏폼 드라마 앱 포함)
   — 서비스 출시·종료·합병(예: 티빙·웨이브), 요금제·광고요금제, 국내 공개 정책·공개 시간 변경, 편성/공개일 발표 방식 변경, 공식 API·파트너 피드·딥링크 정책 등
B. 데이터 소스 정책: TMDB(API 이용약관, 레이트리밋, API 키/요금, 상업적 이용, 포스터·이미지 재사용 및 표기 의무, 엔드포인트 변경·폐기), KOBIS 오픈 API, YouTube 임베드 정책, JustWatch
C. 검색 유입: 네이버·구글의 영화/드라마/OTT 관련 검색 노출 정책 변화(있을 때만)

이 중 OTTCAL 운영에 가장 중요한 3~5건을 골라, 중요도 순으로 아래 형식 그대로 한국어 평문으로 써라.
마크다운 기호(#, **, 표)를 쓰지 말고 줄바꿈과 이모지 번호만 쓴다. 항목당 6줄 안팎으로 짧게.

📺 OTTCAL 주간 업계 브리핑 (${FROM} ~ ${TODAY})

1️⃣ [플랫폼/출처명] 한 줄 제목
• 무엇이 바뀌었나: (날짜 포함, 확인 수준 표시)
• 왜 OTTCAL에 중요한가:
• 대응: [지금 조치 | 검토 | 관찰 | 불필요] 중 하나 — 구체적으로 할 일 한 줄
• 출처: URL (공식이면 URL만, 보도면 "보도 · URL")

(2️⃣ ~ 5️⃣ 같은 형식)

마지막 줄: "조사 범위에서 특이사항 없던 곳: ..." 에 변화가 없던 플랫폼/소스를 쉼표로 나열.`

async function openai(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${json.error?.message || JSON.stringify(json).slice(0, 300)}`)
  return json
}

/** 모델 ID 를 추측하지 않는다 — 이 키로 실제 조회되는지 확인하고, 없으면 쓸 수 있는 후보를 보여주고 멈춘다. */
async function checkModel() {
  try {
    await openai(`/models/${encodeURIComponent(MODEL)}`)
  } catch (e) {
    const list = await openai('/models').catch(() => ({ data: [] }))
    const near = (list.data || []).map(m => m.id).filter(id => id.startsWith('gpt-5.6') || id.startsWith('gpt-6')).sort()
    throw new Error(`모델 '${MODEL}' 을 이 API 키로 쓸 수 없다 (${e.message}). 사용 가능 후보: ${near.join(', ') || '없음'} — Variable OPENAI_MODEL 로 지정`)
  }
}

async function research() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY 가 없다')
  await checkModel()
  const body = {
    model: MODEL,
    instructions: INSTRUCTIONS,
    input: TASK,
    tools: [{
      type: 'web_search',
      search_context_size: 'high',
      user_location: { type: 'approximate', country: 'KR', timezone: 'Asia/Seoul' },
    }],
    reasoning: { effort: EFFORT },
  }
  let r
  try {
    r = await openai('/responses', { method: 'POST', body: JSON.stringify({ ...body, background: true }) })
  } catch (e) {
    // background 모드를 못 쓰는 모델/계정이면 동기 호출로 한 번 더
    if (!/background/i.test(e.message)) throw e
    console.warn('background 모드 불가 → 동기 호출:', e.message)
    r = await openai('/responses', { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(MAX_WAIT_MS) })
  }
  const started = Date.now()
  while (r.status === 'queued' || r.status === 'in_progress') {
    if (Date.now() - started > MAX_WAIT_MS) throw new Error(`OpenAI 응답 ${MAX_WAIT_MS / 60000}분 초과 (id ${r.id})`)
    await new Promise(res => setTimeout(res, POLL_MS))
    r = await openai(`/responses/${r.id}`)
  }
  if (r.status !== 'completed') {
    throw new Error(`OpenAI status=${r.status} ${r.incomplete_details?.reason || r.error?.message || ''}`)
  }

  const texts = [], cited = new Map()
  for (const item of r.output || []) {
    if (item.type !== 'message') continue
    for (const c of item.content || []) {
      if (c.type !== 'output_text') continue
      texts.push(c.text)
      for (const a of c.annotations || []) if (a.type === 'url_citation') cited.set(a.url, a.title || a.url)
    }
  }
  let text = texts.join('\n').trim()
  if (!text) throw new Error('OpenAI 가 빈 브리핑을 돌려줬다')

  // 본문에 안 박힌 인용 URL 은 끝에 모아 둔다 (출처 누락 방지)
  const missing = [...cited].filter(([url]) => !text.includes(url.split('?')[0]))
  if (missing.length) text += '\n\n🔗 참고 출처\n' + missing.map(([url, t]) => `• ${t}\n  ${url}`).join('\n')

  const searches = (r.output || []).filter(i => i.type === 'web_search_call').length
  const u = r.usage || {}
  console.log(`model=${MODEL} effort=${EFFORT} 검색 ${searches}회 · 토큰 in ${u.input_tokens} / out ${u.output_tokens}`)
  return text
}

async function main() {
  if (TEST) {
    const n = await send(`✅ OTTCAL 주간 브리핑 텔레그램 테스트 (${TODAY})\n이 메시지가 보이면 봇 토큰·Chat ID 설정이 정상입니다.`)
    console.log(`텔레그램 테스트 발송 완료 (${n}통)`)
    return
  }
  const text = await research()
  if (DRY) { console.log('\n' + text); return }
  const n = await send(text)
  console.log(`브리핑 발송 완료 (${n}통, ${text.length}자)`)
}

main().catch(async e => {
  console.error(e)
  // 조사 단계에서 죽었으면 조용히 넘어가지 않게 실패 사실만 알린다
  if (!TEST && !DRY) {
    await send(`⚠️ OTTCAL 주간 브리핑 실패 (${TODAY})\n${String(e.message || e).slice(0, 500)}`).catch(() => {})
  }
  process.exit(1)
})
