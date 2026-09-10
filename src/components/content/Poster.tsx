import { scoreColor } from '@/utils/helpers'
import type { Content } from '@/types'

/** 작품 포스터. 이미지가 없으면 제목 폴백을 그라데이션 위에 표시.
 *  showVerified 를 끄는 자리: 포스터가 작아 '✓ 공식' 이 그림을 다 덮는 목록 (예: 매긴 별점 줄) */
export function Poster({ content, showScore = true, showVerified = true }: { content: Content; showScore?: boolean; showVerified?: boolean }) {
  return (
    <div className="poster" style={content.posterUrl ? { backgroundImage: `url(${content.posterUrl}), linear-gradient(135deg, #3F3F46, #18181B)`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
      {!content.posterUrl && <div className="poster-fallback">{content.title}</div>}
      {showVerified && content.verified && <span className="verified-badge" title="관리자 공식 인증 작품">✓ 공식</span>}
      {showScore && content.reviewCount > 0 && (
        <span className="score-corner" style={{ background: scoreColor(content.avgRating) }}>
          {content.avgRating.toFixed(1)}
        </span>
      )}
    </div>
  )
}
