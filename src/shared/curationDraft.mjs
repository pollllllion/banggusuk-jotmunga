/**
 * 캘린더 데이터로 큐레이션 초안 뽑기
 *
 * 자동으로 채우는 건 **사실뿐이다** — 기간에 걸리는 작품 목록, 제목, 요약.
 * 본문(body)과 작품별 코멘트(note)는 일부러 비워 둔다.
 * 자동 문장을 채워 넣으면 운영자가 그대로 발행하게 되고, 그건 정확히
 * 애드센스·구글이 '자동 생성된 얇은 콘텐츠'로 반려하는 형태다.
 * 발행 가드는 curationSeo.mjs 의 publishBlockers() 가 잡는다.
 */

import { effectiveReleaseDate } from './contentSeo.mjs'

/** 이 작품이 해당 OTT 로 공개되나 */
function hasProvider(c, providerName) {
  if (!providerName) return true
  return (c.providers || []).some(p => p.providerName === providerName)
}

/** 'YYYY-MM-DD' → '9월 3일' */
function fmtDay(d) {
  if (!d) return ''
  const [, m, day] = d.split('-')
  return `${Number(m)}월 ${Number(day)}일`
}

/** 월 단위 기간 — month 는 'YYYY-MM' */
export function monthRange(month) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

/** 주 단위 기간 — start 는 'YYYY-MM-DD' (그날부터 7일) */
export function weekRange(start) {
  const d = new Date(`${start}T00:00:00`)
  d.setDate(d.getDate() + 6)
  const to = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { from: start, to }
}

/** URL 로 쓸 수 있는 슬러그로 — 프리렌더 SAFE_ID(/^[A-Za-z0-9._~-]+$/) 를 만족해야 한다 */
export function slugify(s) {
  const out = String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return out || 'curation'
}

/**
 * 슬러그는 **한글 제목이 아니라 필터 값에서** 만든다.
 *
 * 표시용 제목("2026년 9월 넷플릭스 공개작 정리")을 slugify 하면 한글이 통째로 걸러져
 * `2026-9` 만 남는다 — 넷플릭스든 티빙이든 같은 슬러그가 되고, 중복 회피가 붙어
 * `/curation/2026-9-2` 같은 읽을 수 없는 URL 이 된다.
 * TMDB provider 이름(Netflix, Disney Plus)과 type 코드는 원래 ASCII 라 그대로 쓸 수 있다.
 *   월간 + 넷플릭스        → 2026-09-netflix
 *   주간 + 티빙 + 드라마   → 2026-09-28-tving-drama
 */
export function buildSlug({ mode = 'month', from, ottName = '', type = '' }) {
  const period = mode === 'week' ? from : String(from).slice(0, 7)
  return [period, ottName ? slugify(ottName) : '', type ? slugify(type) : '']
    .filter(Boolean).join('-')
}

/** 후보 한 편을 화면·코멘트 작성에 쓸 형태로 */
function toHint(c, rel) {
  return {
    contentId: c.id,
    title: c.title,
    type: c.type,
    posterUrl: c.posterUrl,
    rel,
    day: fmtDay(rel),
    genres: (c.genres || []).slice(0, 3).join('·'),
    creators: (c.creators || []).slice(0, 2).join('·'),
    providers: [...new Set((c.providers || []).map(p => p.providerName))].slice(0, 3).join('·'),
    popularity: Math.round(c.popularity || 0),
    voteAverage: c.voteAverage ?? null,
    voteCount: c.voteCount ?? 0,
  }
}

/**
 * 기간·필터에 걸리는 후보를 인기순으로 준다 — 어디까지나 **고르기 위한 목록**이다.
 *
 * 자동으로 상위 N 편을 집어넣던 걸 이걸로 대체했다. 인기 점수는 TMDB 값이라
 * "기대작"과 자주 어긋난다(시즌 25 예능이 신작 영화보다 높게 나오는 식).
 * 무엇을 실을지는 사람이 정하는 게 맞다.
 */
export function listCandidates({ contents, from, to, ottName = '', type = '', limit = 40 }) {
  return contents
    .filter(c => !c.hidden)
    .filter(c => !type || c.type === type)
    .filter(c => hasProvider(c, ottName))
    .map(c => ({ c, rel: effectiveReleaseDate(c) }))
    .filter(x => x.rel && x.rel >= from && x.rel <= to)
    .sort((a, b) => (b.c.popularity || 0) - (a.c.popularity || 0))
    .slice(0, limit)
    .map(x => toHint(x.c, x.rel))
}

/**
 * 초안 생성.
 *
 * @param contents    전체 작품 (앱 캐시의 목록 컬럼이면 충분)
 * @param from,to     'YYYY-MM-DD' 포함 구간
 * @param mode        'month' | 'week' — 슬러그를 만드는 데 쓴다
 * @param ottName     TMDB provider 이름 (예: 'Netflix'). 없으면 전체
 * @param ottLabel    화면 표기 (예: '넷플릭스')
 * @param type        'movie' | 'drama' | ... 없으면 전체
 * @param contentIds  실을 작품을 직접 고른 경우 그 id 들. 주면 이것만 싣는다.
 *                    (안 주면 인기 상위 limit 편 — 예전 동작)
 * @param limit       contentIds 를 안 줬을 때만 쓰는 상한
 */
export function buildDraft({ contents, from, to, mode = 'month', ottName = '', ottLabel = '', type = '', contentIds = /** @type {string[] | null} */ (null), limit = 12, periodLabel = '' }) {
  let picked
  if (contentIds && contentIds.length) {
    const want = new Set(contentIds)
    picked = contents
      .filter(c => want.has(c.id))
      .map(c => ({ c, rel: effectiveReleaseDate(c) }))
  } else {
    picked = contents
      .filter(c => !c.hidden)
      .filter(c => !type || c.type === type)
      .filter(c => hasProvider(c, ottName))
      .map(c => ({ c, rel: effectiveReleaseDate(c) }))
      .filter(x => x.rel && x.rel >= from && x.rel <= to)
      .sort((a, b) => (b.c.popularity || 0) - (a.c.popularity || 0))
      .slice(0, limit)
  }
  // 고르는 기준이 무엇이든, 글에서는 공개일 순으로 읽히는 게 자연스럽다
  picked = picked.sort((a, b) => String(a.rel || '').localeCompare(String(b.rel || '')))

  const label = periodLabel || `${from} ~ ${to}`
  const where = ottLabel ? `${ottLabel} ` : ''
  const title = `${label} ${where}공개작 정리`.replace(/\s+/g, ' ').trim()

  const names = picked.slice(0, 3).map(x => x.c.title)
  const summary = picked.length
    ? `${label}에 공개되는 ${where}작품 ${picked.length}편을 공개일 순으로 정리했습니다.`
      + (names.length ? ` ${names.join(', ')} 등.` : '')
    : ''

  return {
    id: buildSlug({ mode, from, ottName, type }),
    title,
    summary,
    // 본문·코멘트는 사람이 쓴다 (파일 상단 주석 참고)
    body: '',
    items: picked.map(x => ({ contentId: x.c.id, note: '' })),
    // 화면에서 코멘트 쓸 때 참고용으로만 쓰는 값 — 저장하지 않는다
    hints: picked.map(x => toHint(x.c, x.rel)),
  }
}
