import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { Avatar } from '@/components/profile/Avatar'
import { LevelTag } from '@/components/profile/LevelTag'
import { Seo } from '@/components/seo/Seo'
import { boardDate, scoreColor } from '@/utils/helpers'
import { TALK_LABEL } from '@/utils/constants'
import { clickable } from '@/utils/a11y'
import type { Bookmark, Content, Discussion, User, Watched } from '@/types'

/** 한 화면에 흘릴 최대 줄 수 — 더 보려면 그 사람 프로필로 간다 */
const FEED_MAX = 60
/** 맨 위 '내가 찜한 것' 칸에 세울 최대 줄 수 — 여기는 눈에 띄라고 둔 칸이지 목록이 아니다 */
const CROSS_MAX = 5
/** 묶음 줄 아래 작은 글씨에 이름을 몇 개까지 늘어놓을지 */
const NAMES_IN_SUB = 3

/**
 * 관심 피드 — 관심 등록한 사람들이 **요즘 뭘 보고 있나**.
 *
 * 2026-09-16 전면 개편. 그전에는 '그 사람이 쓴 글'만 모았는데, 실측해 보니 그 재료가
 * 거의 없었다: 최근 글 8개 중 6개가 유동닉 글(작성자 계정이 없어 원리상 안 뜬다)이고,
 * 고정닉 글은 2개뿐이었다. 반면 같은 기간에 **본 작품 등록 14건 · 찜 8건**이 있었는데
 * 피드는 그걸 안 봤다. 사람들이 실제로 하는 일은 글쓰기가 아니라 보고·담고·점수 매기기다.
 *
 * 그래서 두 칸으로 짰다:
 *   ① 내가 찜한 작품을 관심 있는 사람이 봤다 — 겹칠 때만 뜬다. 볼지 말지 결정에 바로 쓰인다
 *   ② 활동 타임라인 — 글 · 별점 · 본 작품 · 찜을 한 줄기로
 *
 * **묶어서 보여준다.** 한 사람이 한 번에 14편을 담는 일이 실제로 있었다(마도사, 09-13).
 * 그걸 14줄로 펴면 그 사람 혼자 피드를 도배한다. 같은 사람·같은 날·같은 종류는 한 줄이다.
 *
 * 남의 watched·bookmarks 는 캐시에 없다(내 행만 있다) — 그래서 여기서 한 번에 물어온다
 * (fetchUsersWatched · fetchUsersBookmarks). RLS 가 '본인만'이면 빈 배열이 오고 그 칸이
 * 조용히 비는 것으로 끝난다(migration_watched_public · migration_bookmarks_public).
 *
 * 알림은 붙이지 않는다 — 남이 뭘 볼 때마다 알림이 오면 사람들은 그냥 알림을 끈다.
 * 보러 오는 사람에게만 보이면 된다.
 */

/** 타임라인 한 줄. 같은 종류·같은 사람·같은 날은 하나로 묶여 들어온다 */
type Ev =
  | { kind: 'post'; at: string; user: User; post: Discussion; content?: Content }
  | { kind: 'rate'; at: string; user: User; items: { content: Content; rating: number }[] }
  | { kind: 'watch'; at: string; user: User; contents: Content[] }
  | { kind: 'mark'; at: string; user: User; contents: Content[] }

/** 내가 찜해 둔 작품을 관심 있는 사람이 본 것 */
interface Cross {
  user: User
  content: Content
  rating: number | null
  at: string
  /** 그 사람이 이 작품에 쓴 글이 있으면 그리로 보낸다 — 점수보다 글이 할 말이 많다 */
  postId?: string
}

/** '2026-09-13' — 묶음의 단위. 시각까지 맞출 필요는 없다(한 번에 담으면 몇 분 안에 끝난다) */
const dayOf = (iso: string) => iso.slice(0, 10)

export function FollowFeedPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  /** 관심 있는 사람들의 본 작품·찜. null 이면 아직 안 왔다 */
  const [watched, setWatched] = useState<Watched[] | null>(null)
  const [marks, setMarks] = useState<Bookmark[] | null>(null)

  // 의존성에 배열을 그대로 넣으면 매 렌더마다 새 배열이라 무한히 다시 부른다 — 문자열로 굳힌다
  const followKey = (user?.follows ?? []).join(',')

  useEffect(() => {
    const ids = followKey ? followKey.split(',') : []
    if (!ids.length) { setWatched([]); setMarks([]); return }
    let alive = true
    void DS.fetchUsersWatched(ids).then(rows => { if (alive) setWatched(rows) })
    void DS.fetchUsersBookmarks(ids).then(rows => { if (alive) setMarks(rows) })
    return () => { alive = false }
  }, [followKey])

  if (!user) return null

  const blocked = DS.getBlockedIds(user.id)
  const shown = (user.follows ?? [])
    .filter(id => !blocked.includes(id))
    .map(id => DS.getUserById(id))
    .filter((u): u is User => Boolean(u))
  const shownIds = new Set(shown.map(f => f.id))
  const userOf = (id: string) => shown.find(f => f.id === id)

  const loading = watched === null || marks === null

  /**
   * 그 사람이 '비공개'로 둔 칸은 여기서도 안 보여준다.
   *
   * RLS 는 남의 watched·bookmarks 를 **읽게** 해 준다(migration_watched_public ·
   * migration_bookmarks_public). 감추기는 화면의 약속이다 — 프로필(/u/:id)에서 가려 놓고
   * 관심 피드로 그대로 흘리면, 그 사람은 감췄다고 믿는데 실제로는 새고 있는 것이 된다.
   * 서버에서 못 읽게 하는 게 더 단단하지만, 그건 정책을 고치는 일이라 따로 다뤄야 한다.
   */
  const canSeeWatched = (id: string) => userOf(id)?.showWatched !== false
  const canSeeMarks = (id: string) => userOf(id)?.showBookmarks !== false

  // ── ① 내가 찜한 작품 × 관심 있는 사람이 본 작품 ───────────
  const myBookmarkIds = new Set(DS.getUserBookmarks(user.id).map(b => b.contentId))
  const crosses: Cross[] = (watched ?? [])
    .filter(w => shownIds.has(w.userId) && canSeeWatched(w.userId) && myBookmarkIds.has(w.contentId))
    .map((w): Cross | null => {
      const u = userOf(w.userId)
      const c = DS.getContentById(w.contentId)
      if (!u || !c) return null
      const post = DS.getDiscussionsByAuthor(u.id).find(p => p.contentId === c.id)
      return { user: u, content: c, rating: w.rating ?? null, at: w.createdAt, postId: post?.id }
    })
    .filter((x): x is Cross => Boolean(x))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, CROSS_MAX)

  // ── ② 활동 타임라인 ────────────────────────────────────
  const evs: Ev[] = []

  // 글 — 하나씩. 글은 그 자체가 할 말이라 묶지 않는다
  for (const p of DS.getDiscussions()) {
    if (!p.authorId || !shownIds.has(p.authorId)) continue
    const u = userOf(p.authorId)
    if (!u) continue
    evs.push({ kind: 'post', at: p.createdAt, user: u, post: p, content: DS.getContentById(p.contentId) || undefined })
  }

  /** (사람, 날짜) 로 묶는다 — 한 번에 여러 편을 담아도 한 줄로 남는다 */
  function group<R extends { userId: string; createdAt: string }, T>(rows: R[], pick: (r: R) => T | null) {
    const bag = new Map<string, { user: User; at: string; items: T[] }>()
    for (const r of rows) {
      if (!shownIds.has(r.userId)) continue
      const u = userOf(r.userId)
      const item = pick(r)
      if (!u || !item) continue
      const key = `${r.userId}|${dayOf(r.createdAt)}`
      const cur = bag.get(key)
      // 묶음의 시각은 그 날 가장 최근 것으로 — 목록을 시간순으로 세울 때 기준이 된다
      if (cur) { cur.items.push(item); if (r.createdAt > cur.at) cur.at = r.createdAt }
      else bag.set(key, { user: u, at: r.createdAt, items: [item] })
    }
    return [...bag.values()]
  }

  const seenRows = (watched ?? []).filter(w => canSeeWatched(w.userId))
  const rows_rated = seenRows.filter(w => w.rating != null)
  const rows_plain = seenRows.filter(w => w.rating == null)

  for (const g of group(rows_rated, w => {
    const c = DS.getContentById(w.contentId)
    return c ? { content: c, rating: w.rating as number } : null
  })) evs.push({ kind: 'rate', at: g.at, user: g.user, items: g.items })

  for (const g of group(rows_plain, w => DS.getContentById(w.contentId) || null)) {
    evs.push({ kind: 'watch', at: g.at, user: g.user, contents: g.items })
  }

  for (const g of group((marks ?? []).filter(b => canSeeMarks(b.userId)), b => DS.getContentById(b.contentId) || null)) {
    evs.push({ kind: 'mark', at: g.at, user: g.user, contents: g.items })
  }

  evs.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const rows = evs.slice(0, FEED_MAX)

  /** 묶음 줄의 제목 — "<대표작> 외 N편" (하나면 그냥 작품 이름) */
  const lead = (cs: Content[], tail: string) => cs.length === 1
    ? <><b>{cs[0].title}</b>{tail}</>
    : <><b>{cs[0].title}</b> 외 {cs.length - 1}편{tail}</>

  /** 묶음 줄 아래 작은 글씨 — 나머지 이름 몇 개 */
  const names = (cs: Content[]) => cs.length > 1 && (
    <div className="follow-ev-sub">
      {cs.slice(1, 1 + NAMES_IN_SUB).map(c => c.title).join(' · ')}
      {cs.length > 1 + NAMES_IN_SUB ? ' …' : ''}
    </div>
  )

  /**
   * 한 줄의 머리 — 누가 · 언제, 그리고 점수가 있으면 날짜 왼쪽에.
   *
   * 2026-09-16 — 점수를 줄 바깥 오른쪽에 붙였더니 글 줄과 날짜 위치가 어긋나 보였다.
   * 점수 있는 줄만 오른쪽에 알약이 튀어나오고 날짜는 그 위에 있었기 때문이다.
   * 이제 날짜는 모든 줄에서 같은 자리(오른쪽 끝)고, 점수는 그 **왼쪽**에 붙는다.
   */
  const who = (u: User, at: string, score?: number | null) => (
    <div className="follow-row-who">
      <Avatar src={u.avatarUrl} name={u.nickname} size={20} />
      <span className="disc-author">{u.nickname}</span>
      <LevelTag authorId={u.id} />
      <span className="follow-row-right">
        {score != null && (
          <span className="follow-score" style={{ background: scoreColor(score) }}>{score}</span>
        )}
        <span className="disc-time">{boardDate(at)}</span>
      </span>
    </div>
  )

  /** 묶음은 그 사람 프로필로 보낸다 — 거기가 그 목록이 전부 있는 곳이다 */
  const evOpen = (e: Ev) => {
    if (e.kind === 'post') return () => navigate(`/talk/${e.post.id}`)
    if (e.kind === 'rate') return e.items.length === 1
      ? () => navigate(`/content/${e.items[0].content.id}?tab=talk`)
      : () => navigate(`/u/${e.user.id}`)
    return e.contents.length === 1
      ? () => navigate(`/content/${e.contents[0].id}`)
      : () => navigate(`/u/${e.user.id}`)
  }

  return (
    <>
      <Seo title="관심 피드" noindex />
      <div className="feed-header">
        <h2 className="feed-title">관심 피드 {shown.length > 0 && shown.length}</h2>
      </div>

      {!shown.length ? (
        <div className="empty-state fade-in">
          <p>아직 관심 등록한 사람이 없어요.</p>
          <p style={{ fontSize: 12, marginTop: 6 }}>
            닉네임을 눌러 그 사람 피드로 간 뒤 <b>+ 관심</b>을 누르면 여기에 그 사람이 보고 담는 것이 모입니다.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/talk')}>{TALK_LABEL} 둘러보기</button>
        </div>
      ) : (
        <>
          {/* 관심 등록한 사람들 — 눌러서 그 사람 피드로 */}
          <div className="follow-people">
            {shown.map(f => (
              <div key={f.id} className="follow-person" {...clickable(() => navigate(`/u/${f.id}`), `${f.nickname} 피드`)}>
                <Avatar src={f.avatarUrl} name={f.nickname} size={44} />
                <span className="follow-person-name">
                  <span className="follow-person-nick">{f.nickname}</span>
                  <LevelTag authorId={f.id} />
                </span>
              </div>
            ))}
          </div>

          {/* ── ① 내가 찜한 작품, 먼저 본 사람 ──────────────────
              겹칠 때만 뜬다. 겹치는 게 없으면 칸째로 없다 — 빈 칸을 두면
              "여긴 원래 비는 곳"이라고 배우게 되고, 정작 찼을 때도 안 본다. */}
          {crosses.length > 0 && (
            <>
              <div className="feed-header" style={{ marginTop: 18 }}>
                <h3 className="feed-title follow-sec-title">내가 찜한 작품, 먼저 본 사람</h3>
              </div>
              <div className="disc-board fade-in">
                {crosses.map(x => (
                  <div
                    key={`${x.user.id}-${x.content.id}`}
                    className="follow-row"
                    {...clickable(() => navigate(x.postId ? `/talk/${x.postId}` : `/content/${x.content.id}?tab=talk`))}
                  >
                    <div className="follow-row-main">
                      {who(x.user, x.at, x.rating)}
                      <div className="follow-ev-line">내가 찜한 <b>{x.content.title}</b>을(를) 봤어요</div>
                      {x.postId && <div className="follow-ev-sub">이 작품에 쓴 글이 있어요 ›</div>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── ② 활동 타임라인 ───────────────────────────── */}
          {crosses.length > 0 && (
            <div className="feed-header" style={{ marginTop: 18 }}>
              <h3 className="feed-title follow-sec-title">그 밖의 활동</h3>
            </div>
          )}

          {loading && !rows.length ? (
            <div className="empty-state fade-in"><p>불러오는 중…</p></div>
          ) : !rows.length ? (
            <div className="empty-state fade-in">
              <p>아직 올라온 것이 없어요.</p>
              <p style={{ fontSize: 12, marginTop: 6 }}>관심 있는 사람이 작품을 담거나 점수를 매기면 여기에 모입니다.</p>
            </div>
          ) : (
            <div className="disc-board fade-in">
              {rows.map(e => (
                <div
                  /* 글은 id 로, 묶음은 (사람·날짜·종류)로 — 묶음은 그 셋이 곧 고유 키다 */
                  key={e.kind === 'post' ? `post-${e.post.id}` : `${e.kind}-${e.user.id}-${dayOf(e.at)}`}
                  className="follow-row"
                  {...clickable(evOpen(e))}
                >
                  <div className="follow-row-main">
                    {who(e.user, e.at, e.kind === 'rate' && e.items.length === 1 ? e.items[0].rating : null)}

                    {e.kind === 'post' && (
                      <>
                        <div className="follow-row-title">{e.post.title || e.post.body.slice(0, 40)}</div>
                        <div className="follow-row-work">{e.content?.title || '자유방'}</div>
                      </>
                    )}

                    {e.kind === 'rate' && (
                      e.items.length === 1 ? (
                        <div className="follow-ev-line"><b>{e.items[0].content.title}</b>에 점수를 매겼어요</div>
                      ) : (
                        <>
                          <div className="follow-ev-line">
                            <b>{e.items[0].content.title}</b> 외 {e.items.length - 1}편에 점수를 매겼어요
                          </div>
                          <div className="follow-ev-sub">
                            {e.items.slice(0, NAMES_IN_SUB).map(i => `${i.content.title} ★${i.rating}`).join(' · ')}
                            {e.items.length > NAMES_IN_SUB ? ' …' : ''}
                          </div>
                        </>
                      )
                    )}

                    {e.kind === 'watch' && (
                      <>
                        <div className="follow-ev-line">{lead(e.contents, '을(를) 본 작품에 담았어요')}</div>
                        {names(e.contents)}
                      </>
                    )}

                    {e.kind === 'mark' && (
                      <>
                        <div className="follow-ev-line">{lead(e.contents, '을(를) 찜했어요')}</div>
                        {names(e.contents)}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
