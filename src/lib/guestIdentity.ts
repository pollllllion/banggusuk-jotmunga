/**
 * 유동닉(게스트) 신원 — **이 브라우저에만 산다.**
 *
 * 예전에는 방문자마다 users 테이블에 행을 하나씩 만들었다. 그 결과 2026-09-09 기준
 * 5,971행이 쌓였는데, 글·댓글이 실제로 참조하는 건 그중 **1행**뿐이었다. 나머지는
 * "들어왔다 나간 사람" 기록이고, users 는 RLS 가 `for all using (true)` 라
 * 누구든 anon 키 하나로 그 5,971행을 통째로 고치거나 지울 수 있었다.
 * (지우면 옛 글의 작성자 표시가 깨진다)
 *
 * 유동닉 글은 guestName 을 글 행에 직접 들고 있어서 이 테이블이 없어도 이름이 보인다.
 * 그래서 신원을 localStorage 로 옮기고, users 테이블은 옛 행을 **읽기만** 한다.
 *
 * localStorage 는 사생활 보호 모드 등에서 접근 자체가 throw 한다 —
 * 모든 접근을 감싸고, 실패하면 "저장 못 하는 브라우저"로 취급해 그 세션만 쓰고 버린다.
 */
import { uuid } from '@/utils/helpers'

export type GuestIdentity = { id: string; nickname: string; createdAt: string }

/** 신원 전체를 담는 새 키 */
const GUEST_KEY = 'bangjot_guest'
/** id 만 담던 옛 키. 그 시절 게스트는 users 테이블에 행이 있다 — 승계용으로 계속 읽는다. */
const LEGACY_ID_KEY = 'bangjot_anon_id'

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* 저장 못 하면 이 세션만 쓰고 버린다 */ }
}

export function readGuest(): GuestIdentity | null {
  const raw = read(GUEST_KEY)
  if (!raw) return null
  try {
    const g = JSON.parse(raw)
    if (g && typeof g.id === 'string' && g.id) {
      return { id: g.id, nickname: String(g.nickname || ''), createdAt: String(g.createdAt || new Date().toISOString()) }
    }
  } catch { /* 깨진 값이면 새로 만든다 */ }
  return null
}

export function writeGuest(g: GuestIdentity) {
  write(GUEST_KEY, JSON.stringify(g))
}

/** 옛 키에 남아 있는 게스트 id — 있으면 그 id 를 그대로 이어받아야 옛 글과 연결이 끊기지 않는다. */
export function readLegacyGuestId(): string | null {
  return read(LEGACY_ID_KEY)
}

export function makeGuest(id?: string): GuestIdentity {
  return {
    id: id || uuid(),
    nickname: '방문객' + Math.floor(1000 + Math.random() * 9000),
    createdAt: new Date().toISOString(),
  }
}

/** 게스트 신원 지우기 (유동닉 '탈퇴') — 옛 키까지 함께 지운다 */
export function clearGuest() {
  try {
    localStorage.removeItem(GUEST_KEY)
    localStorage.removeItem(LEGACY_ID_KEY)
  } catch { /* 지울 수 없으면 그대로 둔다 */ }
}
