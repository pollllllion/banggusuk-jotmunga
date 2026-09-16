import type { ContentType } from '@/types'

// ── 컨텐츠 타입 ─────────────────────────────────────────────
export const CONTENT_TYPES: { code: ContentType; label: string }[] = [
  { code: 'movie',    label: '영화' },
  { code: 'drama',    label: '드라마' },
  { code: 'variety',  label: '예능' },
  { code: 'shortform', label: '숏폼' },
  { code: 'webtoon',  label: '웹툰' },
  { code: 'webnovel', label: '웹소설' },
  { code: 'youtube',  label: '유튜브' },
  { code: 'etc',      label: '기타' },
]

/**
 * 손으로 등록할 수 있는 작품 종류 — TMDB 에 없는 것들.
 *
 * 영화·드라마·예능은 여기 없다. TMDB 검색으로 들어와야 tmdb-* id 를 받는데, 손으로 넣으면
 * uuid 행이 따로 생겨 같은 작품이 두 줄이 된다(dedupe 로 병합하던 그 중복).
 *
 * **서버가 같은 목록으로 한 번 더 막는다** — supabase/migration_manual_types.sql 의
 * create_manual_content. 둘 중 하나만 고치면 화면에서는 고를 수 있는데 저장이 거절된다.
 *
 * 등록 창(RegisterWatchedModal)과 글쓰기(WriteDiscussionPage)가 같은 목록을 써야 한다 —
 * 2026-09-16 에 각자 들고 있다가 한쪽만 넓어져서 글쓰기에서는 숏폼·유튜브를 못 고르는
 * 상태가 됐다. 그래서 여기로 모았다.
 */
export const MANUAL_TYPES: ContentType[] = ['webtoon', 'webnovel', 'shortform', 'youtube', 'etc']

export const TYPE_LABELS: Record<string, string> = {
  movie: '영화', drama: '드라마', variety: '예능', shortform: '숏폼', webtoon: '웹툰', webnovel: '웹소설', youtube: '유튜브', etc: '기타',
}

// ── 웹툰/웹소설 플랫폼 (어드민 수기 등록 빠른 선택 칩 · 표기 흔들림 방지) ──
export const WEBTOON_PLATFORMS = ['네이버웹툰', '카카오웹툰', '카카오페이지', '네이버시리즈', '리디', '문피아'] as const

// ── 왼쪽 사이드바 게시판 (신규 구조) ────────────────────────
// slug: 라우팅 식별자, path: 이동 경로 (영화·드라마는 기존 게시판 뷰 재사용)
/** 토론방의 화면 이름. 사이드바·하단 탭·게시판 제목이 같은 것을 써야 한 곳만 고쳐도 안 갈린다.
 *  (2026-09-16 '토론방' → '방구석 토론방'. 주소 /talk 와 board='talk' 는 그대로다) */
export const TALK_LABEL = '방구석 토론방'

// ── 게시판 목록 규칙 ────────────────────────────────────────
// 토론방 · 자유방 · 작품방이 **같은 값을 쓴다**. 세 곳에 따로 적어 두면 한 곳만 고치고
// "왜 여기만 다르게 보이지"가 된다 — 2026-09-16 에 작품방을 붙이면서 세 번째 사본이
// 생길 뻔해 여기로 모았다.
/** 한 쪽에 보여줄 글 수 (디시 50 · 클리앙 30 — 방좋은 글이 길어서 30) */
export const BOARD_PER_PAGE = 30
/** 글이 이보다 적으면 인기글을 위로 올리지 않는다 — 최신순과 똑같아 보여 뜻이 없다 */
export const TRENDING_MIN_POSTS = 8
/** 목록 맨 위로 끌어올릴 인기글 수 */
export const TRENDING_LIMIT = 10

export const BOARDS: { slug: string; label: string; path: string }[] = [
  { slug: 'calendar', label: '개봉·공개 캘린더', path: '/' },
  { slug: 'talk',     label: TALK_LABEL,         path: '/talk' },
  { slug: 'relay',    label: '자유방',           path: '/board/relay' },
]

// ── 장르 ────────────────────────────────────────────────────
export const GENRES = [
  '로맨스', '스릴러', '액션', '코미디', '드라마', '공포',
  '판타지', 'SF', '무협', '미스터리', '느와르', '일상', '성장', '사극',
] as const

// ── 리뷰 감정 태그 (직설/적나라) ────────────────────────────
export const REVIEW_TAGS = [
  '인생작', '띵작', '수작', '볼만함', '평작',
  '노잼', '시간낭비', '망작', '과대평가', '저평가',
  '발연기', '명연기', '반전甲', '용두사미', '핵꿀잼', '고구마',
] as const

// ── 신고 사유 ───────────────────────────────────────────────
export const REPORT_REASONS = [
  { code: 'spam',          label: '스팸/광고' },
  { code: 'abuse',         label: '욕설/인신공격' },
  { code: 'spoiler',       label: '스포일러 (미표기)' },
  { code: 'false_info',    label: '허위 정보' },
  { code: 'inappropriate', label: '음란/부적절한 내용' },
  { code: 'copyright',     label: '저작권 침해 (권리자 삭제요청)' },
  { code: 'other',         label: '기타' },
]
