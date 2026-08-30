import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import * as DS from '@/api/dataService'
import { SITE_URL, SITE_NAME } from '@/utils/seo'
import {
  buildCurationDescription, buildCurationJsonLd, bodyParagraphs, isPublished,
} from '@/shared/curationSeo.mjs'

/**
 * 큐레이션 상세.
 *
 * 본문(body·items)은 시작 로드에 없어서 여기서 지연 로드한다(curationColumns.ts).
 * 프리렌더가 찍는 정적 HTML 과 같은 내용을 그려야 클로킹이 아니다 —
 * 문단 → 작품 카드 순서를 프리렌더(curationBodyLines)와 맞춰 둘 것.
 */
export function CurationDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [, setTick] = useState(0)

  const cur = DS.getCurationById(id)

  useEffect(() => {
    if (!id) return
    void DS.loadCurationDetail(id).then(changed => { if (changed) setTick(t => t + 1) })
  }, [id])

  if (!cur) {
    return (
      <>
        <Seo title="글을 찾을 수 없습니다" noindex />
        <p style={{ color: 'var(--subtext)', padding: '20px 0' }}>글을 찾을 수 없습니다.</p>
        <div className="back-btn" onClick={() => navigate('/curation')}>목록으로</div>
      </>
    )
  }

  const published = isPublished(cur)
  const paragraphs = bodyParagraphs(cur)
  const items = cur.items || []

  return (
    <>
      <Seo
        title={cur.title}
        description={buildCurationDescription(cur)}
        image={cur.coverUrl}
        path={`/curation/${cur.id}`}
        type="article"
        // 초안은 관리자에게만 보이는 화면이라 색인 대상이 아니다
        noindex={!published}
        nofollow={false}
        jsonLd={published ? buildCurationJsonLd(cur, SITE_URL, SITE_NAME) : null}
      />
      <div className="back-btn" onClick={() => navigate('/curation')}>목록으로</div>

      <article className="cur-detail fade-in">
        {!published && <p className="cur-draft-flag">초안 — 아직 공개되지 않은 글입니다.</p>}
        <h1>{cur.title}</h1>
        {published && (
          <p className="cur-detail-date">{String(cur.publishedAt).slice(0, 10).replace(/-/g, '. ')}</p>
        )}
        {cur.coverUrl && <img className="cur-detail-cover" src={cur.coverUrl} alt="" />}

        {(paragraphs as string[]).map((p, i) => <p key={i} className="cur-para">{p}</p>)}

        <div className="cur-items">
          {items.map(it => {
            const c = DS.getContentById(it.contentId)
            return (
              <section key={it.contentId} className="cur-item">
                {c?.posterUrl && (
                  <img
                    className="cur-item-poster" src={c.posterUrl} alt="" loading="lazy"
                    onClick={() => navigate(`/content/${it.contentId}`)}
                  />
                )}
                <div className="cur-item-body">
                  <h2 onClick={() => navigate(`/content/${it.contentId}`)}>{c ? c.title : it.contentId}</h2>
                  <p>{it.note}</p>
                  <a onClick={() => navigate(`/content/${it.contentId}`)}>작품 정보 보기 ›</a>
                </div>
              </section>
            )
          })}
        </div>
      </article>
    </>
  )
}
