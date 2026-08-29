/**
 * 공개일 알림 발송 (웹푸시)
 * ------------------------------------------------------------
 * 오늘(KST) 공개·개봉하는 작품에 공개알림을 켜 둔 사람에게 푸시를 보낸다.
 * 대상은 content_alerts 다 — 찜(bookmarks)은 저장일 뿐 알림과 무관하다.
 * GitHub Actions 일일 크론에서 돈다. 서비스 키를 쓰므로 RLS 를 우회한다.
 *
 *   node scripts/send-release-push.mjs           # 실제 발송
 *   node scripts/send-release-push.mjs --dry     # 대상만 출력
 *   node scripts/send-release-push.mjs --date=2026-09-01
 *
 * 필요한 환경변수
 *   SUPABASE_SERVICE_KEY   (secret)
 *   VAPID_PRIVATE_KEY      (secret)
 *   VITE_VAPID_PUBLIC_KEY  (공개값. 없으면 아래 기본값)
 *
 * 중복 발송은 push_sent 테이블로 막는다 (userId, contentId, kind 유일).
 */
import webpush from 'web-push'
import './db.mjs'   // .env 로드 (부수효과만 쓴다)

const DRY = process.argv.includes('--dry')
const dateArg = process.argv.find(a => a.startsWith('--date='))?.slice(7)

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  || 'https://ggswwptjbwvesjkowwsc.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const VAPID_PUBLIC = process.env.VITE_VAPID_PUBLIC_KEY
  || 'BBIxyps5i-yTX9-Y1Xd9BS2UYL3CSmcXZK4sCa7Y0EoRiUI-tj3LcwWDANMam2-4DMBlEHtGY45Y8h2uGUo5TfA'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
const SITE_URL = 'https://ottcal.com'
const CONTACT = 'mailto:copyright@bangjot.kr'

if (!SERVICE_KEY) { console.error('SUPABASE_SERVICE_KEY 가 없습니다.'); process.exit(1) }
if (!DRY && !VAPID_PRIVATE) { console.error('VAPID_PRIVATE_KEY 가 없습니다.'); process.exit(1) }

/** 한국 시간 기준 오늘 YYYY-MM-DD (러너는 UTC 라 그대로 쓰면 하루 어긋난다) */
function todayKst() {
  const kst = new Date(Date.now() + 9 * 3600_000)
  return kst.toISOString().slice(0, 10)
}

const TODAY = dateArg || todayKst()

async function rest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`)
  // PostgREST 는 return=minimal 인 INSERT 에 201 을 본문 없이 준다.
  // 204 만 걸러내면 push_sent 기록에서 JSON 파싱이 터지고, 이력이 안 남아 다음날 또 보낸다.
  const body = await res.text()
  return body ? JSON.parse(body) : null
}

/** in.(...) 필터는 URL 길이 제한이 있어 잘라서 부른다 */
async function fetchIn(table, select, column, values, extra = '') {
  const out = []
  for (let i = 0; i < values.length; i += 100) {
    const chunk = values.slice(i, i + 100).map(v => `"${v}"`).join(',')
    out.push(...await rest(`${table}?select=${select}&${column}=in.(${chunk})${extra}`))
  }
  return out
}

const TYPE_LABEL = { movie: '영화', drama: '드라마', variety: '예능', webtoon: '웹툰', webnovel: '웹소설' }

async function main() {
  // 1) 오늘 공개하는 작품 — 수동 지정일(manualOverride)이 있으면 그게 우선이다
  const cols = 'id,title,type,platform,posterUrl,releaseDate,manualReleaseDate,manualOverride,hidden'
  const [byRelease, byManual] = await Promise.all([
    rest(`contents?select=${cols}&releaseDate=eq.${TODAY}`),
    rest(`contents?select=${cols}&manualReleaseDate=eq.${TODAY}&manualOverride=is.true`),
  ])

  const map = new Map()
  for (const c of [...byRelease, ...byManual]) {
    if (c.hidden) continue
    // 수동 지정이 다른 날짜를 가리키면 오늘이 아니다
    const effective = c.manualOverride && c.manualReleaseDate ? c.manualReleaseDate : c.releaseDate
    if (effective !== TODAY) continue
    map.set(c.id, c)
  }
  const contents = [...map.values()]
  console.log(`[push] ${TODAY} 공개 작품 ${contents.length}편`)
  if (!contents.length) return

  // 2) 그 작품에 공개알림을 켠 사람
  const alerts = await fetchIn('content_alerts', '"userId","contentId"', 'contentId', contents.map(c => c.id))
  if (!alerts.length) { console.log('[push] 알림 켠 사람 없음'); return }

  // 3) 이미 보낸 건 제외
  const sent = await fetchIn('push_sent', '"userId","contentId"', 'contentId', contents.map(c => c.id), '&kind=eq.release')
  const sentKey = new Set(sent.map(s => `${s.userId}|${s.contentId}`))
  const targets = alerts.filter(a => !sentKey.has(`${a.userId}|${a.contentId}`))
  console.log(`[push] 알림 ${alerts.length}건 중 미발송 ${targets.length}건`)
  if (!targets.length) return

  // 4) 대상자들의 구독
  const userIds = [...new Set(targets.map(t => t.userId))]
  const subs = await fetchIn('push_subscriptions', '*', 'userId', userIds)
  const subsByUser = new Map()
  for (const s of subs) {
    if (!subsByUser.has(s.userId)) subsByUser.set(s.userId, [])
    subsByUser.get(s.userId).push(s)
  }
  console.log(`[push] 푸시 구독 있는 사람 ${subsByUser.size}명 / 기기 ${subs.length}대`)

  if (DRY) {
    for (const t of targets) {
      const c = map.get(t.contentId)
      const n = subsByUser.get(t.userId)?.length || 0
      console.log(`  - ${t.userId.slice(0, 8)}… ← ${c.title} (기기 ${n}대)`)
    }
    console.log('[push] --dry 라 실제 발송은 안 했습니다.')
    return
  }

  webpush.setVapidDetails(CONTACT, VAPID_PUBLIC, VAPID_PRIVATE)

  const dead = []      // 만료된 구독(410/404) — 정리 대상
  const done = []      // 발송 성공 (userId, contentId)
  let ok = 0, fail = 0

  for (const t of targets) {
    const c = map.get(t.contentId)
    const userSubs = subsByUser.get(t.userId) || []
    if (!userSubs.length) continue

    const payload = JSON.stringify({
      title: `오늘 공개! ${c.title}`,
      body: `${TYPE_LABEL[c.type] || c.type}${c.platform ? ` · ${c.platform}` : ''} · 알림 신청한 작품이 오늘 공개돼요.`,
      url: `/content/${c.id}`,
      image: c.posterUrl || undefined,
      tag: `release-${c.id}`,
    })

    let anyOk = false
    for (const s of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        )
        anyOk = true; ok++
      } catch (e) {
        fail++
        // 410 Gone / 404 = 사용자가 앱을 지웠거나 구독이 만료됐다. 남겨두면 매일 실패한다.
        if (e.statusCode === 410 || e.statusCode === 404) dead.push(s.endpoint)
        else console.warn(`  ! ${c.title} → ${e.statusCode || ''} ${e.message}`)
      }
    }
    if (anyOk) done.push({ userId: t.userId, contentId: t.contentId, kind: 'release' })
  }

  // 5) 이력 기록 — 여기서 실패하면 내일 다시 보내게 되므로 로그를 남긴다
  if (done.length) {
    try {
      await rest('push_sent', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify(done),
      })
    } catch (e) {
      console.error('[push] 발송 이력 기록 실패 — 내일 중복 발송될 수 있음:', e.message)
    }
  }

  // 6) 죽은 구독 정리
  for (const endpoint of dead) {
    await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' })
      .catch(() => {})
  }

  console.log(`[push] 발송 ${ok}건 성공 / ${fail}건 실패 · 만료 구독 ${dead.length}개 정리`)
}

main().catch(e => { console.error(e); process.exit(1) })
