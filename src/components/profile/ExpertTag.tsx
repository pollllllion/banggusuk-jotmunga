import { TYPE_LABELS } from '@/utils/constants'
import { expertBadgeFor } from '@/utils/level'
import type { ContentType } from '@/types'

/** 리뷰·평점 옆에 붙는 작은 좋문가 배지.
 *  해당 작성자가 그 분야(type)의 좋문가가 아니면 아무것도 렌더하지 않는다. */
export function ExpertTag({ authorId, type }: { authorId: string | null | undefined; type: ContentType }) {
  const badge = expertBadgeFor(authorId, type)
  if (!badge) return null
  return (
    <span
      className={`expert-tag rank-${badge.rank}`}
      title={`${TYPE_LABELS[type]} 평가 ${badge.stat.rated}편 · 장문리뷰 ${badge.stat.longReviews}개${badge.stat.approval !== null ? ` · 인정률 ${Math.round(badge.stat.approval * 100)}%` : ''}`}
    >
      {badge.emoji} {badge.label}
    </span>
  )
}
