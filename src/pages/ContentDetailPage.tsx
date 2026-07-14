import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { Poster } from '@/components/content/Poster'
import { DiscussionBoard } from '@/components/content/DiscussionBoard'
import { ReviewCard } from '@/components/review/ReviewCard'
import { Stars } from '@/components/ui/Score'
import { BackIcon, BookmarkIcon, FlagIcon } from '@/components/ui/Icons'
import { TYPE_LABELS } from '@/utils/constants'
import { scoreColor, scoreLabel } from '@/utils/helpers'

export function ContentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { openReportModal } = useUIStore()
  const toast = useToastStore(s => s.show)
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)
  const [sort, setSort] = useState<'popular' | 'latest' | 'high' | 'low'>('popular')

  const content = DS.getContentById(id!)
  if (!content) { navigate('/browse'); return null }

  // 아직 안 나온 작품은 리뷰(평점) 대신 기대평 수다방을 보여준다
  const isUpcoming = content.status === 'upcoming' ||
    (!!content.releaseDate && new Date(content.releaseDate + 'T00:00:00') > new Date())

  const blockedIds = user ? DS.getBlockedIds(user.id) : []
  let reviews = DS.getReviewsByContent(content.id).filter(r => !blockedIds.includes(r.authorId))
  if (sort === 'latest') reviews = [...reviews].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  else if (sort === 'high') reviews = [...reviews].sort((a, b) => b.rating - a.rating)
  else if (sort === 'low') reviews = [...reviews].sort((a, b) => a.rating - b.rating)
  else reviews = [...reviews].sort((a, b) => (b.likes.length - b.dislikes.length) - (a.likes.length - a.dislikes.length))

  const myReview = user ? DS.getUserReviewForContent(user.id, content.id) : undefined
  const bookmarked = user ? DS.isBookmarked(user.id, content.id) : false

  // 점수 분포 (1~10)
  const dist = Array.from({ length: 10 }, (_, i) => {
    const score = 10 - i
    return { score, count: reviews.filter(r => r.rating === score).length }
  })
  const maxCount = Math.max(1, ...dist.map(d => d.count))

  const handleBookmark = () => {
    if (!user) return
    const added = DS.toggleBookmark(user.id, content.id)
    toast(added ? '작품을 찜했습니다.' : '찜을 취소했습니다.'); rerender()
  }

  const goWrite = () => {
    if (myReview) navigate(`/review/edit/${myReview.id}`)
    else navigate(`/review/write/${content.id}`)
  }

  return (
    <>
      <div className="back-btn" onClick={() => navigate('/browse')}><BackIcon /> 목록으로</div>

      <div className="content-hero fade-in">
        <div style={{ width: 160, flexShrink: 0 }}>
          <Poster content={content} showScore={false} />
        </div>
        <div className="content-hero-info">
          <span className={`type-badge type-${content.type}`}>{TYPE_LABELS[content.type]}</span>
          <h1>{content.title}</h1>
          <div className="content-hero-meta">
            {content.creators.length > 0 && <span><b>제작:</b> {content.creators.join(', ')} · </span>}
            {content.platform && <span>{content.platform} · </span>}
            {content.releaseYear && <span>{content.releaseYear}년</span>}
            {content.status && <span> · {content.status === 'upcoming' ? '공개예정' : content.status === 'ongoing' ? '연재중' : '완결'}</span>}
          </div>
          <div className="content-genres">
            {content.genres.map(g => <span key={g} className="genre-tag">{g}</span>)}
          </div>
          <p className="content-synopsis">{content.synopsis || '등록된 줄거리가 없습니다.'}</p>

          <div className="review-detail-actions" style={{ marginTop: 14, marginBottom: 0 }}>
            {!isUpcoming && (
              <button className="btn btn-primary" onClick={goWrite}>
                {myReview ? '내 리뷰 수정' : '✍️ 리뷰 쓰기'}
              </button>
            )}
            <button className={`btn-like ${bookmarked ? 'active' : ''}`} onClick={handleBookmark}>
              <BookmarkIcon filled={bookmarked} /> {isUpcoming ? '찜 · 공개알림' : '찜'}
            </button>
            <button className="btn-text btn-small" onClick={() => openReportModal('content', content.id)}>
              <FlagIcon /> 신고
            </button>
          </div>
        </div>
      </div>

      {isUpcoming ? (
        <DiscussionBoard contentId={content.id} />
      ) : (
      <>
      {/* 점수 요약 + 분포 */}
      <div className="content-hero fade-in" style={{ marginTop: 12, gap: 28 }}>
        <div className="score-box" style={{ flexShrink: 0, minWidth: 120 }}>
          <div className="big" style={{ color: scoreColor(content.avgRating) }}>
            {content.reviewCount ? content.avgRating.toFixed(1) : '-'}
          </div>
          <Stars score={content.avgRating} size={16} />
          <div className="cnt">{content.reviewCount ? `${scoreLabel(content.avgRating)} · 리뷰 ${content.reviewCount}개` : '아직 평가 없음'}</div>
        </div>
        <div className="rating-dist" style={{ flex: 1, alignSelf: 'center', width: '100%' }}>
          {dist.map(d => (
            <div key={d.score} className="dist-row">
              <span className="lbl">{d.score}점</span>
              <div className="dist-bar-bg">
                <div className="dist-bar" style={{ width: `${(d.count / maxCount) * 100}%`, background: scoreColor(d.score) }} />
              </div>
              <span className="val">{d.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 리뷰 목록 */}
      <div className="feed-header" style={{ marginTop: 20 }}>
        <h2 className="feed-title">리뷰 {reviews.length}</h2>
        <div className="feed-sort">
          <button className={sort === 'popular' ? 'active' : ''} onClick={() => setSort('popular')}>공감순</button>
          <button className={sort === 'latest' ? 'active' : ''} onClick={() => setSort('latest')}>최신</button>
          <button className={sort === 'high' ? 'active' : ''} onClick={() => setSort('high')}>고평점</button>
          <button className={sort === 'low' ? 'active' : ''} onClick={() => setSort('low')}>저평점</button>
        </div>
      </div>

      {!reviews.length ? (
        <div className="empty-state fade-in"><p>첫 리뷰의 주인공이 되어보세요!</p></div>
      ) : (
        reviews.map(r => <ReviewCard key={r.id} review={r} showContent={false} />)
      )}
      </>
      )}
    </>
  )
}
