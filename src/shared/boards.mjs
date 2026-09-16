/**
 * 게시판 이름과 SEO 문구 — **앱과 프리렌더가 같이 쓴다.**
 *
 * 왜 여기(.mjs)에 있나: 이름은 `src/utils/constants.ts` 에 있었는데 TypeScript 라
 * 빌드 스크립트(scripts/prerender.mjs)가 못 읽는다. 그래서 프리렌더는 '토론방' 을
 * 따로 적어 뒀고, 화면 이름을 '방구석 토론방' 으로 바꿀 때 그쪽이 안 따라왔다.
 * 결과: 검색 결과 제목은 "토론방", 들어와서 보는 이름은 "방구석 토론방".
 *
 * 아키텍처 불변식 ④ (SEO 는 앱과 src/shared 가 갈리지 않게) 가 정확히 이 경우다.
 * 이름을 고칠 일이 있으면 **여기만** 고친다.
 */

/** 토론방의 화면 이름. 사이드바·하단 탭·게시판 제목·검색 결과 제목이 전부 이걸 쓴다.
 *  (2026-09-16 '토론방' → '방구석 토론방'. 주소 /talk 와 board='talk' 는 그대로다) */
export const TALK_LABEL = '방구석 토론방'
export const FREE_LABEL = '자유방'

/** 목록 페이지의 SEO 문구 — 앱의 <Seo> 와 프리렌더 headBlock 이 같은 값을 쓴다 */
export const BOARD_SEO = {
  talk: {
    path: '/talk',
    title: TALK_LABEL,
    description: '영화·드라마·예능·웹툰·웹소설 이야기를 나누는 게시판. 공개 전 기대평부터 방금 본 작품 잡담까지, 눈치 안 보고 떠드는 방구석 토론방.',
  },
  relay: {
    path: '/board/relay',
    title: FREE_LABEL,
    description: '작품 얘기가 아니어도 괜찮은 오티티칼 자유 게시판. 뭘 볼지 묻고, 방금 본 걸 떠들고, 아무 말이나 남기는 곳.',
  },
}
