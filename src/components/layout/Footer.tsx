import { useNavigate } from 'react-router-dom'
import { STATIC_PAGES } from '@/shared/staticPages.mjs'
import { SITE_NAME } from '@/utils/seo'

interface DocLink { slug: string; path: string; label: string }

/** 모든 페이지 하단 푸터 — 데이터 출처 표기 + 서비스 소개·약관·개인정보·광고 문의.
 *  AppLayout 이 본문 끝에 한 번 그린다(로그인 화면은 AppLayout 밖이라 안 붙는다). */
export function Footer() {
  const navigate = useNavigate()
  const links = STATIC_PAGES as DocLink[]

  return (
    <footer className="site-footer">
      <p className="site-footer-attr">
        영화·드라마 정보 및 OTT 제공 여부: <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">TMDB</a> · OTT 제공 정보 <a href="https://www.justwatch.com/" target="_blank" rel="noreferrer">JustWatch</a> 제공 · 웹툰/웹소설은 직접 큐레이션<br />
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
      {/* 공개작 정리는 사이드바·홈 배너·작품 역링크로 들어가므로 푸터에서는 뺐다 */}
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
