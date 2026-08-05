// ── 레벨 시스템 ─────────────────────────────────────────────
// 설계 원칙(초안 최적화판):
//   1) 활동 레벨(재미) ↔ 좋문가 자격(권위) 를 분리한다.
//   2) 점수는 "현재 상태에서 파생"한다 — 별도 XP 원장을 두지 않는다.
//      → 글/추천이 삭제되면 다음 계산에서 자동으로 빠지므로 "XP 회수"가 공짜로 된다.
//   3) 받은 추천은 체감 곡선(증가폭 감소)으로 환산 → 추천 조작 효율을 낮춘다.
//   4) 순추천(likes - dislikes)만 인정 → 도배성 상호추천 가치를 떨어뜨린다.
//   5) 좋문가는 XP 만으로 승급 불가 — 여러 조건을 동시에 충족해야 하는 별도 자격.
//   6) 게스트(유동닉)에게는 레벨을 주지 않는다 — 고정닉 계정 활동만 집계.
import * as DS from '@/api/dataService'
import { TYPE_LABELS, CONTENT_TYPES } from '@/utils/constants'
import type { ContentType, User } from '@/types'

// ── 튜닝 상수 (서비스 규모에 맞춰 조정) ──────────────────────
/** 활동 레벨 티어 — 총 XP 기준. min 이상이면 해당 티어. */
export const LEVEL_TIERS = [
  { name: '방구석 입주민', min: 0,    emoji: '🚪' },
  { name: '방구석 백수',   min: 30,   emoji: '🛋️' },
  { name: '콘텐츠 찍먹러', min: 120,  emoji: '🥢' },
  { name: '일반인',        min: 300,  emoji: '🙂' },
  { name: '콘텐츠 애호가', min: 700,  emoji: '🍿' },
  { name: '중수',          min: 1500, emoji: '🎯' },
  { name: '고인물',        min: 3000, emoji: '🌊' },
] as const
export type Tier = (typeof LEVEL_TIERS)[number]

const XP_RULE = {
  reviewLong: 4,        // 장문(>= longReviewMin 자) 리뷰 작성
  reviewShort: 2,       // 단문 리뷰 작성
  longReviewMin: 100,   // 장문 기준 글자수
  watchedEach: 1, watchedCap: 40,        // 시청 등록 (활동성)
  commentEach: 1, commentMin: 10, commentCap: 40,  // 유효 댓글(10자 이상)
  discussionEach: 2, discussionCap: 40,  // 토론/게시판 글
  attendanceEach: 2, attendanceCap: 60,  // 누적 방문일(출석) — 비중 낮게, 상한 有
}

/** 받은 순추천 수 → 품질 XP. 증가폭이 점점 줄어드는 체감 곡선(조작 효율 ↓). */
const QUALITY_CURVE: [number, number][] = [
  [0, 0], [1, 3], [3, 7], [5, 10], [10, 16], [20, 23], [50, 32], [100, 40],
]
export function qualityXp(netLikes: number): number {
  const n = Math.max(0, netLikes)
  const c = QUALITY_CURVE
  const last = c[c.length - 1]
  if (n >= last[0]) return last[1]
  for (let i = 1; i < c.length; i++) {
    if (n <= c[i][0]) {
      const [x0, y0] = c[i - 1]
      const [x1, y1] = c[i]
      return Math.round(y0 + ((y1 - y0) * (n - x0)) / (x1 - x0))
    }
  }
  return 0
}

/** 좋문가(전문 자격) 진입/승급 기준. */
export const EXPERT_RULE = {
  minAgeDays: 30,       // 가입 후 최소 기간
  minRated: 20,         // 해당 분야 평가(리뷰) 수
  minLong: 5,           // 해당 분야 장문 리뷰(>= expertLongMin 자) 수
  minNetLikes: 40,      // 해당 분야에서 받은 순추천 합
  minApproval: 0.6,     // 인정률 likes/(likes+dislikes)
  minReactionSample: 10,// 인정률을 신뢰하기 위한 최소 반응 표본
  expertLongMin: 200,   // 좋문가용 장문 기준(활동 XP 장문보다 엄격)
  // 수석(2배급) 기준
  seniorRated: 40, seniorLong: 12, seniorNetLikes: 100,
}

// ── 통계 집계 ───────────────────────────────────────────────
export interface DomainStat {
  type: ContentType
  rated: number        // 해당 분야 리뷰 수
  longReviews: number  // 장문(>=200자) 리뷰 수
  netLikes: number     // 받은 순추천 합
  likes: number        // 받은 추천 합 (인정률 분자)
  reactions: number    // likes + dislikes (인정률 분모/표본)
  approval: number | null // 인정률 likes/(likes+dislikes) (표본 부족 시 null)
}

export interface UserStats {
  reviews: number
  longReviews: number
  watched: number
  comments: number
  discussions: number
  receivedNetLikes: number
  totalLikes: number
  totalDislikes: number
  accountAgeDays: number
  visitDays: number    // 누적 방문일 (출석 · 마이그레이션 전이면 0)
  streak: number       // 현재 연속 출석 일수
  byDomain: Record<ContentType, DomainStat>
}

function emptyDomain(type: ContentType): DomainStat {
  return { type, rated: 0, longReviews: 0, netLikes: 0, likes: 0, reactions: 0, approval: null }
}

/** 유저의 현재 활동 상태를 집계한다 (전부 파생 — 저장값 없음). */
export function computeStats(userId: string, createdAt: string): UserStats {
  const byDomain = {} as Record<ContentType, DomainStat>
  for (const t of CONTENT_TYPES) byDomain[t.code] = emptyDomain(t.code)

  let reviews = 0, longReviews = 0, totalLikes = 0, totalDislikes = 0, receivedNetLikes = 0

  for (const r of DS.getReviewsByAuthor(userId)) {
    reviews++
    const likes = r.likes.length
    const dislikes = r.dislikes.length
    const net = Math.max(0, likes - dislikes)
    totalLikes += likes
    totalDislikes += dislikes
    receivedNetLikes += net
    const bodyLen = (r.body || '').length
    if (bodyLen >= EXPERT_RULE.expertLongMin) longReviews++

    const c = DS.getContentById(r.contentId)
    if (c && byDomain[c.type]) {
      const d = byDomain[c.type]
      d.rated++
      d.netLikes += net
      d.likes += likes
      d.reactions += likes + dislikes
      if (bodyLen >= EXPERT_RULE.expertLongMin) d.longReviews++
    }
  }
  for (const t of CONTENT_TYPES) {
    const d = byDomain[t.code]
    d.approval = d.reactions >= EXPERT_RULE.minReactionSample ? d.likes / d.reactions : null
  }

  const watched = DS.getUserWatched(userId).length
  const comments = DS.getComments().filter(c => c.authorId === userId && (c.content || '').length >= XP_RULE.commentMin).length
  const discussions = DS.getDiscussions().filter(d => d.authorId === userId).length
  const accountAgeDays = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000))
  const u = DS.getUserById(userId)
  const visitDays = u?.visitDays ?? 0
  const streak = u?.streak ?? 0

  return { reviews, longReviews, watched, comments, discussions, receivedNetLikes, totalLikes, totalDislikes, accountAgeDays, visitDays, streak, byDomain }
}

// ── 활동 레벨 ───────────────────────────────────────────────
export interface LevelInfo {
  xp: number
  tierIndex: number
  tier: Tier
  next: Tier | null
  /** 다음 티어까지 진행도 0~1 (최고 티어면 1) */
  progress: number
  toNext: number // 다음 티어까지 남은 XP (최고 티어면 0)
}

/** 집계 통계 → 총 활동 XP. */
export function computeXp(s: UserStats): number {
  let xp = 0
  // 리뷰 작성 기본: 장문 × long, 단문 × short
  xp += s.longReviews * XP_RULE.reviewLong
  xp += Math.max(0, s.reviews - s.longReviews) * XP_RULE.reviewShort
  xp += qualityXp(s.receivedNetLikes)
  xp += Math.min(s.watched * XP_RULE.watchedEach, XP_RULE.watchedCap)
  xp += Math.min(s.comments * XP_RULE.commentEach, XP_RULE.commentCap)
  xp += Math.min(s.discussions * XP_RULE.discussionEach, XP_RULE.discussionCap)
  xp += Math.min(s.visitDays * XP_RULE.attendanceEach, XP_RULE.attendanceCap)
  return Math.round(xp)
}

export function computeLevel(xp: number): LevelInfo {
  let idx = 0
  for (let i = LEVEL_TIERS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_TIERS[i].min) { idx = i; break }
  }
  const tier = LEVEL_TIERS[idx]
  const next = idx < LEVEL_TIERS.length - 1 ? LEVEL_TIERS[idx + 1] : null
  const progress = next ? Math.min(1, (xp - tier.min) / (next.min - tier.min)) : 1
  const toNext = next ? Math.max(0, next.min - xp) : 0
  return { xp, tierIndex: idx, tier, next, progress, toNext }
}

// ── 좋문가 자격 (분야별) ────────────────────────────────────
export type ExpertRank = 'certified' | 'senior'
export interface ExpertBadge {
  type: ContentType
  label: string        // 예: "영화 좋문가", "수석 드라마 좋문가"
  rank: ExpertRank
  emoji: string
  stat: DomainStat
}
export interface ExpertResult {
  badges: ExpertBadge[]
  /** 아직 좋문가가 없을 때, 가장 가까운 분야(예비 좋문가)의 진행 힌트 */
  closest: { type: ContentType; label: string; progress: number; missing: string[] } | null
}

function meetsBase(d: DomainStat, ageDays: number): boolean {
  return (
    ageDays >= EXPERT_RULE.minAgeDays &&
    d.rated >= EXPERT_RULE.minRated &&
    d.longReviews >= EXPERT_RULE.minLong &&
    d.netLikes >= EXPERT_RULE.minNetLikes &&
    d.approval !== null && d.approval >= EXPERT_RULE.minApproval
  )
}
function meetsSenior(d: DomainStat): boolean {
  return (
    d.rated >= EXPERT_RULE.seniorRated &&
    d.longReviews >= EXPERT_RULE.seniorLong &&
    d.netLikes >= EXPERT_RULE.seniorNetLikes
  )
}

/** 분야별 좋문가 자격을 판정한다. banned 계정은 자격 없음. */
export function computeExperts(s: UserStats, banned: boolean): ExpertResult {
  const badges: ExpertBadge[] = []
  if (banned) return { badges, closest: null }

  for (const t of CONTENT_TYPES) {
    const d = s.byDomain[t.code]
    if (meetsBase(d, s.accountAgeDays)) {
      const senior = meetsSenior(d)
      badges.push({
        type: t.code,
        label: `${senior ? '수석 ' : ''}${TYPE_LABELS[t.code]} 좋문가`,
        rank: senior ? 'senior' : 'certified',
        emoji: senior ? '👑' : '🛋️',
        stat: d,
      })
    }
  }

  // 좋문가가 없으면 "가장 가까운 분야" 를 예비 좋문가 진행도로 안내
  let closest: ExpertResult['closest'] = null
  if (badges.length === 0) {
    let best = -1
    for (const t of CONTENT_TYPES) {
      const d = s.byDomain[t.code]
      // 4개 핵심 조건의 충족 비율로 근접도 산정
      const ratios = [
        Math.min(1, d.rated / EXPERT_RULE.minRated),
        Math.min(1, d.longReviews / EXPERT_RULE.minLong),
        Math.min(1, d.netLikes / EXPERT_RULE.minNetLikes),
        Math.min(1, s.accountAgeDays / EXPERT_RULE.minAgeDays),
      ]
      const p = ratios.reduce((a, b) => a + b, 0) / ratios.length
      if (p > best) {
        best = p
        const missing: string[] = []
        if (d.rated < EXPERT_RULE.minRated) missing.push(`평가 ${EXPERT_RULE.minRated - d.rated}개`)
        if (d.longReviews < EXPERT_RULE.minLong) missing.push(`장문리뷰 ${EXPERT_RULE.minLong - d.longReviews}개`)
        if (d.netLikes < EXPERT_RULE.minNetLikes) missing.push(`추천 ${EXPERT_RULE.minNetLikes - d.netLikes}`)
        if (s.accountAgeDays < EXPERT_RULE.minAgeDays) missing.push(`가입 ${EXPERT_RULE.minAgeDays - s.accountAgeDays}일`)
        closest = { type: t.code, label: `${TYPE_LABELS[t.code]} 좋문가`, progress: p, missing }
      }
    }
  }
  return { badges, closest }
}

// ── 작성자별 좋문가 배지 조회 (리뷰/평점 표시용) ────────────
// computeStats 는 유저당 전체 활동을 순회하므로, 목록에서 같은 작성자가
// 여러 번 등장할 때를 위해 세션 캐시를 둔다. 배지는 임계값을 넘나드는
// 순간에만 바뀌므로(자주 안 변함) 이 정도 신선도면 충분하다.
const expertCache = new Map<string, ExpertResult>()
/** 캐시 무효화 — 대량 데이터 재적재 시 호출(선택). */
export function clearExpertCache() { expertCache.clear() }

/** [임시·확인용] 이 계정에는 실제 조건과 무관하게 좋문가 배지를 강제 노출한다.
 *  배지 렌더/좋문가 평점 UI를 실서비스 데이터로 확인하기 위한 것으로, 검증 후 제거. */
function isVerifyOverrideUser(u: User): boolean {
  return u.role === 'admin' && u.nickname === '홍인기'
}

/** 좋문가 자격 판정 + 확인용 오버라이드 적용. LevelCard/배지 조회 공통 경로. */
export function resolveExperts(user: User, stats: UserStats): ExpertResult {
  if (isVerifyOverrideUser(user)) {
    // 전 분야 수석 좋문가로 강제 (툴팁 수치는 실제 통계 유지)
    return {
      badges: CONTENT_TYPES.map(t => ({
        type: t.code,
        label: `수석 ${TYPE_LABELS[t.code]} 좋문가`,
        rank: 'senior' as ExpertRank,
        emoji: '👑',
        stat: stats.byDomain[t.code],
      })),
      closest: null,
    }
  }
  return computeExperts(stats, user.banned)
}

function expertsForUser(userId: string): ExpertResult | null {
  const cached = expertCache.get(userId)
  if (cached) return cached
  const u = DS.getUserById(userId)
  if (!u) return null
  const res = resolveExperts(u, computeStats(userId, u.createdAt))
  expertCache.set(userId, res)
  return res
}

/** 해당 작성자가 주어진 분야의 좋문가면 배지를, 아니면 null 을 반환. */
export function expertBadgeFor(authorId: string | null | undefined, type: ContentType): ExpertBadge | null {
  if (!authorId || authorId === 'deleted') return null
  const res = expertsForUser(authorId)
  if (!res) return null
  return res.badges.find(b => b.type === type) ?? null
}

/** 리뷰 목록에서 좋문가들의 평균 평점을 별도 집계 (전체 평점과 분리 표시용). */
export function expertRatingFor(reviews: { authorId: string | null; rating: number }[], type: ContentType): { avg: number; count: number } {
  const picked = reviews.filter(r => expertBadgeFor(r.authorId, type))
  if (!picked.length) return { avg: 0, count: 0 }
  const avg = Math.round((picked.reduce((s, r) => s + r.rating, 0) / picked.length) * 10) / 10
  return { avg, count: picked.length }
}

// ── 월간 시즌 랭킹 ──────────────────────────────────────────
// 영구 레벨과 분리된 "최근 30일" 활동 점수. 오래 활동한 사람의 상위권 독점을
// 막고 신규 회원에게도 경쟁 기회를 준다. (초안 원칙 1·9)
// 점수는 "최근 30일에 작성된 글"에서만 파생 — 추천은 타임스탬프가 없어
// 최근 글의 현재 순추천을 최근 반응의 근사값으로 사용한다.
export const SEASON_DAYS = 30
export interface SeasonEntry {
  userId: string
  nickname: string
  score: number
  level: LevelInfo
  topBadge: ExpertBadge | null
}

export function computeSeasonRanking(limit = 30): { entries: SeasonEntry[]; days: number } {
  const since = Date.now() - SEASON_DAYS * 86400000
  const inWindow = (iso: string) => new Date(iso).getTime() >= since
  const score = new Map<string, number>()
  const add = (uid: string | null, pts: number) => {
    if (!uid || uid === 'deleted') return
    score.set(uid, (score.get(uid) || 0) + pts)
  }

  for (const r of DS.getReviews()) {
    if (!inWindow(r.createdAt)) continue
    const base = (r.body || '').length >= EXPERT_RULE.expertLongMin ? XP_RULE.reviewLong : XP_RULE.reviewShort
    const net = Math.max(0, r.likes.length - r.dislikes.length)
    add(r.authorId, base + qualityXp(net))
  }
  for (const d of DS.getDiscussions()) {
    if (inWindow(d.createdAt)) add(d.authorId, XP_RULE.discussionEach)
  }
  for (const c of DS.getComments()) {
    if (inWindow(c.createdAt) && (c.content || '').length >= XP_RULE.commentMin) add(c.authorId, XP_RULE.commentEach)
  }
  for (const w of DS.getWatched()) {
    if (inWindow(w.createdAt)) add(w.userId, XP_RULE.watchedEach)
  }

  const entries: SeasonEntry[] = []
  for (const [userId, s] of score) {
    const u = DS.getUserById(userId)
    if (!u || u.banned) continue
    const stats = computeStats(userId, u.createdAt)
    const experts = resolveExperts(u, stats)
    entries.push({
      userId,
      nickname: u.nickname,
      score: Math.round(s),
      level: computeLevel(computeXp(stats)),
      topBadge: experts.badges[0] ?? null,
    })
  }
  entries.sort((a, b) => b.score - a.score)
  return { entries: entries.slice(0, limit), days: SEASON_DAYS }
}
