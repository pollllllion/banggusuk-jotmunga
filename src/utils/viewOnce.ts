/**
 * 조회수 중복 방지 — 같은 글은 **한 세션에 한 번만** 센다(그누보드·XE 기본값과 같은 기준).
 *
 * 세션 = 브라우저 탭을 열어 둔 동안(sessionStorage). 새로고침 연타·목록과 글을 오가는 걸로는
 * 안 오르고, 탭을 닫았다가 다시 들어오면 오른다 — 저녁에 댓글 보러 다시 온 건 진짜 재방문이다.
 *
 * '하루 1회'보다 느슨한 쪽을 고른 이유(2026-09-17): 조회수가 인기글 점수에 들어가긴 하지만
 * 지금은 방문자가 적어 순위를 조작할 사람도 이득도 없다. 조작이 실제로 보이면 그때
 * localStorage + 날짜 키로 조이면 된다.
 *
 * 서버에서 막지 않는 이유: 막으려면 IP 나 기기 식별값을 저장해야 하는데, 이 프로젝트는
 * 그걸 안 남기기로 했다(analytics.ts 머리 주석).
 *
 * 관리자는 여기를 거치지 않는다(호출부에서 건너뛴다) — 볼 때마다 오른다.
 */
const KEY = 'bj_viewed'

/** 저장 못 하는 환경(사생활 보호 모드)에서도 한 탭 안에서는 막히게 메모리에도 둔다 */
let mem: string[] | null = null

function load(): string[] {
  if (mem) return mem
  mem = []
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) || '[]')
    if (Array.isArray(raw)) mem = raw.filter((v: unknown): v is string => typeof v === 'string')
  } catch { /* 못 읽으면 빈 목록으로 시작 */ }
  return mem
}

/**
 * 이번 세션에 이 글을 처음 보는 거면 true 를 주고 봤다고 적어 둔다. 이미 봤으면 false.
 * @param key 글 종류까지 포함한 키 (예: 'd:<토론글 id>')
 */
export function firstViewThisSession(key: string): boolean {
  const ids = load()
  if (ids.includes(key)) return false
  ids.push(key)
  try { sessionStorage.setItem(KEY, JSON.stringify(ids)) } catch { /* 메모리 기록만으로 이번 탭은 막힌다 */ }
  return true
}
