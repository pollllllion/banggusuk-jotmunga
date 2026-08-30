import { useNavigate } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import * as DS from '@/api/dataService'
import { SITE_NAME } from '@/utils/seo'

/** 큐레이션 목록 — 발행된 기획 글만 최신순 */
export function CurationListPage() {
  const navigate = useNavigate()
  const list = DS.getPublishedCurations()

  return (
    <>
      <Seo
        title="공개작 정리"
        description={`${SITE_NAME}가 직접 고르고 정리한 월간·주간 공개작 모음. 넷플릭스·디즈니+·티빙·웨이브 신작과 극장 개봉작을 공개일 순으로 묶었습니다.`}
        path="/curation"
      />
      <div className="feed-header">
        <h2 className="feed-title">공개작 정리</h2>
      </div>

      {!list.length ? (
        <p style={{ color: 'var(--subtext)', padding: '20px 0' }}>아직 올라온 글이 없습니다.</p>
      ) : (
        <div className="cur-list">
          {list.map(c => (
            <article key={c.id} className="cur-card fade-in" onClick={() => navigate(`/curation/${c.id}`)}>
              {c.coverUrl && <img className="cur-card-cover" src={c.coverUrl} alt="" loading="lazy" />}
              <div className="cur-card-body">
                <h3>{c.title}</h3>
                <p>{c.summary}</p>
                <span className="cur-card-date">{String(c.publishedAt).slice(0, 10).replace(/-/g, '. ')}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  )
}
