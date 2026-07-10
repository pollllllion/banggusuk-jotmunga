import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { ReviewCard } from '@/components/review/ReviewCard'

export function MyReviewsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  if (!user) return null

  const reviews = DS.getReviewsByAuthor(user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <>
      <div className="feed-header">
        <h2 className="feed-title">내 리뷰 ({reviews.length})</h2>
      </div>
      {!reviews.length ? (
        <div className="empty-state fade-in">
          <p>아직 작성한 리뷰가 없습니다.</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/browse')}>작품 둘러보기</button>
        </div>
      ) : (
        reviews.map(r => <ReviewCard key={r.id} review={r} />)
      )}
    </>
  )
}
