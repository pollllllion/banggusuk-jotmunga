/**
 * 중복 작품 판정 로직 (순수 함수 — 네트워크 없음).
 * merge-dups.mjs 가 이걸 써서 병합 계획을 세운다. 테스트: scripts/__tests__/dedupe-lib.test.mjs
 *
 * 핵심 원칙: "제목이 같다"만으로는 병합하지 않는다. 동명이작(예: '기프트' — 야구
 * 코치물 vs 휠체어 럭비물)이 실제로 있으므로, 같은 작품이라는 근거가 있을 때만
 * 자동 병합하고 애매하면 review 로 빼서 사람에게 넘긴다.
 */

/** src/utils/helpers.ts 의 normalizeTitle 과 같은 규칙 (공백·문장부호 무시) */
export const norm = s => (s || '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()

/** 메타데이터 충실도 — 어느 행을 남길지 고를 때의 보조 기준 */
export const richness = c =>
  (c.posterUrl ? 3 : 0) + (c.synopsis ? 1 : 0) +
  (c.castMembers?.length ? 2 : 0) + (c.creators?.length ? 1 : 0) +
  (c.genres?.length ? 1 : 0) + (c.providers?.length ? 1 : 0) +
  (c.networks?.length ? 1 : 0) + (c.releaseDate ? 2 : 0)

/** 남길 행 우선순위: 숨김 아님 > 공개일 있음 > TMDB 행 > 메타 충실 > 화제도 */
export const keepScore = c =>
  (c.hidden ? 0 : 1000) + (c.releaseDate ? 200 : 0) + (c.tmdbId ? 100 : 0) +
  richness(c) * 5 + Math.min(c.popularity ?? 0, 50)

const yearOf = c => c.releaseYear ?? (c.releaseDate ? +c.releaseDate.slice(0, 4) : null)

/**
 * 아무 정보도 없는 빈 껍데기 행 — 포스터·줄거리·공개일·연도·회차가 전부 비었고 화제도 0.
 * TMDB에 잘못 올라온 유령 항목(예: '킬러들의 쇼핑몰' tv/329791 — 방영일·회차·줄거리 없음)을
 * 사용자가 본 작품 등록에서 골라 버리면 이런 행이 생긴다. 동명이작이라는 근거가 될 만한
 * 정보가 하나도 없으므로 같은 제목의 제대로 된 행에 합친다(사용자 링크는 그대로 이전).
 */
export const isStub = c =>
  !c.posterUrl && !c.synopsis && !c.releaseDate && !c.releaseYear &&
  !c.numberOfEpisodes && !(c.popularity > 0)

/**
 * 같은 작품이라고 볼 근거가 있으면 그 사유 문자열, 없으면 null.
 *  - b(삭제될 쪽)가 빈 껍데기면 → 판정 정보가 없으므로 남는 행에 흡수
 *  - 같은 tmdbId → 확실
 *  - 둘 다 TMDB인데 id가 다르면 → 줄거리 앞부분 또는 (공개일+회차)가 일치할 때만
 *    (TMDB에 같은 작품이 두 번 올라온 케이스는 잡고, 동명이작은 거른다)
 *  - 한쪽이 TMDB 이전의 수기·시드 행이면 → 카탈로그 중복으로 간주.
 *    단 양쪽에 연도가 다 있고 2년 이상 벌어지면 보류.
 */
export function sameWork(a, b) {
  if (isStub(b)) return '빈 껍데기 행'
  if (a.tmdbId && b.tmdbId) {
    if (a.tmdbId === b.tmdbId) return '같은 tmdbId'
    const synA = norm(a.synopsis).slice(0, 40), synB = norm(b.synopsis).slice(0, 40)
    if (synA && synA === synB) return '줄거리 동일'
    if (a.releaseDate && a.releaseDate === b.releaseDate &&
        a.numberOfEpisodes && a.numberOfEpisodes === b.numberOfEpisodes) return '공개일·회차 동일'
    return null
  }
  if (a.id.startsWith('tmdb-') && b.id.startsWith('tmdb-')) {
    // 둘 다 TMDB 행인데 tmdbId 가 비어 있는 옛 행 — id 안의 숫자가 같으면 같은 작품
    const idNum = x => x.id.match(/(\d+)$/)?.[1]
    if (idNum(a) && idNum(a) === idNum(b)) return '같은 TMDB id(행 id 기준)'
    return null
  }
  const ya = yearOf(a), yb = yearOf(b)
  if (ya && yb && Math.abs(ya - yb) > 1) return null
  return '수기·시드 행과 TMDB 행 중복'
}

/**
 * 전체 작품 목록 → { plan, review, groups }
 *   plan:   자동 병합할 { from, into, label, why } 목록 (from 이 삭제됨)
 *   review: 동명이작 가능성이 있어 사람이 봐야 할 그룹
 */
export function planMerges(contents) {
  const groups = new Map()
  for (const c of contents) {
    const k = c.type + '|' + norm(c.title)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(c)
  }
  const plan = [], review = []
  let dupGroups = 0
  for (const rows of groups.values()) {
    if (rows.length < 2) continue
    dupGroups++
    const sorted = [...rows].sort((a, b) => keepScore(b) - keepScore(a))
    const keep = sorted[0]
    for (const c of sorted.slice(1)) {
      const why = sameWork(keep, c)
      if (why) plan.push({ from: c.id, into: keep.id, label: keep.title, why })
      else review.push({ title: keep.title, type: keep.type, ids: [keep.id, c.id] })
    }
  }
  return { plan, review, dupGroups }
}
