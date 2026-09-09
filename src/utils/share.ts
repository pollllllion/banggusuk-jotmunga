/**
 * 공유 — 글·작품·캘린더 링크를 남에게 보내는 길.
 *
 * 두 갈래다:
 *   폰(웹 공유 API 있음) → OS 공유 시트(카톡·메시지·복사…)
 *   PC(없음)             → 주소를 클립보드로 복사 + 토스트
 *
 * 주소는 항상 **절대 주소**여야 한다. 상대 경로를 복사해 주면 붙여넣은 쪽에서
 * 아무 데도 안 간다. SITE_URL 을 쓰는 이유는 프리렌더·OG 태그가 그 도메인 기준이라
 * 카톡 미리보기가 같은 주소로 잡히기 때문이다.
 */
import { SITE_URL } from '@/utils/seo'

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

/** '/talk/123' → 'https://ottcal.com/talk/123' */
export function absoluteUrl(path: string): string {
  const base = SITE_URL.replace(/\/+$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

/** 이 브라우저가 OS 공유 시트를 쓸 수 있나 (대부분 모바일) */
export function canUseWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/**
 * 클립보드 복사.
 * navigator.clipboard 는 https(보안 컨텍스트)에서만 있고 권한이 거절될 수도 있어서,
 * 실패하면 숨긴 textarea + execCommand 로 한 번 더 시도한다(옛 사파리·웹뷰).
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* 아래 폴백으로 */ }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    // 화면 밖으로 빼되 focus 는 가능해야 한다 — display:none 이면 선택이 안 된다
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/**
 * 공유하기. 공유 시트를 띄우거나, 없으면 주소를 복사한다.
 *
 * 사용자가 공유 시트를 그냥 닫은 경우(AbortError)는 실패가 아니다 —
 * "복사했어요" 토스트를 띄우면 하지도 않은 일을 했다고 말하는 셈이다.
 */
export async function shareOrCopy(opts: { path: string; title?: string; text?: string }): Promise<ShareResult> {
  const url = absoluteUrl(opts.path)

  if (canUseWebShare()) {
    try {
      await navigator.share({ url, title: opts.title, text: opts.text })
      return 'shared'
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelled'
      // 공유 시트가 못 뜬 경우(권한·제스처 문제)는 복사로 물러난다
    }
  }

  return (await copyText(url)) ? 'copied' : 'failed'
}

/** 결과 → 사용자에게 보여줄 말. cancelled 는 아무 말도 하지 않는다(null). */
export function shareMessage(result: ShareResult): string | null {
  if (result === 'copied') return '링크를 복사했어요.'
  if (result === 'failed') return '링크를 복사하지 못했어요. 주소창에서 직접 복사해주세요.'
  return null   // shared: OS 가 이미 알려준다 · cancelled: 사용자가 그만둔 것
}
