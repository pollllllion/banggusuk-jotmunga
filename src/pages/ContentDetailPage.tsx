import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { Poster } from '@/components/content/Poster'
import { DiscussionBoard } from '@/components/content/DiscussionBoard'
import { CurationBacklinks } from '@/components/content/CurationBacklinks'
import { ContentInfo } from '@/components/content/ContentInfo'
import { Stars } from '@/components/ui/Score'
import { Seo } from '@/components/seo/Seo'
import { BackIcon, BellIcon, BookmarkIcon, FlagIcon } from '@/components/ui/Icons'
import { TYPE_LABELS } from '@/utils/constants'
import { scoreColor, scoreLabel } from '@/utils/helpers'
import { expertRatingFor } from '@/utils/level'
import { SITE_URL } from '@/utils/seo'
import {
  buildContentTitle, buildContentDescription, buildContentJsonLd, ogTypeOf,
} from '@/shared/contentSeo.mjs'
import { isIndexableContent } from '@/shared/contentIndexable.mjs'
import { getPushState, enablePush } from '@/utils/push'
import { useContentDetail } from '@/hooks/useContentDetail'
import { ContentDetailFallback } from '@/components/content/ContentDetailFallback'

export function ContentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isAccount } = useAuthStore()
  const { openReportModal } = useUIStore()
  const toast = useToastStore(s => s.show)
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)

  // 줄거리·출연진은 시작 로드에서 빠져 있다(용량 절감) — 상세로 들어온 지금 그 한 행만 채운다.
  // 다 오기 전(loading)·못 받았을 때(error)를 구분해야 '정보 없는 작품'으로 오해받지 않는다.
  const { state: detail, retry: retryDetail } = useContentDetail(id)

  const content = DS.getContentById(id!)
  if (!content) { navigate('/browse'); return null }

  // 공개 여부는 캘린더와 동일하게 '공개일' 기준으로 판단한다.
  const relDate = content.manualOverride && content.manualReleaseDate ? content.manualReleaseDate : content.releaseDate
  const now = new Date()
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const isUpcoming = relDate ? relDate > todayKey : content.status === 'upcoming'
  const statusLabel = isUpcoming ? '공개예정'
    : relDate ? null
    : content.status === 'ongoing' ? '연재중'
    : content.status === 'completed' ? '완결' : null

  // 별점 = 토론글 중 별점 단 글에서 집계
  const rated = DS.getDiscussionsByContent(content.id).filter(d => d.rating != null)
  const ratingCount = rated.length
  const avgRating = ratingCount ? Math.round((rated.reduce((s, d) => s + (d.rating || 0), 0) / ratingCount) * 10) / 10 : 0
  const dist = Array.from({ length: 10 }, (_, i) => {
    const score = 10 - i
    return { score, count: rated.filter(d => d.rating === score).length }
  })
  const maxCount = Math.max(1, ...dist.map(d => d.count))
  const expertRating = expertRatingFor(rated)

  const bookmarked = user ? DS.isBookmarked(user.id, content.id) : false
  const alerted = user ? DS.isContentAlerted(user.id, content.id) : false

  const handleBookmark = () => {
    if (!user) return
    if (!isAccount) { toast('찜은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    const added = DS.toggleBookmark(user.id, content.id)
    toast(added ? '작품을 찜했습니다.' : '찜을 취소했습니다.'); rerender()
  }

  /**
   * 공개알림 — 찜과 별개다.
   * 알림이 실제로 오려면 ① 이 작품의 알림 행 ② 이 기기의 푸시 구독, 둘 다 필요하다.
   * 그래서 켜는 순간 구독이 없으면 여기서 바로 권한을 요청한다.
   * (설정 페이지까지 찾아가라고 하면 그 단계에서 다 이탈한다 — 원래 그래서 안 왔다)
   */
  const handleAlert = async () => {
    if (!user) return
    if (!isAccount) { toast('공개알림은 로그인(고정닉) 후 이용할 수 있어요.'); return }

    const on = DS.toggleContentAlert(user.id, content.id)
    rerender()
    if (!on) { toast('공개알림을 껐어요.'); return }

    const state = await getPushState()
    if (state === 'on') { toast('공개일에 알려드릴게요.'); return }
    if (state === 'unsupported') { toast('이 브라우저는 알림을 지원하지 않아요. 다른 기기에서 켜주세요.'); return }
    if (state === 'denied') { toast('브라우저에서 알림이 차단돼 있어요. 주소창 옆 자물쇠에서 허용으로 바꿔주세요.'); return }
    try {
      await enablePush(user.id)
      toast('공개일에 알려드릴게요.')
    } catch (e: any) {
      // 알림 행은 남겨둔다 — 다른 기기에서 구독을 켜면 그때부터 유효하다
      toast(e?.message || '알림 권한을 받지 못했어요. 설정에서 다시 켜주세요.')
    }
  }

  const goWrite = () => navigate(`/talk/write?contentId=${content.id}`)

  // ── SEO ──────────────────────────────────────────────────────
  const seoTitle = buildContentTitle(content, todayKey)
  const seoDescription = buildContentDescription(content, todayKey)
  // 본문이 얇은 작품은 색인하지 않는다. sitemap·프리렌더와 같은 기준을 써야
  // "sitemap 엔 있는데 페이지는 noindex" 같은 모순이 안 생긴다.
  const indexable = isIndexableContent(content, {
    today: todayKey,
    discussionCount: DS.getDiscussionsByContent(content.id).length,
  })
  const jsonLd = indexable ? buildContentJsonLd(content, SITE_URL) : null

  return (
    <>
      <Seo
        title={seoTitle}
        description={seoDescription}
        image={content.posterUrl}
        path={`/content/${content.id}`}
        type={ogTypeOf(content) as 'video.movie' | 'video.tv_show' | 'article'}
        noindex={!indexable}
        nofollow={content.hidden === true}
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
          {detail === 'ready'
            ? <p className="content-synopsis">{content.synopsis || '등록된 줄거리가 없습니다.'}</p>
            : <ContentDetailFallback state={detail} onRetry={retryDetail} />}

          <div className="review-detail-actions" style={{ marginTop: 14, marginBottom: 0 }}>
            {!isUpcoming && (
              <button className="btn btn-primary" onClick={goWrite}>✍️ 토론하기</button>
            )}
            <button className={`btn-like ${bookmarked ? 'active' : ''}`} onClick={handleBookmark}>
              <BookmarkIcon filled={bookmarked} /> 찜
            </button>
            {isUpcoming && (
              <button className={`btn-like ${alerted ? 'active' : ''}`} onClick={handleAlert}>
                <BellIcon size={15} filled={alerted} /> {alerted ? '알림 켜짐' : '공개알림'}
              </button>
            )}
            <button className="btn-text btn-small" onClick={() => openReportModal('content', content.id)}>
              <FlagIcon /> 신고
            </button>
          </div>
        </div>
      </div>

      <ContentInfo content={content} detail={detail} />

      {/* 별점 요약 + 분포 (출시된 작품만) */}
      {!isUpcoming && (
        <div className="content-hero fade-in" style={{ marginTop: 12, gap: 28 }}>
          <div className="score-box" style={{ flexShrink: 0, minWidth: 120 }}>
            <div className="score-box-label">전체 평점</div>
            <div className="big" style={{ color: scoreColor(avgRating) }}>
              {ratingCount ? avgRating.toFixed(1) : '-'}
            </div>
            <Stars score={avgRating} size={16} />
            <div className="cnt">{ratingCount ? `${scoreLabel(avgRating)} · 별점 ${ratingCount}개` : '아직 별점 없음'}</div>
            {expertRating.count > 0 && (
              <div className="score-expert" title={`좋문가 ${expertRating.count}명의 평균 별점`}>
                <span className="score-expert-label">👑 좋문가 평점</span>
                <span className="score-expert-val" style={{ color: scoreColor(expertRating.avg) }}>{expertRating.avg.toFixed(1)}</span>
                <span className="score-expert-cnt">· {expertRating.count}명</span>
              </div>
            )}
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
      )}

      {/* 이 작품이 실린 기획 글 — 작품 → 큐레이션 역링크 */}
      <CurationBacklinks contentId={content.id} />

      {/* 토론글(=글) 목록 + 작성 */}
      <DiscussionBoard contentId={content.id} />

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
