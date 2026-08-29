/**
 * 웹푸시 구독 — 찜한 작품의 공개일 알림
 *
 * 구독 정보는 push_subscriptions 테이블에 저장하고,
 * 실제 발송은 scripts/send-release-push.mjs (GitHub Actions 일일 크론) 가 한다.
 *
 * VAPID 공개키는 이름 그대로 공개값이라 코드에 있어도 안전하다.
 * 비밀키는 절대 프런트에 들어가지 않는다(.env / GitHub Secrets 전용).
 */
import { supabase } from '@/lib/supabaseClient'

const DEFAULT_VAPID_PUBLIC = 'BBIxyps5i-yTX9-Y1Xd9BS2UYL3CSmcXZK4sCa7Y0EoRiUI-tj3LcwWDANMam2-4DMBlEHtGY45Y8h2uGUo5TfA'
const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || DEFAULT_VAPID_PUBLIC

export type PushState = 'unsupported' | 'default' | 'denied' | 'on'

/**
 * base64url(VAPID 공개키) → PushManager 가 요구하는 Uint8Array.
 *
 * 버퍼를 명시적으로 만들어 `Uint8Array<ArrayBuffer>` 로 좁힌다.
 * `new Uint8Array(길이)` 는 `Uint8Array<ArrayBufferLike>` 라 SharedArrayBuffer 도
 * 포함되는데, applicationServerKey 가 받는 BufferSource 는 그걸 안 받는다.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** ArrayBuffer → base64url (서버가 web-push 로 복호화할 때 쓰는 형식) */
function bufToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return ''
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

/** 현재 이 기기의 구독 상태 */
export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'default'
}

/**
 * 알림 켜기. 권한 요청 → 구독 → DB 저장.
 * 실패하면 사람이 읽을 수 있는 메시지를 담아 throw 한다.
 */
export async function enablePush(userId: string): Promise<void> {
  if (!pushSupported()) throw new Error('이 브라우저는 알림을 지원하지 않아요.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? '브라우저에서 알림이 차단돼 있어요. 주소창 옆 자물쇠에서 허용으로 바꿔주세요.'
      : '알림 권한이 필요해요.')
  }

  const reg = await navigator.serviceWorker.ready
  // 이미 구독돼 있으면 그대로 쓴다 (재구독하면 endpoint 가 바뀌어 행이 늘어난다)
  const sub = await reg.pushManager.getSubscription()
    || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    })

  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: sub.endpoint,
    userId,
    p256dh: bufToBase64Url(sub.getKey('p256dh')),
    auth: bufToBase64Url(sub.getKey('auth')),
    userAgent: navigator.userAgent.slice(0, 200),
    failCount: 0,
  }, { onConflict: 'endpoint' })

  if (error) {
    // DB 에 못 넣었으면 구독만 남아 있어봤자 발송이 안 된다 — 되돌린다
    await sub.unsubscribe().catch(() => {})
    throw new Error('알림 등록에 실패했어요. 잠시 후 다시 시도해주세요.')
  }
}

/** 알림 끄기. 이 기기의 구독만 해제한다. */
export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe().catch(() => {})
}
