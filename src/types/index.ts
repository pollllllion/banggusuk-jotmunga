// ── User ────────────────────────────────────────────────────
export interface User {
  id: string
  nickname: string
  email: string
  password?: string
  role: 'admin' | 'user'
  banned: boolean
  createdAt: string
  // ── 출석 streak (profiles 마이그레이션 후 채워짐 · 미적용 시 undefined) ──
  lastVisit?: string | null   // 마지막 집계일 'YYYY-MM-DD'
  streak?: number             // 현재 연속 출석 일수
  visitDays?: number          // 누적 방문일 수 (출석 XP 산정)
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
  | 'kr_ott_post_theatrical' // 극장 개봉 후 OTT/디지털 공개(극장 이력 있음)
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
  /** 관리자 공식 인증 작품 (TMDB·관리자 등록은 자동 true, 사용자 수기등록은 false) */
  verified?: boolean

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
  releasePattern?: string | null      // 공개 패턴 수동 입력(예: "매주 수·목 공개"). 있으면 자동유추보다 우선

  // ── 상세정보 확장 (감독/연출은 creators, 장르는 genres 재사용) ──
  castMembers?: CastMember[]          // 출연진 (상위 N명)
  networks?: NetworkInfo[]            // 채널/방영사 (TV: tvN·JTBC·Netflix ...)
  runtime?: number | null            // 러닝타임(분) · TV는 회차당
  numberOfSeasons?: number | null    // 시즌 수(TV)
  numberOfEpisodes?: number | null   // 총 회차(TV)
}

export interface CastMember {
  name: string
  character: string | null
  profilePath: string | null         // TMDB 프로필 경로 → IMG_PROFILE + profilePath
}

export interface NetworkInfo {
  name: string
  logoPath: string | null
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
  title?: string | null      // 게시판 글 제목 (구 글은 없을 수 있음)
  body: string
  likes: string[]
  createdAt: string
}

// 방구석토론방 게시글 댓글 (고정닉/유동닉)
export interface DiscussionComment {
  id: string
  discussionId: string
  authorId: string | null
  guestName?: string | null
  guestPwHash?: string | null
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
  /** 실제로 이 작품을 본 연도 (사용자 입력, 모르면 null) */
  watchedYear: number | null
}

// ── Announcement ────────────────────────────────────────────
export interface Announcement {
  id: string
  authorId: string
  title: string
  content: string
  createdAt: string
}
