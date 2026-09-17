import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DS from '@/api/dataService'
import type { Content, Curation } from '@/types'
import { clickable } from '@/utils/a11y'

/**
 * "이 작품이 실린 큐레이션" — 작품 페이지 → 큐레이션 역링크. 작품방 토론글 목록 바로 아래.
 *
 * 큐레이션 → 작품 단방향만 두면, 작품 페이지 1,800여 개에 쌓인 크롤 예산이
 * 원본 글로 흐르지 않는다. 역링크를 걸어야 얇은 작품 페이지들이 글을 가리키는
 * 구조가 된다. 사람에게도 "이 작품 말고 뭐가 같이 묶였나"로 넘어가는 길이 된다.
 *
 * 글마다 제목 한 줄 + 실린 작품 포스터 줄 (2026-09-17). 전에는 요약 문단을 그대로 깔아
 * 글자가 크고 길었다 — 무슨 글인지는 제목이, 무엇이 묶였는지는 포스터가 더 빨리 말한다.
 * 지금 보고 있는 작품 포스터에는 테두리를 둘러 "여기 이 작품이 들어 있다"를 짚는다.
 *
 * items 가 시작 로드에 없어서 DB 에 직접 묻는다(getCurationsForContent).
 * 붙은 글이 없으면 아무것도 그리지 않는다.
 */
export function CurationBacklinks({ contentId }: { contentId: string }) {
  const navigate = useNavigate()
  const [list, setList] = useState<Curation[]>([])

  useEffect(() => {
    let alive = true
    void DS.getCurationsForContent(contentId).then(rows => { if (alive) setList(rows) })
    return () => { alive = false }
  }, [contentId])

  if (!list.length) return null

  return (
    <section className="cur-backlinks">
      <h2>이 작품이 실린 큐레이션</h2>
      <ul>
        {list.map(c => {
          const works = (c.items || [])
            .map(it => DS.getContentById(it.contentId))
            .filter((w): w is Content => Boolean(w))
          return (
            <li key={c.id} {...clickable(() => navigate(`/curation/${c.id}`), c.title)}>
              <span className="cur-backlink-title">{c.title}</span>
              {works.length > 0 && (
                <span className="cur-backlink-posters">
                  {works.map(w => w.posterUrl
                    ? <img key={w.id} src={w.posterUrl} alt={w.title} title={w.title} loading="lazy"
                        className={w.id === contentId ? 'here' : ''} />
                    : <span key={w.id} className={`noimg ${w.id === contentId ? 'here' : ''}`} title={w.title}>{w.title.slice(0, 6)}</span>)}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
