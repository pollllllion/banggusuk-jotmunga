import { describe, it, expect } from 'vitest'
import { splitMessage } from '../telegram-lib.mjs'

describe('splitMessage', () => {
  it('짧으면 한 조각', () => {
    expect(splitMessage('안녕')).toEqual(['안녕'])
  })

  it('빈 입력은 빈 배열', () => {
    expect(splitMessage('   ')).toEqual([])
  })

  it('모든 조각이 한도 이하이고 내용이 빠지지 않는다', () => {
    const para = '가'.repeat(700)
    const text = Array.from({ length: 12 }, (_, i) => `${i}${para}`).join('\n\n')
    const parts = splitMessage(text, 3900)
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(3900)
    expect(parts.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
  })

  it('문단 경계에서 끊는다', () => {
    const a = 'a'.repeat(60), b = 'b'.repeat(60)
    expect(splitMessage(`${a}\n\n${b}`, 100)).toEqual([a, b])
  })

  it('경계가 없으면 글자 단위로 자르되 이모지를 쪼개지 않는다', () => {
    const text = 'x'.repeat(99) + '😀' + 'y'.repeat(10)
    const parts = splitMessage(text, 100)
    expect(parts[0]).toBe('x'.repeat(99))
    expect(parts[1].startsWith('😀')).toBe(true)
  })
})
