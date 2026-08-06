import { useNavigate } from 'react-router-dom'
import { STATIC_PAGES } from '@/shared/staticPages.mjs'
import { SITE_NAME } from '@/utils/seo'

interface DocLink { slug: string; path: string; label: string }

/** 홈(캘린더) 피드 하단 푸터 — 서비스 소개·약관·개인정보·광고 문의 */
export function Footer() {
  const navigate = useNavigate()
  const links = STATIC_PAGES as DocLink[]

  return (
    <footer className="site-footer">
      <nav className="site-footer-links">
        {links.map(d => (
          <a key={d.slug} onClick={() => navigate(d.path)}>{d.label}</a>
        ))}
      </nav>
      <p className="site-footer-note">
        작품 정보·포스터는 TMDB, OTT 제공 정보는 JustWatch 데이터를 이용합니다.
        공개일은 사정에 따라 변경될 수 있어요.
      </p>
      <p className="site-footer-copy">© {SITE_NAME} · ottcal.com</p>
    </footer>
  )
}
