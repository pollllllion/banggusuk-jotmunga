import { scoreColor } from '@/utils/helpers'

/**
 * 별점 시트 — 1~10 중 하나를 고른다.
 *
 * 내 피드 목록과 작품 페이지가 같은 것을 쓴다. 두 벌로 두면 한쪽만 고쳐지는 날이 온다
 * (Pager 와 같은 이유로 모았다).
 *
 * 값은 `watched.rating` 에 저장된다 — 글을 쓰지 않아도 별점만 남길 수 있다.
 */
export function RatingSheet({ title, rating, onPick, onClose }: {
  title: string
  rating: number | null
  onPick: (rating: number | null) => void
  onClose: () => void
}) {
  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sheet" role="dialog" aria-label="별점 매기기">
        <div className="sheet-group">
          <div className="rate-head">
            <div className="rate-title">{title}</div>
            <div className="rate-sub">1점부터 10점까지 · 매긴 점수는 작품 평점에 들어가요</div>
          </div>
          <div className="rate-grid">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
              <button
                key={n}
                className={`rate-num ${rating === n ? 'on' : ''}`}
                style={rating === n ? { background: scoreColor(n), borderColor: 'transparent', color: '#fff' } : undefined}
                onClick={() => onPick(n)}
              >{n}</button>
            ))}
          </div>
          {rating != null && (
            <button className="sheet-item danger" onClick={() => onPick(null)}>별점 지우기</button>
          )}
        </div>
        <button className="sheet-item sheet-cancel" onClick={onClose}>취소</button>
      </div>
    </div>
  )
}
