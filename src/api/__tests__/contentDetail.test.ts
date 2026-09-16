import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 상세 컬럼 지연 로드 — "어쩔 땐 나오고 어쩔 땐 누락된다" 버그의 회귀 테스트.
 *
 * 시작 로드가 2단계라, 1단계 창(window) 밖 작품은 2단계가 끝나야 캐시에 들어온다.
 * 그 전에 작품방을 열면 상세 요청은 성공하지만 얹을 행이 없다. 예전 코드는 이때
 * 'ready' 를 돌려줘서 받아 온 줄거리·출연진을 통째로 버렸고, 훅은 같은 id 로 다시
 * 묻지 않으니 새로고침 전까지 '정보 없음'으로 굳었다.
 */

// cache 는 supabase 를 물고 오고 모듈 로드 시 부수효과가 있다 — 여기서는 통 하나면 충분하다
const fakeCache: { contents: any[] } = { contents: [] }
vi.mock('../cache', () => ({
  cache: fakeCache,
  load: (t: string) => (fakeCache as any)[t] ?? [],
  store: () => {},
}))

let rows: Record<string, any> = {}
let selectCalls = 0
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => {
        selectCalls++
        return {
          eq: (_c: string, id: string) => ({
            maybeSingle: async () => ({ data: rows[id] ?? null, error: null }),
          }),
        }
      },
    }),
  },
}))

const DETAIL = { id: 'tmdb-mv-1', synopsis: '줄거리입니다', castMembers: [{ name: '배우' }] }

async function freshModule() {
  vi.resetModules()
  return import('../contents')
}

beforeEach(() => {
  fakeCache.contents = []
  rows = { 'tmdb-mv-1': DETAIL }
  selectCalls = 0
})

describe('loadContentDetail — 작품 행이 이미 캐시에 있을 때', () => {
  it('상세를 얹고 ready 를 준다', async () => {
    const m = await freshModule()
    fakeCache.contents = [{ id: 'tmdb-mv-1', title: '어떤 영화' }]

    expect(await m.loadContentDetail('tmdb-mv-1')).toBe('ready')
    expect(fakeCache.contents[0].synopsis).toBe('줄거리입니다')
    expect(m.isContentDetailLoaded('tmdb-mv-1')).toBe(true)
  })

  it('같은 작품을 다시 열어도 요청을 더 보내지 않는다', async () => {
    const m = await freshModule()
    fakeCache.contents = [{ id: 'tmdb-mv-1', title: '어떤 영화' }]

    await m.loadContentDetail('tmdb-mv-1')
    await m.loadContentDetail('tmdb-mv-1')
    expect(selectCalls).toBe(1)
  })
})

describe('loadContentDetail — 작품 행이 아직 안 온 경우 (2단계 로드 중)', () => {
  it('받아 온 상세를 버리지 않고 pending 을 준다', async () => {
    const m = await freshModule()   // 캐시 비어 있음

    expect(await m.loadContentDetail('tmdb-mv-1')).toBe('pending')
    // 아직 얹을 데가 없으니 '다 됐다'고 하면 안 된다 — 여기서 ready 면 화면이 '정보 없음'으로 굳는다
    expect(m.isContentDetailLoaded('tmdb-mv-1')).toBe(false)
  })

  it('작품 행이 도착하면 다시 묻지 않고 그대로 얹는다', async () => {
    const m = await freshModule()
    expect(await m.loadContentDetail('tmdb-mv-1')).toBe('pending')

    // 2단계 로드가 작품을 채워 넣은 뒤
    fakeCache.contents = [{ id: 'tmdb-mv-1', title: '어떤 영화' }]

    expect(await m.loadContentDetail('tmdb-mv-1')).toBe('ready')
    expect(fakeCache.contents[0].synopsis).toBe('줄거리입니다')
    expect(selectCalls).toBe(1)   // 요청은 처음 한 번뿐
  })

  it('다시 그리기만 해도(isContentDetailLoaded) 얹힌다', async () => {
    const m = await freshModule()
    await m.loadContentDetail('tmdb-mv-1')

    expect(m.isContentDetailLoaded('tmdb-mv-1')).toBe(false)
    fakeCache.contents = [{ id: 'tmdb-mv-1', title: '어떤 영화' }]
    expect(m.isContentDetailLoaded('tmdb-mv-1')).toBe(true)
    expect(fakeCache.contents[0].castMembers).toEqual([{ name: '배우' }])
  })
})

describe('loadContentDetail — 정말 없는 작품', () => {
  it('DB 에 행이 없으면 ready (재시도해도 같은 결과)', async () => {
    const m = await freshModule()
    rows = {}
    expect(await m.loadContentDetail('tmdb-mv-없음')).toBe('ready')
  })
})
