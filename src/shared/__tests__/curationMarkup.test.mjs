import { describe, it, expect } from 'vitest'
import { textBlocks, inlineRuns, blocksToHtml, textLength } from '../curationMarkup.mjs'
import { publishBlockers, curationBodyLines, MIN_BODY } from '../curationSeo.mjs'

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// 사용자가 실제로 붙여 넣은 표(챗GPT 형식) 앞부분
const TABLE = `| 특별관                    | 핵심 특징                    | 대표적으로 알아둘 지점 |
| ---------------------- | ------------------------ | ------------------ |
| **IMAX**               | 대형 스크린 + IMAX 전용 상영 시스템  | **용산아이파크몰(용아맥)**, 왕십리 |
| **ULTRA 4DX**          | **4DX + SCREENX** 결합     | 용산아이파크몰 |`

describe('textBlocks', () => {
  it('빈 줄로 나뉜 평문은 예전처럼 문단들', () => {
    expect(textBlocks('첫째.\n\n둘째.')).toEqual([{ type: 'p', text: '첫째.' }, { type: 'p', text: '둘째.' }])
  })

  it('챗GPT 표: 둘째 줄이 구분줄이면 첫 줄이 머리글, 칸 공백은 다듬는다', () => {
    const [t] = textBlocks(TABLE)
    expect(t.type).toBe('table')
    expect(t.head).toEqual(['특별관', '핵심 특징', '대표적으로 알아둘 지점'])
    expect(t.rows).toHaveLength(2)
    expect(t.rows[0][0]).toBe('**IMAX**')
  })

  it('문단 바로 뒤에 붙은 표·소제목·목록도 갈라낸다', () => {
    const b = textBlocks('도입 문장\n| a | b |\n| - | - |\n| 1 | 2 |\n\n## 정리\n- 하나\n- 둘')
    expect(b.map(x => x.type)).toEqual(['p', 'table', 'h', 'ul'])
    expect(b[1].head).toEqual(['a', 'b'])
    expect(b[3].items).toEqual(['하나', '둘'])
  })

  it('구분줄이 없으면 머리글 없는 표, 칸 수가 모자란 줄은 빈 칸으로 채운다', () => {
    const [t] = textBlocks('| a | b |\n| c |')
    expect(t.head).toBeNull()
    expect(t.rows).toEqual([['a', 'b'], ['c', '']])
  })
})

describe('inlineRuns', () => {
  it('**굵게** 를 나눈다', () => {
    expect(inlineRuns('가 **나** 다')).toEqual([
      { text: '가 ', bold: false }, { text: '나', bold: true }, { text: ' 다', bold: false },
    ])
  })
  it('짝이 안 맞는 ** 는 글자 그대로', () => {
    expect(inlineRuns('가 **나')).toEqual([{ text: '가 **나', bold: false }])
  })
})

describe('blocksToHtml', () => {
  it('표를 thead/tbody 로, 굵게는 strong 으로, HTML 은 이스케이프', () => {
    const html = blocksToHtml(textBlocks(TABLE + '\n\n<script>x</script>'), esc)
    expect(html).toContain('<thead><tr><th>특별관</th>')
    expect(html).toContain('<td data-label="특별관"><strong>IMAX</strong></td>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
})

describe('정보글(작품 없는 큐레이션)', () => {
  const info = over => ({ title: 'CGV 특별관 총정리', summary: '요약', body: '가'.repeat(MIN_BODY), items: [], ...over })

  it('작품 0편이어도 본문이 차면 발행할 수 있다', () => {
    expect(publishBlockers(info())).toEqual([])
  })
  it('작품을 1~2편만 실으면 막는다', () => {
    expect(publishBlockers(info({ items: [{ contentId: 'a', note: '나'.repeat(30) }] })).join()).toMatch(/최소 3편/)
  })
  it('표 구분줄(---)은 글자 수에 안 들어간다', () => {
    expect(textLength('| a |\n| ------------------------------ |\n| b |')).toBe(2)
    expect(publishBlockers(info({ body: TABLE })).join()).toMatch(/본문이/)
  })
  it('본문 줄에 블록이 실린다 (프리렌더가 그대로 그린다)', () => {
    const lines = curationBodyLines(info({ body: '도입\n\n' + TABLE }), new Map())
    expect(lines.map(l => l.block.type)).toEqual(['p', 'table'])
  })
})

describe('챗GPT 화면에서 긁어 온 표(탭 구분)', () => {
  const TSV = ['특별관\t핵심 특징\t대표 지점', 'MEGA | MX4D\t좌석 모션\t코엑스 등', 'BALCONY\t발코니형\t송도·분당'].join('\n')
  it('첫 줄이 머리글, 칸 안의 | 는 글자 그대로', () => {
    const [t] = textBlocks(TSV)
    expect(t.type).toBe('table')
    expect(t.head).toEqual(['특별관', '핵심 특징', '대표 지점'])
    expect(t.rows[0][0]).toBe('MEGA | MX4D')
  })
  it('탭이 든 줄이 하나뿐이면 표가 아니라 문단', () => {
    expect(textBlocks('가\t나').map(b => b.type)).toEqual(['p'])
  })
})

describe('문단 안 줄바꿈 · 각주', () => {
  it('줄마다 쓴 짧은 목록은 한 문단 안에서 줄바꿈으로 남는다(프리렌더는 <br>)', () => {
    const b = textBlocks('코돌비 → 코엑스\n남돌비 → 남양주')
    expect(b).toEqual([{ type: 'p', text: '코돌비 → 코엑스\n남돌비 → 남양주' }])
    expect(blocksToHtml(b, esc)).toBe('<p>코돌비 → 코엑스<br>남돌비 → 남양주</p>')
  })
  it("'* ' 로 시작하는 각주는 목록이 아니다", () => {
    expect(textBlocks('* Dolby Cinema는 포맷이다').map(b => b.type)).toEqual(['p'])
  })
})
