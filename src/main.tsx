import { createRoot } from 'react-dom/client'
import '@/styles/variables.css'
import '@/styles/global.css'
import App from './App.tsx'

// 프리렌더된 정적 요약 블록(scripts/prerender.mjs 가 심는다)을 앱 실행 직전에 치운다.
// JS 를 안 돌리는 크롤러(네이버 등)와 카톡 미리보기용이라 사용자에겐 보일 필요가 없다.
document.getElementById('prerender-seo')?.remove()

createRoot(document.getElementById('root')!).render(<App />)
