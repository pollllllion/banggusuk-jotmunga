/** 고유 ID 생성 */
export function uuid(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 11)
}

/** 제목 정규화 — 공백·문장부호 제거 + 소문자화 (중복 작품 매칭용).
 *  "전지적 독자 시점" ↔ "전지적독자시점" 을 같게 취급한다. */
export function normalizeTitle(s: string): string {
  return (s || '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
}

/** SHA-256 hex (유동닉 글 비밀번호 해시용) */
export async function sha256hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** HTML 이스케이프 (XSS 방지) */
export function esc(str: string): string {
  const el = document.createElement('div')
  el.textContent = str
  return el.innerHTML
}

/** 상대 시간 표시 */
export function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (mins < 1) return '방금 전'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}일 전`
  return new Date(dateStr).toLocaleDateString('ko-KR')
}

/**
 * 게시판 목록용 날짜 — 오늘 안이면 경과 시간, 하루가 지나면 `26.08.25`.
 *
 * timeAgo 와 따로 두는 이유: timeAgo 는 알림·글 상세·관리자에서도 쓰는데
 * 거기선 "3일 전" 이 더 잘 읽힌다. 목록은 열 폭이 44px 남짓이라 짧아야 하고,
 * 오래된 글은 "몇 일 전" 보다 날짜가 유용하다(디시·클리앙도 같은 방식).
 * '전' 을 뗀 것도 폭 때문이다.
 */
export function boardDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, '0')

  // 오늘 쓴 글은 시:분. '3시간' 같은 경과 시간이 아니라 시계 시각이다 —
  // 목록을 위에서 아래로 훑을 때 시각이 줄줄이 내려가는 편이 순서를 읽기 쉽다.
  // '경과 24시간'이 아니라 **달력상 같은 날**로 끊는다: 어젯밤 11시 글이 오늘 아침에
  // '9시간'으로 남아 오늘 글처럼 보이던 것을 없앤다.
  const sameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
  if (sameDay) return `${p(d.getHours())}:${p(d.getMinutes())}`

  // 올해 글은 월.일만. 해가 다를 때만 연도를 붙인다 — 목록의 거의 모든 줄에
  // 똑같은 '26.' 이 붙어 있어 봐야 구분에 보태는 게 없다.
  if (d.getFullYear() === now.getFullYear()) return `${p(d.getMonth() + 1)}.${p(d.getDate())}`
  return `${p(d.getFullYear() % 100)}.${p(d.getMonth() + 1)}.${p(d.getDate())}`
}

/** 글 상세용 정확한 작성 시각 — 2026.09.09 23:59 */
export function fullDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 점수(0~10)에 따른 색상 */
export function scoreColor(score: number): string {
  if (score >= 8) return 'var(--score-high)'
  if (score >= 6) return 'var(--score-mid)'
  if (score >= 4) return 'var(--score-low)'
  return 'var(--score-bad)'
}

/** 점수(0~10)에 따른 한줄 등급 */
export function scoreLabel(score: number): string {
  if (score >= 9) return '인생작'
  if (score >= 8) return '수작'
  if (score >= 6.5) return '볼만함'
  if (score >= 5) return '평작'
  if (score >= 3) return '아쉬움'
  return '망작'
}

/** 비밀번호 유효성 검사 */
export function isPasswordValid(pw: string): boolean {
  return (
    pw.length >= 8 &&
    /[a-zA-Z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pw)
  )
}

/** 비밀번호 규칙 개별 검사 */
export function getPasswordRules(pw: string) {
  return [
    { key: 'len', label: '8자 이상', pass: pw.length >= 8 },
    { key: 'letter', label: '영문 포함', pass: /[a-zA-Z]/.test(pw) },
    { key: 'num', label: '숫자 포함', pass: /[0-9]/.test(pw) },
    { key: 'special', label: '특수문자 포함', pass: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pw) },
  ]
}

/** 이메일 형식 검증 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
