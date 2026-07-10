import { scoreColor } from '@/utils/helpers'
import type { Content } from '@/types'

/** 작품 포스터. 이미지가 없으면 제목 폴백을 그라데이션 위에 표시 */
export function Poster({ content, showScore = true }: { content: Content; showScore?: boolean }) {
  return (
    <div className="poster" style={content.posterUrl ? { background: `center/cover no-repeat url(${content.posterUrl})` } : undefined}>
      {!content.posterUrl && <div className="poster-fallback">{content.title}</div>}
      {showScore && content.reviewCount > 0 && (
        <span className="score-corner" style={{ background: scoreColor(content.avgRating) }}>
          {content.avgRating.toFixed(1)}
        </span>
      )}
    </div>
  )
}
