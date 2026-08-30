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
 * 초안 생성.
 *
 * @param contents  전체 작품 (앱 캐시의 목록 컬럼이면 충분)
 * @param from,to   'YYYY-MM-DD' 포함 구간
 * @param ottName   TMDB provider 이름 (예: 'Netflix'). 없으면 전체
 * @param ottLabel  화면 표기 (예: '넷플릭스')
 * @param type      'movie' | 'drama' | 'variety' | ... 없으면 전체
 * @param limit     최대 편수
 */
export function buildDraft({ contents, from, to, ottName = '', ottLabel = '', type = '', limit = 12, periodLabel = '' }) {
  const picked = contents
    .filter(c => !c.hidden)
    .filter(c => !type || c.type === type)
    .filter(c => hasProvider(c, ottName))
    .map(c => ({ c, rel: effectiveReleaseDate(c) }))
    .filter(x => x.rel && x.rel >= from && x.rel <= to)
    .sort((a, b) => (b.c.popularity || 0) - (a.c.popularity || 0))
    .slice(0, limit)
    // 글에서는 공개일 순으로 읽히는 게 자연스럽다 (고르는 건 인기순, 싣는 건 날짜순)
    .sort((a, b) => a.rel.localeCompare(b.rel))

  const label = periodLabel || `${from} ~ ${to}`
  const where = ottLabel ? `${ottLabel} ` : ''
  const title = `${label} ${where}공개작 정리`.replace(/\s+/g, ' ').trim()

  const names = picked.slice(0, 3).map(x => x.c.title)
  const summary = picked.length
    ? `${label}에 공개되는 ${where}작품 ${picked.length}편을 공개일 순으로 정리했습니다.`
      + (names.length ? ` ${names.join(', ')} 등.` : '')
    : ''

  return {
    id: slugify(`${label}-${ottLabel || 'all'}`),
    title,
    summary,
    // 본문·코멘트는 사람이 쓴다 (위 주석 참고)
    body: '',
    items: picked.map(x => ({ contentId: x.c.id, note: '' })),
    // 화면에서 코멘트 쓸 때 참고용으로만 쓰는 값 — 저장하지 않는다
    hints: picked.map(x => ({
      contentId: x.c.id,
      title: x.c.title,
      posterUrl: x.c.posterUrl,
      day: fmtDay(x.rel),
      genres: (x.c.genres || []).slice(0, 3).join('·'),
      creators: (x.c.creators || []).slice(0, 2).join('·'),
      providers: [...new Set((x.c.providers || []).map(p => p.providerName))].slice(0, 3).join('·'),
    })),
  }
}
