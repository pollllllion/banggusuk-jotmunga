/**
 * contents 테이블의 로드 컬럼 정의.
 *
 * 시작 로드(cache.ts)와 상세 로드(contents.ts) 양쪽이 참조하므로 따로 뽑아 뒀다.
 * PostgREST 는 '이 컬럼만 빼고'가 안 돼서 목록 컬럼을 전부 열거해야 한다.
 */

/**
 * 상세(작품 페이지·캘린더 모달·관리자 편집)에서만 쓰는 컬럼 — 시작 로드에서 뺀다.
 * 작품 상세로 들어갈 때 loadContentDetail() 이 그 한 행만 채워 넣는다.
 *
 * 2026-08-17 실측으로 목록 화면이 안 쓰는 컬럼을 추가로 옮겼다(2,013행 기준):
 *   synopsis 665KB · networks 105KB · tmdbUrl 98KB · numberOfEpisodes 45KB ·
 *   numberOfSeasons 42KB · voteAverage 34KB · voteCount 29KB · runtime 28KB
 *   → 시작 로드 2,990KB → 1,718KB
 * ⚠️ 여기 있는 컬럼을 목록/캘린더 화면에서 읽으면 undefined 다.
 *    그 화면에서 필요해지면 아래 LIST 로 옮기고 용량 대가를 감수할 것.
 */
export const CONTENT_DETAIL_COLS = [
  'castMembers', 'backdropUrl', 'synopsis', 'networks', 'tmdbUrl',
  'runtime', 'numberOfSeasons', 'numberOfEpisodes', 'voteAverage', 'voteCount',
] as const

/**
 * contents 시작 로드 컬럼 = 전체 - 상세 전용.
 * syncedAt 은 클라이언트에서 아무도 안 읽어서 아예 뺐다(84KB).
 */
export const CONTENT_LIST_COLS = [
  'id', 'type', 'title', 'posterUrl', 'genres', 'creators', 'platform',
  'releaseYear', 'releaseDate', 'status', 'popularity', 'avgRating', 'reviewCount',
  'createdBy', 'createdAt', 'verified', 'tmdbId', 'mediaType', 'eventType', 'seasonNumber',
  'originalTitle', 'manualReleaseDate', 'manualOverride', 'releaseDateSource', 'providers',
  'source', 'region', 'hidden', 'releasePattern',
].join(',')
