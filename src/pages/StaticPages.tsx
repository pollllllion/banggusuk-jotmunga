import { useNavigate } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { STATIC_PAGES, CONTACT_EMAIL } from '@/shared/staticPages.mjs'

/** 서비스 소개·이용약관·개인정보 처리방침·광고 문의.
 *  원문은 src/shared/staticPages.mjs 한 곳에 있고 프리렌더도 같은 값을 쓴다. */

interface Section { h: string; p?: string[]; ul?: string[] }
interface Doc {
  slug: string; path: string; label: string
  title: string; description: string; updated: string
  sections: Section[]
}

const DOCS = STATIC_PAGES as Doc[]

function StaticDoc({ slug }: { slug: string }) {
  const navigate = useNavigate()
  const doc = DOCS.find(d => d.slug === slug)
  if (!doc) return null

  return (
    <>
      <Seo title={doc.title} description={doc.description} path={doc.path} />
      <div className="feed-header">
        <h2 className="feed-title">{doc.title}</h2>
      </div>

      <article className="doc fade-in">
        <p className="doc-updated">최종 개정일 {doc.updated}</p>

        {doc.sections.map(s => (
          <section key={s.h} className="doc-section">
            <h3>{s.h}</h3>
            {s.p?.map((text, i) => <p key={i}>{text}</p>)}
            {s.ul && (
              <ul>
                {s.ul.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            )}
          </section>
        ))}

        <div className="doc-contact">
          <strong>문의</strong>
          {CONTACT_EMAIL
            ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            : <span>문의 창구를 준비 중입니다. 열리는 대로 이 페이지에 안내할게요.</span>}
        </div>

        <nav className="doc-nav">
          {DOCS.filter(d => d.slug !== slug).map(d => (
            <a key={d.slug} onClick={() => navigate(d.path)}>{d.label}</a>
          ))}
        </nav>
      </article>
    </>
  )
}

export function AboutPage() { return <StaticDoc slug="about" /> }
export function TermsPage() { return <StaticDoc slug="terms" /> }
export function PrivacyPage() { return <StaticDoc slug="privacy" /> }
export function AdsPage() { return <StaticDoc slug="ads" /> }
