/**
 * 검색어 → 우리 작품 짝짓기 — 관리자 통계(숏폼 비중)와 수집기(숏폼 기대작 점수)가 같이 쓴다
 *
 * 사람들은 작품명 뒤에 '평점·몇부작·기본정보' 같은 말을 붙이고, 띄어쓰기는 제멋대로다
 * ('수영부또라이에게찍혀버렸다' · '수영부 또라이'). 그래서 붙은 말을 떼고 공백·기호를 지운 뒤
 * 제목과 맞춘다. 제목 일부만 쳐도('옆집 재벌과의 하룻밤') 앞부분이 충분히 길면 같은 작품으로 본다.
 */

// 작품명 뒤(가끔 앞)에 붙는 검색 의도 — 실제 유입 검색어(2026-09)에서 뽑았다
const INTENT_WORDS = [
  '기본정보', '관람평', '몇부작', '출연진', '다시보기', '재밌나요', '방영일', '공개일', '줄거리',
  '넷플릭스', '평점', '리뷰', '후기', '결말', '평가', '배우', '정보', '언제', 'ott', '드라마', '영화',
  '애니메이션', '웹툰',
]
const INTENT_TAIL = new RegExp(`(${INTENT_WORDS.join('|')})$`)
const INTENT_HEAD = /^(영화|드라마|넷플릭스)/

/** 공백·기호를 지운 비교용 문자열 */
export function normTitle(s) {
  return String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '')
}

const SEASON_TAIL = /시즌\d+$|\d+기$|s0?\d+$/

/** 검색어에서 의도어만 뗀 것 (시즌 표기는 남긴다) */
function stripIntent(q) {
  let s = normTitle(q)
  for (let i = 0; i < 4; i++) {
    const next = s.replace(INTENT_TAIL, '').replace(INTENT_HEAD, '')
    if (next === s) break
    s = next
  }
  return s
}

/** 검색어에서 작품명 부분만 (의도어·시즌 표기를 뗀다) */
export function queryCore(q) {
  return stripIntent(stripIntent(q).replace(SEASON_TAIL, ''))
}

/**
 * 작품 목록으로 짝짓기 함수를 만든다.
 * 해외 시리즈는 DB 에 시즌 행('FBI 시즌9')만 있는 일이 많아서 시즌 행도 넣는다 —
 * '시즌9'를 붙여 찾으면 그 시즌에, 빼고 찾으면 같은 시리즈의 아무 행에나 붙는다.
 * @param contents { id, title, type, hidden?, seasonNumber? }[]
 * @returns (query) => 작품 | null
 */
export function buildQueryMatcher(contents) {
  const byTitle = new Map()
  const add = (t, c) => { if (t.length >= 2 && !byTitle.has(t)) byTitle.set(t, c) }
  // 시리즈 행이 먼저 자리를 잡게 — 시즌 행의 '시즌 뗀 제목'이 시리즈 행을 밀어내지 않도록
  const rows = contents.filter(c => !c.hidden)
  for (const c of rows) if (!c.seasonNumber) add(normTitle(c.title), c)
  for (const c of rows) if (c.seasonNumber) {
    add(normTitle(c.title), c)
    add(normTitle(c.title).replace(SEASON_TAIL, ''), c)
  }
  // 긴 제목부터 — 더 구체적인 쪽이 먼저 걸리게
  const list = [...byTitle].sort((a, b) => b[0].length - a[0].length)

  return function match(query) {
    const full = stripIntent(query)
    const core = queryCore(query)
    if (core.length < 3) return null
    const exact = byTitle.get(full) || byTitle.get(core)
    if (exact) return exact
    for (const [t, c] of list) {
      // 제목 앞부분만 친 경우 — 짧으면 엉뚱한 작품이 걸리니 5자 이상일 때만
      if (core.length >= 5 && t.startsWith(core)) return c
      // 제목 뒤에 우리가 모르는 말이 더 붙은 경우 — 제목이 4자 이상일 때만
      if (t.length >= 4 && core.startsWith(t)) return c
    }
    return null
  }
}
