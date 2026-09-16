/**
 * 글·댓글 검색의 매칭 규칙 — **헤더 검색창과 통합검색 화면(/search)이 같은 것을 쓴다.**
 * (게시판 안의 검색창은 그대로다 — 거기는 그 게시판만 보는 자리이고 작품명으로도 걸러야 해서
 *  하는 일이 다르다. 나중에 합친다면 이 파일이 그 자리다.)
 *
 * 작품 검색(searchContents)은 띄어쓰기를 지운 뒤 맞춰 본다 — "유퀴즈"로 '유 퀴즈 온 더 블럭'을
 * 찾아야 하기 때문이다. 글·댓글은 그렇게 하지 않는다: 사람이 쓴 문장이라 공백을 지우면
 * 말이 뭉개져 엉뚱한 자리에 걸린다("한 번" 과 "한번"은 같아도, "이 상황"과 "이상"은 다르다).
 * 그래서 여기서는 **쓴 그대로 소문자 substring** 으로만 찾는다.
 */

/** 검색어가 글의 어디에 맞았나 — 큰 값이 먼저 온다. 0 이면 안 맞은 것. */
export const SCORE = {
  /** 제목이 검색어 그 자체 */
  titleExact: 100,
  /** 제목이 검색어로 시작 */
  titlePrefix: 80,
  /** 제목 안에 있음 */
  titleIncludes: 60,
  /** 본문에만 있음 */
  bodyIncludes: 30,
} as const

/**
 * 제목·본문에 대고 점수를 매긴다. 제목이 본문보다 늘 앞선다 —
 * 목록에서 사람이 먼저 읽는 것이 제목이고, 제목에 든 말이 그 글의 주제일 확률이 높다.
 */
export function scorePost(query: string, title: string | null | undefined, body: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const t = (title || '').toLowerCase()
  if (t) {
    if (t === q) return SCORE.titleExact
    if (t.startsWith(q)) return SCORE.titlePrefix
    if (t.includes(q)) return SCORE.titleIncludes
  }
  return (body || '').toLowerCase().includes(q) ? SCORE.bodyIncludes : 0
}

/**
 * 검색어가 나온 자리를 앞뒤로 잘라 보여 준다 — 긴 글에서 **왜 이게 걸렸는지**를 알려주는 조각.
 * 앞에서부터 잘라 버리면 검색어가 잘린 뒤쪽에 있을 때 화면에 안 나와, 사람이 보기엔
 * 엉뚱한 글이 올라온 것처럼 보인다.
 *
 * @param radius 검색어 좌우로 남길 글자 수
 */
export function snippet(text: string, query: string, radius = 30): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  const q = query.trim().toLowerCase()
  const max = radius * 2 + q.length
  if (!q || clean.length <= max) return clean

  const at = clean.toLowerCase().indexOf(q)
  if (at < 0) return clean.slice(0, max) + '…'

  const from = Math.max(0, at - radius)
  const to = Math.min(clean.length, at + q.length + radius)
  return (from > 0 ? '…' : '') + clean.slice(from, to) + (to < clean.length ? '…' : '')
}
