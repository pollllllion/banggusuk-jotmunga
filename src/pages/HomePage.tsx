import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { ReviewCard } from '@/components/review/ReviewCard'
import { ScorePill } from '@/components/ui/Score'
import { TYPE_LABELS } from '@/utils/constants'
import { timeAgo } from '@/utils/helpers'
import type { Review } from '@/types'

export function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [sort, setSort] = useState<'latest' | 'popular'>('latest')

  const blockedIds = user ? DS.getBlockedIds(user.id) : []
  let reviews: Review[] = DS.getReviews().filter(r => !blockedIds.includes(r.authorId))

  if (sort === 'popular') {
    reviews = [...reviews].sort((a, b) => (b.likes.length - b.dislikes.length) - (a.likes.length - a.dislikes.length))
  } else {
    reviews = [...reviews].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  const announcements = DS.getAnnouncements()
  const topContents = [...DS.getContents()]
    .filter(c => c.reviewCount > 0)
    .sort((a, b) => b.avgRating - a.avgRating)
    .slice(0, 5)

  return (
    <>
      <div className="hero-banner fade-in">
        <h2>⚡ 돌직구</h2>
        <p>영화·드라마·웹툰·웹소설, 눈치 안 보고 남기는 가장 솔직한 리뷰</p>
      </div>

      {announcements.map(a => (
        <div key={a.id} className="announcement-card fade-in" onClick={() => navigate('/admin')}>
          <span className="announcement-badge">공지</span>
          <strong>{a.title}</strong>
          <span style={{ fontSize: 12, color: 'var(--subtext)', marginLeft: 8 }}>{timeAgo(a.createdAt)}</span>
        </div>
      ))}

      {topContents.length > 0 && (
        <>
          <div className="section-head">
            <h3>🔥 평점 높은 작품</h3>
            <a onClick={() => navigate('/browse?sort=top')}>전체보기</a>
          </div>
          <div className="trending-section fade-in">
            {topContents.map((c, i) => (
              <div key={c.id} className="trending-item" onClick={() => navigate(`/content/${c.id}`)}>
                <span className="trending-rank">{i + 1}</span>
                <span className={`type-badge type-${c.type}`}>{TYPE_LABELS[c.type]}</span>
                <span className="trending-title">{c.title}</span>
                <ScorePill score={c.avgRating} />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="feed-header" style={{ marginTop: 20 }}>
        <h2 className="feed-title">최신 리뷰</h2>
        <div className="feed-sort">
          <button className={sort === 'latest' ? 'active' : ''} onClick={() => setSort('latest')}>최신순</button>
          <button className={sort === 'popular' ? 'active' : ''} onClick={() => setSort('popular')}>인기순</button>
        </div>
      </div>

      {!reviews.length ? (
        <div className="empty-state fade-in"><p>아직 리뷰가 없습니다. 첫 직설 리뷰를 남겨보세요!</p></div>
      ) : (
        reviews.map(r => <ReviewCard key={r.id} review={r} />)
      )}
    </>
  )
}
