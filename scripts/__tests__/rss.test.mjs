import { describe, it, expect } from 'vitest'
import { item, rfc822 } from '../generate-rss.mjs'

/**
 * RSS 항목 만들기. 피드는 **본문을 그대로 펼쳐 보여주는** 매체라,
 * 가려야 할 것이 여기서 새면 사이트에서 가린 의미가 없어진다.
 */
const post = extra => ({
  id: 'abc123', title: '제목', body: '본문입니다', createdAt: '2026-09-16T10:00:00.000Z', ...extra,
})

describe('스포일러', () => {
  it('스포 글은 본문 대신 안내 문구만 나간다', () => {
    const xml = item(post({ spoiler: true, body: '범인은 철수였다' }))
    expect(xml).toContain('스포일러가 포함된 글입니다')
    expect(xml).not.toContain('범인은')
  })

  it('스포가 아니면 본문 발췌가 들어간다', () => {
    expect(item(post({ spoiler: false }))).toContain('본문입니다')
  })

  it('제목이 없는 글은 본문 앞부분을 제목으로 쓴다 — 스포여도 제목은 필요하다', () => {
    const xml = item(post({ title: null, spoiler: true, body: '오늘 본 영화 이야기' }))
    expect(xml).toContain('<title>오늘 본 영화 이야기</title>')
  })
})

describe('날짜', () => {
  it('RSS 2.0 이 요구하는 RFC 822 로 나간다 (ISO 를 그대로 넣으면 리더가 못 읽는다)', () => {
    expect(rfc822('2026-09-16T10:00:00.000Z')).toBe('Wed, 16 Sep 2026 10:00:00 GMT')
  })

  it('날짜가 깨져 있으면 null — 잘못된 pubDate 를 쓰느니 빼는 게 낫다', () => {
    expect(rfc822('언젠가')).toBeNull()
    expect(item(post({ createdAt: '언젠가' }))).not.toContain('<pubDate>')
  })
})

describe('XML 안전', () => {
  it('제목의 &, <, " 를 이스케이프한다 — 하나만 새도 피드 전체가 깨진다', () => {
    const xml = item(post({ title: 'A & B <급> "인용"' }))
    expect(xml).toContain('A &amp; B &lt;급&gt; &quot;인용&quot;')
    expect(xml).not.toContain('<급>')
  })

  it('링크는 글 주소를 가리킨다', () => {
    expect(item(post())).toContain('<link>https://ottcal.com/talk/abc123</link>')
  })
})
