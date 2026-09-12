import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { Poster } from '@/components/content/Poster'
import { RegisterWatchedModal, type RegisterMode } from '@/components/content/RegisterWatchedModal'
import { RatingSheet } from '@/components/content/RatingSheet'
import { EditContentModal } from '@/components/content/EditContentModal'
import { ProfileShowcase } from '@/components/profile/ProfileShowcase'
import { WatchedShelf, type WatchedEntry } from '@/components/profile/WatchedShelf'
import { boardDate, scoreColor } from '@/utils/helpers'
import { TYPE_LABELS } from '@/utils/constants'
import { Seo } from '@/components/seo/Seo'
import type { Content } from '@/types'
import { clickable } from '@/utils/a11y'

/** 찜한 작품 가로 줄에 세울 최대 개수 — 그 이상은 어차피 밀어서 보지 않는다
 *  (본 작품 쪽 줄 세우기·필터는 WatchedShelf 가 갖고 있다) */
const STRIP_MAX = 12

export function MyFeedPage() {
  const navigate = useNavigate()
  const { user, isAccount, updateProfile } = useAuthStore()
  const toast = useToastStore(s => s.show)
  /** 열려 있는 등록 창의 종류. null 이면 닫혀 있다 */
  const [showModal, setShowModal] = useState<RegisterMode | null>(null)
  const [editing, setEditing] = useState<Content | null>(null)
  const [tick, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)
  /** 별점 시트가 열려 있는 항목. null 이면 안 열려 있다 */
  const [ratingFor, setRatingFor] = useState<WatchedEntry | null>(null)

  // tick 을 의존성에 포함해야 등록/삭제/수정(rerender) 직후 watched 캐시를 다시 읽어 즉시 반영된다.
  // (DS.getUserWatched 는 인메모리 캐시라 React 가 변화를 모르므로 tick 으로 강제 재계산)
  const items = useMemo<WatchedEntry[]>(() => {
    if (!user) return []
    return DS.getUserWatched(user.id)
      .map(w => {
        const c = DS.getContentById(w.contentId)
        return c ? { content: c, rating: w.rating ?? null } : null
      })
      .filter((i): i is WatchedEntry => Boolean(i))
  }, [user, tick])

  if (!user) return null

  /** 칸별 공개 여부 (본 작품 · 찜한 작품). 별점 쪽 스위치는 ProfileShowcase 가 갖고 있다.
   *  마이그레이션 전(undefined)이면 공개로 본다 — 지금까지 공개였던 것을 조용히 감추지 않는다.
   *  비공개로 둬도 이 화면(본인)에는 계속 보인다: 감춘 것도 관리는 해야 한다. */
  const watchedPublic = user.showWatched !== false
  const bookmarksPublic = user.showBookmarks !== false
  const togglePublic = async (key: 'showWatched' | 'showBookmarks', now: boolean) => {
    if (!isAccount) { toast('공개 설정은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    try {
      await updateProfile({ [key]: !now })
      toast(!now ? '공개로 바꿨어요.' : '비공개로 바꿨어요.'); rerender()
    } catch { toast('설정을 저장하지 못했어요.') }
  }

  /** 제목 옆 공개/비공개 스위치 — 본 작품과 찜한 작품이 같은 것을 쓴다 */
  const publicSwitch = (key: 'showWatched' | 'showBookmarks', now: boolean) => isAccount && (
    <button
      className={`feed-public ${now ? 'on' : ''}`}
      onClick={() => togglePublic(key, now)}
      title={now ? '남에게 보입니다. 누르면 비공개로 바꿔요' : '나만 봅니다. 누르면 공개로 바꿔요'}
    >{now ? '공개' : '비공개'}</button>
  )

  /** 찜한 작품 — '볼 것' 서랍. 본 작품('본 것')과 짝이라 바로 아래에 둔다.
   *  최근에 담은 것부터. 전체는 기존 찜 화면(/bookmarks)이 맡는다. */
  const bookmarks = DS.getUserBookmarks(user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(b => DS.getContentById(b.contentId))
    .filter((c): c is Content => Boolean(c))

  /**
   * 내 토론 — 내가 고른 내 글 모음. 저장은 글 상세에서 하고(거기서 글을 읽다 정한다),
   * 여기서는 차례·공개 여부를 손보고 뺀다.
   * 지워진 글이 목록에 남을 수 있어(다른 기기에서 지운 경우) 그릴 때 걸러 낸다.
   */
  const pins = (user.pinnedPosts ?? [])
    .map(p => ({ pin: p, post: DS.getDiscussions().find(d => d.id === p.id) }))
    .filter((x): x is { pin: typeof x.pin; post: NonNullable<typeof x.post> } => Boolean(x.post))

  const savePins = async (next: { id: string; public: boolean }[]) => {
    try { await updateProfile({ pinnedPosts: next }); rerender() }
    catch { toast('처리하지 못했어요.') }
  }
  const togglePinPublic = (id: string) => {
    const list = user.pinnedPosts ?? []
    void savePins(list.map(p => (p.id === id ? { ...p, public: !p.public } : p)))
  }
  const removePin = (id: string, title: string) => {
    if (!window.confirm(`'${title}'을(를) 내 토론에서 뺄까요?`)) return
    void savePins((user.pinnedPosts ?? []).filter(p => p.id !== id))
  }

  /** 본 작품 목록에서 바로 추천작에 담고 뺀다 — 카드마다 붙는 버튼이라 확인창은 안 띄운다
   *  (한 번 더 누르면 그대로 돌아온다) */
  const isRec = (id: string) => (user.recommendedWorks ?? []).includes(id)
  const toggleRec = async (e: React.MouseEvent, c: Content) => {
    e.stopPropagation()
    if (!isAccount) { toast('추천 작품은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    const list = user.recommendedWorks ?? []
    const next = isRec(c.id) ? list.filter(id => id !== c.id) : [...list, c.id]
    try {
      await updateProfile({ recommendedWorks: next })
      toast(isRec(c.id) ? '추천에서 뺐어요.' : '추천 작품에 담았어요.'); rerender()
    } catch { toast('처리하지 못했어요.') }
  }

  /** 등록 창 — 본 작품과 찜이 같은 창을 쓴다(mode 만 다르다) */
  const openRegister = (mode: RegisterMode) => {
    if (!isAccount) { toast(`${mode === 'watched' ? '본 작품' : '찜한 작품'} 등록은 로그인(고정닉) 후 이용할 수 있어요.`); return }
    setShowModal(mode)
  }

  // 내가 직접 등록한 수기 작품(웹툰/웹소설 등, tmdb-* 아님)은 클릭 시 정보 수정,
  // TMDB 작품(포스터 자동)은 기존대로 작품 상세로 이동.
  const editable = (c: Content) => c.createdBy === user.id && !c.id.startsWith('tmdb-')
  const openCard = (c: Content) => {
    if (editable(c)) setEditing(c)
    else navigate(`/content/${c.id}?tab=talk`)
  }

  const remove = async (e: React.MouseEvent, c: Content) => {
    e.stopPropagation()
    if (!window.confirm(`'${c.title}'을(를) 내 피드에서 뺄까요?`)) return
    await DS.unregisterWatched(user.id, c.id)
    toast('내 피드에서 뺐어요.'); rerender()
  }

  /**
   * 별점 매기기 — 글 없이 목록에서 바로.
   *
   * prompt 로 숫자를 받다가 시트로 바꿨다: 1~10 을 타자로 치게 하면 오타가 나고
   * (11 을 넣으면 그제야 혼난다), 무엇보다 '지금 몇 점인지'가 입력칸 안에 숨는다.
   * 시트는 열 개를 한눈에 늘어놓고 지금 점수를 색으로 짚어 준다 — 한 번 눌러 끝난다.
   *
   * 이미 그 작품에 별점 단 토론글이 있으면 여기서 못 매긴다 — 1작품 1별점이고,
   * 두 곳에서 다른 점수를 매기면 어느 쪽이 내 평가인지 알 수 없다.
   */
  const openRating = (e: React.MouseEvent, it: WatchedEntry) => {
    e.stopPropagation()
    if (!isAccount) { toast('별점은 로그인(고정닉) 후 매길 수 있어요.'); return }
    const posted = DS.getDiscussions().find(d => d.authorId === user.id && d.contentId === it.content.id && d.rating != null)
    if (posted) {
      toast(`이 작품엔 글로 매긴 별점(★ ${posted.rating})이 있어요. 그 글에서 고쳐주세요.`)
      return
    }
    setRatingFor(it)
  }

  const pickRating = async (rating: number | null) => {
    const it = ratingFor
    setRatingFor(null)
    if (!it) return
    await DS.updateWatchedRating(user.id, it.content.id, rating)
    DS.recomputeContentRating(it.content.id)
    toast(rating != null ? `★ ${rating} 로 매겼어요.` : '별점을 지웠어요.'); rerender()
  }

  /** 본 작품 카드 한 장 — 연도별로 묶든 별점순으로 늘어놓든 같은 카드를 쓴다 */
  const cardView = (it: WatchedEntry) => {
    const c = it.content
    return (
      <div key={c.id} className="content-card watched-card fade-in" {...clickable(() => openCard(c))}>
        <button className="watched-remove" title="내 피드에서 빼기" onClick={e => remove(e, c)}>✕</button>
        {editable(c) && <span className="watched-editable" title="클릭하면 정보 수정">✏️</span>}
        <Poster content={c} showScore={false} />
        <div className="c-title">{c.title}</div>
        <div className="c-meta">
          {TYPE_LABELS[c.type]}
          {c.releaseYear ? ` · ${c.releaseYear}` : ''}
        </div>
        <div className="watched-actions">
          {/* 별점 — 글 없이 여기서 바로. 매긴 점수는 작품 평점에도 들어간다 */}
          <button
            className={`watched-rate ${it.rating != null ? 'on' : ''}`}
            style={it.rating != null ? { background: scoreColor(it.rating), borderColor: 'transparent', color: '#fff' } : undefined}
            onClick={e => openRating(e, it)}
            title="별점 매기기"
          >{it.rating != null ? `★ ${it.rating}` : '별점'}</button>
          {/* 추천작에 담기 — 목록을 훑다가 '이건 권할 만하다' 싶을 때 바로 누른다.
              따로 추천 칸을 두고 거기서 검색해 담는 것보다 여기가 자연스럽다.
              담은 것만 모아 보려면 위의 '추천작만' 을 켠다. */}
          <button
            className={`watched-rec ${isRec(c.id) ? 'on' : ''}`}
            onClick={e => toggleRec(e, c)}
            title={isRec(c.id) ? '추천 작품에서 빼기' : '추천 작품에 담기'}
          >{isRec(c.id) ? '추천 중' : '+ 추천'}</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Seo title="내 피드" noindex />

      {/* 인생작품·프로필·취향·별점·많이 본 장르는 남의 프로필(/u/:id)과 같은 것을 쓴다 —
          본인이 꾸민 그대로 남에게 보여야 꾸미는 뜻이 있다. */}
      <ProfileShowcase user={user} watched={items} editable={isAccount} />

      {/* ── 본 작품 (등록·묶기·필터는 그대로) ─────────────────── */}
      <div className="feed-header" style={{ marginTop: 24 }}>
        <h2 className="feed-title">본 작품 {items.length}</h2>
        <span className="feed-sec-right">
          {publicSwitch('showWatched', watchedPublic)}
          {/* 등록은 '무엇을 더 담을까'라 제목 옆에, 펼치기는 '더 볼래?'라 목록 끝에 둔다 */}
          <button className="btn-text btn-small" onClick={() => openRegister('watched')}>+ 본 작품 등록</button>
        </span>
      </div>

      {!items.length ? (
        <div className="empty-state fade-in">
          <p>아직 등록한 작품이 없어요.<br />본 영화·드라마·예능·웹툰·웹소설을 등록해보세요!</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => openRegister('watched')}>+ 본 작품 등록</button>
        </div>
      ) : (
        /* 가로 줄 → 전체 보기 → 별점순·추천작만·갈래. 공개 프로필(/u/:id)과 같은 선반을 쓴다 */
        <WatchedShelf items={items} recommended={user.recommendedWorks ?? []} onOpen={openCard} card={cardView} />
      )}

      {/* ── 찜한 작품 ─────────────────────────────────────────
          '본 것' 바로 아래 '볼 것'. 버튼 자리는 본 작품과 똑같이 둔다 —
          두 칸이 나란히 있는데 손이 가는 자리가 다르면 매번 눈으로 찾아야 한다.
          다른 점 하나: 전체 보기는 여기서 펼치지 않고 찜 화면(/bookmarks)으로 간다.
          거기가 원래 찜을 정리하는 자리다(고르기·빼기·공개일 알림). */}
      <div className="feed-header" style={{ marginTop: 24 }}>
        <h2 className="feed-title">찜한 작품 {bookmarks.length}</h2>
        <span className="feed-sec-right">
          {publicSwitch('showBookmarks', bookmarksPublic)}
          <button className="btn-text btn-small" onClick={() => openRegister('bookmark')}>+ 찜한 작품 등록</button>
        </span>
      </div>
      {!bookmarks.length ? (
        <div className="empty-state fade-in">
          <p>찜한 작품이 없어요.</p>
          <p style={{ fontSize: 12, marginTop: 6 }}>위 <b>+ 찜한 작품 등록</b>을 누르거나, 작품방에서 <b>찜</b>을 누르면 여기 모입니다.</p>
        </div>
      ) : (
        <>
          <div className="feed-strip fade-in">
            {bookmarks.slice(0, STRIP_MAX).map(c => (
              <div key={c.id} className="feed-strip-item" {...clickable(() => navigate(`/content/${c.id}`), c.title)}>
                <Poster content={c} showScore={false} />
                <div className="feed-strip-title">{c.title}</div>
              </div>
            ))}
          </div>
          <button className="feed-more" onClick={() => navigate('/bookmarks')}>
            {bookmarks.length}편 전체 보기 ›
          </button>
        </>
      )}

      {/* ── 내 토론 (맨 아래) ──────────────────────────────────
          내가 쓴 글 전부가 아니라 **내가 고른 글**만 온다 — 깊게 판 글, 남에게 보여주고 싶은 글,
          그냥 모아 두고 싶은 글. 그래서 글마다 공개/비공개가 따로 있다:
          자랑할 글과 혼자 볼 글이 한 칸에 섞이기 때문이다. */}
      <div className="feed-header" style={{ marginTop: 28 }}>
        <h2 className="feed-title">내 토론 {pins.length > 0 && pins.length}</h2>
        <span className="feed-sec-note">글 상세에서 저장해요</span>
      </div>
      {!pins.length ? (
        <div className="empty-state fade-in">
          <p>아직 걸어 둔 글이 없어요.</p>
          <p style={{ fontSize: 12, marginTop: 6 }}>내가 쓴 글을 열어 <b>내 토론에 저장</b>을 누르면 여기 모입니다.</p>
        </div>
      ) : (
        <div className="disc-board fade-in">
          {pins.map(({ pin, post }) => (
            <div key={pin.id} className="feed-pin">
              <div className="feed-pin-main" {...clickable(() => navigate(`/talk/${pin.id}`))}>
                <div className="feed-pin-title">{post.title || post.body.slice(0, 40)}</div>
                <div className="feed-pin-meta">
                  <span className="feed-pin-work">{DS.getContentById(post.contentId)?.title || '자유방'}</span>
                  <span>{boardDate(post.createdAt)}</span>
                  {post.likes.length > 0 && <span className="feed-pin-likes">♥ {post.likes.length}</span>}
                </div>
              </div>
              <span className="feed-sec-right">
                <button
                  className={`feed-public ${pin.public ? 'on' : ''}`}
                  onClick={() => togglePinPublic(pin.id)}
                  title={pin.public ? '남에게 보입니다. 누르면 비공개로 바꿔요' : '나만 봅니다. 누르면 공개로 바꿔요'}
                >{pin.public ? '공개' : '비공개'}</button>
                <button className="feed-pin-x" onClick={() => removePin(pin.id, post.title || '이 글')} aria-label="내 토론에서 빼기">✕</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 별점 시트 — 열 개를 한눈에 늘어놓고 한 번 눌러 끝낸다.
          지금 점수는 색으로 짚어 주고, 같은 점수를 다시 누르면 그냥 닫힌다(바꿀 게 없다). */}
      {ratingFor && (
        <RatingSheet
          title={ratingFor.content.title}
          rating={ratingFor.rating}
          onPick={pickRating}
          onClose={() => setRatingFor(null)}
        />
      )}

      {showModal && (
        <RegisterWatchedModal
          mode={showModal}
          onClose={() => setShowModal(null)}
          onRegistered={() => rerender()}
        />
      )}

      {editing && (
        <EditContentModal
          content={editing}
          onClose={() => setEditing(null)}
          onSaved={() => rerender()}
        />
      )}
    </>
  )
}
