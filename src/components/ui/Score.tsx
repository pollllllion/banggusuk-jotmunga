import { StarIcon } from './Icons'
import { scoreColor } from '@/utils/helpers'

/** 큰 숫자형 점수 (0~10) */
export function ScoreBadge({ score, size = 20 }: { score: number; size?: number }) {
  return (
    <span className="score-badge" style={{ color: scoreColor(score) }}>
      <span className="num" style={{ fontSize: size }}>{score.toFixed(1)}</span>
      <span className="max">/10</span>
    </span>
  )
}

/** 색상 알약형 점수 배지 */
export function ScorePill({ score }: { score: number }) {
  return (
    <span className="score-pill" style={{ background: scoreColor(score) }}>
      <StarIcon size={12} color="#fff" /> {score.toFixed(1)}
    </span>
  )
}

/** 별 5개 게이지 (10점 → 5별 환산, 반별 지원) */
export function Stars({ score, size = 14 }: { score: number; size?: number }) {
  const filled = Math.round(score) / 2 // 0~5
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map(i => (
        <StarIcon key={i} size={size}
          filled={i <= filled}
          color={i <= filled ? 'var(--accent)' : 'var(--border)'} />
      ))}
    </span>
  )
}
