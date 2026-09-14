/**
 * PWA 지원 유틸 — 서비스워커 등록 + 설치 상태 판별.
 *
 * 서비스워커는 dev 서버에선 등록하지 않는다. 캐시가 HMR 을 방해하고,
 * 한번 등록되면 localhost 에 남아 다음 작업까지 따라다닌다.
 */

/** 홈화면(또는 스토어 앱)에서 실행 중인가 */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    // iOS Safari 전용 플래그 — 표준 display-mode 를 안 쓴다
    || (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua)
    // 아이패드는 iPadOS 13+ 에서 맥으로 위장한다 — 터치 지원 여부로 가른다
    || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** 설치 기록을 계정에 남길 때 쓰는 기기 종류 */
export function devicePlatform(): 'ios' | 'android' | 'desktop' {
  if (isIos()) return 'ios'
  return /Android/i.test(navigator.userAgent) ? 'android' : 'desktop'
}

/** iOS 에서 '홈 화면에 추가'가 가능한 브라우저인가 (사파리 계열만 된다) */
export function isIosSafari(): boolean {
  if (!isIos()) return false
  const ua = navigator.userAgent
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Whale|NAVER|KAKAOTALK|Instagram|FBAV/i.test(ua)
}

/** 크롬 계열이 설치 가능해질 때 던지는 비표준 이벤트 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * beforeinstallprompt 는 React 가 마운트되기 전에 떠버리는 경우가 많다.
 * 그래서 이 모듈이 로드되는 즉시(= main.tsx 의 render 이전) 붙잡아 둔다.
 * 컴포넌트는 나중에 getInstallPrompt() 로 꺼내 쓴다.
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null
const promptListeners = new Set<(e: BeforeInstallPromptEvent | null) => void>()

/**
 * 이 기기에 앱을 깔았는가 — 브라우저 탭으로 들어왔을 때도 알아야 권유를 멈출 수 있다.
 * 설치된 앱 창과 브라우저는 저장소를 같이 쓴다. 그래서 앱으로 한 번 열리거나(standalone)
 * 설치 완료 이벤트가 오면 표시해 두고, 크롬이 다시 설치 권유 이벤트를 주면(= 지웠다) 지운다.
 */
const INSTALLED_KEY = 'pwa-installed'

function setInstalledMark(on: boolean) {
  try {
    if (on) localStorage.setItem(INSTALLED_KEY, '1')
    else localStorage.removeItem(INSTALLED_KEY)
  } catch { /* 사생활 보호 모드 */ }
}

export function wasInstalledHere(): boolean {
  try { return localStorage.getItem(INSTALLED_KEY) === '1' } catch { return false }
}

if (typeof window !== 'undefined') {
  if (isStandalone()) setInstalledMark(true)
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()   // 크롬 기본 미니바를 막고 우리 배너로 대체
    deferredPrompt = e as BeforeInstallPromptEvent
    // 크롬은 이미 설치된 앱에는 이 이벤트를 주지 않는다 — 왔다면 지웠거나 깐 적이 없다
    setInstalledMark(false)
    promptListeners.forEach(fn => fn(deferredPrompt))
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    setInstalledMark(true)
    promptListeners.forEach(fn => fn(null))
  })
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt
}

export function clearInstallPrompt() {
  deferredPrompt = null
}

/** 설치 프롬프트가 도착하거나 사라질 때 알림. 해제 함수를 돌려준다. */
export function onInstallPromptChange(fn: (e: BeforeInstallPromptEvent | null) => void): () => void {
  promptListeners.add(fn)
  return () => { promptListeners.delete(fn) }
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      // 등록 실패해도 앱은 그대로 동작해야 한다 (오프라인·설치 기능만 빠진다)
      console.warn('[pwa] 서비스워커 등록 실패', err)
    })
  })
}
