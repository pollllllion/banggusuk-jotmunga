/**
 * 누적관객수 동기화 — 영화진흥위원회(KOFIC) 박스오피스에서 받아 우리 영화 행에 적는다
 *
 *   npm run kofic                      # 미리보기(DB 미반영) — 최근 10일
 *   npm run kofic -- --apply           # 실제 반영
 *   npm run kofic -- --days=60 --apply # 최초 1회 백필(두 달치)
 *
 * 왜 KOFIC 인가 (2026-09-20):
 *   외부 평점을 하나 더 붙이려다 로튼토마토는 공개 API 가 없어 접었다. KOFIC 은 정부기관
 *   공식 오픈API 이고 무료이며, **한국에서 극장 개봉한 영화의 관객수는 여기가 원본**이다.
 *   평점은 아니지만 "얼마나 봤나"도 판단 재료고, 한국 영화 커버리지가 100% 다.
 *
 * 한계: 일별 박스오피스는 **그날의 상위 10편**만 준다. 그래서 구분을 나눠 세 번 부른다
 *   (전체 · 한국영화 · 다양성영화) — 작은 영화도 제 구분에서는 10위 안에 든다.
 *   며칠치를 겹쳐 받으므로 그 기간에 한 번이라도 순위에 든 영화는 다 들어온다.
 *
 * 매칭은 제목+연도다(kofic-lib.mjs). 동명이작 후보가 둘 이상이면 적지 않고 경고만 남긴다.
 *
 * 환경변수: KOFIC_API_KEY(필수), SUPABASE_SERVICE_KEY(--apply 일 때 필수)
 *   키 발급: https://www.kobis.or.kr/kobisopenapi → 회원가입 → 키 발급 (무료·즉시)
 */
import { planUpdates, mergeBoxOffice } from './kofic-lib.mjs'

const APPLY = process.argv.includes('--apply')
const DAYS = Math.max(1, parseInt((process.argv.find(a => a.startsWith('--days=')) || '').split('=')[1] || '10', 10))
const KEY = process.env.KOFIC_API_KEY || ''
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ggswwptjbwvesjkowwsc.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_XRQiUZAforlq1XXAZytb0A_6CAkxx6t'

if (!KEY) {
  // 키가 없으면 실패가 아니라 건너뛴다 — 워크플로의 다른 단계까지 빨갛게 만들 일이 아니다
  console.log('KOFIC_API_KEY 가 없습니다 — 누적관객수 동기화를 건너뜁니다. (https://www.kobis.or.kr/kobisopenapi 에서 무료 발급)')
  process.exit(0)
}
if (APPLY && !SERVICE_KEY) { console.error('SUPABASE_SERVICE_KEY 가 필요합니다 (.env).'); process.exit(1) }

const sbKey = APPLY ? SERVICE_KEY : ANON_KEY
async function sb(pathAndQuery, init = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: sbKey, Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json', ...(init.headers || {}),
    },
  })
}

const BOX = 'https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json'
/** 한 날짜에 부르는 구분 — 전체 10편만 보면 작은 영화가 영영 안 잡힌다 */
const VARIANTS = [
  { label: '전체', params: {} },
  { label: '한국영화', params: { repNationCd: 'K' } },
  { label: '다양성', params: { multiMovieYn: 'Y' } },
]

/** KOFIC 집계는 하루 뒤에 나온다 — 오늘(KST)은 건너뛰고 어제부터 거슬러 올라간다 */
const kstNow = new Date(Date.now() + 9 * 3_600_000)
const targetDates = Array.from({ length: DAYS }, (_, i) => {
  const d = new Date(kstNow.getTime() - (i + 1) * 86_400_000)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
})

async function fetchDay(targetDt, params) {
  const url = new URL(BOX)
  url.searchParams.set('key', KEY)
  url.searchParams.set('targetDt', targetDt)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`KOFIC HTTP ${res.status}`)
  const json = await res.json()
  // 키가 틀리거나 한도를 넘으면 faultInfo 로 온다 (HTTP 는 200)
  if (json.faultInfo) throw new Error(`KOFIC ${json.faultInfo.errorCode || ''} ${json.faultInfo.message || ''}`.trim())
  return json.boxOfficeResult?.dailyBoxOfficeList ?? []
}

// ── 1) 박스오피스 수집 ──────────────────────────────────────
const lists = []
let calls = 0, failed = 0
for (const targetDt of targetDates) {
  for (const v of VARIANTS) {
    try {
      lists.push(await fetchDay(targetDt, v.params))
      calls++
    } catch (e) {
      failed++
      console.log(`  ✖ ${targetDt} ${v.label}: ${e.message}`)
      // 키 문제면 날짜를 더 돌아도 같은 실패다 — 바로 끊는다
      if (/key|키|인증|한도|초과/i.test(e.message)) { console.error('KOFIC 키 문제로 중단합니다.'); process.exit(1) }
    }
  }
}
const agg = mergeBoxOffice(lists)
console.log(`KOFIC ${targetDates.length}일 × ${VARIANTS.length}구분 = ${calls}회 조회(실패 ${failed}) → 영화 ${agg.size}편`)

// ── 2) 우리 영화 행 읽기 ────────────────────────────────────
const COLS = 'id,title,originalTitle,type,releaseDate,releaseYear,hidden,koficAudience,koficMovieCd'
const contents = []
for (let from = 0; ; from += 1000) {
  const res = await sb(`contents?select=${COLS}&type=eq.movie&order=id&limit=1000&offset=${from}`)
  if (!res.ok) {
    const body = await res.text()
    // 42703 = 없는 컬럼. 마이그레이션 전이다 — 워크플로를 실패로 만들지 않고 안내만 한다
    if (/42703|kofic/i.test(body)) {
      console.log('koficAudience 칸이 아직 없습니다 — supabase/migration_kofic.sql 을 SQL Editor 에서 먼저 실행하세요. (건너뜀)')
      process.exit(0)
    }
    throw new Error(`Supabase ${res.status} ${body}`)
  }
  const batch = await res.json()
  contents.push(...batch)
  if (batch.length < 1000) break
}

// ── 3) 매칭 → 반영 ──────────────────────────────────────────
const { updates, ambiguous, unmatched } = planUpdates(agg, contents)
const fmt = n => Number(n).toLocaleString('ko-KR')

for (const u of updates) {
  console.log(`  ${u.row.title} (${u.row.id}): ${u.from ? fmt(u.from) : '없음'} → ${fmt(u.kf.audiAcc)}명`)
}
for (const a of ambiguous) {
  console.log(`  ? '${a.kf.movieNm}'(${a.kf.openDt}) 후보 ${a.rows.length}개 — 동명이작 의심, 적지 않음: ${a.rows.map(r => r.id).join(', ')}`)
}

let saved = 0, saveFailed = 0
if (APPLY) {
  const now = new Date().toISOString()
  for (const u of updates) {
    const res = await sb(`contents?id=eq.${encodeURIComponent(u.row.id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ koficAudience: u.kf.audiAcc, koficMovieCd: u.kf.movieCd, koficUpdatedAt: now }),
    })
    if (res.ok) saved++
    else { saveFailed++; console.log(`  ✖ 저장 실패 ${u.row.id}: ${res.status} ${await res.text()}`) }
  }
}

console.log(`\n갱신 대상 ${updates.length}행${APPLY ? ` · 저장 ${saved} · 실패 ${saveFailed}` : ''} · 동명이작 보류 ${ambiguous.length} · 우리에게 없는 영화 ${unmatched.length}편`)
if (!APPLY) console.log('실제로 반영하려면: npm run kofic -- --apply')
