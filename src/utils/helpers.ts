/** 고유 ID 생성 */
export function uuid(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 11)
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
