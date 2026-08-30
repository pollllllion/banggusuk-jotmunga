/**
 * 큐레이션(기획 글) — 조회·관리자 편집, 본문 지연 로드.
 *
 * ⚠️ RLS 상 쓰기는 **관리자만**이고, 읽기는 발행된 글만 공개다(migration_curations.sql).
 *    초안(status='draft')은 관리자로 로그인했을 때만 캐시에 들어온다.
 */
import { supabase } from '@/lib/supabaseClient'
import type { Curation } from '@/types'
import { cache, load, store } from './cache'
import { CURATION_DETAIL_COLS } from './curationColumns'

export function getCurations(): Curation[] { return load('curations') }
export function saveCurations(list: Curation[]) { store('curations', list) }

export function getCurationById(id: string) { return getCurations().find(c => c.id === id) }

/** 공개 목록 — 발행된 글만, 최신순 */
export function getPublishedCurations(): Curation[] {
  return getCurations()
    .filter(c => c.status === 'published' && c.publishedAt)
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
}

// 본문을 이미 받아온 글 (같은 글을 다시 열어도 재요청하지 않게)
const detailLoaded = new Set<string>()
// items 만 따로 받아온 글 — body 는 아직 없으므로 detailLoaded 와 섞으면 안 된다
const itemsLoaded = new Set<string>()

/**
 * 목록 카드에 작품 포스터를 그리려면 items 가 필요하다.
 * body(수백~수천 자)는 빼고 items 만 **한 번의 질의로** 전부 채운다.
 * ⚠️ detailLoaded 에 넣지 말 것 — 그러면 상세 화면이 body 를 영영 안 받아온다.
 */
export async function loadCurationItems(): Promise<boolean> {
  const need = getCurations().filter(c => !itemsLoaded.has(c.id)).map(c => c.id)
  if (!need.length) return false
  const { data, error } = await supabase.from('curations').select('id,items').in('id', need)
  if (error) { console.error('[loadCurationItems]', error.message); return false }
  for (const row of data || []) {
    itemsLoaded.add(row.id)
    const idx = cache.curations.findIndex((c: any) => c.id === row.id)
    if (idx >= 0) cache.curations[idx] = { ...cache.curations[idx], items: (row as any).items }
  }
  return (data || []).length > 0
}

/**
 * 본문·작품목록만 뒤늦게 채운다. 시작 로드에서는 빼기 때문에(CURATION_DETAIL_COLS)
 * 상세 화면·관리자 편집에서 이걸 부른 뒤 리렌더해야 한다.
 * @returns 캐시가 바뀌었으면 true
 */
export async function loadCurationDetail(id: string): Promise<boolean> {
  if (!id || detailLoaded.has(id)) return false
  const { data, error } = await supabase
    .from('curations')
    .select(['id', ...CURATION_DETAIL_COLS].join(','))
    .eq('id', id)
    .maybeSingle()
  if (error) { console.error('[loadCurationDetail]', error.message); return false }
  detailLoaded.add(id)
  itemsLoaded.add(id)
  if (!data) return false
  const idx = cache.curations.findIndex((c: any) => c.id === id)
  if (idx < 0) return false
  cache.curations[idx] = { ...cache.curations[idx], ...(data as any) }
  return true
}

/** 슬러그가 이미 쓰였나 (자기 자신은 제외) */
export function curationSlugTaken(id: string, exceptId?: string): boolean {
  return getCurations().some(c => c.id === id && c.id !== exceptId)
}

export function createCuration(data: Partial<Curation>): Curation {
  const now = new Date().toISOString()
  const c: Curation = {
    id: data.id!,
    title: data.title || '',
    summary: data.summary || '',
    body: data.body || '',
    items: data.items || [],
    coverUrl: data.coverUrl ?? null,
    status: 'draft',
    publishedAt: null,
    authorId: data.authorId ?? null,
    createdAt: now,
    updatedAt: now,
  }
  saveCurations([c, ...getCurations()])
  detailLoaded.add(c.id)
  itemsLoaded.add(c.id)
  return c
}

export function updateCuration(id: string, updates: Partial<Curation>) {
  saveCurations(getCurations().map(c =>
    c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c))
}

/** 발행 — publishedAt 은 처음 발행할 때만 찍는다(재발행이 날짜를 밀지 않게) */
export function publishCuration(id: string) {
  const c = getCurationById(id)
  updateCuration(id, { status: 'published', publishedAt: c?.publishedAt || new Date().toISOString() })
}

export function unpublishCuration(id: string) {
  updateCuration(id, { status: 'draft' })
}

export function deleteCuration(id: string) {
  saveCurations(getCurations().filter(c => c.id !== id))
}

/**
 * 이 작품이 실린 발행 글 — 작품 페이지의 역링크용.
 *
 * items 는 시작 로드에서 빠져 있어서(curationColumns.ts) 캐시로는 알 수 없다.
 * jsonb 포함(cs) 질의로 DB 에 직접 물어본다. 인덱스는 없지만 curations 는 수십 행이다.
 */
export async function getCurationsForContent(contentId: string): Promise<Curation[]> {
  if (!contentId) return []
  const { data, error } = await supabase
    .from('curations')
    .select('id,title,summary,publishedAt')
    .eq('status', 'published')
    .contains('items', [{ contentId }])
    .order('publishedAt', { ascending: false })
  if (error) { console.error('[getCurationsForContent]', error.message); return [] }
  return (data || []) as Curation[]
}
