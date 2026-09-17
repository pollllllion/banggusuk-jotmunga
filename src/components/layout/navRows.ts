import { TALK_LABEL } from '@/utils/constants'

/**
 * 메뉴 목록 — **모바일 서랍(Sidebar)과 PC 상단 띠(TopNav)가 같은 것을 읽는다.**
 *
 * 2026-09-16 에 두 벌이 될 뻔했다. 화면마다 메뉴를 따로 적으면 새 게시판을 하나 만들 때
 * 한쪽만 고쳐 놓고 "폰에는 있는데 PC에는 없다" 가 생긴다. 그래서 목록은 여기 한 곳에만 둔다.
 *
 * 칸이 둘로 갈린 것도 두 화면이 공유하는 규칙이다:
 *   boards = 남들과 함께 보는 곳 · mine = 나만의 것.
 * 서랍에서는 위아래로, 상단 띠에서는 좌우로 갈린다 — 나누는 선은 같다.
 */
export interface NavRow {
  path: string
  label: string
  /** 관리자 전용 줄 — 파란 글씨 */
  admin?: boolean
}

/** 게시판 — 남들과 함께 보는 곳 */
export const BOARD_ROWS: NavRow[] = [
  { path: '/', label: '개봉·공개 캘린더' },
  { path: '/curation', label: '큐레이션' },
  { path: '/talk', label: TALK_LABEL },
  { path: '/board/relay', label: '자유방' },
  { path: '/browse', label: '작품 둘러보기' },
]

/** 내 활동 — 나만의 것 */
export const MINE_ROWS: NavRow[] = [
  { path: '/feed', label: '내 피드' },
  { path: '/follows', label: '관심 피드' },
  { path: '/bookmarks', label: '찜한 작품' },
]

/** 관리자에게만 보이는 줄. 일반 사용자에게는 이 칸 자체가 없다 */
export const ADMIN_ROWS: NavRow[] = [
  { path: '/ranking', label: '레벨', admin: true },
  { path: '/admin', label: '관리자', admin: true },
]

/** 지금 보고 있는 화면인가 — 게시판 글 상세에 있어도 그 게시판이 켜져 있어야 한다 */
export function isNavActive(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/'
  if (path === '/talk') return pathname.startsWith('/talk')
  return pathname === path || pathname.startsWith(path + '/')
}
