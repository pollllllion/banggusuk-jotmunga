import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { ReviewCard } from '@/components/review/ReviewCard'
import { Poster } from '@/components/content/Poster'
import { TYPE_LABELS } from '@/utils/constants'
import { timeAgo } from '@/utils/helpers'
import type { Review } from '@/types'

export function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [sort, setSort] = useState<'latest' | 'popular'>('latest')

  const blockedIds = user ? DS.getBlockedIds(user.id) : []
  let reviews: Review[] = DS.getReviews().filter(r => !blockedIds.includes(r.authorId || ''))

  if (sort === 'popular') {
    reviews = [...reviews].sort((a, b) => (b.likes.length - b.dislikes.length) - (a.likes.length - a.dislikes.length))
  } else {
    reviews = [...reviews].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  const announcements = DS.getAnnouncements()

  // 화제의 영화·드라마 통합 랭킹 (극장+OTT): popularity 우선, 동점은 리뷰 버즈로
  const hotContents = DS.getContents()
    .filter(c => c.type === 'movie' || c.type === 'drama')
    .map(c => {
      const rs = DS.getReviewsByContent(c.id)
      const buzz = rs.reduce((s, r) => s + r.views + r.likes.length + r.dislikes.length, 0) + rs.length * 5
      return { content: c, score: (c.popularity ?? 0) * 1000 + buzz }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(x => x.content)

  return (
    <>
      {announcements.map(a => (
        <div key={a.id} className="announcement-card fade-in" onClick={() => navigate('/admin')}>
          <span className="announcement-badge">공지</span>
          <strong>{a.title}</strong>
          <span style={{ fontSize: 12, color: 'var(--subtext)', marginLeft: 8 }}>{timeAgo(a.createdAt)}</span>
        </div>
      ))}

      {hotContents.length > 0 && (
        <>
          <div className="section-head">
            <h3>🔥 지금 화제의 영화·드라마</h3>
            <a onClick={() => navigate('/browse?sort=top')}>전체보기</a>
          </div>
          <div className="hot-rank-row fade-in">
            {hotContents.map((c, i) => (
              <div key={c.id} className="hot-rank-card" onClick={() => navigate(`/content/${c.id}`)}>
                <div className="hot-rank-poster">
                  <Poster content={c} />
                  <span className="hot-rank-num">{i + 1}</span>
                </div>
                <div className="c-title">{c.title}</div>
                <div className="c-meta">{TYPE_LABELS[c.type]}{c.releaseYear ? ` · ${c.releaseYear}` : ''}</div>
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
