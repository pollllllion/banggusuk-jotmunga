/**
 * 활동 알림 웹푸시 발송 (Supabase Edge Function · Deno)
 * ------------------------------------------------------------
 * notifications 테이블에 행이 INSERT 되면 Database Webhook 이 이 함수를 부른다.
 * 받는 사람이 **폰 알림을 켜 뒀을 때만** 그 사람의 기기들로 웹푸시를 쏜다.
 *
 * 왜 이게 필요한가:
 *   알림 행은 "댓글 단 사람의 브라우저"가 만든다. 그 브라우저는 받는 사람의 기기에
 *   푸시를 쏠 수 없다(VAPID 비밀키가 서버에만 있어야 하므로 당연히). 그래서 DB 가
 *   행 생성을 감지해 서버 쪽에서 쏘는 이 함수가 필요하다.
 *
 * 역할 분담 (2026-09-09에 정한 것):
 *   종 아이콘(사이트 안)  — **항상** 뜬다. 설정과 무관하다.
 *   폰 푸시               — profiles 의 notifyComment/notifyReply/notifyLike 로 켜고 끈다.
 *   즉 이 함수가 그 스위치를 읽는 **유일한** 곳이다.
 *
 * 배포·연결 순서는 supabase/README-push.md 참고.
 *
 * 필요한 시크릿 (supabase secrets set)
 *   SERVICE_ROLE_KEY    profiles·push_subscriptions 를 RLS 우회로 읽기 위해
 *   VAPID_PRIVATE_KEY   푸시 서명
 *   VAPID_PUBLIC_KEY    (선택 · 없으면 아래 기본값)
 *   PUSH_HOOK_SECRET    웹훅이 보내는 X-Hook-Secret 과 대조 (아무나 못 부르게)
 */
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://ggswwptjbwvesjkowwsc.supabase.co'
const SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY') ?? ''
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')
  ?? 'BBIxyps5i-yTX9-Y1Xd9BS2UYL3CSmcXZK4sCa7Y0EoRiUI-tj3LcwWDANMam2-4DMBlEHtGY45Y8h2uGUo5TfA'
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const HOOK_SECRET = Deno.env.get('PUSH_HOOK_SECRET') ?? ''
const CONTACT = 'mailto:ottcal.help@gmail.com'

/** 알림 종류 → 그 종류를 켜고 끄는 profiles 컬럼.
 *  ⚠️ src/utils/notify.ts 의 wantsNotification 과 같은 규칙이다. 한쪽만 고치지 말 것. */
const PREF_COLUMN: Record<string, string> = {
  comment: 'notifyComment',
  reply: 'notifyReply',
  like: 'notifyLike',
  dislike: 'notifyLike',
}

/**
 * 웹훅 재시도·밀린 이벤트로 몇 시간 전 알림이 갑자기 울리는 걸 막는다.
 * 지난 일을 지금 알려 봐야 놀라기만 한다.
 */
const MAX_AGE_MS = 10 * 60 * 1000

type NotificationRow = {
  id: string
  userId: string
  type: string
  reviewId: string
  message: string
  createdAt: string
}

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`)
  const body = await res.text()
  return body ? JSON.parse(body) : null
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  // ── 아무나 못 부르게 ──────────────────────────────────────
  // 이 함수는 남의 기기로 알림을 쏠 수 있다. 시크릿이 설정돼 있으면 반드시 대조한다.
  if (HOOK_SECRET && req.headers.get('x-hook-secret') !== HOOK_SECRET) {
    return json(401, { error: 'bad hook secret' })
  }
  if (!SERVICE_KEY || !VAPID_PRIVATE) {
    console.error('[push-on-activity] 시크릿 누락 — SERVICE_ROLE_KEY / VAPID_PRIVATE_KEY')
    return json(500, { error: 'missing secrets' })
  }

  let record: NotificationRow
  try {
    const payload = await req.json()
    if (payload?.type !== 'INSERT' || payload?.table !== 'notifications') {
      return json(200, { skipped: 'not a notifications insert' })
    }
    record = payload.record
  } catch {
    return json(400, { error: 'bad payload' })
  }
  if (!record?.userId || !record?.type) return json(200, { skipped: 'incomplete record' })

  // 밀린 이벤트는 버린다
  const age = Date.now() - new Date(record.createdAt).getTime()
  if (Number.isFinite(age) && age > MAX_AGE_MS) {
    return json(200, { skipped: 'too old', ageMs: age })
  }

  try {
    // ── 받는 사람이 이 종류의 폰 알림을 켜 뒀나 ─────────────
    const col = PREF_COLUMN[record.type] ?? 'notifyComment'
    const profiles = await rest(`profiles?select=id,"${col}"&id=eq.${record.userId}`)
    const profile = profiles?.[0]
    if (!profile) return json(200, { skipped: 'no profile (유동닉이거나 탈퇴)' })
    // 컬럼이 없거나(마이그레이션 전) null 이면 켜진 것으로 본다 — 기본값이 true 다
    if (profile[col] === false) return json(200, { skipped: `${col} off` })

    // ── 그 사람의 기기들 ────────────────────────────────────
    const subs = await rest(`push_subscriptions?select=*&userId=eq.${record.userId}`)
    if (!subs?.length) return json(200, { skipped: 'no subscription' })

    webpush.setVapidDetails(CONTACT, VAPID_PUBLIC, VAPID_PRIVATE)

    const payload = JSON.stringify({
      title: '방구석좋문가',
      body: record.message,
      // 알림을 누르면 그 글로 간다. reviewId 는 토론글 id 다(옛 이름 그대로).
      url: record.reviewId ? `/talk/${record.reviewId}` : '/',
      // 같은 글의 알림이 여러 개 쌓이면 하나로 접힌다 — 폰이 도배되지 않게
      tag: `activity-${record.reviewId || record.id}`,
    })

    let ok = 0, fail = 0
    const dead: string[] = []
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        )
        ok++
      } catch (e: any) {
        fail++
        // 410 Gone / 404 = 앱을 지웠거나 구독 만료. 남겨두면 계속 실패한다.
        if (e?.statusCode === 410 || e?.statusCode === 404) dead.push(s.endpoint)
        else console.warn('[push-on-activity]', e?.statusCode ?? '', e?.message ?? e)
      }
    }

    for (const endpoint of dead) {
      await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' })
        .catch(() => {})
    }

    return json(200, { sent: ok, failed: fail, cleaned: dead.length })
  } catch (e) {
    // 500 을 주면 웹훅이 재시도한다 — 일시적 오류에는 그게 맞다.
    console.error('[push-on-activity]', e)
    return json(500, { error: String(e) })
  }
})
