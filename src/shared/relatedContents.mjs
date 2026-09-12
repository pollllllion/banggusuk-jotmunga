/**
 * "이런 작품도" — 작품 → 작품 내부 링크를 고른다 (앱·프리렌더 공용 단일 소스)
 *
 * 왜 필요한가 (2026-09-12):
 *   서치콘솔이 185개를 "발견됨 - 현재 색인이 생성되지 않음"으로 묶어 뒀다.
 *   주소는 sitemap 으로 알지만 읽으러 가지도 않은 상태다. 원인은 내용이 아니라 구조 —
 *   작품 페이지끼리 링크가 하나도 없어서, 크롤러가 작품에 들어오면 거기가 막다른 길이었다.
 *   sitemap 에만 이름이 적힌 페이지는 "아무도 안 가리키니 안 중요하다"로 밀린다.
 *   → 작품마다 이웃 8개를 걸어 1,800여 개를 하나의 그물로 잇는다.
 *
 *   사람에게도 같은 이유로 필요하다. 작품을 보다가 다음 작품으로 넘어갈 길이 없으면
 *   거기서 세션이 끝난다.
 *
 * 링크 대상은 **색인 대상 작품만** 넣는다(호출부에서 걸러 넘긴다).
 * noindex 로 막아 둔 얇은 페이지로 크롤 예산을 흘려보내면 앞의 정리가 도루묵이 된다.
 */

/** 한 작품에 붙일 이웃 수. 모바일에서 가로 스크롤 두어 번이면 끝나는 양. */
export const RELATED_LIMIT = 8

/** 공개일이 가깝다고 볼 범위(일) — 같은 시기 공개작은 실제로 같이 검색된다 */
const NEAR_DAYS = 60
const FAR_DAYS = 180

function releaseKey(c) {
  return (c.manualOverride && c.manualReleaseDate) || c.releaseDate || ''
}

function daysApart(a, b) {
  if (!a || !b) return null
  const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime())
  return Number.isFinite(ms) ? ms / 86400_000 : null
}

/** 이 작품이 어느 OTT 에 있나 — providers(JustWatch) 와 platform(수기 입력)을 합쳐 본다 */
function platformsOf(c) {
  const names = (c.providers || []).map(p => p && p.providerName).filter(Boolean)
  if (c.platform) names.push(c.platform)
  return new Set(names)
}

/**
 * 두 작품이 얼마나 이웃인가. 0 이면 남남이라 링크하지 않는다.
 *
 * 장르를 가장 높게 친다 — "이거 재밌었는데 비슷한 거"에 가장 가까운 축이고,
 * 검색어도 장르로 묶여 들어온다. 그다음이 같은 OTT(볼 수 있는 곳이 같다),
 * 그다음이 같은 시기 공개(공개 직후 검색이 몰린다 — 실측으로 확인된 패턴).
 */
export function relatedScore(a, b) {
  let score = 0

  const genresA = new Set(a.genres || [])
  let sharedGenres = 0
  for (const g of b.genres || []) if (genresA.has(g)) sharedGenres++
  score += Math.min(sharedGenres, 3) * 3

  const platsA = platformsOf(a)
  for (const p of platformsOf(b)) if (platsA.has(p)) { score += 2; break }

  if (a.type && a.type === b.type) score += 1

  const gap = daysApart(releaseKey(a), releaseKey(b))
  if (gap !== null) {
    if (gap <= NEAR_DAYS) score += 2
    else if (gap <= FAR_DAYS) score += 1
  }

  return score
}

/**
 * 이웃 고르기.
 *
 * pool 은 **호출부가 색인 대상만 걸러서** 넘긴다.
 * 점수가 같으면 id 순으로 자른다 — 빌드할 때마다 링크가 흔들리면
 * 크롤러가 매번 다른 그래프를 보게 되고, 그건 없느니만 못하다.
 */
export function pickRelated(target, pool, limit = RELATED_LIMIT) {
  if (!target) return []
  const scored = []
  for (const c of pool) {
    if (!c || c.id === target.id) continue
    const s = relatedScore(target, c)
    if (s > 0) scored.push({ c, s })
  }
  scored.sort((x, y) => y.s - x.s || (x.c.id < y.c.id ? -1 : 1))
  const picked = scored.slice(0, limit).map(x => x.c)
  if (picked.length >= limit) return picked

  // 이웃이 모자라면 같은 종류로 채운다.
  // 수기로 넣은 웹툰·웹소설은 장르도 공개일도 비어 있어 점수가 전부 0 이 나온다 —
  // 그대로 두면 그 페이지들만 막다른 길로 남는다. 링크가 아예 없는 것보다는 낫다.
  const taken = new Set(picked.map(c => c.id))
  const rest = pool
    .filter(c => c && c.id !== target.id && !taken.has(c.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
  // 같은 종류를 먼저, 그래도 모자라면 아무거나.
  // 웹툰·웹소설은 색인 대상이 한 손에 꼽혀서 같은 종류만 고집하면 채울 게 없다.
  const filler = rest.filter(c => c.type === target.type).concat(rest.filter(c => c.type !== target.type))
  return picked.concat(filler.slice(0, limit - picked.length))
}
