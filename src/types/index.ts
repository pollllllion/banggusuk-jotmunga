// ── User ────────────────────────────────────────────────────
export interface User {
  id: string
  nickname: string
  email: string
  password?: string
  role: 'admin' | 'user'
  banned: boolean
  createdAt: string
}

// ── Content (평가 대상 작품) ─────────────────────────────────
export type ContentType = 'movie' | 'drama' | 'variety' | 'webtoon' | 'webnovel'

// TMDB OTT 연동: 이 작품을 제공하는 OTT (구독형)
export interface ContentProvider {
  providerId: number
  providerName: string
  logoPath: string | null       // TMDB 로고 경로 → IMG_LOGO + logoPath 로 URL 생성
  monetizationType: 'flatrate'
}

// releaseDate 가 어디서 왔는지 (신뢰도 표시용)
export type ReleaseDateSource =
  | 'kr_digital'          // 한국 디지털(OTT) 공개일
  | 'kr_theatrical'       // 한국 극장 개봉일
  | 'tmdb_release_date'   // TMDB 대표 개봉일
  | 'tmdb_first_air_date' // TV 최초 방영일
  | 'tmdb_season_air_date'// 시즌 공개일
  | 'tmdb_estimated'      // 정확한 OTT 공개일 미확인(추정)
  | 'manual'              // 관리자 수동 지정

export interface Content {
  id: string
  type: ContentType
  title: string
  posterUrl: string | null
  synopsis: string
  genres: string[]
  creators: string[]          // 감독 / 작가 등
  platform: string | null     // 넷플릭스 / 네이버웹툰 / 카카오페이지 ...
  releaseYear: number | null
  releaseDate: string | null  // 대표 출시일 'YYYY-MM-DD' (개봉/첫공개/연재시작). 캘린더 핵심 필드
  status: 'upcoming' | 'ongoing' | 'completed' | null  // upcoming=공개예정
  popularity?: number         // 화제도(극장+OTT 통합 랭킹용). 클수록 상위
  // 집계값 (리뷰에서 파생, 캐시)
  avgRating: number           // 0.0 ~ 10.0
  reviewCount: number
  createdBy: string
  createdAt: string

  // ── OTT 캘린더 연동 (TMDB 자동 수집 · 전부 선택적: 수기 작품은 없음) ──
  tmdbId?: number | null
  mediaType?: 'movie' | 'tv' | null
  eventType?: 'movie_release' | 'series_release' | 'season_release' | null
  seasonNumber?: number | null
  originalTitle?: string | null
  backdropUrl?: string | null
  manualReleaseDate?: string | null   // 관리자가 고친 실제 국내 공개일
  manualOverride?: boolean            // true 면 자동 동기화가 releaseDate/title 을 덮어쓰지 않음
  releaseDateSource?: ReleaseDateSource | null
  providers?: ContentProvider[]       // 이 작품을 제공하는 OTT 목록
  voteAverage?: number | null
  voteCount?: number | null
  tmdbUrl?: string | null
  source?: string | null              // 'tmdb'
  region?: string | null              // 'KR'
  hidden?: boolean                    // 캘린더에서 숨김
  syncedAt?: string | null
}

// ── Review (핵심) ───────────────────────────────────────────
export interface Review {
  id: string
  contentId: string
  authorId: string | null     // 로그인 글이면 auth uid, 유동닉이면 null
  guestName?: string | null
  guestPwHash?: string | null
  rating: number              // 1 ~ 10 정수
  title: string
  body: string
  spoiler: boolean
  tags: string[]              // 감정 태그: 인생작 / 발연기 / 시간낭비 ...
  likes: string[]
  dislikes: string[]
  views: number
  createdAt: string
  updatedAt: string | null
}

// ── Comment (리뷰에 달림) ────────────────────────────────────
export interface Comment {
  id: string
  reviewId: string
  authorId: string | null     // 로그인 글이면 auth uid, 유동닉이면 null
  guestName?: string | null
  guestPwHash?: string | null
  parentId: string | null
  content: string
  likes: string[]
  createdAt: string
  updatedAt?: string
}

// ── Discussion (출시 전 수다방 · 작품 단위 기대평) ──────────
export interface Discussion {
  id: string
  contentId: string
  authorId: string | null    // 로그인 글이면 auth uid, 유동닉이면 null
  guestName?: string | null  // 유동닉 표시명
  guestPwHash?: string | null // 유동닉 비번 SHA-256 hex
  body: string
  likes: string[]
  createdAt: string
}

// ── Notification ────────────────────────────────────────────
export type NotificationType = 'like' | 'dislike' | 'comment' | 'reply'

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  reviewId: string
  message: string
  read: boolean
  createdAt: string
}

// ── Report ──────────────────────────────────────────────────
export interface Report {
  id: string
  reporterId: string
  targetType: 'review' | 'comment' | 'content'
  targetId: string
  reason: string
  detail: string
  status: 'pending' | 'resolved' | 'dismissed'
  createdAt: string
}

// ── Block ───────────────────────────────────────────────────
export interface Block {
  blockerId: string
  blockedId: string
  createdAt: string
}

// ── Bookmark (작품 찜) ──────────────────────────────────────
export interface Bookmark {
  userId: string
  contentId: string
  createdAt: string
}

// ── Watched (내가 본 작품 — 내 피드) ────────────────────────
export interface Watched {
  userId: string
  contentId: string
  createdAt: string
}

// ── Announcement ────────────────────────────────────────────
export interface Announcement {
  id: string
  authorId: string
  title: string
  content: string
  createdAt: string
}
