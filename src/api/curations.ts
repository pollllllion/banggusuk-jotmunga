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
