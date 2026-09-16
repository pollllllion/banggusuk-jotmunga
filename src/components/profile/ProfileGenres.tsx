import { FeedBlank } from '@/components/profile/FeedBlank'
import type { WatchedEntry } from '@/components/profile/WatchedShelf'
import type { User } from '@/types'

/** 막대에 세울 장르 개수 — 5위부터는 '많이 본'이 아니라 '본 적 있는'에 가깝다 */
const TOP_N = 4

/**
 * 많이 본 장르 — 본 작품에서 세어 낸 값이라 손댈 게 없다.
 * 취향 칩(고른 것)과 섞지 않고 따로 세운다. 막대는 1위 대비 비율이다(절대 개수가 아니라).
 *
 * 2026-09-16 — ProfileShowcase 안에 있던 것을 밖으로 뺐다. 이 칸은 **본 작품·찜한 작품을
 * 다 훑고 난 뒤**에 놓여야 뜻이 산다 — 무엇을 봤는지 보고 나서 "그래서 뭘 많이 봤나"가
 * 오는 차례다. 위(취향 바로 아래)에 있을 때는 아직 아무 목록도 안 본 채로 결론부터 읽혔다.
 * 내 피드와 남의 프로필이 같은 자리에서 이것을 그린다.
 */
export function ProfileGenres({ user, watched, editable }: {
  user: User
  /** 이 사람이 본 작품들 */
  watched: WatchedEntry[]
  /** 내 화면인가 — 비어 있을 때 하는 말이 달라진다 */
  editable: boolean
}) {
  /** 본 작품이 감춰진 상태 — '무엇을 봤나'는 장르로도 새어 나가므로 같이 가린다 */
  const watchedHidden = user.showWatched === false && !editable

  const genreRanks = (() => {
    const count = new Map<string, number>()
    for (const { content } of watched) content.genres?.forEach(g => count.set(g, (count.get(g) || 0) + 1))
    const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N)
    const max = top.length ? top[0][1] : 1
    return top.map(([genre, n]) => ({ genre, n, pct: Math.round((n / max) * 100) }))
  })()

  return (
    <section className="feed-sec">
      <div className="feed-sec-head">
        <h3>많이 본 장르</h3>
        <span className="feed-sec-right">
          {watchedHidden
            ? <span className="feed-private">비공개</span>
            : genreRanks.length > 0 && <span className="feed-sec-note">본 작품 {watched.length}편 기준</span>}
        </span>
      </div>
      {watchedHidden ? (
        <FeedBlank>본 작품을 비공개로 둬서 장르도 보이지 않아요.</FeedBlank>
      ) : !genreRanks.length ? (
        <FeedBlank>{editable ? '본 작품을 등록하면 장르가 여기 쌓입니다.' : '아직 셀 만한 본 작품이 없어요.'}</FeedBlank>
      ) : (
        <div className="feed-genres">
          {genreRanks.map(({ genre, n, pct }) => (
            <div key={genre} className="feed-genre">
              <span className="feed-genre-name">{genre}</span>
              <div className="feed-genre-bar"><div style={{ width: `${pct}%` }} /></div>
              <span className="feed-genre-n">{n}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
