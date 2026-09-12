import { createRoot } from 'react-dom/client'
import '@/styles/variables.css'
import '@/styles/global.css'
import App from './App.tsx'
import { registerServiceWorker } from '@/utils/pwa'

// 프리렌더된 정적 요약 블록(scripts/prerender.mjs 가 심는다)을 앱 실행 직전에 치운다.
// JS 를 안 돌리는 크롤러(네이버 등)와 카톡 미리보기용이라 사용자에겐 보일 필요가 없다.
document.getElementById('prerender-seo')?.remove()

/**
 * 배포가 나가면 옛 화면이 참조하던 조각(청크)이 서버에서 사라진다. 그 상태로 화면을
 * 옮기면 import 가 실패하고 사람 눈에는 '접속 오류'로 보인다 — 하루에 여러 번 배포하면
 * 실제로 겪는다. 그때는 새로고침 한 번이면 낫는 문제라 대신 눌러 준다.
 *
 * 한 번만 시도한다. 새로고침해도 또 실패하는 상황(정말 오프라인 등)에서 무한 새로고침에
 * 빠지면 그게 더 나쁘다 — 그래서 표시를 남기고 두 번은 하지 않는다.
 */
const RELOADED_KEY = 'chunk-reloaded-at'
window.addEventListener('vite:preloadError', event => {
  event.preventDefault()   // 기본 동작(콘솔 에러로 끝)을 막고 우리가 처리한다
  let last = 0
  try { last = Number(sessionStorage.getItem(RELOADED_KEY) || 0) } catch { /* 사생활 보호 모드 */ }
  if (Date.now() - last < 30_000) return   // 방금 시도했으면 그냥 둔다
  try { sessionStorage.setItem(RELOADED_KEY, String(Date.now())) } catch { /* 무시 */ }
  location.reload()
})

createRoot(document.getElementById('root')!).render(<App />)

registerServiceWorker()
