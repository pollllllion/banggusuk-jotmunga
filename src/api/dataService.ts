/**
 * DataService — 데이터 계층 진입점 (Supabase 백엔드, 인메모리 캐시 + write-through)
 *
 * 앱 시작 시 loadAll() 로 테이블을 캐시에 로드한다.
 * 읽기(getX)는 캐시에서 동기적으로, 쓰기(saveX)는 캐시 갱신 + Supabase 동기화(비동기).
 * 화면 코드는 전부 `import * as DS from '@/api/dataService'` 로 이 파일만 본다.
 *
 * 실제 구현은 도메인별로 나뉘어 있다 (2026-08-17 분리 — 한 파일 1,078줄이 너무 커졌다):
 *   cache.ts          캐시·동기화 뼈대, 앱 시작 로드
 *   contentColumns.ts contents 로드 컬럼 정의(목록/상세)
 *   session.ts        sessionStorage 세션
 *   users.ts          고정닉 계정(profiles) + 유동닉 게스트(users) + 출석 + 탈퇴
 *   contents.ts       작품 조회·검색·편집·병합
 *   reviews.ts        리뷰 + 리뷰 댓글
 *   discussions.ts    토론글 + 그 댓글 + 유동닉 비번 RPC + 평점 재집계
 *   social.ts         찜·본작품·차단·알림·신고·공지
 *   curations.ts      큐레이션(기획 글)
 */
export { cache, load, store, loadAll, reloadUserScoped, seed, type Table } from './cache'
export { CONTENT_LIST_COLS, CONTENT_DETAIL_COLS } from './contentColumns'
export { CURATION_LIST_COLS, CURATION_DETAIL_COLS } from './curationColumns'
export { setSession, getSession, currentUser } from './session'
export * from './users'
export * from './contents'
export * from './reviews'
export * from './discussions'
export * from './social'
export * from './curations'
