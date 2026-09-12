import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { Poster } from './Poster'
import { TYPE_LABELS } from '@/utils/constants'
import { pickRelated } from '@/shared/relatedContents.mjs'
import { isIndexableContent } from '@/shared/contentIndexable.mjs'
import { todayKey } from '@/shared/contentSeo.mjs'
import type { Content } from '@/types'

/**
 * "이런 작품도" — 작품 → 작품 링크.
 *
 * 고르는 규칙은 src/shared/relatedContents.mjs 에 있다(프리렌더와 같은 함수).
 * 여기서 갈리면 크롤러가 본 링크와 사람이 본 링크가 달라진다.
 *
 * **`<Link>` 로 진짜 <a href> 를 그린다.** ContentCard 는 div+navigate 라 새 탭으로 못 열고
 * 크롤러도 못 따라간다. 이 줄은 존재 이유가 링크라서 카드를 재사용하지 않는다.
 */
export function RelatedContents({ content }: { content: Content }) {
  const list = useMemo(() => {
    const today = todayKey()
    // 글 수는 한 번만 센다 — 작품 2천여 개마다 목록을 훑으면 저사양 폰에서 티가 난다
    const talkCount = new Map<string, number>()
    for (const d of DS.getDiscussionsByBoard('talk')) {
      if (d.contentId) talkCount.set(d.contentId, (talkCount.get(d.contentId) || 0) + 1)
    }
    // 링크는 색인 대상에만 건다 — noindex 로 막아 둔 얇은 페이지로 크롤 예산을 흘리지 않는다
    const pool = DS.getContents().filter(c =>
      isIndexableContent(c, { today, discussionCount: talkCount.get(c.id) || 0 }))
    return pickRelated(content, pool) as Content[]
  }, [content])

  if (!list.length) return null

  return (
    <section className="related-works">
      <h2>이런 작품도</h2>
      <div className="related-row">
        {list.map(c => (
          <Link key={c.id} to={`/content/${c.id}`} className="related-item">
            <Poster content={c} />
            <div className="c-title">{c.title}</div>
            <div className="c-meta">
              {TYPE_LABELS[c.type]}
              {c.releaseYear ? ` · ${c.releaseYear}` : ''}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
