import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { Poster } from '@/components/content/Poster'
import { FeedBlank } from '@/components/profile/FeedBlank'
import type { WatchedEntry } from '@/components/profile/WatchedShelf'
import { scoreColor } from '@/utils/helpers'
import { TYPE_LABELS } from '@/utils/constants'
import { clickable } from '@/utils/a11y'
import type { Content, User } from '@/types'

/** 별점 목록을 처음에 몇 줄만 보여줄지 — 이 화면의 주인공은 취향이지 목록이 아니다 */
const RATINGS_PREVIEW = 5
/** '더 보기' 한 번에 늘리는 개수. 수백 개를 한 번에 쏟으면 접기 버튼이 저 아래로 달아난다 */
const RATINGS_STEP = 20

/** 별점 한 줄 — 작품 하나에 점수 하나(1작품 1별점) */
interface RatingRow {
  key: string
  /** 글에 딸린 별점이면 그 글 id. 없으면 목록에서 바로 매긴 것 */
  postId: string | undefined
  rating: number
  content: Content
}

export interface RatingsData {
  /** 이 사람이 매긴 별점 전부 (숫자 집계용) */
  ratings: RatingRow[]
  /** 그중 목록에 실제로 그릴 것 — 본 작품을 감춘 사람은 글 없는 별점을 뺀다 */
  listRatings: RatingRow[]
  /** 감춰서 목록에서 빠진 개수 */
  hiddenRatings: number
  avgRating: number
  /** 남이 보는 화면인데 별점을 비공개로 둔 상태 */
  ratingsHidden: boolean
}

/**
 * 이 사람이 매긴 별점을 모은다 — 두 군데서 온다. 1작품 1별점이라 작품당 한 줄이다.
 *   · 토론글에 단 별점 (글이 있으니 누르면 그 글로 간다)
 *   · 본 작품 목록에서 바로 매긴 별점 (글이 없으니 작품방으로 간다)
 * 같은 작품에 둘 다 있으면 **글 쪽이 이긴다** — 작품 평점을 낼 때와 같은 규칙이다
 * (api/discussions.ts 의 recomputeContentRating, supabase/migration_watched_rating.sql).
 *
 * 화면(ProfileRatings)과 따로 떼어 둔 이유: 프로필 위쪽 숫자 칸(별점 N · 평균 점수)이
 * 같은 값을 써야 하는데, 2026-09-16 부터 내 피드에서는 이 칸이 **찜한 작품 아래**로
 * 내려가 서로 멀리 떨어졌기 때문이다. 두 번 세면 언젠가 두 숫자가 어긋난다.
 */
export function computeRatings(user: User, watched: WatchedEntry[], editable: boolean): RatingsData {
  const posted = DS.getDiscussionsByAuthor(user.id)
    .filter(p => p.rating != null)
    .map(p => ({ key: p.id, postId: p.id as string | undefined, rating: p.rating as number, content: DS.getContentById(p.contentId) }))
    .filter((x): x is RatingRow => Boolean(x.content))
  const postedIds = new Set(posted.map(r => r.content.id))
  const fromWatched: RatingRow[] = watched
    .filter(w => w.rating != null && !postedIds.has(w.content.id))
    .map(w => ({ key: w.content.id, postId: undefined, rating: w.rating as number, content: w.content }))

  const ratings = [...posted, ...fromWatched].sort((a, b) => b.rating - a.rating)
  const avgRating = ratings.length
    ? Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10
    : 0

  // 본 작품을 비공개로 둔 사람의 목록 별점은 **줄로 보여주지 않는다** — 작품 이름이 곧 본 목록이다.
  // 다만 위 ratings/avgRating(숫자)에는 그대로 남는다: 감추는 건 '무엇'이지 '얼마나'가 아니다.
  const watchedHidden = user.showWatched === false && !editable
  const listRatings = watchedHidden ? ratings.filter(r => r.postId) : ratings

  return {
    ratings,
    listRatings,
    hiddenRatings: ratings.length - listRatings.length,
    avgRating,
    ratingsHidden: user.showRatings === false && !editable,
  }
}

/**
 * 매긴 별점 칸 — 점수 높은 순.
 *
 * 내 피드(/feed)와 남의 프로필(/u/:id)이 같은 것을 쓰되 **놓이는 자리가 다르다**:
 * 남의 프로필에서는 프로필 바로 아래(그 사람을 읽는 순서 그대로),
 * 내 피드에서는 본 작품·찜한 작품 아래(내 것은 관리가 먼저다).
 * 그래서 ProfileShowcase 안에 박아 두지 않고 따로 뺐다.
 */
export function ProfileRatings({ user, watched, editable, data }: {
  user: User
  watched: WatchedEntry[]
  /** 내 화면인가 — 공개 스위치가 붙고, 비공개여도 내게는 보인다 */
  editable: boolean
  /** 이미 센 값이 있으면 그대로 쓴다(프로필 숫자 칸과 같은 것을 보게) */
  data?: RatingsData
}) {
  const navigate = useNavigate()
  const updateProfile = useAuthStore(s => s.updateProfile)
  const toast = useToastStore(s => s.show)
  const [shownRatings, setShownRatings] = useState(RATINGS_PREVIEW)
  const [, setTick] = useState(0)

  const { ratings, listRatings, hiddenRatings, ratingsHidden } = data ?? computeRatings(user, watched, editable)
  const ratingsPublic = user.showRatings !== false

  const togglePublic = async () => {
    try {
      await updateProfile({ showRatings: !ratingsPublic })
      toast(!ratingsPublic ? '공개로 바꿨어요.' : '비공개로 바꿨어요.')
      setTick(t => t + 1)
    } catch { toast('설정을 저장하지 못했어요.') }
  }

  return (
    <section className="feed-sec">
      <div className="feed-sec-head">
        <h3>{editable ? '내가 매긴 별점' : '매긴 별점'}{!ratingsHidden && ratings.length > 0 && ` ${ratings.length}`}</h3>
        <span className="feed-sec-right">
          {!ratingsHidden && listRatings.length > 0 && <span className="feed-sec-note">높은 순</span>}
          {editable ? (
            <button
              className={`feed-public ${ratingsPublic ? 'on' : ''}`}
              onClick={togglePublic}
              title={ratingsPublic ? '남에게 보입니다. 누르면 비공개로 바꿔요' : '나만 봅니다. 누르면 공개로 바꿔요'}
            >{ratingsPublic ? '공개' : '비공개'}</button>
          ) : ratingsHidden ? <span className="feed-private">비공개</span> : null}
        </span>
      </div>
      {ratingsHidden ? (
        <FeedBlank>이 사람이 별점을 비공개로 뒀어요.</FeedBlank>
      ) : !listRatings.length ? (
        <div className="feed-ratings feed-ratings-empty">
          <p>{hiddenRatings > 0 ? `본 작품을 비공개로 둬서 별점 ${hiddenRatings}개를 목록에서 감췄어요.` : '아직 매긴 별점이 없어요.'}</p>
          {editable && <p className="sub">본 작품 목록에서 <b>별점</b>을 누르거나, 작품에 글을 쓸 때 별점을 달면 여기에 모입니다.</p>}
        </div>
      ) : (
        <>
          <div className="feed-ratings">
            {listRatings.slice(0, shownRatings).map(({ key, postId, rating, content }) => (
              <div
                key={key}
                className="feed-rating"
                {...clickable(() => navigate(postId ? `/talk/${postId}` : `/content/${content.id}?tab=talk`), content.title)}
              >
                <div className="feed-rating-poster"><Poster content={content} showScore={false} showVerified={false} /></div>
                <div className="feed-rating-info">
                  <div className="feed-rating-title">{content.title}</div>
                  <div className="feed-rating-meta">{TYPE_LABELS[content.type]}{content.releaseYear ? ` · ${content.releaseYear}` : ''}</div>
                </div>
                <span className="feed-rating-score" style={{ background: scoreColor(rating) }}>{rating}</span>
              </div>
            ))}
          </div>
          {/* 감춘 것이 있으면 왜 목록이 짧은지 말해 준다 — 위 숫자(별점 N)와 안 맞아 보이니까 */}
          {hiddenRatings > 0 && (
            <p className="feed-ratings-note">본 작품을 비공개로 둬서 {hiddenRatings}개는 목록에서 감췄어요.</p>
          )}
          {listRatings.length > shownRatings && (
            <button className="feed-more" onClick={() => setShownRatings(n => n + RATINGS_STEP)}>
              {Math.min(RATINGS_STEP, listRatings.length - shownRatings)}개 더 보기 (남은 {listRatings.length - shownRatings})
            </button>
          )}
          {shownRatings > RATINGS_PREVIEW && (
            <button className="feed-more" onClick={() => setShownRatings(RATINGS_PREVIEW)}>접기</button>
          )}
        </>
      )}
    </section>
  )
}
