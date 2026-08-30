/**
 * 방구석좋문가 서비스워커 (PWA)
 * ------------------------------------------------------------
 * 이 앱은 정적 SPA + Supabase 다. 서버 렌더가 없으므로 프리캐시 목록을
 * 빌드 시점에 만들어 두지 않고, 런타임에 필요한 것만 골라 캐싱한다.
 * (dist 에는 프리렌더된 HTML 이 1,200개 넘게 있어서 통째 프리캐시는 손해다)
 *
 * 전략
 *   내비게이션(HTML)  : network-first → 캐시 → /offline.html
 *                       (프리렌더 HTML 이 자주 바뀌므로 항상 새 걸 먼저 본다)
 *   /assets/*         : cache-first  (파일명에 해시가 박혀 있어 영원히 안전)
 *   아이콘·로고        : cache-first
 *   TMDB 포스터        : cache-first + 개수 상한
 *   Supabase API      : 캐시하지 않음 (로그인 상태·최신 데이터가 걸려 있다)
 *
 * VERSION 을 올리면 옛 캐시가 activate 때 정리된다. 배포마다 올릴 필요는 없다
 * (HTML 은 network-first, 자산은 해시라 낡은 게 섞이지 않는다).
 */
const VERSION = 'v1'
const SHELL = `ottcal-shell-${VERSION}`
const ASSETS = `ottcal-assets-${VERSION}`
const PAGES = `ottcal-pages-${VERSION}`
const IMAGES = 'ottcal-images-v1'

const OFFLINE_URL = '/offline.html'
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/manifest.webmanifest']

const MAX_PAGES = 60
const MAX_IMAGES = 300
/**
 * 자산(해시 박힌 js·css)은 cache-first 라 안전하지만 상한이 없으면 배포할 때마다
 * 쌓인다 — 실측으로 한 브라우저에 번들 23개가 남아 있었다.
 * 삽입 순서 = 오래된 순이라, 방금 받은 현재 번들은 잘려나가지 않는다.
 */
const MAX_ASSETS = 40

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  const keep = new Set([SHELL, ASSETS, PAGES, IMAGES])
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/** 캐시가 무한정 커지지 않게 오래된 항목부터 잘라낸다 (insertion order = 오래된 순) */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= max) return
  await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)))
}

async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  // opaque(cors 없는 외부 이미지) 응답도 캐시해 둔다 — 재요청 비용이 크다
  if (res && (res.ok || res.type === 'opaque')) {
    await cache.put(request, res.clone())
    if (max) trim(cacheName, max)
  }
  return res
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES)
  try {
    const res = await fetch(request)
    if (res && res.ok) {
      await cache.put(request, res.clone())
      trim(PAGES, MAX_PAGES)
    }
    return res
  } catch {
    return (await cache.match(request))
      || (await cache.match('/'))
      || (await caches.match(OFFLINE_URL))
      || Response.error()
  }
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try { url = new URL(request.url) } catch { return }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  // Supabase(인증·데이터)는 절대 캐시하지 않는다
  if (url.hostname.endsWith('.supabase.co')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request))
    return
  }

  const sameOrigin = url.origin === self.location.origin

  if (sameOrigin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS, MAX_ASSETS))
    return
  }

  if (sameOrigin && /^\/(icons|logos)\//.test(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL))
    return
  }

  // TMDB 포스터·프로필 이미지
  if (url.hostname === 'image.tmdb.org') {
    event.respondWith(cacheFirst(request, IMAGES, MAX_IMAGES))
    return
  }
})

/* ── 웹푸시 (찜한 작품 공개 알림) ─────────────────────────────
   전송 백엔드는 아직 붙지 않았다. 핸들러를 미리 넣어 두면
   나중에 서버만 붙이면 되고, 앱 재설치를 요구하지 않아도 된다. */
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }

  const title = data.title || '방구석좋문가'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      image: data.image,
      tag: data.tag || 'ottcal',
      renotify: Boolean(data.tag),
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // 이미 열려 있는 창이 있으면 새 창을 띄우지 않고 그리로 보낸다
      for (const client of list) {
        if ('focus' in client) { client.focus(); if ('navigate' in client) client.navigate(target); return }
      }
      return self.clients.openWindow(target)
    }),
  )
})
