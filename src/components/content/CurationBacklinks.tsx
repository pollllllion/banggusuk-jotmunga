import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DS from '@/api/dataService'
import type { Curation } from '@/types'

/**
 * "이 작품이 실린 글" — 작품 페이지 → 큐레이션 역링크.
 *
 * 큐레이션 → 작품 단방향만 두면, 작품 페이지 1,800여 개에 쌓인 크롤 예산이
 * 원본 글로 흐르지 않는다. 역링크를 걸어야 얇은 작품 페이지들이 글을 가리키는
 * 구조가 된다. 사람에게도 "이 작품 말고 그달에 뭐가 더 나오나"로 넘어가는 길이 된다.
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
      <h2>이 작품이 실린 글</h2>
      <ul>
        {list.map(c => (
          <li key={c.id} onClick={() => navigate(`/curation/${c.id}`)}>
            <span className="cur-backlink-title">{c.title}</span>
            {c.summary && <span className="label">{c.summary}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
