/**
 * 큐레이션 본문 서식 — 앱(CurationBlocks.tsx)과 프리렌더가 같은 블록을 그린다.
 *
 * 지원하는 것 (마크다운의 아주 작은 부분집합):
 *   빈 줄        문단 나눔 (예전부터 쓰던 규칙 그대로). 문단 안의 줄바꿈은 그대로 줄바꿈
 *   ## 소제목     ### 도 같은 급으로 본다
 *   - 항목        목록. '* ' 는 목록으로 안 본다 — 한국어 글에선 각주 표시(* Dolby Cinema는…)로 더 많이 쓴다
 *   | a | b |     표 — 둘째 줄이 | --- | --- | 이면 첫 줄이 머리글 (챗GPT '복사' 버튼 = 마크다운)
 *   a<TAB>b       표 — 탭으로 칸을 나눈 줄이 2줄 이상 이어지면 표, 첫 줄이 머리글.
 *                 챗GPT 화면의 표를 마우스로 긁어 붙이면 이 형태로 들어온다. 칸에 | 가 있어도 된다(MEGA | MX4D)
 *   **굵게**      문단·목록·표 칸 어디서나
 *
 * HTML 은 받지 않는다 — 글자는 늘 글자로 찍힌다(프리렌더는 esc, 앱은 React 텍스트 노드).
 */

/** 문단(빈 줄) 단위로 자르기 — curationSeo.paragraphs 와 같은 규칙 */
function chunks(text) {
  return String(text || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
}

const isTableLine = l => /^\s*\|/.test(l)
const isTsvLine = l => l.includes('\t')
const LIST_RE = /^\s*-\s+/
const HEAD_RE = /^\s*#{2,3}\s+/
const SEP_CELL = /^:?-+:?$/

/** '| a | b |' → ['a', 'b'] */
function cells(line) {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map(c => c.trim())
}

function tableBlock(lines) {
  const rows = lines.map(cells)
  const hasHead = rows.length >= 2 && rows[1].length > 0 && rows[1].every(c => SEP_CELL.test(c))
  const head = hasHead ? rows[0] : null
  const body = hasHead ? rows.slice(2) : rows
  const width = Math.max(head ? head.length : 0, ...body.map(r => r.length))
  const pad = r => [...r, ...Array(Math.max(0, width - r.length)).fill('')].slice(0, width)
  return { type: 'table', head: head ? pad(head) : null, rows: body.map(pad) }
}

/** 탭으로 나뉜 줄들 → 표. 첫 줄이 머리글(챗GPT 화면에서 긁으면 머리글 행부터 딸려 온다) */
function tsvBlock(lines) {
  const rows = lines.map(l => l.split('\t').map(c => c.trim()))
  const width = Math.max(...rows.map(r => r.length))
  const pad = r => [...r, ...Array(Math.max(0, width - r.length)).fill('')].slice(0, width)
  return { type: 'table', head: pad(rows[0]), rows: rows.slice(1).map(pad) }
}

/**
 * 글 → 블록 목록.
 * @returns {({type:'p', text:string} | {type:'h', text:string} | {type:'ul', items:string[]}
 *           | {type:'table', head:string[]|null, rows:string[][]})[]}
 */
export function textBlocks(text) {
  const out = []
  for (const chunk of chunks(text)) {
    const lines = chunk.split('\n')
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      // 탭 표를 먼저 본다 — 칸 안에 | 가 든 줄(MEGA | MX4D)을 마크다운 표로 잘못 읽지 않게
      if (isTsvLine(line) && i + 1 < lines.length && isTsvLine(lines[i + 1])) {
        const run = []
        while (i < lines.length && isTsvLine(lines[i])) run.push(lines[i++])
        out.push(tsvBlock(run))
      } else if (isTableLine(line)) {
        const run = []
        while (i < lines.length && isTableLine(lines[i])) run.push(lines[i++])
        out.push(tableBlock(run))
      } else if (LIST_RE.test(line)) {
        const items = []
        while (i < lines.length && LIST_RE.test(lines[i])) items.push(lines[i++].replace(LIST_RE, '').trim())
        out.push({ type: 'ul', items })
      } else if (HEAD_RE.test(line)) {
        out.push({ type: 'h', text: line.replace(HEAD_RE, '').trim() })
        i++
      } else {
        // 첫 줄은 무조건 받는다 — 탭이 든 외톨이 줄(표가 아님)에서 멈춰 제자리를 돌지 않게
        const run = [lines[i++]]
        while (i < lines.length && !isTableLine(lines[i]) && !isTsvLine(lines[i]) && !LIST_RE.test(lines[i]) && !HEAD_RE.test(lines[i])) {
          run.push(lines[i++])
        }
        const t = run.join('\n').trim()
        if (t) out.push({ type: 'p', text: t })
      }
    }
  }
  return out
}

/** '가 **나** 다' → [{text:'가 ', bold:false}, {text:'나', bold:true}, {text:' 다', bold:false}] */
export function inlineRuns(s) {
  const parts = String(s ?? '').split('**')
  // 짝이 안 맞는 ** 는 글자 그대로 둔다 — 마지막 조각을 굵게 만들지 않는다
  if (parts.length % 2 === 0) {
    const last = parts.pop()
    parts[parts.length - 1] += '**' + last
  }
  return parts.map((text, i) => ({ text, bold: i % 2 === 1 })).filter(r => r.text)
}

/** 서식 기호를 뗀 글자 — 검색 설명·글자 수 세기용 */
export function plainText(s) {
  return inlineRuns(s).map(r => r.text).join('')
}

/** 블록 → 크롤러용 HTML (프리렌더). esc 는 호출한 쪽의 HTML 이스케이프 */
export function blocksToHtml(blocks, esc) {
  const inline = s => inlineRuns(s).map(r => r.bold ? `<strong>${esc(r.text)}</strong>` : esc(r.text)).join('')
  return blocks.map(b => {
    if (b.type === 'h') return `<h2>${inline(b.text)}</h2>`
    if (b.type === 'ul') return `<ul>${b.items.map(t => `<li>${inline(t)}</li>`).join('')}</ul>`
    if (b.type === 'table') {
      const head = b.head ? `<thead><tr>${b.head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : ''
      // data-label: 좁은 화면에서 행을 카드로 쌓을 때 칸 이름으로 쓴다(global.css .cur-table)
      const label = j => b.head && b.head[j] ? ` data-label="${esc(plainText(b.head[j]))}"` : ''
      return `<table>${head}<tbody>${b.rows.map(r => `<tr>${r.map((c, j) => `<td${label(j)}>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    }
    // 문단 안 줄바꿈 → <br> (앱은 .cur-para 의 white-space: pre-line)
    return `<p>${b.text.split('\n').map(inline).join('<br>')}</p>`
  }).join('')
}

/** 서식 기호를 뺀 본문 글자 수 — 발행 하한(MIN_BODY) 판정용. 표는 칸 글자만 센다 */
export function textLength(text) {
  return textBlocks(text).reduce((n, b) => {
    if (b.type === 'table') return n + [...(b.head || []), ...b.rows.flat()].reduce((m, c) => m + plainText(c).length, 0)
    if (b.type === 'ul') return n + b.items.reduce((m, t) => m + plainText(t).length, 0)
    return n + plainText(b.text).length
  }, 0)
}
