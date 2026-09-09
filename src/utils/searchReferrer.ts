/**
 * 유입 검색어 뽑기 — "밖에서 뭘 검색해서 들어왔나".
 *
 * 검색엔진이 우리 사이트로 보낼 때 referrer URL 에 검색어를 남기는 곳이 있고 아닌 곳이 있다.
 *   남긴다   네이버 · 다음 · 줌 · 네이트 (search.naver.com/...?query=오징어게임)
 *   안 남긴다 **구글** (2011년부터 검색어를 지운다) · 빙 · 덕덕고
 * 그래서 구글 검색어는 여기서 절대 안 나온다 — 그건 Search Console 몫이다.
 *
 * ⚠️ referrer **전체 URL 은 저장하지 않는다.** 도메인과 검색어만 꺼내고 나머지(클릭 위치·
 *    세션 파라미터 등 남의 사이트 사정)는 버린다.
 */

/** 검색엔진별 검색어가 담기는 쿼리 파라미터. 호스트가 이 목록에 없으면 검색어를 안 본다. */
const SEARCH_PARAM: { match: RegExp; params: string[] }[] = [
  { match: /(^|\.)search\.naver\.com$/, params: ['query'] },
  { match: /(^|\.)m\.search\.naver\.com$/, params: ['query'] },
  { match: /(^|\.)search\.daum\.net$/, params: ['q'] },
  { match: /(^|\.)search\.zum\.com$/, params: ['query'] },
  { match: /(^|\.)search\.nate\.com$/, params: ['q'] },
  // 아래는 대부분 검색어를 안 넘긴다. 넘기는 경우만 주우려고 남겨 둔다.
  { match: /(^|\.)bing\.com$/, params: ['q'] },
  { match: /(^|\.)search\.yahoo\.com$/, params: ['p', 'q'] },
]

/** 검색어로 인정할 최대 길이 — 이보다 길면 검색어가 아니라 딴 값일 가능성이 크다 */
const MAX_LEN = 80

/**
 * referrer URL → 유입 검색어. 검색엔진이 아니거나 검색어를 안 넘겼으면 null.
 * @param referrer document.referrer 값
 */
export function searchQueryFromReferrer(referrer: string | null | undefined): string | null {
  if (!referrer) return null
  let url: URL
  try { url = new URL(referrer) } catch { return null }

  const host = url.hostname.replace(/^www\./, '')
  const rule = SEARCH_PARAM.find(r => r.match.test(host))
  if (!rule) return null

  for (const p of rule.params) {
    const raw = url.searchParams.get(p)
    if (!raw) continue
    const q = raw.trim().replace(/\s+/g, ' ')
    if (!q || q.length > MAX_LEN) continue
    return q
  }
  return null
}

/** 유입 도메인만 (www. 제거). 우리 사이트 안 이동이면 null. */
export function referrerHost(referrer: string | null | undefined, selfHost: string): string | null {
  if (!referrer) return null
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '')
    if (host === selfHost.replace(/^www\./, '')) return null   // 사이트 안 이동은 유입이 아니다
    return host
  } catch {
    return null
  }
}
