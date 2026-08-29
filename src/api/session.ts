/**
 * 세션 — 지금 보고 있는 사용자 정보의 로컬 캐시.
 *
 * 진짜 로그인 상태는 supabase 토큰(localStorage)이 갖고 있고, 이건 그걸 보고
 * authStore.init 이 채워 넣는 사본이다. 화면이 뜨기 전에 참조되는 곳들이 있어서 둔다.
 *
 * localStorage 를 쓰는 이유: 예전엔 sessionStorage 였는데 탭을 닫으면 날아가서,
 * 브라우저를 다시 열 때마다 init 이 끝날 때까지 게스트로 보였다.
 * 폰(PWA)은 앱을 껐다 켜는 게 곧 탭을 닫는 것이라 매번 그랬다.
 */
import type { User } from '@/types'

const KEY = 'bangjot_session'

export function setSession(user: User | null) {
  try {
    if (user) localStorage.setItem(KEY, JSON.stringify(user))
    else localStorage.removeItem(KEY)
  } catch { /* 사생활 보호 모드 등에서 쓰기 불가 — 캐시일 뿐이라 없어도 동작한다 */ }
}

export function getSession(): User | null {
  try {
    const raw = localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY)  // 옛 저장 위치 승계
    return JSON.parse(raw || 'null')
  } catch { return null }
}

export function currentUser(): User | null {
  return getSession()
}
