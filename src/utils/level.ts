// ── 레벨 시스템 ─────────────────────────────────────────────
// 설계 원칙(초안 최적화판):
//   1) 활동 레벨(재미) ↔ 좋문가 자격(권위) 를 분리한다.
//   2) 점수는 "현재 상태에서 파생"한다 — 별도 XP 원장을 두지 않는다.
//      → 글/추천이 삭제되면 다음 계산에서 자동으로 빠지므로 "XP 회수"가 공짜로 된다.
//   3) 받은 추천은 체감 곡선(증가폭 감소)으로 환산 → 추천 조작 효율을 낮춘다.
//   4) 추천은 상호추천 감쇠·인당 상한으로 가중 → 품앗이·부계정 몰아주기 억제.
//   5) 좋문가는 XP 만으로 승급 불가 — 여러 조건을 동시에 충족해야 하는 별도 자격.
//   6) 게스트(유동닉)에게는 레벨을 주지 않는다 — 고정닉 계정 활동만 집계.
//
// ※ 글의 단위는 '토론글(discussions)' 이다. 별점을 단 토론글 = '평가'.
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

export const XP_RULE = {
  postLong: 4,          // 장문(>= expertLongMin 자) 토론글 작성
  postShort: 2,         // 단문 토론글 작성
  watchedEach: 1, watchedCap: 40,        // 시청 등록 (활동성)
  commentEach: 1, commentMin: 10, commentCap: 40,  // 유효 댓글(10자 이상)
  attendanceEach: 2, attendanceCap: 60,  // 누적 방문일(출석) — 비중 낮게, 상한 有
}

/** 받은 추천 수 → 품질 XP. 증가폭이 점점 줄어드는 체감 곡선(조작 효율 ↓). */
export const QUALITY_CURVE: [number, number][] = [
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

/** 상호추천(품앗이)·부계정 몰아주기 방지: 받은 추천을 가중한다.
 *  - 인당 영향력 상한: 한 사람이 내 글을 아무리 많이 추천해도 기여가 상한에 수렴.
 *  - 상호추천 감쇠: 서로 반복해서 추천을 주고받는 관계의 추천은 크게 깎는다. */
export const ANTIABUSE = {
  perLikerCap: 4,         // 한 추천자가 줄 수 있는 최대 인정 추천량
  mutualMin: 2,           // 서로 N회 이상 주고받으면 품앗이로 간주
  reciprocalWeight: 0.4,  // 상호추천 관계의 추천 반영률
}
/** 한 추천자가 내 글 nB개를 추천했을 때 인정되는 총 추천량(체감·상한). */
function perLikerCredit(nB: number): number {
  if (nB <= 3) return nB
  return Math.min(ANTIABUSE.perLikerCap, 3 + (nB - 3) * 0.25)
}

/** 특정 작성자가 받은 추천에 대해 '추천자별 추천 1건'의 가중치 맵을 만든다.
 *  (인당 영향력 상한 + 상호추천 감쇠). 작성자의 전체 이력 기준으로 판정한다. */
function buildLikeWeighting(userId: string): Map<string, number> {
  // 내가 '남에게' 준 추천 — 상대 작성자별 횟수 (상호추천 판정용). 전체 1회 스캔.
  const givenTo = new Map<string, number>()
  for (const p of DS.getDiscussions()) {
    if (p.authorId && p.authorId !== userId && p.likes.includes(userId)) {
      givenTo.set(p.authorId, (givenTo.get(p.authorId) || 0) + 1)
    }
  }
  // 내가 '받은' 추천 — 추천자별 횟수.
  const receivedFrom = new Map<string, number>()
  for (const p of DS.getDiscussionsByAuthor(userId)) {
    for (const uid of p.likes) {
      if (uid === userId) continue
      receivedFrom.set(uid, (receivedFrom.get(uid) || 0) + 1)
    }
  }
  const weight = new Map<string, number>()
  for (const [liker, nB] of receivedFrom) {
    const nGiven = givenTo.get(liker) || 0
    const reciprocal = nB >= ANTIABUSE.mutualMin && nGiven >= ANTIABUSE.mutualMin
    weight.set(liker, (perLikerCredit(nB) / nB) * (reciprocal ? ANTIABUSE.reciprocalWeight : 1))
  }
  return weight
}

/** 토론글 1건의 가중 추천 = Σ(추천자 가중치). (토론글엔 비공감이 없다) */
function weightedLikesOfPost(p: { likes: string[] }, weight: Map<string, number>, userId: string): number {
  let w = 0
  for (const uid of p.likes) { if (uid === userId) continue; w += weight.get(uid) || 0 }
  return w
}

/** 좋문가(전문 자격) 진입/승급 기준. */
export const EXPERT_RULE = {
  minAgeDays: 30,       // 가입 후 최소 기간
  minRated: 20,         // 해당 분야 평가(별점 단 글) 수
  minLong: 5,           // 해당 분야 장문 글(>= expertLongMin 자) 수
  minNetLikes: 40,      // 해당 분야에서 받은 가중 추천 합
  expertLongMin: 200,   // 좋문가용 장문 기준(활동 XP 장문보다 엄격)
  // 수석(2배급) 기준
  seniorRated: 40, seniorLong: 12, seniorNetLikes: 100,
}

// ── 통계 집계 ───────────────────────────────────────────────
export interface DomainStat {
  type: ContentType
  rated: number      // 이 분야 평가(별점 단 글) 수
  longPosts: number  // 이 분야 장문 글(>=200자) 수
  netLikes: number   // 이 분야에서 받은 가중 추천 합
}

export interface UserStats {
  posts: number         // 내가 쓴 토론글 수
  ratedPosts: number    // 그중 별점 단 글 (평가)
  longPosts: number     // 장문 글(>= expertLongMin)
  watched: number
  comments: number
  receivedNetLikes: number
  accountAgeDays: number
  visitDays: number    // 누적 방문일 (출석 · 마이그레이션 전이면 0)
  streak: number       // 현재 연속 출석 일수
  byDomain: Record<ContentType, DomainStat>
}

function emptyDomain(type: ContentType): DomainStat {
  return { type, rated: 0, longPosts: 0, netLikes: 0 }
}

/** 유저의 현재 활동 상태를 집계한다 (전부 파생 — 저장값 없음). */
export function computeStats(userId: string, createdAt: string): UserStats {
  const byDomain = {} as Record<ContentType, DomainStat>
  for (const t of CONTENT_TYPES) byDomain[t.code] = emptyDomain(t.code)

  let posts = 0, ratedPosts = 0, longPosts = 0, receivedNetLikes = 0

  const myPosts = DS.getDiscussionsByAuthor(userId)
  const likeWeight = buildLikeWeighting(userId)

  for (const p of myPosts) {
    posts++
    const rated = p.rating != null
    if (rated) ratedPosts++
    const long = (p.body || '').length >= EXPERT_RULE.expertLongMin
    if (long) longPosts++
    // 원추천 대신 가중 추천으로 계산 (품앗이·부계정 몰아주기 억제)
    const net = weightedLikesOfPost(p, likeWeight, userId)
    receivedNetLikes += net

    const c = DS.getContentById(p.contentId)
    if (c && byDomain[c.type]) {
      const d = byDomain[c.type]
      if (rated) d.rated++
      if (long) d.longPosts++
      d.netLikes += net
    }
  }
  receivedNetLikes = Math.round(receivedNetLikes)
  for (const t of CONTENT_TYPES) byDomain[t.code].netLikes = Math.round(byDomain[t.code].netLikes)

  const watched = DS.getUserWatched(userId).length
  const comments = DS.getComments().filter(c => c.authorId === userId && (c.content || '').length >= XP_RULE.commentMin).length
  const accountAgeDays = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000))
  const u = DS.getUserById(userId)
  const visitDays = u?.visitDays ?? 0
  const streak = u?.streak ?? 0

  return { posts, ratedPosts, longPosts, watched, comments, receivedNetLikes, accountAgeDays, visitDays, streak, byDomain }
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
  // 토론글 작성 기본: 장문 × long, 단문 × short
  xp += s.longPosts * XP_RULE.postLong
  xp += Math.max(0, s.posts - s.longPosts) * XP_RULE.postShort
  xp += qualityXp(s.receivedNetLikes)
  xp += Math.min(s.watched * XP_RULE.watchedEach, XP_RULE.watchedCap)
  xp += Math.min(s.comments * XP_RULE.commentEach, XP_RULE.commentCap)
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
    d.longPosts >= EXPERT_RULE.minLong &&
    d.netLikes >= EXPERT_RULE.minNetLikes
  )
}
function meetsSenior(d: DomainStat): boolean {
  return (
    d.rated >= EXPERT_RULE.seniorRated &&
    d.longPosts >= EXPERT_RULE.seniorLong &&
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
      const ratios = [
        Math.min(1, d.rated / EXPERT_RULE.minRated),
        Math.min(1, d.longPosts / EXPERT_RULE.minLong),
        Math.min(1, d.netLikes / EXPERT_RULE.minNetLikes),
        Math.min(1, s.accountAgeDays / EXPERT_RULE.minAgeDays),
      ]
      const p = ratios.reduce((a, b) => a + b, 0) / ratios.length
      if (p > best) {
        best = p
        const missing: string[] = []
        if (d.rated < EXPERT_RULE.minRated) missing.push(`평가 ${EXPERT_RULE.minRated - d.rated}개`)
        if (d.longPosts < EXPERT_RULE.minLong) missing.push(`장문글 ${EXPERT_RULE.minLong - d.longPosts}개`)
        if (d.netLikes < EXPERT_RULE.minNetLikes) missing.push(`추천 ${EXPERT_RULE.minNetLikes - d.netLikes}`)
        if (s.accountAgeDays < EXPERT_RULE.minAgeDays) missing.push(`가입 ${EXPERT_RULE.minAgeDays - s.accountAgeDays}일`)
        closest = { type: t.code, label: `${TYPE_LABELS[t.code]} 좋문가`, progress: p, missing }
      }
    }
  }
  return { badges, closest }
}

// ── 작성자별 좋문가 배지 조회 (글/평점 표시용) ──────────────
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

// 목록에서 같은 작성자가 여러 번 나오므로 세션 캐시를 둔다 (좋문가 배지와 같은 이유).
const levelCache = new Map<string, LevelInfo>()
/** 캐시 무효화 — 대량 데이터 재적재 시 호출(선택). */
export function clearLevelCache() { levelCache.clear() }

/**
 * 목록·상세에 붙일 활동 레벨. **고정닉(계정)만** 반환한다.
 * 유동닉·레거시 방문객·탈퇴 글은 null → 배지가 안 붙는 것 자체가 고정닉과의 구분이 된다.
 */
export function levelBadgeFor(authorId: string | null | undefined): LevelInfo | null {
  if (!DS.isAccountId(authorId)) return null
  const id = authorId as string
  const cached = levelCache.get(id)
  if (cached) return cached
  const u = DS.getUserById(id)
  if (!u) return null
  const info = computeLevel(computeXp(computeStats(id, u.createdAt)))
  levelCache.set(id, info)
  return info
}

/** 해당 작성자가 주어진 분야의 좋문가면 배지를, 아니면 null 을 반환. */
export function expertBadgeFor(authorId: string | null | undefined, type: ContentType): ExpertBadge | null {
  if (!authorId || authorId === 'deleted') return null
  const res = expertsForUser(authorId)
  if (!res) return null
  return res.badges.find(b => b.type === type) ?? null
}

/** 별점 단 글 목록에서 좋문가들의 평균 평점을 별도 집계 (전체 평점과 분리 표시용). */
export function expertRatingFor(rated: { authorId: string | null; rating?: number | null }[], type: ContentType): { avg: number; count: number } {
  const picked = rated.filter(r => r.rating != null && expertBadgeFor(r.authorId, type))
  if (!picked.length) return { avg: 0, count: 0 }
  const avg = Math.round((picked.reduce((s, r) => s + (r.rating || 0), 0) / picked.length) * 10) / 10
  return { avg, count: picked.length }
}

// ── 월간 시즌 랭킹 ──────────────────────────────────────────
// 영구 레벨과 분리된 "최근 30일" 활동 점수. 오래 활동한 사람의 상위권 독점을
// 막고 신규 회원에게도 경쟁 기회를 준다. (초안 원칙 1·9)
// 점수는 "최근 30일에 작성된 글"에서 파생 — 추천은 타임스탬프가 없어
// 최근 글의 현재 추천을 최근 반응의 근사값으로 사용한다.
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

  // 작성자별 가중치 맵은 재사용 (전체 이력 기준이므로 글마다 다시 안 만든다)
  const weightCache = new Map<string, Map<string, number>>()
  const weightFor = (uid: string) => {
    let m = weightCache.get(uid)
    if (!m) { m = buildLikeWeighting(uid); weightCache.set(uid, m) }
    return m
  }
  for (const p of DS.getDiscussions()) {
    if (!inWindow(p.createdAt) || !p.authorId || p.authorId === 'deleted') continue
    const base = (p.body || '').length >= EXPERT_RULE.expertLongMin ? XP_RULE.postLong : XP_RULE.postShort
    // 시즌에도 상호추천 감쇠·인당 상한을 적용 (품앗이 랭킹 farming 차단)
    const net = weightedLikesOfPost(p, weightFor(p.authorId), p.authorId)
    add(p.authorId, base + qualityXp(net))
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

/** 전체(누적) 랭킹 — 총 활동 XP 기준. 영구 레벨 순위. */
export function computeOverallRanking(limit = 30): { entries: SeasonEntry[] } {
  const ids = new Set<string>()
  for (const d of DS.getDiscussions()) if (d.authorId && d.authorId !== 'deleted') ids.add(d.authorId)
  for (const w of DS.getWatched()) ids.add(w.userId)
  for (const c of DS.getComments()) if (c.authorId && c.authorId !== 'deleted') ids.add(c.authorId)

  const entries: SeasonEntry[] = []
  for (const userId of ids) {
    const u = DS.getUserById(userId)
    if (!u || u.banned) continue
    const stats = computeStats(userId, u.createdAt)
    const experts = resolveExperts(u, stats)
    const level = computeLevel(computeXp(stats))
    entries.push({ userId, nickname: u.nickname, score: level.xp, level, topBadge: experts.badges[0] ?? null })
  }
  entries.sort((a, b) => b.score - a.score)
  return { entries: entries.slice(0, limit) }
}
