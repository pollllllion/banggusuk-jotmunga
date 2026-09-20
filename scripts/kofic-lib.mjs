/**
 * KOFIC(영화진흥위원회) 박스오피스 → 우리 작품 행 매칭 (순수 함수 — 네트워크 없음).
 * sync-kofic.mjs 가 이걸 써서 누적관객수를 어느 행에 적을지 정한다.
 * 테스트: scripts/__tests__/kofic-lib.test.mjs
 *
 * 왜 매칭이 필요한가: KOFIC 은 TMDB id 를 모른다. 양쪽을 잇는 건 **한국어 제목 + 연도**뿐이다.
 * 제목만으로 붙이면 동명이작에 엉뚱한 관객수가 붙는다(예: '기프트') — 그래서 연도가 맞는
 * 후보가 **정확히 하나일 때만** 적고, 둘 이상이면 사람에게 넘긴다(dedupe-lib 와 같은 태도).
 */
import { norm } from './dedupe-lib.mjs'

/** 이 행이 KOFIC 과 맞춰볼 대상인가 — 극장 개봉이 있는 건 영화뿐이다 */
export const isMovieRow = c => c?.type === 'movie' && !c.hidden

/** 행의 연도 후보들. releaseDate 는 OTT 공개일로 덮여 있을 수 있어 releaseYear 와 둘 다 본다 */
export function yearsOf(c) {
  const ys = []
  if (c?.releaseYear) ys.push(Number(c.releaseYear))
  if (c?.releaseDate) ys.push(Number(String(c.releaseDate).slice(0, 4)))
  return ys.filter(Number.isFinite)
}

/**
 * 제목 → 행들. 원제(originalTitle)로도 찾을 수 있게 같이 넣는다 —
 * KOFIC 은 한국 개봉명을 쓰지만 우리 title 이 원제로 남아 있는 행이 있다.
 */
export function buildIndex(contents) {
  const idx = new Map()
  const put = (key, row) => {
    if (!key) return
    const arr = idx.get(key)
    if (arr) { if (!arr.includes(row)) arr.push(row) } else idx.set(key, [row])
  }
  for (const c of contents) {
    if (!isMovieRow(c)) continue
    put(norm(c.title), c)
    put(norm(c.originalTitle), c)
  }
  return idx
}

/** KOFIC 개봉일(YYYY-MM-DD 또는 YYYYMMDD)의 연도. 없으면 null */
export function openYear(openDt) {
  const s = String(openDt ?? '').replace(/\D/g, '')
  return s.length >= 4 ? Number(s.slice(0, 4)) : null
}

/**
 * 박스오피스 한 줄을 어느 작품 행에 붙일지.
 *
 *   { row }            → 이 행에 적는다
 *   { ambiguous: [] }  → 제목은 맞는데 후보가 둘 이상 (동명이작 의심) — 적지 않는다
 *   null               → 우리에게 없는 영화
 *
 * 연도는 ±1 까지 본다. 12월 개봉작이 TMDB 에는 다음 해로 적혀 있는 일이 흔하고,
 * 재개봉작은 KOFIC 개봉일이 한참 뒤일 수 있다 — 그건 아래 재개봉 규칙에서 걸러진다.
 */
export function matchOne(kf, index) {
  const rows = index.get(norm(kf.movieNm))
  if (!rows || !rows.length) return null
  const ky = openYear(kf.openDt)
  // 연도를 모르면(KOFIC openDt 가 빈 값) 후보가 하나일 때만 인정한다
  if (ky == null) return rows.length === 1 ? { row: rows[0] } : { ambiguous: rows }
  const fit = rows.filter(r => {
    const ys = yearsOf(r)
    return ys.length ? ys.some(y => Math.abs(y - ky) <= 1) : false
  })
  if (fit.length === 1) return { row: fit[0] }
  if (fit.length > 1) return { ambiguous: fit }
  // 연도가 하나도 안 맞는다 — 연도가 아예 없는 행이 딱 하나면 그건 받아 준다
  const noYear = rows.filter(r => !yearsOf(r).length)
  if (noYear.length === 1) return { row: noYear[0] }
  return rows.length ? { ambiguous: rows } : null
}

/**
 * 여러 날·여러 구분(전체/한국영화/다양성)의 목록을 영화코드별로 합친다.
 * audiAcc(누적관객)는 날이 갈수록 오르므로 **가장 큰 값**이 최신이다.
 */
export function mergeBoxOffice(lists) {
  const by = new Map()
  for (const row of lists.flat()) {
    if (!row?.movieCd) continue
    const audi = Number(row.audiAcc)
    if (!Number.isFinite(audi) || audi <= 0) continue
    const prev = by.get(row.movieCd)
    if (!prev || audi > prev.audiAcc) {
      by.set(row.movieCd, { movieCd: row.movieCd, movieNm: row.movieNm, openDt: row.openDt || prev?.openDt || '', audiAcc: audi })
    }
  }
  return by
}

/**
 * 적을 것 고르기.
 *
 * 누적관객수는 줄지 않는다 — 더 작은 값이 나오면 그건 **다른 영화를 붙였다는 신호**다.
 * 같은 영화코드에서 값이 줄었을 리는 없으니(재개봉은 코드가 새로 나온다) 그대로 두고 넘긴다.
 */
export function planUpdates(agg, contents) {
  const index = buildIndex(contents)
  const updates = [], ambiguous = [], unmatched = []
  for (const kf of agg.values()) {
    const m = matchOne(kf, index)
    if (!m) { unmatched.push(kf); continue }
    if (m.ambiguous) { ambiguous.push({ kf, rows: m.ambiguous }); continue }
    const row = m.row
    const cur = Number(row.koficAudience ?? 0)
    const sameMovie = row.koficMovieCd === kf.movieCd
    if (sameMovie && kf.audiAcc <= cur) continue           // 이미 최신
    if (!sameMovie && cur > kf.audiAcc) continue           // 더 큰 값이 이미 있다 — 덮지 않는다
    updates.push({ row, kf, from: cur || null })
  }
  return { updates, ambiguous, unmatched }
}
