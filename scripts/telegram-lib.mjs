/**
 * 텔레그램 봇 발송 헬퍼 — 주간 브리핑(weekly-briefing.mjs)이 쓴다.
 *
 * sendMessage 는 한 통에 4096자까지다. 긴 글은 문단 → 줄 → 글자 순으로 끊어 여러 통으로 보낸다.
 * parse_mode 를 쓰지 않는다(평문) — AI 가 만든 글의 `_`·`*` 하나 때문에 발송이 통째로 실패하지 않게.
 */

export const TELEGRAM_LIMIT = 4096
// 머리표(1/3) 붙일 자리와 서로게이트 쌍 여유
const SAFE_LIMIT = 3900

/** 순수 함수: text 를 limit 이하 조각들로 나눈다. 가능하면 빈 줄 → 줄바꿈 → 공백 경계에서 끊는다. */
export function splitMessage(text, limit = SAFE_LIMIT) {
  const chunks = []
  let rest = String(text ?? '').trim()
  while (rest.length > limit) {
    const window = rest.slice(0, limit)
    let cut = window.lastIndexOf('\n\n')
    if (cut < limit * 0.5) cut = window.lastIndexOf('\n')
    if (cut < limit * 0.5) cut = window.lastIndexOf(' ')
    if (cut < limit * 0.5) cut = limit
    // 서로게이트 쌍(이모지) 한가운데서 자르지 않는다
    const code = rest.charCodeAt(cut - 1)
    if (code >= 0xd800 && code <= 0xdbff) cut -= 1
    chunks.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }
  if (rest) chunks.push(rest)
  return chunks
}

/**
 * 여러 통이면 "(1/3)" 머리표를 붙여 순서대로 보낸다. 실패하면 throw.
 * token·chatId 는 부르는 쪽이 반드시 넘긴다 — 기본값으로 다른 봇(퀀트 알림)에 새지 않게.
 */
export async function sendTelegram(text, { token, chatId }) {
  if (!token || !chatId) throw new Error('텔레그램 봇 토큰 / Chat ID 가 없다')
  const parts = splitMessage(text)
  for (let i = 0; i < parts.length; i++) {
    const body = parts.length > 1 ? `(${i + 1}/${parts.length})\n${parts[i]}` : parts[i]
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: body, disable_web_page_preview: true }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.ok) throw new Error(`텔레그램 ${res.status}: ${json.description || '응답 없음'}`)
    // 같은 채팅 초당 1통 권장
    if (i < parts.length - 1) await new Promise(r => setTimeout(r, 1100))
  }
  return parts.length
}
