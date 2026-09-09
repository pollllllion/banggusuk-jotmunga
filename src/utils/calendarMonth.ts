/**
 * 캘린더가 보고 있는 달 — URL(?ym=YYYY-MM) 과 주고받는 변환.
 *
 * 달을 로컬 state 로만 두면 "2026년 12월 공개작" 링크를 공유할 수 없고,
 * 작품 상세에 들어갔다 뒤로 오면 이번 달로 돌아가 버린다.
 * 캘린더 ↔ 상세를 오가는 게 이 사이트의 주 동선이라 그 왕복이 특히 아프다.
 */
export type Month = { y: number; m: number }   // m 은 0-based (Date 와 같게)

/** 'YYYY-MM' → Month. 형식이 어긋나거나 범위를 벗어나면 null.
 *  ?ym= 은 공유 링크·손으로 친 주소로도 들어오므로 반드시 검증한다. */
export function parseYm(raw: string | null | undefined): Month | null {
  const hit = /^(\d{4})-(\d{2})$/.exec((raw || '').trim())
  if (!hit) return null
  const y = Number(hit[1])
  const m = Number(hit[2]) - 1
  if (m < 0 || m > 11) return null
  // 수집 범위 밖으로 나가면 빈 달만 나온다 — 터무니없는 연도는 여기서 걸러 이번 달로 보낸다
  if (y < 1900 || y > 2200) return null
  return { y, m }
}

export function formatYm({ y, m }: Month): string {
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

export function sameMonth(a: Month, b: Month): boolean {
  return a.y === b.y && a.m === b.m
}
