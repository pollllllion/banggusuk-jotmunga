/**
 * 본문·컬럼 텍스트에서 "우리가 올린 짤" 참조를 뽑는다 — clean-media 의 고아 판정 기준.
 *
 * 저장소가 두 곳이라 따로 모은다 (같은 talk/xxx.gif 라도 서로 다른 파일이다):
 *   supabase : .../storage/v1/object/public/talk-media/<path>   (2026-09-22 이전 업로드)
 *   r2       : https://ottcal.com/media/<talk|avatars>/<file>    (worker/ 의 R2)
 *
 * 'talk-media/talk/x.gif' 안에도 'media/talk/x.gif' 가 들어 있지만, R2 쪽 정규식은
 * 바로 앞 글자가 '/' 인 것만 잡으므로('-media' 는 안 잡힌다) 섞이지 않는다.
 */
const SUPABASE_RE = /talk-media\/([^\s"'<>)\\]+)/g
const R2_RE = /\/media\/((?:talk|avatars)\/[^\s"'<>)\\?#]+)/g

const clean = s => decodeURIComponent(s.split('?')[0])

/** @param {string[]} texts @returns {{ supabase: Set<string>, r2: Set<string> }} */
export function extractMediaRefs(texts) {
  const supabase = new Set()
  const r2 = new Set()
  for (const text of texts) {
    if (!text) continue
    for (const m of text.matchAll(SUPABASE_RE)) supabase.add(clean(m[1]))
    for (const m of text.matchAll(R2_RE)) r2.add(clean(m[1]))
  }
  return { supabase, r2 }
}
