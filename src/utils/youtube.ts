/**
 * 유튜브 영상 — 주소에서 영상 ID 를 뽑고, 본문에 끼울 주소를 만든다.
 *
 * 본문에는 iframe 을 통째로 저장하지 않는다. 익명 글쓰기를 받는 게시판이라
 * iframe 을 허용하면 아무 사이트나 끼워 넣을 수 있다. 그래서 **영상 ID(11자)만** 담고,
 * 화면에 그릴 때 그 ID 로 우리가 직접 유튜브 플레이어를 만든다(richText.renderVideoEmbeds).
 */

/** 유튜브 영상 ID — 영문·숫자·_·- 11자 */
export const YT_ID_RE = /^[\w-]{11}$/

/**
 * 유튜브 주소 → 영상 ID. 유튜브 영상 주소가 아니면 null.
 * youtu.be/ID · youtube.com/watch?v=ID · /shorts/ID · /embed/ID · /live/ID (m.·www.·music. 포함)
 */
export function youtubeId(input: string): string | null {
  let u: URL
  try { u = new URL(input.trim()) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null

  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') {
    id = u.pathname.split('/')[1] || null
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v')
    else id = /^\/(?:shorts|embed|live|v)\/([^/]+)/.exec(u.pathname)?.[1] ?? null
  }
  return id && YT_ID_RE.test(id) ? id : null
}

/** 사람이 누르는 주소 — 평문 본문(목록 미리보기·검색·공유 설명)에 남는다 */
export function youtubeWatchUrl(id: string): string {
  return `https://youtu.be/${id}`
}

/** 플레이어 주소 — 쿠키를 덜 남기는 nocookie 도메인 */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`
}
