import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { Poster } from '@/components/content/Poster'
import { DiscussionBoard } from '@/components/content/DiscussionBoard'
import { ContentInfo } from '@/components/content/ContentInfo'
import { ReviewCard } from '@/components/review/ReviewCard'
import { Stars } from '@/components/ui/Score'
import { Seo } from '@/components/seo/Seo'
import { BackIcon, BookmarkIcon, FlagIcon } from '@/components/ui/Icons'
import { TYPE_LABELS } from '@/utils/constants'
import { scoreColor, scoreLabel } from '@/utils/helpers'
import { SITE_URL } from '@/utils/seo'
import {
  buildContentTitle, buildContentDescription, buildContentJsonLd, ogTypeOf,
} from '@/shared/contentSeo.mjs'

export function ContentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isAccount } = useAuthStore()
  const { openReportModal } = useUIStore()
  const toast = useToastStore(s => s.show)
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)
  const [sort, setSort] = useState<'popular' | 'latest' | 'high' | 'low'>('popular')
  const [searchParams] = useSearchParams()
  // 출시된 작품: 리뷰 / 수다방 탭 (내 피드에서 클릭 시 ?tab=talk 로 수다방 바로 열기)
  const [tab, setTab] = useState<'reviews' | 'talk'>(searchParams.get('tab') === 'talk' ? 'talk' : 'reviews')

  // 출연진은 시작 로드에서 빠져 있다(용량 절감) — 상세로 들어온 지금 그 한 행만 채운다
  useEffect(() => { if (id) DS.loadContentDetail(id).then(changed => { if (changed) rerender() }) }, [id])

  const content = DS.getContentById(id!)
  if (!content) { navigate('/browse'); return null }

  // 공개 여부는 캘린더와 동일하게 '공개일' 기준으로 판단한다.
  // (TMDB 동기화는 status를 전부 'upcoming'으로 저장하므로 status만 보면 이미 개봉한 작품도 '공개예정'이 됨)
  const relDate = content.manualOverride && content.manualReleaseDate ? content.manualReleaseDate : content.releaseDate
  const now = new Date()
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const isUpcoming = relDate ? relDate > todayKey : content.status === 'upcoming'
  // 공개일이 있는(=캘린더/TMDB) 작품은 날짜로 판정, 없으면 큐레이션 status(연재중/완결) 사용
  const statusLabel = isUpcoming ? '공개예정'
    : relDate ? null
    : content.status === 'ongoing' ? '연재중'
    : content.status === 'completed' ? '완결' : null

  const blockedIds = user ? DS.getBlockedIds(user.id) : []
  let reviews = DS.getReviewsByContent(content.id).filter(r => !blockedIds.includes(r.authorId || ''))
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
    if (!isAccount) { toast('찜은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    const added = DS.toggleBookmark(user.id, content.id)
    toast(added ? '작품을 찜했습니다.' : '찜을 취소했습니다.'); rerender()
  }

  const goWrite = () => {
    if (myReview) navigate(`/review/edit/${myReview.id}`)
    else navigate(`/review/write/${content.id}`)
  }

  // ── SEO ──────────────────────────────────────────────────────
  // 문구 생성은 shared/contentSeo.mjs 에 있다. 프리렌더 스크립트가 같은 함수를 써야
  // 크롤러가 받는 HTML 과 여기서 그리는 메타가 어긋나지 않는다.
  const seoTitle = buildContentTitle(content, todayKey)
  const seoDescription = buildContentDescription(content, todayKey)
  const jsonLd = buildContentJsonLd(content, SITE_URL)

  return (
    <>
      <Seo
        title={seoTitle}
        description={seoDescription}
        image={content.posterUrl}
        path={`/content/${content.id}`}
        type={ogTypeOf(content) as 'video.movie' | 'video.tv_show' | 'article'}
        // 캘린더에서 숨긴 작품(동기화에서 밀려난 옛 행)은 색인 대상이 아니다. sitemap 에서도 빠져 있다.
        noindex={content.hidden === true}
        jsonLd={jsonLd}
      />
      <div className="back-btn" onClick={() => navigate('/browse')}><BackIcon /> 목록으로</div>

      <div className="content-hero fade-in">
        <div style={{ width: 160, flexShrink: 0 }}>
          <Poster content={content} showScore={false} />
        </div>
        <div className="content-hero-info">
          <span className={`type-badge type-${content.type}`}>{TYPE_LABELS[content.type]}</span>
          <h1>{content.title}</h1>
          <div className="content-hero-meta">
            {content.platform && <span>{content.platform} · </span>}
            {relDate ? <span>{relDate.replace(/-/g, '. ')} {isUpcoming ? '공개예정' : '공개'}</span> : content.releaseYear && <span>{content.releaseYear}년</span>}
            {statusLabel && !relDate && <span> · {statusLabel}</span>}
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

      <ContentInfo content={content} />

      {isUpcoming ? (
        <DiscussionBoard contentId={content.id} />
      ) : (
      <>
      {/* 리뷰 / 수다방 탭 */}
      <div className="feed-sort" style={{ marginTop: 16, marginBottom: 4 }}>
        <button className={tab === 'reviews' ? 'active' : ''} onClick={() => setTab('reviews')}>⭐ 리뷰</button>
        <button className={tab === 'talk' ? 'active' : ''} onClick={() => setTab('talk')}>💬 작품방</button>
      </div>

      {tab === 'talk' ? (
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
      )}
      {content.source === 'tmdb' && (
        <p style={{ fontSize: 11, color: 'var(--subtext)', textAlign: 'center', marginTop: 20, lineHeight: 1.7 }}>
          작품 정보 제공: <a href={content.tmdbUrl || 'https://www.themoviedb.org/'} target="_blank" rel="noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'underline' }}>TMDB</a>
          {Array.isArray(content.providers) && content.providers.length > 0 && <> · OTT 제공 정보: JustWatch</>}
          <br />This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      )}
    </>
  )
}
