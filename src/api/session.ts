/** 세션 (브라우저 로컬 sessionStorage) — 현재 보고 있는 사용자 정보 캐시 */
import type { User } from '@/types'

export function setSession(user: User | null) {
  if (user) sessionStorage.setItem('bangjot_session', JSON.stringify(user))
  else sessionStorage.removeItem('bangjot_session')
}

export function getSession(): User | null {
  try { return JSON.parse(sessionStorage.getItem('bangjot_session') || 'null') }
  catch { return null }
}

export function currentUser(): User | null {
  return getSession()
}
