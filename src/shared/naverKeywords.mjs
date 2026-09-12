/**
 * 네이버 서치어드바이저에서 긁어 온 표를 읽는다.
 *
 * 네이버는 유입 검색어 API 를 주지 않는다(2026-09-12 확인). 화면에서 복사해 붙이는 수밖에
 * 없는데, 붙여넣은 모양이 브라우저·기기마다 제각각이다 — 탭으로 나뉘기도 하고 공백만
 * 남기도 하고, 앞에 순위 번호가 붙기도 한다. 그 변형을 여기서 흡수한다.
 *
 * 읽는 규칙:
 *   · 한 줄에서 **뒤쪽 숫자들**을 수치로, 그 앞 전부를 검색어로 본다
 *   · 줄 맨 앞의 홀로 선 숫자는 순위 번호로 보고 버린다
 *   · 숫자가 하나면 클릭수로, 둘이면 (클릭, 노출)로 읽는다
 *   · 숫자가 없는 줄(머리글 등)은 버린다
 *
 * 숫자 하나짜리를 노출이 아니라 클릭으로 읽는 이유: 서치어드바이저의 기본 정렬이
 * 클릭 기준이고, 사람이 한 열만 긁어 오면 대개 그 열이다.
 */

/** '1,234' · '1 234' 같은 표기를 숫자로. 숫자가 아니면 null */
function toNum(tok) {
  if (!/^[\d,]+$/.test(tok)) return null
  const n = Number(tok.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

export function parseNaverKeywords(text) {
  const out = []
  const seen = new Set()

  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // 탭이 있으면 탭으로, 없으면 공백으로 나눈다 (검색어에 공백이 들어가므로 탭이 있으면 그게 정확하다)
    const parts = (trimmed.includes('\t') ? trimmed.split('\t') : trimmed.split(/\s+/))
      .map(s => s.trim()).filter(Boolean)
    if (parts.length < 2) continue

    // 뒤에서부터 숫자를 걷어낸다
    const nums = []
    let end = parts.length
    while (end > 0) {
      const n = toNum(parts[end - 1])
      if (n === null) break
      nums.unshift(n); end--
    }
    if (!nums.length) continue

    let head = parts.slice(0, end)
    // 맨 앞 순위 번호 버리기 — 검색어가 통째로 숫자인 경우는 아래에서 걸러진다
    if (head.length > 1 && toNum(head[0]) !== null) head = head.slice(1)

    const query = head.join(' ').trim()
    if (!query || toNum(query) !== null) continue
    if (seen.has(query)) continue
    seen.add(query)

    out.push({
      query,
      clicks: nums[0] ?? 0,
      impressions: nums.length > 1 ? nums[1] : 0,
    })
  }
  return out
}
