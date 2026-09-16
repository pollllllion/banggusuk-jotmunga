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
  const [searchParams] = useSearchParams()
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

  /**
   * 상세정보(줄거리·출연진·별점 분포·실린 글)를 펼쳤나 — 2026-09-16.
   *
   * 예전에는 '토론글 / 작품상세정보' 두 탭이었다. 토론글이 기본이라 글은 바로 보였지만,
   * 상세정보를 보려면 눌러야 했고 누르면 토론글이 사라졌다 — 둘을 같이 볼 방법이 없었다.
   * 이제 탭을 없애고, 포스터 옆 띠에 **판단에 필요한 것만**(평점·장르·연출·출연) 남긴 뒤
   * 나머지는 여기 접어 둔다. 그래야 토론글이 첫 화면 안으로 들어온다.
   *
   * `?tab=info` 로 들어온 옛 링크는 펼친 채로 연다 — 그 링크가 보러 온 것이 이 안에 있다.
   */
  const [infoOpen, setInfoOpen] = useState(searchParams.get('tab') === 'info')

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

      {/* 어느 작품 방인지 말하는 한 줄 */}
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

      {/* 작품에 대고 하는 것들 — 제목 줄과 포스터 띠 사이.
          정보가 아니라 작품 자체에 붙는 행동이라 상세정보와 같이 접히면 안 되고,
          제목 바로 아래가 그 작품에 대고 무언가 하는 첫 자리다.
          '토론하기'는 여기 없다 — 아래 토론글 목록 머리에 이미 있다.
          좁은 화면에서는 아이콘 위·글자 아래로 균등 분할된다(global.css). */}
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

      {/* ── 포스터 + 기본정보 띠 ─────────────────────────────────
          접힌 채로도 "무슨 작품인지"가 읽혀야 한다: 평점 · 장르 · 연출 · 주연.
          줄거리를 두 줄만 자르는 것도 해봤지만 도입부만 잘려 나와 감이 덜 왔다.
          띠가 얇아야 바로 아래 토론글이 첫 화면에 들어온다 — 그게 이 개편의 목적이다. */}
      <div className="content-strip fade-in">
        <div className="cs-poster">
          <Poster content={content} showScore={false} />
        </div>
        <div className="cs-info">
          {/* 아직 안 나온 작품은 별점이 있을 수 없다 — 그 줄을 통째로 뺀다 */}
          {!isUpcoming && (
            <div className="cs-score">
              <span className="cs-score-num" style={{ color: ratingCount ? scoreColor(avgRating) : undefined }}>
                {ratingCount ? avgRating.toFixed(1) : '–'}
              </span>
              <span className="cs-score-sub">
                <Stars score={avgRating} size={13} />
                <em>{ratingCount ? `${scoreLabel(avgRating)} · 별점 ${ratingCount}개` : '아직 별점 없음'}</em>
              </span>
              {/* 별점 남기기가 첫 화면으로 올라왔다 — 전에는 '작품상세정보' 탭 안, 스크롤 아래였다 */}
              <button type="button" className={`score-mine ${myRating != null ? 'on' : ''}`} onClick={openRating}>
                {myRating != null
                  ? <>내 별점 <b style={{ color: scoreColor(myRating) }}>{myRating}</b></>
                  : '별점 남기기'}
              </button>
            </div>
          )}

          {/* 우리 별점이 없을 때만 TMDB 평점을 보여준다.
              네이버 유입 검색어 다섯 중 하나가 "○○ 평점"인데(2026-09-12 실측) 우리 별점이 달린
              작품은 2,300개 중 11개다 — 평점을 찾아온 사람이 '아직 별점 없음' 한 줄만 보고 나갔다.
              남의 수치이므로 출처를 붙이고, 우리 별점 자리(큰 숫자)는 비워 둔 채로 여기 적는다. */}
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

          {/* 장르 · 연출 · 주연 — 이 세 줄이 줄거리 대신 작품을 설명한다.
              출연은 상세 로드에 있는 값이라 아직 안 왔으면 그 줄만 안 그린다(자리는 안 비워 둔다). */}
          <dl className="cs-kv">
            {content.genres && content.genres.length > 0 && (
              <><dt>장르</dt><dd>{content.genres.join(' · ')}</dd></>
            )}
            {content.creators && content.creators.length > 0 && (
              <><dt>{content.type === 'movie' ? '감독' : '연출'}</dt><dd>{content.creators.join(', ')}</dd></>
            )}
            {(content.castMembers?.length ?? 0) > 0 && (
              <><dt>출연</dt><dd>{content.castMembers!.slice(0, 4).map(p => p.name).join(', ')}{content.castMembers!.length > 4 ? ' 외' : ''}</dd></>
            )}
          </dl>
        </div>
      </div>

      {/* 펼친 상세정보 — 줄거리·출연진·별점 분포·실린 글.
          띠 바로 아래에 열리고, 아래 버튼이 따라 내려간다. */}
      {infoOpen && (
        <div className="cs-detail fade-in" id="content-detail-info">
          <section className="cs-panel">
            <h3>줄거리</h3>
            {detail === 'ready'
              ? <p className="content-synopsis">{content.synopsis || '등록된 줄거리가 없습니다.'}</p>
              : <ContentDetailFallback state={detail} onRetry={retryDetail} />}
          </section>

          <ContentInfo content={content} detail={detail} />

          {/* 별점 분포 — 별점이 하나라도 있을 때만. 0개면 빈 막대 10줄이 남는다 */}
          {!isUpcoming && ratingCount > 0 && (
            <section className="cs-panel">
              <h3>별점 분포</h3>
              <div className="rating-dist">
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
            </section>
          )}

          {/* 이 작품이 실린 기획 글 — 작품 → 큐레이션 역링크 */}
          <CurationBacklinks contentId={content.id} />
        </div>
      )}

      <button
        type="button"
        className={`cs-more ${infoOpen ? 'on' : ''}`}
        onClick={() => setInfoOpen(v => !v)}
        aria-expanded={infoOpen}
        aria-controls="content-detail-info"
      >
        {infoOpen ? '접기 ∧' : '상세정보 더보기 ∨'}
      </button>

      {/* 토론글 목록 + 작성 — 이 페이지의 주인공이다 */}
      <DiscussionBoard contentId={content.id} />

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
