import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import * as DS from '@/api/dataService'
import { SITE_NAME } from '@/utils/seo'

/** 카드에 늘어놓을 포스터 최대 장수 */
const MAX_POSTERS = 5

/** 큐레이션 목록 — 발행된 기획 글만 최신순 */
export function CurationListPage() {
  const navigate = useNavigate()
  const [, setTick] = useState(0)
  const list = DS.getPublishedCurations()

  // 제목만 있으면 어떤 글인지 한눈에 안 들어온다. 실린 작품 포스터를 카드에 깐다.
  // items 는 시작 로드에 없어서 한 번의 질의로 채워 온다(body 는 안 받는다).
  useEffect(() => {
    void DS.loadCurationItems().then(changed => { if (changed) setTick(t => t + 1) })
  }, [list.length])

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
          {list.map(c => {
            const works = (c.items || []).map(i => DS.getContentById(i.contentId)).filter(Boolean)
            const posters = works.filter(x => x!.posterUrl).slice(0, MAX_POSTERS)
            const total = (c.items || []).length
            // 카드에는 요약문 대신 실린 작품명을 보여준다 — 포스터 옆에서 뭐가 실렸는지
            // 바로 읽힌다. summary 는 지우지 않는다: 검색결과 meta description 이 그걸 쓴다
            // (buildCurationDescription). items 가 아직 안 왔을 때만 summary 로 대신한다.
            const line = works.length ? works.map(w => w!.title).join(' · ') : c.summary

            return (
              <article key={c.id} className="cur-card fade-in" onClick={() => navigate(`/curation/${c.id}`)}>
                {c.coverUrl
                  ? <img className="cur-card-cover" src={c.coverUrl} alt="" loading="lazy" />
                  : posters.length > 0 && (
                    <div className="cur-card-posters">
                      {posters.map(p => (
                        <img key={p!.id} src={p!.posterUrl!} alt={p!.title} loading="lazy" />
                      ))}
                      {total > posters.length && <span className="cur-card-more">+{total - posters.length}</span>}
                    </div>
                  )}
                <div className="cur-card-body">
                  <h3>{c.title}</h3>
                  <p>{line}</p>
                  <span className="cur-card-date">
                    {String(c.publishedAt).slice(0, 10).replace(/-/g, '. ')}
                    {total > 0 && ` · 작품 ${total}편`}
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
