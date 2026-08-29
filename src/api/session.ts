/**
 * 세션 — 지금 보고 있는 사용자 정보의 로컬 캐시.
 *
 * 진짜 로그인 상태는 supabase 토큰(localStorage)이 갖고 있고, 이건 그걸 보고
 * authStore.init 이 채워 넣는 사본이다. 화면이 뜨기 전에 참조되는 곳들이 있어서 둔다.
 *
 * 저장 위치는 토큰과 같은 규칙을 따른다("로그인 상태 유지" 체크 → authStorage).
 * 예전엔 무조건 sessionStorage 였는데 탭을 닫으면 날아가서, 브라우저를 다시 열 때마다
 * init 이 끝날 때까지 게스트로 보였다. 폰(PWA)은 앱을 껐다 켜는 게 곧 탭을 닫는 것이라 매번 그랬다.
 * 토큰만 남고 이 캐시가 없으면 화면이 잠깐 게스트로 깜빡이므로 둘을 같이 움직인다.
 */
import type { User } from '@/types'
import { authStorage } from '@/lib/authStorage'

const KEY = 'bangjot_session'

export function setSession(user: User | null) {
  if (user) authStorage.setItem(KEY, JSON.stringify(user))
  else authStorage.removeItem(KEY)
}

export function getSession(): User | null {
  try { return JSON.parse(authStorage.getItem(KEY) || 'null') }
  catch { return null }
}

export function currentUser(): User | null {
  return getSession()
}
