/**
 * 숏폼 드라마(세로형·회당 1~3분) 판별 — 수집기·앱·프리렌더 공용 단일 소스
 *
 * 왜 방영사(networks)로 가르나 (2026-09-19):
 *   러닝타임으로 가르면 어린이 애니가 섞이고(migration_shortform.sql 주석), TMDB 는 숏폼에
 *   회차 수도 1~2화로 잘못 적어 둔다. 대신 TMDB 가 DramaBox·Vigloo 같은 숏폼 앱을
 *   방영사로 따로 등록해 두었다 — 이게 가장 믿을 만한 표지다.
 *
 * 왜 숏폼을 따로 모으나:
 *   네이버 유입 클릭의 4분의 1 이상이 숏폼 작품명 검색이었다(2026-09 실측, 186 중 49+).
 *   큰 OTT 작품은 포털 검색에서 대형 사이트에 밀리지만 숏폼은 정보 페이지가 드물다.
 *   그래서 작품 페이지는 전부 두고(검색 유입), 캘린더에는 골라서만 올린다(isOnCalendar).
 *
 * id 는 TMDB network id — /discover/tv?with_networks= 에 그대로 쓴다.
 * url 은 직접 열어서 확인한 공식 주소만 적는다(모르면 비운다 — 틀린 링크보다 없는 게 낫다).
 */
export const SHORT_PLATFORMS = [
  { id: 8989, name: 'DramaBox',     label: '드라마박스', url: 'https://www.dramabox.com/' },
  { id: 8899, name: 'Vigloo',       label: '비글루',     url: 'https://www.vigloo.com/ko' },
  { id: 8976, name: 'ReelShort',    label: '릴숏',       url: 'https://www.reelshort.com/' },
  { id: 9158, name: 'Shortmax',     label: '숏맥스',     url: 'https://www.shorttv.live/' },
  { id: 8821, name: 'GoodShort',    label: '굿숏',       url: 'https://www.goodshort.com/' },
  { id: 9361, name: 'GoodShort',    label: '굿숏',       url: 'https://www.goodshort.com/' },
  { id: 9138, name: 'NetShort',     label: '넷숏',       url: 'https://netshort.com/' },
  { id: 9139, name: 'FlickReels',   label: '플릭릴스',   url: 'https://www.flickreels.net/' },
  { id: 9140, name: 'MoboReels',    label: '모보릴스',   url: 'https://www.moboreels.com/' },
  { id: 9157, name: 'DramaWave',    label: '드라마웨이브', url: 'https://mydramawave.com/' },
  { id: 8326, name: 'FlexTV',       label: '플렉스TV',   url: 'https://www.flextv.cc/' },
  { id: 9160, name: 'Stardust TV',  label: '스타더스트TV', url: 'https://www.stardusttv.net/' },
  { id: 9352, name: 'DreameShort',  label: '드리미숏',   url: 'https://www.dreameshort.com/' },
  { id: 8166, name: 'Shortcha',     label: '숏챠',       url: 'https://shortcha.com/ko-KR/' },
  { id: 7439, name: 'TopReels',     label: '탑릴스',     url: 'https://topreels.com/' },
  { id: 7893, name: 'Shortime',     label: '숏타임',     url: 'https://shortime.app/' },
  { id: 8925, name: 'Lezhin Snack', label: '레진스낵',   url: 'https://www.lezhinsnack.com/ko' },
  { id: 8937, name: 'Everyreels',   label: '에브리릴스', url: 'https://www.everyreels.com/' },
  { id: 9450, name: 'MiniShorts',   label: '미니숏츠',   url: 'https://minishorts.com/' },
]

/** discover 의 with_networks 값 ('|' = OR) */
export const SHORT_NETWORK_QUERY = [...new Set(SHORT_PLATFORMS.map(p => p.id))].join('|')

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '')
const BY_NAME = new Map()
for (const p of SHORT_PLATFORMS) {
  BY_NAME.set(norm(p.name), p)
  BY_NAME.set(norm(p.label), p)   // 관리자가 한글로 적어도 알아본다
}

/** 이름 하나 → 숏폼 플랫폼 정보 (아니면 null) */
export function shortPlatformByName(name) {
  return BY_NAME.get(norm(name)) || null
}

/**
 * 이 작품의 숏폼 플랫폼 (방영사 중 첫 번째 숏폼 앱). 없으면 null.
 * networks 는 TMDB 원본({name, id}) 이든 우리 DB 모양({name, logoPath}) 이든 이름만 본다.
 */
export function shortPlatformOf(c) {
  for (const n of c?.networks || []) {
    const p = shortPlatformByName(n?.name)
    if (p) return p
  }
  return c?.platform ? shortPlatformByName(c.platform) : null
}

/** 숏폼 드라마인가 — 종류가 지정됐거나, 숏폼 앱에서 나온 작품 */
export function isShortForm(c) {
  return c?.type === 'shortform' || !!shortPlatformOf(c)
}

/**
 * 숏폼의 회차 수를 믿을 수 있나.
 * TMDB 는 56부작 숏폼을 1~2화로 적어 두는 일이 흔하다(2026-09 실측: 115편 중 83편이 1~2).
 * 숏폼이 10화 미만일 리는 없으니 그 아래는 '모름'으로 친다. 관리자가 고친 값은 믿는다.
 */
export function trustedEpisodeCount(c) {
  const n = c?.numberOfEpisodes
  if (!n) return null
  if (isShortForm(c) && !c.manualOverride && n < 10) return null
  return n
}

/**
 * 캘린더에 올릴 작품인가.
 * 숏폼은 매일 수십 편씩 쏟아지는 양산형이 대부분이라 전부 올리면 달력이 묻힌다.
 * → 고른 것만: TMDB 수집작은 calendarPick(수집기 점수 shortPickScore 또는 관리자 '캘린더 올리기'),
 *   직접 등록한 작품은 인증된 것(관리자 등록은 자동 인증, 이용자 등록은 미인증).
 *   숏폼이 아닌 작품은 지금까지처럼 전부 올린다.
 */
export function isOnCalendar(c) {
  if (!isShortForm(c)) return true
  if (c.source === 'tmdb') return c.calendarPick === true
  return c.verified === true
}

/**
 * 숏폼 캘린더 선정 점수 — 2점 이상이면 올린다. 수집기가 TMDB 상세를 받을 때 계산한다.
 *
 * '재밌는지'는 자동으로 알 수 없다. 대신 '검증된 관심'의 흔적을 센다 (2026-09 실측으로 정했다 —
 * 숏폼은 TMDB 평가가 0~15명, 인기도 0~5, 배우 인기도 2.3 이하라 일반 작품 기준은 못 쓴다):
 *   검색 유입  +2  우리 사이트로 실제로 찾아 들어온 작품 (클릭 1+ 또는 노출 30+). 가장 믿을 만하다
 *   TMDB 평가 +1  3명+ 평균 6+  /  +1 더  5명+ 평균 7+   — 평가가 낮은 건 점수를 못 받는다
 *   인기도    +1  TMDB popularity 3+
 *   배우      +1  출연진 중 TMDB 인기도 1.3+ (숏폼 밖에서도 활동하는 배우)
 * 줄거리·포스터가 없으면 작품 페이지가 빈약해서 올리지 않는다.
 * 본 사람 3명+ 평균 5 미만이면 다른 점수와 상관없이 뺀다 — 찾는 사람이 많아도 재미없다는 평이 모인 작품이다.
 *
 * @param s { demandClicks, demandImpressions, voteCount, voteAverage, popularity, topCastPopularity, hasSynopsis, hasPoster }
 */
export function shortPickScore(s) {
  if (!s.hasSynopsis || !s.hasPoster) return 0
  if ((s.voteCount || 0) >= 3 && (s.voteAverage || 0) < 5) return 0
  let n = 0
  if ((s.demandClicks || 0) >= 1 || (s.demandImpressions || 0) >= 30) n += 2
  if ((s.voteCount || 0) >= 3 && (s.voteAverage || 0) >= 6) n += 1
  if ((s.voteCount || 0) >= 5 && (s.voteAverage || 0) >= 7) n += 1
  if ((s.popularity || 0) >= 3) n += 1
  if ((s.topCastPopularity || 0) >= 1.3) n += 1
  return n
}
export const SHORT_PICK_MIN = 2
