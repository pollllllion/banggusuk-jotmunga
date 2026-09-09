import { describe, it, expect, afterEach, vi } from 'vitest'
import { absoluteUrl, canUseWebShare, shareOrCopy, shareMessage } from '../share'
import { SITE_URL } from '@/utils/seo'

afterEach(() => vi.unstubAllGlobals())

describe('absoluteUrl', () => {
  it('사이트 주소를 앞에 붙인다', () => {
    expect(absoluteUrl('/talk/123')).toBe(`${SITE_URL}/talk/123`)
  })

  it('앞 슬래시가 없어도 붙여 준다', () => {
    expect(absoluteUrl('content/abc')).toBe(`${SITE_URL}/content/abc`)
  })

  it('쿼리스트링을 살린다 (캘린더 달 공유)', () => {
    expect(absoluteUrl('/?ym=2026-12')).toBe(`${SITE_URL}/?ym=2026-12`)
  })

  it('슬래시가 겹치지 않는다', () => {
    expect(absoluteUrl('/talk')).not.toContain('//talk')
  })
})

describe('shareOrCopy', () => {
  /** 웹 공유 API 가 있는 환경(폰) */
  function stubShare(impl: (data: any) => Promise<void>) {
    vi.stubGlobal('navigator', { share: impl, clipboard: undefined })
  }
  /** 공유 API 가 없고 클립보드만 있는 환경(PC) */
  function stubClipboard(ok: boolean) {
    const writeText = vi.fn(() => ok ? Promise.resolve() : Promise.reject(new Error('denied')))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('document', {
      createElement: () => ({ setAttribute() {}, select() {}, style: {}, value: '' }),
      body: { appendChild() {}, removeChild() {} },
      execCommand: () => false,
    })
    return writeText
  }

  it('공유 시트가 있으면 그걸 쓴다', async () => {
    const seen: any[] = []
    stubShare(async d => { seen.push(d) })
    expect(await shareOrCopy({ path: '/talk/1', title: '제목' })).toBe('shared')
    expect(seen[0].url).toBe(`${SITE_URL}/talk/1`)
    expect(seen[0].title).toBe('제목')
  })

  it('사용자가 공유 시트를 닫으면 cancelled — 실패가 아니다', async () => {
    stubShare(async () => { const e: any = new Error('abort'); e.name = 'AbortError'; throw e })
    expect(await shareOrCopy({ path: '/talk/1' })).toBe('cancelled')
  })

  it('공유 시트가 없으면 주소를 복사한다', async () => {
    const writeText = stubClipboard(true)
    expect(await shareOrCopy({ path: '/content/x' })).toBe('copied')
    expect(writeText).toHaveBeenCalledWith(`${SITE_URL}/content/x`)
  })

  it('복사까지 실패하면 failed', async () => {
    stubClipboard(false)
    expect(await shareOrCopy({ path: '/content/x' })).toBe('failed')
  })

  it('공유 API 가 있는지 알아본다', () => {
    stubShare(async () => {})
    expect(canUseWebShare()).toBe(true)
    stubClipboard(true)
    expect(canUseWebShare()).toBe(false)
  })
})

describe('shareMessage', () => {
  it('복사했을 때만 말해 준다', () => {
    expect(shareMessage('copied')).toBe('링크를 복사했어요.')
    expect(shareMessage('failed')).toContain('복사하지 못했어요')
  })

  it('공유 시트가 떴거나 사용자가 닫았으면 아무 말도 하지 않는다', () => {
    // OS 가 이미 알려줬거나, 사용자가 일부러 그만둔 것이다.
    // 여기서 "복사했어요"를 띄우면 하지도 않은 일을 했다고 말하는 셈이다.
    expect(shareMessage('shared')).toBeNull()
    expect(shareMessage('cancelled')).toBeNull()
  })
})
