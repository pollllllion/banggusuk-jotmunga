/**
 * 본문·컬럼 텍스트에서 "우리가 올린 파일" 참조를 뽑는다 — clean-media 의 고아 판정 기준.
 *
 * 저장소가 두 곳이라 따로 모은다 (같은 talk/xxx.gif 라도 서로 다른 파일이다):
 *   supabase : .../storage/v1/object/public/talk-media/<path>        (2026-09-22 이전 업로드)
 *   r2       : https://media.ottcal.com/<talk|avatars>/<file>          (사진·움짤 — <img src>, avatarUrl)
 *              <div data-vid="talk/<file>">                             (동영상 — 본문엔 주소가 아니라 키만 있다)
 *
 * ⚠️ 동영상 자리(data-vid)를 여기서 빼면 올린 영상이 전부 고아로 잡혀 24시간 뒤 지워진다.
 * 'talk-media/talk/x.gif' 는 R2 쪽 정규식에 걸리지 않는다(앞이 'media.ottcal.com/' 도 'data-vid="' 도 아니다).
 */
const SUPABASE_RE = /talk-media\/([^\s"'<>)\\]+)/g
const R2_URL_RE = /\/\/media\.ottcal\.com\/((?:talk|avatars)\/[^\s"'<>)\\?#]+)/g
const R2_VID_RE = /data-vid\s*=\s*["']((?:talk)\/[^\s"'<>)\\?#]+)["']/g

const clean = s => decodeURIComponent(s.split('?')[0])

/** @param {(string|null|undefined)[]} texts @returns {{ supabase: Set<string>, r2: Set<string> }} */
export function extractMediaRefs(texts) {
  const supabase = new Set()
  const r2 = new Set()
  for (const text of texts) {
    if (!text) continue
    for (const m of text.matchAll(SUPABASE_RE)) supabase.add(clean(m[1]))
    for (const m of text.matchAll(R2_URL_RE)) r2.add(clean(m[1]))
    for (const m of text.matchAll(R2_VID_RE)) r2.add(clean(m[1]))
  }
  return { supabase, r2 }
}
