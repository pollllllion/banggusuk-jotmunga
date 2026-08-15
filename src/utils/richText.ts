/**
 * 토론글 본문 서식(HTML) 다루기 — 허용 목록 방식 정화 + 평문 추출.
 *
 * 유동닉(로그인 없이)도 글을 쓰는 게시판이라 본문 HTML 을 그대로 믿으면 안 된다.
 * 저장할 때도, 화면에 그릴 때도 이 함수를 통과시킨다(둘 중 하나가 뚫려도 막히게).
 * 허용하는 건 글자 모양과 <img> 뿐 — 링크·스크립트·이벤트 속성은 전부 걷어낸다.
 * <img> 는 본문에 끼워 넣는 짤이라 src 가 http(s) 인 것만 남긴다(data:·javascript: 차단).
 */

/** 남겨도 되는 태그 (글자 모양 계열 + 본문에 낀 짤) */
const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'BR', 'DIV', 'P', 'SPAN', 'FONT', 'IMG'])

/** 남겨도 되는 style 속성 */
const ALLOWED_STYLE_PROPS = ['color', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line']

const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z-]{3,20})$/i
const SIZE_RE = /^(\d{1,3}(\.\d+)?(px|pt|em|rem)|xx-small|x-small|small|smaller|medium|large|larger|x-large|xx-large)$/i
const FAMILY_RE = /^[\w\s,'"()가-힣.-]{1,80}$/
const KEYWORD_RE = /^[a-z\s-]{1,40}$/i

/** 글자 크기 상한 — 본문이 화면을 뚫고 나가지 않게 (px 로 들어온 것만 검사) */
const MAX_PX = 48

function isSafeStyleValue(prop: string, value: string): boolean {
  const v = value.trim()
  if (!v || v.includes('url(') || v.includes('expression')) return false
  if (prop === 'color') return COLOR_RE.test(v)
  if (prop === 'font-size') {
    if (!SIZE_RE.test(v)) return false
    const px = /^(\d{1,3}(\.\d+)?)px$/.exec(v)
    return !px || Number(px[1]) <= MAX_PX
  }
  if (prop === 'font-family') return FAMILY_RE.test(v)
  return KEYWORD_RE.test(v)
}

function cleanStyle(style: string | null): string {
  if (!style) return ''
  return style.split(';')
    .map(part => {
      const i = part.indexOf(':')
      if (i < 0) return null
      const prop = part.slice(0, i).trim().toLowerCase()
      const value = part.slice(i + 1).trim()
      if (!ALLOWED_STYLE_PROPS.includes(prop) || !isSafeStyleValue(prop, value)) return null
      return `${prop}: ${value}`
    })
    .filter(Boolean)
    .join('; ')
}

/** 태그는 지우되 안의 글은 살린다 */
function unwrap(el: Element) {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}

function scrub(root: Element) {
  for (const el of Array.from(root.children)) {
    scrub(el)
    if (!ALLOWED_TAGS.has(el.tagName)) { unwrap(el); continue }

    // 짤: http(s) 주소만 남기고 나머지 속성은 전부 버린다
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src') || ''
      if (!/^https?:\/\//i.test(src)) { el.remove(); continue }
      const alt = el.getAttribute('alt') || ''
      for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name)
      el.setAttribute('src', src)
      if (alt) el.setAttribute('alt', alt)
      continue
    }

    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase() !== 'style') el.removeAttribute(attr.name)
    }
    const style = cleanStyle(el.getAttribute('style'))
    if (style) el.setAttribute('style', style)
    else el.removeAttribute('style')
  }
}

/** 본문 HTML 정화 — 허용 태그·스타일만 남긴다 */
export function sanitizeRichText(dirty: string): string {
  if (!dirty) return ''
  const doc = new DOMParser().parseFromString(`<body>${dirty}</body>`, 'text/html')
  doc.body.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach(el => el.remove())
  scrub(doc.body)
  return doc.body.innerHTML
}

/** 본문 HTML → 평문 (목록 미리보기·검색·공유 설명용) */
export function richTextToPlain(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  doc.body.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
  doc.body.querySelectorAll('div, p').forEach(el => el.append('\n'))
  return (doc.body.textContent || '').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/** 본문 HTML 안에 낀 짤 주소 목록 (목록 표시·공유 이미지용으로 따로 뽑아 둔다) */
export function extractImageUrls(html: string): string[] {
  if (!html) return []
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return [...doc.body.querySelectorAll('img')]
    .map(img => img.getAttribute('src') || '')
    .filter(src => /^https?:\/\//i.test(src))
}

/** 평문 → HTML (서식 없이 쓴 옛 글을 에디터에 열 때) */
export function plainToRichText(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.split('\n').map(line => `<div>${line || '<br>'}</div>`).join('')
}
