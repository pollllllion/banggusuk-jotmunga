/**
 * 작품(contents) — 조회·검색·관리자 편집·병합, 그리고 상세 컬럼 지연 로드.
 *
 * ⚠️ contents 는 RLS 상 **관리자만** 직접 쓸 수 있다(migration_rls_fix.sql).
 *    일반 사용자의 작품 생성·수정은 SECURITY DEFINER RPC 로만 간다:
 *    ensureContent / updateMyContent / registerWatched(social.ts) / mergeContent.
 */
import { supabase } from '@/lib/supabaseClient'
import { uuid, normalizeTitle } from '@/utils/helpers'
import type { Content, ContentType } from '@/types'
import { cache, load, store } from './cache'
import { CONTENT_DETAIL_COLS } from './contentColumns'
import { getReviews, saveReviews, getComments, saveComments } from './reviews'

export function getContents(): Content[] { return load('contents') }
export function saveContents(contents: Content[]) { store('contents', contents) }
export function getContentById(id: string) { return getContents().find(c => c.id === id) }

// 상세 컬럼을 이미 받아온 작품 (같은 작품을 다시 열어도 재요청하지 않게)
const detailLoaded = new Set<string>()

/**
 * 작품 상세 전용 컬럼(줄거리·출연진 등)만 뒤늦게 채운다.
 * 시작 로드에서는 이 컬럼들을 빼기 때문에(CONTENT_DETAIL_COLS) 상세 화면·캘린더 모달·
 * 관리자 편집처럼 실제로 필요한 곳에서 이걸 부른 뒤 화면을 갱신해야 한다.
 * @returns 캐시가 바뀌었으면 true (호출한 쪽에서 리렌더)
 */
export async function loadContentDetail(id: string): Promise<boolean> {
  if (!id || detailLoaded.has(id)) return false
  const { data, error } = await supabase
    .from('contents')
    .select(['id', ...CONTENT_DETAIL_COLS].join(','))
    .eq('id', id)
    .maybeSingle()
  if (error) { console.error('[loadContentDetail]', error.message); return false }
  detailLoaded.add(id)
  if (!data) return false
  const idx = cache.contents.findIndex((c: any) => c.id === id)
  if (idx < 0) return false
  cache.contents[idx] = { ...cache.contents[idx], ...(data as any) }
  return true
}

/**
 * 이 TMDB 작품이 이미 DB에 있나 — 통합검색의 TMDB 폴백에서 중복 노출을 막는 용도.
 * tmdbId 컬럼이 비어 있는 옛 행과 시즌별 행(tmdb-dr-123-s2)도 잡도록 행 id 로도 확인한다.
 */
export function hasTmdbContent(kind: 'movie' | 'tv', tmdbId: number): boolean {
  const prefix = kind === 'movie' ? `tmdb-mv-${tmdbId}` : `tmdb-dr-${tmdbId}`
  return getContents().some(c =>
    (c.tmdbId === tmdbId && (c.mediaType ?? kind) === kind) ||
    c.id === prefix || c.id.startsWith(`${prefix}-`))
}

/**
 * 통합 작품 검색 — 공백·문장부호를 무시(normalizeTitle)하고 매칭한다.
 * "유퀴즈" → "유 퀴즈 온 더 블럭", "전지적독자시점" → "전지적 독자 시점" 처럼
 * 띄어쓰기를 다르게 쳐도 찾아진다. (기존엔 원문 substring 이라 한 칸만 달라도 0건이었다)
 *
 * 점수: 제목 완전일치 > 제목 앞부분 > 제목 포함 > 원제 > 감독·작가 > 장르.
 * 동점이면 화제도(popularity) → 리뷰수 순. 숨긴 작품은 제외.
 *
 * 작품을 검색하는 곳(통합검색·본 작품 등록·토론 글쓰기·취향 프로필·토론방·관리자)은
 * 전부 이 함수를 쓴다. 각자 substring 으로 따로 구현하면 같은 검색어에 다른 결과가 나온다.
 * @param opts.includeHidden 숨긴 작품도 포함 (관리자 목록 전용 — 숨긴 걸 다시 찾아야 하므로)
 */
export function searchContents(query: string, limit = 8, opts?: { includeHidden?: boolean }): Content[] {
  const q = normalizeTitle(query)
  if (!q) return []
  const hits: { c: Content; score: number }[] = []
  for (const c of getContents()) {
    if (c.hidden && !opts?.includeHidden) continue
    const title = normalizeTitle(c.title)
    const original = normalizeTitle(c.originalTitle || '')
    let score = 0
    if (title === q) score = 100
    else if (title.startsWith(q)) score = 80
    else if (title.includes(q)) score = 60
    else if (original && original.startsWith(q)) score = 50
    else if (original && original.includes(q)) score = 40
    else if ((c.creators || []).some(cr => normalizeTitle(cr).includes(q))) score = 30
    else if ((c.genres || []).some(g => normalizeTitle(g).includes(q))) score = 20
    if (score) hits.push({ c, score })
  }
  hits.sort((a, b) =>
    b.score - a.score ||
    (b.c.popularity ?? 0) - (a.c.popularity ?? 0) ||
    (b.c.reviewCount ?? 0) - (a.c.reviewCount ?? 0))
  return hits.slice(0, limit).map(h => h.c)
}

/** 관리자 전용 (RLS: contents_insert = is_admin) */
export function createContent(data: Partial<Content>): Content {
  const content: Content = {
    id: uuid(), posterUrl: null, synopsis: '', genres: [], creators: [],
    platform: null, releaseYear: null, releaseDate: null, status: null, popularity: 0,
    avgRating: 0, reviewCount: 0, createdAt: new Date().toISOString(),
    ...data,
  } as Content
  saveContents([content, ...getContents()])
  return content
}

/** 관리자 전용 (RLS: contents_update = is_admin). 본인 등록작 수정은 updateMyContent. */
export function updateContent(id: string, updates: Partial<Content>): Content | null {
  const contents = getContents()
  const idx = contents.findIndex(c => c.id === id)
  if (idx < 0) return null
  const updated = { ...contents[idx], ...updates }
  const next = [...contents]; next[idx] = updated
  saveContents(next)
  return updated
}

/**
 * 중복 작품 병합 — 서버 RPC(merge_content). fromId 를 intoId 로 합치고 fromId 삭제.
 * watched·bookmarks·reviews·discussions 의 참조를 intoId 로 옮긴다. 관리자만.
 */
export async function mergeContent(fromId: string, intoId: string): Promise<void> {
  const { error } = await supabase.rpc('merge_content', { p_from: fromId, p_into: intoId })
  if (error) { console.error('[merge_content]', error); throw error }

  // 캐시 반영 — watched/bookmarks 는 대상에 이미 있으면 원본 링크 제거 후 이전
  const movePk = (rows: any[]) => {
    const intoUsers = new Set(rows.filter(r => r.contentId === intoId).map(r => r.userId))
    return rows
      .filter(r => !(r.contentId === fromId && intoUsers.has(r.userId)))
      .map(r => r.contentId === fromId ? { ...r, contentId: intoId } : r)
  }
  cache.watched = movePk(cache.watched)
  cache.bookmarks = movePk(cache.bookmarks)
  cache.reviews = cache.reviews.map((r: any) => r.contentId === fromId ? { ...r, contentId: intoId } : r)
  cache.discussions = cache.discussions.map((d: any) => d.contentId === fromId ? { ...d, contentId: intoId } : d)
  cache.contents = cache.contents.filter((c: any) => c.id !== fromId)
  // 대상 평점/리뷰수 재집계
  const revs = cache.reviews.filter((r: any) => r.contentId === intoId)
  const avg = revs.length ? Math.round((revs.reduce((s: number, r: any) => s + (r.rating || 0), 0) / revs.length) * 10) / 10 : 0
  cache.contents = cache.contents.map((c: any) => c.id === intoId ? { ...c, avgRating: avg, reviewCount: revs.length } : c)
}

/** 관리자 전용 */
export function deleteContent(id: string) {
  const removedReviews = getReviews().filter(r => r.contentId === id).map(r => r.id)
  saveContents(getContents().filter(c => c.id !== id))
  saveReviews(getReviews().filter(r => r.contentId !== id))
  saveComments(getComments().filter(c => !removedReviews.includes(c.reviewId)))
}

export interface EnsureContentInput {
  contentId: string
  type: ContentType
  title: string
  posterUrl?: string | null
  releaseYear?: number | null
  synopsis?: string
  platform?: string | null
}

/**
 * 통합검색 TMDB 폴백용 — 작품이 DB에 없으면 그 자리에서 만들어 준다(RPC ensure_content).
 * 이미 있으면 서버가 기존 행을 그대로 돌려주므로 중복이 생기지 않는다.
 * 시청 기록(watched)은 만들지 않는다 — 검색해서 눌러본 것뿐이므로.
 */
export async function ensureContent(input: EnsureContentInput): Promise<Content> {
  const cached = getContentById(input.contentId)
  if (cached) return cached
  const { data, error } = await supabase.rpc('ensure_content', {
    p_content_id: input.contentId,
    p_type: input.type,
    p_title: input.title,
    p_poster_url: input.posterUrl ?? null,
    p_release_year: input.releaseYear ?? null,
    p_synopsis: input.synopsis ?? '',
    p_platform: input.platform ?? null,
  })
  if (error) {
    console.error('[ensure_content]', error)
    // 마이그레이션(supabase/migration_ensure_content.sql)이 아직 SQL Editor 에 적용 안 된 경우
    if (error.code === 'PGRST202') throw new Error('작품 등록 기능이 아직 서버에 반영되지 않았어요.')
    throw error
  }
  const content = data as Content
  // 캐시 반영 (store 를 쓰면 클라이언트가 contents 를 upsert 하려다 RLS에 막힌다)
  if (content && !cache.contents.some((c: any) => c.id === content.id)) {
    cache.contents = [content, ...cache.contents]
  }
  return content
}

export interface UpdateMyContentInput {
  contentId: string
  title: string
  posterUrl?: string | null
  platform?: string | null
  releaseYear?: number | null
}

/**
 * 내가 등록한 작품 정보 수정 — 서버 RPC(update_my_content).
 * createdBy = 본인인 작품만 수정됨(서버에서 검증). 수정된 content 반환.
 */
export async function updateMyContent(input: UpdateMyContentInput): Promise<Content> {
  const { data, error } = await supabase.rpc('update_my_content', {
    p_content_id: input.contentId,
    p_title: input.title,
    p_poster_url: input.posterUrl ?? null,
    p_platform: input.platform ?? null,
    p_release_year: input.releaseYear ?? null,
  })
  if (error) { console.error('[update_my_content]', error); throw error }
  const content = data as Content
  // 캐시 반영 (즉시 표시)
  cache.contents = cache.contents.map((c: any) => c.id === content.id ? content : c)
  return content
}
