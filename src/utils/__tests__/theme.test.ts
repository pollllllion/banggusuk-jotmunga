import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isTheme, readTheme, applyTheme, isDarkNow, THEME_KEY } from '../theme'

/**
 * 테마는 저장이 안 되는 브라우저(사생활 보호 모드)에서도 앱을 못 쓰게 만들면 안 된다.
 * localStorage 접근이 throw 하는 경우까지 포함해서 확인한다.
 */

/** 최소한의 document/localStorage/matchMedia 흉내 */
function stubDom(opts: { stored?: string | null; storageThrows?: boolean; systemDark?: boolean } = {}) {
  let attr: string | null = null
  const meta = { content: '', setAttribute: (_k: string, v: string) => { meta.content = v } }

  vi.stubGlobal('document', {
    documentElement: {
      setAttribute: (_k: string, v: string) => { attr = v },
      removeAttribute: () => { attr = null },
      getAttribute: () => attr,
    },
    querySelector: () => meta,
  })

  const store: Record<string, string> = {}
  if (opts.stored != null) store[THEME_KEY] = opts.stored
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => { if (opts.storageThrows) throw new Error('denied'); return store[k] ?? null },
    setItem: (k: string, v: string) => { if (opts.storageThrows) throw new Error('denied'); store[k] = v },
  })

  vi.stubGlobal('window', {
    matchMedia: (q: string) => ({ matches: q.includes('dark') ? !!opts.systemDark : false }),
  })

  return { getAttr: () => attr, meta, store }
}

afterEach(() => vi.unstubAllGlobals())

describe('isTheme', () => {
  it('아는 값만 통과시킨다', () => {
    expect(isTheme('dark')).toBe(true)
    expect(isTheme('light')).toBe(true)
    expect(isTheme('system')).toBe(true)
    expect(isTheme('DARK')).toBe(false)
    expect(isTheme('')).toBe(false)
    expect(isTheme(null)).toBe(false)
    expect(isTheme(42)).toBe(false)
  })
})

describe('readTheme', () => {
  it('저장된 값을 읽는다', () => {
    stubDom({ stored: 'dark' })
    expect(readTheme()).toBe('dark')
  })
  it('저장된 게 없으면 system', () => {
    stubDom({ stored: null })
    expect(readTheme()).toBe('system')
  })
  it('쓰레기 값이 들어 있으면 system', () => {
    stubDom({ stored: 'neon' })
    expect(readTheme()).toBe('system')
  })
  it('localStorage 가 막힌 브라우저에서도 던지지 않는다', () => {
    stubDom({ storageThrows: true })
    expect(readTheme()).toBe('system')
  })
})

describe('applyTheme', () => {
  it('dark 를 고르면 data-theme 을 붙인다', () => {
    const dom = stubDom()
    applyTheme('dark')
    expect(dom.getAttr()).toBe('dark')
    expect(dom.store[THEME_KEY]).toBe('dark')
  })

  it('system 을 고르면 속성을 뗀다 (OS 설정에 맡긴다)', () => {
    const dom = stubDom()
    applyTheme('dark')
    applyTheme('system')
    expect(dom.getAttr()).toBeNull()
    expect(dom.store[THEME_KEY]).toBe('system')
  })

  it('저장이 막혀 있어도 화면 적용은 된다', () => {
    const dom = stubDom({ storageThrows: true })
    expect(() => applyTheme('dark')).not.toThrow()
    expect(dom.getAttr()).toBe('dark')
  })

  it('theme-color 도 같이 바뀐다 (주소창·상태바)', () => {
    const dom = stubDom()
    applyTheme('dark')
    expect(dom.meta.content).toBe('#131316')
    applyTheme('light')
    expect(dom.meta.content).toBe('#FFFFFF')
  })
})

describe('isDarkNow', () => {
  it('직접 고른 값이 OS 설정을 이긴다', () => {
    stubDom({ systemDark: true })
    applyTheme('light')
    expect(isDarkNow()).toBe(false)

    stubDom({ systemDark: false })
    applyTheme('dark')
    expect(isDarkNow()).toBe(true)
  })

  it('system 이면 OS 설정을 따른다', () => {
    stubDom({ systemDark: true })
    applyTheme('system')
    expect(isDarkNow()).toBe(true)

    stubDom({ systemDark: false })
    applyTheme('system')
    expect(isDarkNow()).toBe(false)
  })
})
