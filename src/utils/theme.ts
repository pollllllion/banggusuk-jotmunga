/**
 * 화면 테마 — 시스템 / 라이트 / 다크.
 *
 * 색은 전부 variables.css 의 토큰이 정한다. 여기서 하는 일은 <html> 에
 * data-theme 을 붙였다 떼는 것뿐이다:
 *   system → 속성 없음 (prefers-color-scheme 이 정한다)
 *   light  → data-theme="light"  (OS 가 다크여도 라이트로 고정)
 *   dark   → data-theme="dark"
 *
 * ⚠️ 첫 적용은 React 가 아니라 index.html 의 인라인 스크립트가 한다.
 *    번들이 실행될 때까지 기다리면 다크 사용자에게 흰 화면이 한 번 번쩍인다.
 *    저장 키('bangjot_theme')를 그쪽과 똑같이 써야 한다.
 */
export type Theme = 'system' | 'light' | 'dark'

export const THEME_KEY = 'bangjot_theme'

const THEMES: Theme[] = ['system', 'light', 'dark']

export function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && (THEMES as string[]).includes(v)
}

/** 저장된 선택. 없거나 이상하면 'system'. (사생활 보호 모드에서는 읽기 자체가 throw 한다) */
export function readTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    return isTheme(raw) ? raw : 'system'
  } catch {
    return 'system'
  }
}

/** <html> 에 반영 + 저장. 주소창/상태바 색(theme-color)도 같이 맞춘다. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)

  try { localStorage.setItem(THEME_KEY, theme) } catch { /* 저장 못 해도 이번 세션은 적용된다 */ }
  syncThemeColor()
}

/** 실제로 지금 어두운 화면인가 (system 이면 OS 설정을 본다) */
export function isDarkNow(): boolean {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark') return true
  if (attr === 'light') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

/**
 * <meta name="theme-color"> 를 지금 배경색에 맞춘다.
 * 안 맞추면 안드로이드 크롬 주소창·PWA 상태바만 흰색으로 남아 눈에 띈다.
 */
export function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', isDarkNow() ? '#131316' : '#FFFFFF')
}

/**
 * 'system' 인 동안 OS 설정이 바뀌면 theme-color 도 따라가야 한다.
 * (색 자체는 CSS 미디어쿼리가 알아서 바꾼다 — meta 태그만 JS 몫이다)
 * @returns 구독 해제 함수
 */
export function watchSystemTheme(onChange?: () => void): () => void {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!mq) return () => {}
  const handler = () => { syncThemeColor(); onChange?.() }
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
