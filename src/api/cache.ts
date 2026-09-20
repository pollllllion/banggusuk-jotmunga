/**
 * 데이터 계층의 뼈대 — 인메모리 캐시 + write-through 동기화 + 앱 시작 로드.
 *
 * 읽기(getX)는 캐시에서 동기적으로, 쓰기(saveX)는 캐시 갱신 + Supabase 동기화(비동기).
 * 도메인별 함수는 contents/reviews/discussions/social/users.ts 에 있고,
 * 전부 dataService.ts 에서 다시 내보낸다(기존 import 경로 유지).
 */
import { supabase } from '@/lib/supabaseClient'
import { UPCOMING_SEED } from '@/utils/upcomingSeed'
import { CONTENT_LIST_COLS } from './contentColumns'
import { CURATION_LIST_COLS } from './curationColumns'
import { isSnapshotUsable, BOOT_SNAPSHOT_VERSION, type BootSnapshot } from '@/utils/bootSnapshot'

export type Table =
  | 'users' | 'contents' | 'reviews' | 'comments'
  | 'bookmarks' | 'content_alerts' | 'watched' | 'blocks' | 'notifications' | 'reports' | 'announcements' | 'discussions' | 'discussion_comments' | 'profiles' | 'curations'

const TABLES: Table[] = ['users', 'contents', 'reviews', 'comments', 'bookmarks', 'content_alerts', 'watched', 'blocks', 'notifications', 'reports', 'announcements', 'discussions', 'discussion_comments', 'profiles', 'curations']

export const cache: Record<Table, any[]> = {
  users: [], contents: [], reviews: [], comments: [],
  bookmarks: [], content_alerts: [], watched: [], blocks: [], notifications: [], reports: [], announcements: [], discussions: [], discussion_comments: [], profiles: [], curations: [],
}

/** 테이블별 기본키 컬럼. watched·bookmarks·content_alerts·blocks 는 복합키라 id 컬럼이 아예 없다. */
function pkCols(t: Table): string[] {
  if (t === 'bookmarks' || t === 'content_alerts' || t === 'watched') return ['userId', 'contentId']
  if (t === 'blocks') return ['blockerId', 'blockedId']
  return ['id']
}

function rowKey(t: Table, r: any): string {
  return pkCols(t).map(c => r[c]).join('|')
}

function conflictCols(t: Table): string {
  if (t === 'bookmarks' || t === 'content_alerts') return 'userId,contentId'
  if (t === 'blocks') return 'blockerId,blockedId'
  return 'id'
}

// ── Cache primitives ────────────────────────────────────────
export function load<T>(key: Table): T[] { return cache[key] as T[] }

/** 쓰기 결과. ok=false 면 캐시에는 들어갔지만 서버에는 안 들어갔다는 뜻이다. */
export type PersistResult = { ok: true } | { ok: false; error: string }

/**
 * 서버까지 저장이 가지 못했을 때 던진다. 화면은 이걸 잡아 message 를 그대로 보여준다.
 * detail 에는 원인(RLS 거부·네트워크 등)이 들어 있다 — 사용자에겐 안 보여준다.
 */
export class SaveFailedError extends Error {
  detail: string
  constructor(detail: string) {
    super('저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.')
    this.name = 'SaveFailedError'
    this.detail = detail
  }
}

/**
 * 캐시 갱신 + 서버 동기화.
 *
 * 반환하는 Promise 를 **무시해도 되지만**, 사용자가 만든 콘텐츠(글·댓글)를 쓰는
 * 자리에서는 반드시 await 해서 실패를 화면에 알려야 한다. 안 그러면 저장이 실패해도
 * "올렸어요!" 가 뜨고, 사용자는 새로고침하고 나서야 글이 없어진 걸 안다.
 */
export function store(key: Table, val: any[]): Promise<PersistResult> {
  const prev = cache[key] || []
  cache[key] = val
  return persist(key, prev, val)
}

/**
 * ⚠️ supabase-js 는 RLS 거부·제약 위반을 **throw 하지 않고** { error } 로 돌려준다.
 *    예전엔 그 error 를 아무도 안 봐서 try/catch 가 네트워크 예외만 잡았고,
 *    권한 문제로 글이 안 써져도 조용히 성공한 척했다. 이제 매 호출의 error 를 본다.
 */
async function persist(t: Table, prev: any[], next: any[]): Promise<PersistResult> {
  try {
    const prevByKey = new Map(prev.map(r => [rowKey(t, r), r]))
    const nextKeys = new Set(next.map(r => rowKey(t, r)))
    // 삭제된 행
    const removed = prev.filter(r => !nextKeys.has(rowKey(t, r)))
    for (const r of removed) {
      const del = supabase.from(t).delete()
      const q = (t === 'bookmarks' || t === 'content_alerts') ? del.eq('userId', r.userId).eq('contentId', r.contentId)
        : t === 'blocks' ? del.eq('blockerId', r.blockerId).eq('blockedId', r.blockedId)
        : del.eq('id', r.id)
      const { error } = await q
      if (error) return fail(t, 'delete', error.message)
    }
    // 새로/바뀐 행만 upsert (RLS: 남의 행 통짜 upsert 방지 — 본인이 바꾼 것만 씀)
    const changed = next.filter(r => {
      const p = prevByKey.get(rowKey(t, r))
      return !p || JSON.stringify(p) !== JSON.stringify(r)
    })
    if (changed.length) {
      const rows = t === 'users' ? changed.map(({ password, ...u }: any) => u) : changed
      const { error } = await supabase.from(t).upsert(rows, { onConflict: conflictCols(t) })
      if (error) return fail(t, 'upsert', error.message)
    }
    return { ok: true }
  } catch (e: any) {
    return fail(t, 'exception', e?.message || String(e))
  }
}

function fail(t: Table, op: string, message: string): PersistResult {
  console.error('[supabase persist]', t, op, message)
  return { ok: false, error: message }
}

// ── Load all (앱 시작 시) ────────────────────────────────────
/** 같은 행이 두 번 들어오지 않게 PK 기준으로 접는다 (중복 방어의 마지막 관문) */
function dedupeRows(t: Table, rows: any[]): any[] {
  const byKey = new Map<string, any>()
  for (const r of rows) byKey.set(rowKey(t, r), r)
  return [...byKey.values()]
}

function selectCols(t: Table): string {
  if (t === 'contents') return CONTENT_LIST_COLS
  // 큐레이션 본문은 한 편에 수백~수천 자다 — 목록 화면이 안 쓰는 body·items 는 상세에서 받는다
  if (t === 'curations') return CURATION_LIST_COLS
  return '*'
}

/**
 * 한 테이블 전체를 페이지네이션으로 로드.
 * PostgREST는 한 번의 select에 기본 1000행만 반환하므로, .range()로 끝까지 긁는다.
 * (안 그러면 contents가 1000행을 넘는 순간 최근 행들이 캐시에 안 올라와
 *  그 content를 참조하는 watched/피드 항목이 화면에서 사라진다.)
 *
 * order 를 반드시 준다: ORDER BY 없는 LIMIT/OFFSET 은 순서를 보장하지 않아서,
 * 페이지를 넘기는 사이에 행이 UPDATE/INSERT 되면 같은 행이 두 페이지에 걸쳐
 * 두 번 들어오거나(→ 목록·검색에 같은 작품이 두 개) 어떤 행은 아예 빠진다.
 * 1000행을 넘긴 contents 에서 실제로 문제가 되는 지점.
 */
async function selectAllRows(t: Table): Promise<any[] | null> {
  const PAGE = 1000
  const all: any[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(t).select(selectCols(t))
    for (const col of pkCols(t)) q = q.order(col, { ascending: true })
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) { console.error('[supabase load]', t, error.message); return null }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
  }
  return dedupeRows(t, all)
}

/**
 * ══════════════════════════════════════════════════════════════
 * 시작 로드는 두 단계다 (2026-09-09).
 *
 * 예전엔 loadAll() 하나가 전 테이블을 다 받을 때까지 첫 페인트를 막았다.
 * 실측으로 contents 2,227행 = 1,875KB(gzip 256KB)를 1000행씩 **3회 순차 왕복**.
 * 그런데 캘린더 첫 화면에 실제로 필요한 건 ±1개월치, 전체의 16% 뿐이었다.
 *
 *   1단계 loadEssential()  작은 표 전부 + 지금 화면에 필요한 작품만 → 여기서 화면을 그린다
 *   2단계 loadRest()       작품 전체를 백그라운드로 마저 받아 캐시를 채운다
 *
 * 2단계가 있어야 하는 이유: 검색(searchContents)을 쓰는 6곳이 "작품 전체가
 * 메모리에 있다"를 전제한다. 그 전제를 깨지 않으려고 범위 로딩 대신 2단계를 골랐다.
 * ══════════════════════════════════════════════════════════════
 */

/** 작품 전체가 캐시에 들어왔나. false 인 동안은 "없는 작품"과 "아직 안 온 작품"을 구분해야 한다. */
let contentsComplete = false
export function isContentsComplete(): boolean { return contentsComplete }

/** 2단계가 끝나면 화면을 다시 그려야 한다 — authStore 가 여기에 콜백을 건다. */
let onContentsComplete: (() => void) | null = null
export function setOnContentsComplete(fn: () => void) { onContentsComplete = fn }

/** 1단계에서 받아 둘 작품의 공개일 범위 — 지난달부터 두 달 뒤까지.
 *  캘린더 기본 화면(이번 달)과 앞뒤 한 번의 달 이동을 덮는다. */
const WINDOW_BACK_MONTHS = 1
const WINDOW_FWD_MONTHS = 2

function windowRange(base = new Date()): { from: string; to: string } {
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return {
    from: key(new Date(base.getFullYear(), base.getMonth() - WINDOW_BACK_MONTHS, 1)),
    to: key(new Date(base.getFullYear(), base.getMonth() + WINDOW_FWD_MONTHS + 1, 0)),
  }
}

/**
 * 지금 주소가 보여 달라는 달. ?ym=2026-12 로 들어온 사람에게 이번 달을 받아 주면
 * 그 달이 빈 채로 그려지고 2단계가 끝나야 채워진다.
 */
function baseMonthFromUrl(): Date {
  try {
    const ym = new URLSearchParams(window.location.search).get('ym')
    const hit = /^(\d{4})-(\d{2})$/.exec((ym || '').trim())
    if (hit) {
      const y = Number(hit[1]), m = Number(hit[2]) - 1
      if (m >= 0 && m <= 11 && y >= 1900 && y <= 2200) return new Date(y, m, 1)
    }
  } catch { /* SSR·프리렌더 등 window 없음 */ }
  return new Date()
}

/** 주소가 /content/:id 면 그 작품은 1단계에 반드시 있어야 한다(딥링크가 튕기지 않게). */
function contentIdFromUrl(): string | null {
  try {
    const hit = /^\/content\/([^/?#]+)/.exec(window.location.pathname)
    return hit ? decodeURIComponent(hit[1]) : null
  } catch { return null }
}

/** id 목록으로 작품을 받아 캐시에 합친다 (URL 길이 제한 때문에 100개씩) */
async function fetchContentsByIds(ids: string[]): Promise<any[]> {
  const out: any[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from('contents').select(CONTENT_LIST_COLS).in('id', ids.slice(i, i + 100))
    if (error) { console.error('[supabase load] contents by id', error.message); break }
    if (data) out.push(...data)
  }
  return out
}

/**
 * 1단계에서 받을 작품:
 *   ① 보고 있는 달 언저리(공개일 범위)
 *   ② 이미 받아 둔 글·댓글이 가리키는 작품 — 토론방 목록이 작품 없는 글을 걸러내기
 *      때문에(DiscussionRoomPage), 이게 없으면 목록이 텅 빈 것처럼 보인다
 *   ③ 주소가 /content/:id 면 그 작품
 */
/**
 * 다음 회차가 잡힌 작품들 (id → 날짜·회차). 방영 중인 시리즈 수십 편뿐이다.
 *
 * CONTENT_LIST_COLS 에 넣지 않고 **따로 받는 이유**:
 *   ① 그 목록은 통째로 select 에 들어간다 — 칸이 DB 에 없으면(migration_next_episode.sql 적용 전)
 *      작품 로드 전체가 400 으로 죽는다. 여기서는 이 조회 하나만 실패하고 표시가 안 나올 뿐이다
 *   ② 2천여 행 전부에 null 두 칸을 실어 나를 이유가 없다 (시작 로드 용량 · 불변식 ②)
 */
async function loadNextEpisodes(): Promise<Map<string, { date: string; number: number | null }>> {
  const out = new Map<string, { date: string; number: number | null }>()
  try {
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const { data, error } = await supabase.from('contents')
      .select('id,nextEpisodeDate,nextEpisodeNumber').gte('nextEpisodeDate', today)
    if (error) return out
    for (const r of (data ?? []) as unknown as any[]) out.set(r.id, { date: String(r.nextEpisodeDate).slice(0, 10), number: r.nextEpisodeNumber ?? null })
  } catch { /* 표시만 안 나온다 */ }
  return out
}

/**
 * 캘린더에 올릴 숏폼 id (migration_shortform_pick.sql). 수십 편뿐이다.
 * 다음 회차와 같은 이유로 목록 컬럼에 넣지 않고 따로 받는다 — 칸이 아직 없으면 이 조회만 실패하고
 * 숏폼이 캘린더에 안 뜰 뿐, 작품 로드는 멀쩡하다.
 */
async function loadCalendarPicks(): Promise<Set<string>> {
  try {
    const { data, error } = await supabase.from('contents').select('id').eq('calendarPick', true)
    if (error) return new Set()
    return new Set(((data ?? []) as unknown as { id: string }[]).map(r => r.id))
  } catch { return new Set() }
}

/**
 * 누적관객수가 적힌 작품 (id → 명). 한국 극장 개봉 영화 수백 편뿐이다
 * (supabase/migration_kofic.sql · scripts/sync-kofic.mjs).
 *
 * 다음 회차·숏폼 픽과 같은 이유로 목록 컬럼에 넣지 않고 따로 받는다 — 칸이 없으면 이 조회만
 * 실패하고 관객수가 안 보일 뿐이다. 값이 있는 행만 받으므로 gzip 0.7KB(2026-09-20 실측).
 *
 * 2단계(loadRest)가 목록 컬럼만 담은 새 행으로 덮으므로, 받은 표를 모듈에 들고 있다가
 * 그쪽에서도 다시 얹는다 — 안 그러면 작품 전체가 오는 순간 관객수가 사라진다.
 */
let audienceById = new Map<string, number>()

async function loadAudience(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  try {
    const { data, error } = await supabase.from('contents')
      .select('id,koficAudience').not('koficAudience', 'is', null)
    if (error) return out
    for (const r of (data ?? []) as unknown as any[]) {
      const n = Number(r.koficAudience)
      if (Number.isFinite(n) && n > 0) out.set(r.id, n)
    }
  } catch { /* 표시만 안 나온다 */ }
  return out
}

/** 마지막 1단계가 받은 공개일 범위 — 부팅 스냅샷에 같이 적는다 */
let lastWindow: { from: string; to: string } | null = null

async function loadContentsWindow(src: Record<Table, any[]>): Promise<any[]> {
  const { from, to } = windowRange(baseMonthFromUrl())
  lastWindow = { from, to }
  const nextEpisodesP = loadNextEpisodes()   // 작품 창과 나란히 받는다
  const picksP = loadCalendarPicks()
  const audienceP = loadAudience()
  const { data, error } = await supabase.from('contents').select(CONTENT_LIST_COLS)
    .gte('releaseDate', from).lte('releaseDate', to)
  if (error) { console.error('[supabase load] contents window', error.message) }
  const rows = data || []

  /**
   * 창 밖이지만 **사람이 손댄 작품**은 1단계에 반드시 있어야 한다.
   *
   * 화면들이 id → 작품을 찾아 그리는데, 못 찾으면 그 줄을 조용히 버린다
   * (ProfileShowcase 의 favWorks, MyFeedPage 의 본 작품·찜 …). 2단계가 끝나기 전에
   * 그 화면을 열면 **등록해 둔 것이 사라진 것처럼 보인다.** 실제로 그랬다 —
   * 2026-09-16, 인생작품 5편(나의 해방일지·커피프린스·미생·비밀의 숲·곡성)이
   * 전부 옛 작품이라 창(지난달~두 달 뒤) 밖이었고, "또 없어졌다"가 반복됐다.
   * 2단계가 끝나면 다시 나타나니 "어쩔 땐 나오고 어쩔 땐 누락"으로 보였다.
   *
   * 글·리뷰가 가리키는 작품은 원래 여기서 챙기고 있었다. 본 작품·찜·인생작품이
   * 빠져 있었을 뿐이다 — 같은 이유로 같이 챙긴다.
   */
  const have = new Set(rows.map((r: any) => r.id))
  const need = new Set<string>()
  const want = (id: string | null | undefined) => { if (id && !have.has(id)) need.add(id) }
  for (const d of src.discussions) want(d.contentId)
  for (const r of src.reviews) want(r.contentId)
  for (const w of src.watched) want(w.contentId)
  for (const b of src.bookmarks) want(b.contentId)
  for (const p of src.profiles) for (const id of (p.favoriteWorks || [])) want(id)
  want(contentIdFromUrl())
  // 방영 중인 작품은 첫 공개가 몇 달 전이라 창 밖일 수 있다 — 달력이 회차를 그리려면 작품 행이 있어야 한다
  const nextEpisodes = await nextEpisodesP
  for (const id of nextEpisodes.keys()) want(id)
  // 고른 숏폼도 — 2단계 행에는 이 표시가 없어서, 1단계에서 붙여 둬야 달을 넘겨도 남는다
  const picks = await picksP
  for (const id of picks) want(id)

  audienceById = await audienceP

  if (need.size) rows.push(...await fetchContentsByIds([...need]))
  for (const r of rows as any[]) {
    const ne = nextEpisodes.get(r.id)
    if (ne) { r.nextEpisodeDate = ne.date; r.nextEpisodeNumber = ne.number }
    if (picks.has(r.id)) r.calendarPick = true
    const audi = audienceById.get(r.id)
    if (audi) r.koficAudience = audi
  }
  return dedupeRows('contents', rows)
}

/** 1단계 — 이게 끝나면 화면을 그려도 된다 */
export async function loadEssential() {
  // 다 받은 뒤 **한 번에** 캐시에 넣는다. 부팅 스냅샷으로 이미 화면이 떠 있을 수 있어서,
  // 표마다 따로 바뀌면 그 사이 다시 그려질 때 '새 글 + 옛 작품 목록' 같은 어긋난 조합이 보인다.
  // 받은 표만 넣는다 — 실패한 표는 기존 값을 두고, 받는 동안 사용자가 쓴 값도 덮지 않는다.
  const fetched: Partial<Record<Table, any[]>> = {}
  // users(레거시 게스트)는 방문자 수만큼 늘어나는 표라 통째로 받지 않는다 — 아래서 따로.
  // contents 는 유일하게 큰 표라 따로 뺀다(나머지 전부 합쳐도 30KB 남짓).
  await Promise.all(TABLES.filter(t => t !== 'users' && t !== 'contents').map(async t => {
    const rows = await selectAllRows(t)
    if (rows) fetched[t] = rows
  }))
  fetched.contents = await loadContentsWindow({ ...cache, ...fetched })
  const users = await loadGuestUsers({ ...cache, ...fetched })
  if (users) fetched.users = users
  Object.assign(cache, fetched)
  injectUpcomingSeed()
}

/**
 * 2단계 — 작품 전체. 백그라운드에서 돈다.
 *
 * 1단계에서 받은 행에는 상세 컬럼(줄거리·출연진)이 채워져 있을 수 있다
 * (작품을 열면 loadContentDetail 이 그 행만 채운다). 목록 컬럼만 담은 새 행으로
 * 통째로 덮으면 그게 날아가므로 **기존 행 위에 덮어쓴다**(빠진 키는 그대로 남는다).
 */
export async function loadRest() {
  const fresh = await selectAllRows('contents')
  if (!fresh) return   // 실패하면 창(window) 데이터로 계속 쓴다 — 다음 방문에 다시 시도
  const prevById = new Map(cache.contents.map((c: any) => [c.id, c]))
  const merged = fresh.map((r: any) => {
    const prev = prevById.get(r.id)
    const row = prev ? { ...prev, ...r } : r
    // 곁다리로 받은 값은 목록 컬럼에 없다 — 새 행으로 덮인 뒤 다시 얹는다
    const audi = audienceById.get(row.id)
    if (audi) row.koficAudience = audi
    return row
  })
  // 로드 중에 새로 만들어진 작품(ensureContent)이 fresh 에 없을 수 있다
  const freshIds = new Set(fresh.map((r: any) => r.id))
  const extras = cache.contents.filter((c: any) => !freshIds.has(c.id))
  cache.contents = [...merged, ...extras]
  contentsComplete = true
  onContentsComplete?.()
}

/** 옛 이름 — 한 번에 다 받는다. 스크립트·테스트가 쓰던 진입점을 남겨 둔다. */
export async function loadAll() {
  await loadEssential()
  await loadRest()
}

/**
 * 게스트(유동닉) 계정 중 **화면에 이름이 필요한 행만** 받는다.
 * 전부 받으면 방문자 수에 비례해 커진다 — 2026-08-17 기준 1,076행 150KB 이고,
 * 방문자가 1만 명이 되면 그것만으로 1.4MB 를 매 방문마다 받게 된다.
 * 필요한 건 ① 이 브라우저의 게스트 계정 ② 글·댓글·차단·신고에 등장하는 작성자뿐이다.
 * (유동닉 글은 guestName 을 행에 직접 들고 있어서 대부분 이 테이블이 필요 없다)
 */
/** 받은 행을 돌려준다. null = 실패(기존 캐시를 그대로 둔다) */
async function loadGuestUsers(src: Record<Table, any[]>): Promise<any[] | null> {
  const ids = new Set<string>()
  try {
    // 옛 키(신원이 DB 에 있던 시절). 지금 게스트는 localStorage 에만 있어서 받을 행이 없다.
    const mine = localStorage.getItem('bangjot_anon_id')
    if (mine) ids.add(mine)
  } catch { /* 사생활 보호 모드 등에서 localStorage 접근 불가 */ }

  for (const rows of [src.reviews, src.comments, src.discussions, src.discussion_comments]) {
    for (const r of rows) if (r.authorId) ids.add(r.authorId)
  }
  for (const b of src.blocks) { if (b.blockerId) ids.add(b.blockerId); if (b.blockedId) ids.add(b.blockedId) }
  for (const r of src.reports) if (r.reporterId) ids.add(r.reporterId)

  // 계정(profiles)에 있는 id 는 users 테이블에 없다 — 조회할 필요가 없다
  const profileIds = new Set(src.profiles.map((p: any) => p.id))
  const need = [...ids].filter(id => id && id !== 'deleted' && !profileIds.has(id))
  if (!need.length) return []

  const rows: any[] = []
  // URL 길이 제한 때문에 나눠서 조회
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100)
    const { data, error } = await supabase.from('users').select('*').in('id', chunk)
    if (error) { console.error('[supabase load] users', error.message); return null }
    if (data) rows.push(...data)
  }
  return rows
}

/**
 * RLS로 "본인 것만" 보이는 유저별 테이블.
 * 이 테이블들은 auth.uid()가 있어야 행이 반환되므로, 로그인/로그아웃 등
 * 인증 상태가 바뀐 뒤 반드시 다시 로드해야 한다. (안 그러면 anon으로 로드된
 * 빈 캐시가 남아 내 피드/찜/알림이 텅 빈 것처럼 보인다.)
 */
const USER_SCOPED: Table[] = ['watched', 'bookmarks', 'content_alerts', 'blocks', 'notifications', 'reports']

export async function reloadUserScoped() {
  await Promise.all(USER_SCOPED.map(async t => {
    const rows = await selectAllRows(t)
    if (rows) cache[t] = rows
  }))
}

/**
 * ── 부팅 스냅샷 ─────────────────────────────────────────────
 * 다시 온 사람에게 첫 화면을 '로딩 중' 없이 그리려고, 1단계가 끝난 캐시를 localStorage 에 떠 둔다.
 * 판정 규칙은 utils/bootSnapshot.ts. 크기는 npm run payload 의 '1단계 합계'(압축 전)와 같다.
 *
 * 유저별 표(USER_SCOPED: 찜·알림·신고…)는 넣지 않는다. 남의 PC 에 개인 활동이 남으면 안 되고,
 * "로그인 상태 유지"를 끈 사람의 토큰은 탭을 닫으면 지워지는데 사본만 남는 것도 이상하다.
 * 그 표들은 새로 받는 1초 사이에만 비어 보인다.
 */
const BOOT_KEY = 'ottcal_boot'

export function saveBootSnapshot() {
  if (!lastWindow) return
  try {
    const tables: Record<string, any[]> = {}
    for (const t of TABLES) {
      if (USER_SCOPED.includes(t)) continue
      tables[t] = t === 'users' ? cache.users.map(({ password: _pw, ...u }: any) => u) : cache[t]
    }
    const snap: BootSnapshot = { v: BOOT_SNAPSHOT_VERSION, at: Date.now(), ...lastWindow, tables }
    localStorage.setItem(BOOT_KEY, JSON.stringify(snap))
  } catch {
    // 용량 초과·사생활 보호 모드 — 옛 사본이 남아 헷갈리지 않게 지우고, 다음엔 평소처럼 뜬다
    try { localStorage.removeItem(BOOT_KEY) } catch { /* 무시 */ }
  }
}

/** 쓸 수 있는 사본이면 캐시에 채우고 true. 아니면 아무것도 건드리지 않고 false */
export function restoreBootSnapshot(): boolean {
  try {
    const raw = localStorage.getItem(BOOT_KEY)
    if (!raw) return false
    const snap = JSON.parse(raw)
    const { from, to } = windowRange(baseMonthFromUrl())
    if (!isSnapshotUsable(snap, { now: Date.now(), from, to, contentId: contentIdFromUrl() })) return false
    for (const t of TABLES) {
      if (USER_SCOPED.includes(t)) continue
      const rows = snap.tables[t]
      if (Array.isArray(rows)) cache[t] = rows
    }
    return true
  } catch {
    return false
  }
}

/**
 * 개봉예정 시드를 캐시에 주입 (클라이언트 전용, Supabase에는 쓰지 않음).
 * contents 테이블에 releaseDate가 실제로 채워지기 전까지 캘린더를 살아있게 유지한다.
 * 같은 제목이 이미 DB에 있으면 스킵 → 실데이터가 시드를 대체.
 */
function injectUpcomingSeed() {
  // DB에 이미 실제 예정작(releaseDate 보유)이 있으면 시드는 넣지 않는다.
  const hasReal = cache.contents.some((c: any) => c.releaseDate)
  if (hasReal) return
  const existing = new Set(cache.contents.map((c: any) => c.title))
  const add = UPCOMING_SEED.filter(s => !existing.has(s.title))
  if (add.length) cache.contents = [...add, ...cache.contents]
}

// authStore 호환용 별칭
export const seed = loadAll
