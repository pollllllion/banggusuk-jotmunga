/**
 * 읽은 글 표시 — 한 번 연 글은 목록에서 흐린 보라색으로 보인다(디시·클리앙과 같은 방식).
 *
 * 서버에 둘 값이 아니다. 기기마다 다르고 유동닉도 쓰는 기능이라 계정에 묶을 수 없다.
 * 그래서 localStorage 에만 남긴다 — 지워져도 "읽은 표시가 사라진다" 뿐이라 해가 없다.
 *
 * 목록 행은 <a> 가 아니라 div + onClick 이라 :visited 를 쓸 수 없다. 그게 이 파일이 있는 이유다.
 */
const KEY = 'bj_read_posts'
/** 오래된 것부터 버린다. 글 id 36자 × 600 ≈ 22KB — localStorage 한도(보통 5MB)에 한참 못 미친다 */
const LIMIT = 600

/** 매번 JSON.parse 하지 않으려고 한 번만 읽어 둔다. 탭 하나 안에서는 이 값이 곧 진실이다 */
let cache: string[] | null = null

function load(): string[] {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    cache = Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : []
  } catch {
    cache = []   // 사생활 보호 모드 등으로 못 읽어도 이번 세션은 그냥 굴러간다
  }
  return cache
}

export function isPostRead(id: string): boolean {
  return load().includes(id)
}

export function markPostRead(id: string): void {
  const list = load()
  if (list.includes(id)) return
  list.push(id)
  if (list.length > LIMIT) list.splice(0, list.length - LIMIT)
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* 저장 못 해도 화면은 맞다 */ }
}
