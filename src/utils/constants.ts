import type { ContentType } from '@/types'

// ── 컨텐츠 타입 ─────────────────────────────────────────────
export const CONTENT_TYPES: { code: ContentType; label: string; emoji: string }[] = [
  { code: 'movie',    label: '영화',    emoji: '\u{1F3AC}' },
  { code: 'drama',    label: '드라마',  emoji: '\u{1F4FA}' },
  { code: 'webtoon',  label: '웹툰',    emoji: '\u{1F5BC}' },
  { code: 'webnovel', label: '웹소설',  emoji: '\u{1F4DA}' },
]

export const TYPE_LABELS: Record<string, string> = {
  movie: '영화', drama: '드라마', webtoon: '웹툰', webnovel: '웹소설',
}

export const TYPE_EMOJIS: Record<string, string> = {
  movie: '\u{1F3AC}', drama: '\u{1F4FA}', webtoon: '\u{1F5BC}', webnovel: '\u{1F4DA}',
}

// ── 왼쪽 사이드바 게시판 (신규 구조) ────────────────────────
// slug: 라우팅 식별자, path: 이동 경로 (영화·드라마는 기존 게시판 뷰 재사용)
export const BOARDS: { slug: string; label: string; emoji: string; path: string }[] = [
  { slug: 'calendar',    label: '개봉·공개 캘린더',       emoji: '\u{1F5D3}\u{FE0F}', path: '/' },
  { slug: 'community',   label: '커뮤니티',              emoji: '\u{1F4AC}', path: '/community' },
  { slug: 'todays-pick', label: "랭커들의 today's pick", emoji: '\u{1F3C6}', path: '/board/todays-pick' },
  { slug: 'movie',       label: '영화',                  emoji: '\u{1F3AC}', path: '/browse?type=movie' },
  { slug: 'drama',       label: '드라마',                emoji: '\u{1F4FA}', path: '/browse?type=drama' },
  { slug: 'season',      label: '시즌제',                emoji: '\u{1F5D3}\u{FE0F}', path: '/board/season' },
  { slug: 'free',        label: '자유게시판',            emoji: '\u{1F4AC}', path: '/board/free' },
  { slug: 'relay',       label: '릴레이제작소',          emoji: '\u{270D}\u{FE0F}', path: '/board/relay' },
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
