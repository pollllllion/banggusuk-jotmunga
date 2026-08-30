/**
 * curations 테이블의 로드 컬럼 정의.
 *
 * contents 와 같은 이유로 목록/상세를 나눈다 — 큐레이션 본문은 한 편에 수백~수천 자라
 * 30편만 쌓여도 시작 로드에 그대로 얹힌다. 목록 화면은 body·items 를 안 쓴다.
 * ⚠️ 여기 DETAIL 에 있는 컬럼을 목록 화면에서 읽으면 undefined 다.
 */
export const CURATION_DETAIL_COLS = ['body', 'items'] as const

export const CURATION_LIST_COLS = [
  'id', 'title', 'summary', 'coverUrl', 'status',
  'publishedAt', 'authorId', 'createdAt', 'updatedAt',
].join(',')
