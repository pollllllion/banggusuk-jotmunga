import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useDataStore } from '@/stores/dataStore'
import { StillLoading } from '@/components/ui/StillLoading'
import { useUIStore } from '@/stores/uiStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { Poster } from '@/components/content/Poster'
import { DiscussionBoard } from '@/components/content/DiscussionBoard'
import { CurationBacklinks } from '@/components/content/CurationBacklinks'
import { RelatedContents } from '@/components/content/RelatedContents'
import { RatingSheet } from '@/components/content/RatingSheet'
import { ContentInfo } from '@/components/content/ContentInfo'
import { Stars } from '@/components/ui/Score'
import { Seo } from '@/components/seo/Seo'
import { BackIcon, BellIcon, BookmarkIcon, EyeIcon, FlagIcon } from '@/components/ui/Icons'
import { ShareButton } from '@/components/ui/ShareButton'
import { TYPE_LABELS } from '@/utils/constants'
import { scoreColor, scoreLabel } from '@/utils/helpers'
import { expertRatingFor } from '@/utils/level'
import { SITE_URL } from '@/utils/seo'
import {
  buildContentTitle, buildContentDescription, buildContentJsonLd, ogTypeOf, hasTmdbRating,
} from '@/shared/contentSeo.mjs'
import { isIndexableContent } from '@/shared/contentIndexable.mjs'
import { getPushState, enablePush } from '@/utils/push'
import { useContentDetail } from '@/hooks/useContentDetail'
import { ContentDetailFallback } from '@/components/content/ContentDetailFallback'
import { clickable } from '@/utils/a11y'

export function ContentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, isAccount } = useAuthStore()
  const { openReportModal } = useUIStore()
  const toast = useToastStore(s => s.show)
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)
  // 본 작품 등록은 서버 왕복이 있다 — 오가는 동안 두 번 눌리지 않게 잠근다
  const [watchBusy, setWatchBusy] = useState(false)
  /** 별점 시트가 열려 있나 */
  const [rateOpen, setRateOpen] = useState(false)

  // 줄거리·출연진은 시작 로드에서 빠져 있다(용량 절감) — 상세로 들어온 지금 그 한 행만 채운다.
  // 다 오기 전(loading)·못 받았을 때(error)를 구분해야 '정보 없는 작품'으로 오해받지 않는다.
  const { state: detail, retry: retryDetail } = useContentDetail(id)

  const contentsComplete = useDataStore(s => s.contentsComplete)
  const content = DS.getContentById(id!)
  // 시작 로드가 2단계라 "캐시에 없다"가 곧 "없는 작품"이 아니다 —
  // 2단계가 끝나기 전에 튕기면 멀쩡한 공유 링크가 목록으로 날아간다.
  if (!content) {
    if (!contentsComplete) return <StillLoading />
    navigate('/browse'); return null
  }

  // 공개 여부는 캘린더와 동일하게 '공개일' 기준으로 판단한다.
  const relDate = content.manualOverride && content.manualReleaseDate ? content.manualReleaseDate : content.releaseDate
  const now = new Date()
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const isUpcoming = relDate ? relDate > todayKey : content.status === 'upcoming'
  const statusLabel = isUpcoming ? '공개예정'
    : relDate ? null
    : content.status === 'ongoing' ? '연재중'
    : content.status === 'completed' ? '완결' : null

  /** 어느 탭을 보고 있나. 기본은 토론글 — 주소에 ?tab= 이 없으면 글부터 보여준다.
   *  (목록·내 피드에서 오는 링크가 이미 ?tab=talk 를 달고 있다) */
  const tab: 'talk' | 'info' = searchParams.get('tab') === 'info' ? 'info' : 'talk'
  const goTab = (next: 'talk' | 'info') => {
    const q = new URLSearchParams(searchParams)
    if (next === 'talk') q.delete('tab'); else q.set('tab', next)   // 기본값은 주소에 안 남긴다
    setSearchParams(q, { replace: true })   // 탭질이 뒤로가기 기록을 채우지 않게
  }

  const discussions = DS.getDiscussionsByContent(content.id)
  // 별점 = 토론글 중 별점 단 글에서 집계
  const rated = discussions.filter(d => d.rating != null)
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
  const watched = user ? DS.isWatched(user.id, content.id) : false
  /** 내가 이 작품에 매긴 별점 (글 없이 매긴 것 — watched.rating) */
  const myRating = user
    ? DS.getUserWatched(user.id).find(w => w.contentId === content.id)?.rating ?? null
    : null

  /**
   * 별점 매기기.
   *
   * 예전엔 별점을 매기려면 이 화면에서 '본 작품'으로 담고 → 내 피드로 가서 → 목록에서 찾아
   * 눌러야 했다. 세 단계다. 그래서 작품 2,300개 중 별점이 달린 건 11개뿐이었고,
   * "○○ 평점"으로 검색해 들어온 사람(네이버 유입의 5분의 1)이 볼 것이 없었다.
   * 작품 앞에 서 있는 지금 한 번에 끝낸다.
   *
   * 아직 본 작품으로 안 담았으면 담으면서 매긴다 — 별점을 매겼다는 건 봤다는 뜻이다.
   */
  const openRating = () => {
    if (!isAccount) { toast('별점은 로그인(고정닉) 후 매길 수 있어요.'); return }
    // 글로 매긴 별점이 있으면 그쪽이 원본이다. 두 곳에서 따로 매기면 어느 게 진짜인지 알 수 없다
    const posted = user && DS.getDiscussionsByContent(content.id)
      .find(d => d.authorId === user.id && d.rating != null)
    if (posted) { toast(`이 작품엔 글로 매긴 별점(★ ${posted.rating})이 있어요. 그 글에서 고쳐주세요.`); return }
    setRateOpen(true)
  }

  const pickRating = async (rating: number | null) => {
    setRateOpen(false)
    if (!user) return
    try {
      if (!watched && rating != null) {
        await DS.registerWatched({
          contentId: content.id, type: content.type, title: content.title,
          posterUrl: content.posterUrl, platform: content.platform,
          releaseYear: content.releaseYear, synopsis: content.synopsis,
          genres: content.genres, creators: content.creators,
        })
      }
      await DS.updateWatchedRating(user.id, content.id, rating)
      DS.recomputeContentRating(content.id)
      toast(rating != null
        ? (watched ? `★ ${rating} 로 매겼어요.` : `★ ${rating} · 본 작품에도 담았어요.`)
        : '별점을 지웠어요.')
      rerender()
    } catch {
      toast('별점을 저장하지 못했어요. 잠시 후 다시 시도해주세요.')
    }
  }

  /**
   * 본 작품 등록 — 내 피드에 담는다. 찜과 다르다:
   * 찜은 '볼 것', 본 작품은 '본 것'이고 취향 프로필·레벨의 재료가 된다.
   *
   * 내 피드 화면의 등록 모달은 작품을 검색하는 단계가 있는데, 여기서는 이미 그 작품 앞에
   * 서 있으므로 한 번 누르면 끝이다. 본 연도는 안 받는다 — 지금 보고 등록하는 흐름이라
   * 대개 올해다. 연도를 고쳐야 하면 내 피드에서 고칠 수 있다.
   */
  const handleWatched = async () => {
    if (!user) return
    if (!isAccount) { toast('본 작품 등록은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    if (watchBusy) return
    // 등록 취소는 내 피드에서 한 칸이 사라지는 일이다 — 본 연도 같은 기록도 같이 날아간다
    if (watched && !confirm(`'${content.title}'을(를) 본 작품에서 뺄까요?`)) return
    setWatchBusy(true)
    try {
      if (watched) {
        await DS.unregisterWatched(user.id, content.id)
        toast('내 피드에서 뺐어요.')
      } else {
        await DS.registerWatched({
          contentId: content.id, type: content.type, title: content.title,
          posterUrl: content.posterUrl, platform: content.platform,
          releaseYear: content.releaseYear, synopsis: content.synopsis,
          genres: content.genres, creators: content.creators,
        })
        toast('본 작품으로 담았어요.')
      }
    } catch {
      toast('처리하지 못했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setWatchBusy(false); rerender()
    }
  }

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

  // ── SEO ──────────────────────────────────────────────────────
  const seoTitle = buildContentTitle(content, todayKey)
  const seoDescription = buildContentDescription(content, todayKey)
  // 본문이 얇은 작품은 색인하지 않는다. sitemap·프리렌더와 같은 기준을 써야
  // "sitemap 엔 있는데 페이지는 noindex" 같은 모순이 안 생긴다.
  const indexable = isIndexableContent(content, {
    today: todayKey,
    discussionCount: discussions.length,
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
      <div className="back-btn" {...clickable(() => navigate('/browse'))}><BackIcon /> 목록으로</div>

      {/* 탭 위에 늘 남는 한 줄 — 어느 작품 방인지만 말한다.
          포스터·줄거리·버튼은 '작품상세정보' 탭으로 내려갔지만, 제목까지 내려가면
          토론글 탭에 무슨 작품 글인지 알려 주는 것이 하나도 안 남는다. */}
      <div className="content-head fade-in">
        <span className={`type-badge type-${content.type}`}>{TYPE_LABELS[content.type]}</span>
        <h1>{content.title}</h1>
        <span className="content-head-meta">
          {content.platform && <>{content.platform} · </>}
          {relDate
            ? <>{relDate.replace(/-/g, '. ')} {isUpcoming ? '공개예정' : '공개'}</>
            : content.releaseYear ? <>{content.releaseYear}년</> : null}
        </span>
      </div>

      {/* 작품에 대고 하는 것들 — 탭 위에 둔다.
          '작품상세정보' 탭 안에 있을 땐 찜·공유를 누르려고 탭을 옮겨야 했다. 이 버튼들은
          정보가 아니라 작품 자체에 붙는 행동이라, 어느 탭을 보고 있든 같은 자리에 있어야 한다.
          '토론하기'는 여기 없다 — 토론글 목록 머리에 이미 있고, 글을 쓰는 건 그 목록에서
          할 일이다. 좁은 화면에서는 아이콘 위·글자 아래로 균등 분할된다(global.css). */}
      <div className="content-actions">
        {/* 아직 안 나온 작품은 봤을 수가 없다 */}
        {!isUpcoming && (
          <button className={`btn-like ${watched ? 'active' : ''}`} onClick={handleWatched} disabled={watchBusy}>
            <EyeIcon size={15} /> {watched ? '봤음' : '본 작품'}
          </button>
        )}
        <button className={`btn-like ${bookmarked ? 'active' : ''}`} onClick={handleBookmark}>
          <BookmarkIcon filled={bookmarked} /> 찜
        </button>
        {isUpcoming && (
          <button className={`btn-like ${alerted ? 'active' : ''}`} onClick={handleAlert}>
            <BellIcon size={15} filled={alerted} /> {alerted ? '알림 켜짐' : '공개알림'}
          </button>
        )}
        <ShareButton
          className="btn-like"
          path={`/content/${content.id}`}
          title={content.title}
          text={`${content.title} — 오티티칼`}
          label={`'${content.title}' 공유하기`}
        >
          공유
        </ShareButton>
        <button className="btn-like" onClick={() => openReportModal('content', content.id)}>
          <FlagIcon /> 신고
        </button>
      </div>

      <div className="content-tabs" role="tablist">
        <button
          role="tab" aria-selected={tab === 'talk'}
          className={tab === 'talk' ? 'active' : ''}
          onClick={() => goTab('talk')}>
          {/* 글 수는 붙이지 않는다 — 바로 아래 '토론글 12 [토론하기]' 줄이 이미 말한다 */}
          토론글
        </button>
        <button
          role="tab" aria-selected={tab === 'info'}
          className={tab === 'info' ? 'active' : ''}
          onClick={() => goTab('info')}>
          작품상세정보
        </button>
      </div>

      {tab === 'talk' ? (
        /* 토론글(=글) 목록 + 작성 */
        <DiscussionBoard contentId={content.id} />
      ) : (
        <>
        {/* 포스터 · 줄거리 — 버튼 줄은 탭 위로 올라갔다(두 탭에서 다 쓰는 것이라) */}
        <div className="content-hero fade-in">
          <div style={{ width: 160, flexShrink: 0 }}>
            <Poster content={content} showScore={false} />
          </div>
          <div className="content-hero-info">
            <div className="content-hero-meta">
              {content.platform && <span>{content.platform} · </span>}
              {relDate ? <span>{relDate.replace(/-/g, '. ')} {isUpcoming ? '공개예정' : '공개'}</span> : content.releaseYear && <span>{content.releaseYear}년</span>}
              {statusLabel && !relDate && <span> · {statusLabel}</span>}
            </div>
            {detail === 'ready'
              ? <p className="content-synopsis">{content.synopsis || '등록된 줄거리가 없습니다.'}</p>
              : <ContentDetailFallback state={detail} onRetry={retryDetail} />}
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
              {/* 우리 별점이 없을 때만 TMDB 평점을 보여준다.
                  네이버 유입 검색어 다섯 중 하나가 "○○ 평점"인데(2026-09-12 실측) 우리 별점이 달린
                  작품은 2,300개 중 11개다 — 평점을 찾아온 사람이 '아직 별점 없음' 한 줄만 보고 나갔다.
                  남의 수치이므로 출처를 붙이고, 우리 별점 자리(큰 숫자)는 비워 둔 채로 아래에 적는다. */}
              {/* 별점 남기기 — 큰 숫자(전체 평점) 바로 아래. 한 번 눌러 고르면 끝난다 */}
              <button type="button" className={`score-mine ${myRating != null ? 'on' : ''}`} onClick={openRating}>
                {myRating != null
                  ? <>내 별점 <b style={{ color: scoreColor(myRating) }}>{myRating}</b></>
                  : '별점 남기기'}
              </button>
              {!ratingCount && hasTmdbRating(content) && (
                <div className="score-tmdb">
                  <span className="score-tmdb-label">TMDB 평점</span>
                  <span className="score-tmdb-val" style={{ color: scoreColor(content.voteAverage!) }}>
                    {content.voteAverage!.toFixed(1)}
                  </span>
                  <span className="score-tmdb-cnt">· {content.voteCount!.toLocaleString('ko-KR')}명</span>
                </div>
              )}
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
        </>
      )}

      {rateOpen && (
        <RatingSheet
          title={content.title}
          rating={myRating}
          onPick={pickRating}
          onClose={() => setRateOpen(false)}
        />
      )}

      {/* 작품 → 작품 링크. 탭과 무관하게 늘 보인다 — 여기서 다음 작품으로 넘어간다
          (작품 페이지가 서로를 안 가리키면 크롤러에게도 사람에게도 막다른 길이다) */}
      <RelatedContents content={content} />

      {/* TMDB 출처는 탭과 상관없이 늘 보인다 — 위 줄거리가 TMDB 자료라서
          '정보' 탭에서만 밝히면 글 탭에서는 출처 없이 그 자료를 쓰는 셈이 된다 */}
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
