import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import * as DS from '@/api/dataService'
import { SITE_URL, SITE_NAME } from '@/utils/seo'
import {
  buildCurationDescription, buildCurationJsonLd, paragraphs as splitParagraphs, isPublished, curationGroups,
} from '@/shared/curationSeo.mjs'
import { textBlocks } from '@/shared/curationMarkup.mjs'
import { CurationBlocks } from '@/components/curation/CurationBlocks'
import { clickable } from '@/utils/a11y'

/**
 * 큐레이션 상세.
 *
 * 본문(body·items)은 시작 로드에 없어서 여기서 지연 로드한다(curationColumns.ts).
 * 프리렌더가 찍는 정적 HTML 과 같은 내용을 그려야 클로킹이 아니다 —
 * 문단 → 작품 카드 → 맺음말 순서를 프리렌더(curationBodyLines)와 맞춰 둘 것.
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
        <div className="back-btn" {...clickable(() => navigate('/curation'))}>목록으로</div>
      </>
    )
  }

  const published = isPublished(cur)
  // 문단·소제목·목록·표 — 프리렌더(curationBodyLines → blocksToHtml)와 같은 블록
  const bodyBlocks = textBlocks(cur.body)
  const outroBlocks = textBlocks(cur.outro)
  const items = cur.items || []
  /** 작품 → 묶음. 아무도 안 묶었으면 작품마다 하나(예전 화면 그대로) */
  const groups = curationGroups(items) as { items: typeof items; title: string; note: string }[]

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
      <div className="back-btn" {...clickable(() => navigate('/curation'))}>목록으로</div>

      <article className="cur-detail fade-in">
        {!published && <p className="cur-draft-flag">초안 — 아직 공개되지 않은 글입니다.</p>}
        <h1>{cur.title}</h1>
        {published && (
          <p className="cur-detail-date">{String(cur.publishedAt).slice(0, 10).replace(/-/g, '. ')}</p>
        )}
        {cur.coverUrl && <img className="cur-detail-cover" src={cur.coverUrl} alt="" />}

        <CurationBlocks blocks={bodyBlocks} />

        {items.length > 0 && <div className="cur-items">
          {groups.map(g => {
            const it = g.items[0]
            // 여러 작품 한 묶음 — 묶음 제목, 포스터 줄, 설명 하나 (프리렌더 curationBodyLines 의 'group')
            if (g.items.length > 1) {
              const works = g.items.map(x => ({ id: x.contentId, c: DS.getContentById(x.contentId) }))
              return (
                <section key={it.contentId} className="cur-item cur-group">
                  <div className="cur-item-body">
                    <h2>{g.title || works.map(w => w.c ? w.c.title : w.id).join(' · ')}</h2>
                    <div className="cur-group-works">
                      {works.map(w => (
                        <figure key={w.id} onClick={() => navigate(`/content/${w.id}`)}>
                          {w.c?.posterUrl
                            ? <img src={w.c.posterUrl} alt={w.c.title} loading="lazy" />
                            : <span className="cur-group-noimg" />}
                          <figcaption>{w.c ? w.c.title : w.id}</figcaption>
                        </figure>
                      ))}
                    </div>
                    {(splitParagraphs(g.note) as string[]).map((p, i) => <p key={i}>{p}</p>)}
                  </div>
                </section>
              )
            }
            const c = DS.getContentById(it.contentId)
            return (
              <section key={it.contentId} className="cur-item">
                {/* 포스터·제목 어느 쪽을 눌러도 작품으로 간다 — 따로 링크를 달 이유가 없다 */}
                {c?.posterUrl && (
                  <img
                    className="cur-item-poster" src={c.posterUrl} alt={c.title} loading="lazy"
                    onClick={() => navigate(`/content/${it.contentId}`)}
                  />
                )}
                <div className="cur-item-body">
                  <h2 onClick={() => navigate(`/content/${it.contentId}`)}>{c ? c.title : it.contentId}</h2>
                  {(splitParagraphs(it.note) as string[]).map((p, i) => <p key={i}>{p}</p>)}
                </div>
              </section>
            )
          })}
        </div>}

        {outroBlocks.length > 0 && (
          <div className="cur-outro">
            <CurationBlocks blocks={outroBlocks} />
          </div>
        )}
      </article>
    </>
  )
}
