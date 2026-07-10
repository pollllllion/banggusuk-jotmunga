import { useNavigate } from 'react-router-dom'
import { Poster } from './Poster'
import { TYPE_LABELS } from '@/utils/constants'
import type { Content } from '@/types'

export function ContentCard({ content }: { content: Content }) {
  const navigate = useNavigate()
  return (
    <div className="content-card fade-in" onClick={() => navigate(`/content/${content.id}`)}>
      <Poster content={content} />
      <div className="c-title">{content.title}</div>
      <div className="c-meta">
        {TYPE_LABELS[content.type]}
        {content.releaseYear ? ` · ${content.releaseYear}` : ''}
        {content.reviewCount > 0 ? ` · 리뷰 ${content.reviewCount}` : ' · 리뷰 없음'}
      </div>
    </div>
  )
}
