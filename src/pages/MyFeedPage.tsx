import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { Poster } from '@/components/content/Poster'
import { RegisterWatchedModal } from '@/components/content/RegisterWatchedModal'
import { EditContentModal } from '@/components/content/EditContentModal'
import { ProfileShowcase } from '@/components/profile/ProfileShowcase'
import { boardDate } from '@/utils/helpers'
import { CONTENT_TYPES, TYPE_LABELS } from '@/utils/constants'
import { Seo } from '@/components/seo/Seo'
import type { Content, ContentType } from '@/types'
import { clickable } from '@/utils/a11y'

type Filter = 'all' | ContentType
/** 묶는 기준: 작품(개봉) 연도 vs 내가 본(시청) 연도 */
type GroupMode = 'release' | 'watched'

/** 접혀 있을 때 가로 줄에 세울 최대 개수 — 그 이상은 어차피 밀어서 보지 않는다 */
const STRIP_MAX = 12

/** 내 피드 항목 = 작품 + 그 작품을 본 연도 */
interface FeedItem { content: Content; watchedYear: number | null }

/** 주어진 연도 추출 함수로 묶기 — 최신 연도부터, 연도 미상(null)은 맨 뒤 */
function groupByYear(list: FeedItem[], yearOf: (i: FeedItem) => number | null): { year: number | null; items: FeedItem[] }[] {
  const map = new Map<number | null, FeedItem[]>()
  for (const it of list) {
    const y = yearOf(it) ?? null
    const arr = map.get(y)
    if (arr) arr.push(it)
    else map.set(y, [it])
  }
  return [...map.entries()]
    .map(([year, items]) => ({ year, items }))
    .sort((a, b) => {
      if (a.year === null) return 1
      if (b.year === null) return -1
      return b.year - a.year
    })
}

export function MyFeedPage() {
  const navigate = useNavigate()
  const { user, isAccount, updateProfile } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Content | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [groupMode, setGroupMode] = useState<GroupMode>('release')
  const [tick, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)
  /** 본 작품을 다 펼칠지. 기본은 가로 한 줄 — 수백 편이면 아래가 끝없이 길어진다.
   *  펼치면 지금까지의 연도별 그리드(묶기 토글·타입 필터·삭제·연도 수정)가 그대로 나온다. */
  const [expandWatched, setExpandWatched] = useState(false)

  // tick 을 의존성에 포함해야 등록/삭제/수정(rerender) 직후 watched 캐시를 다시 읽어 즉시 반영된다.
  // (DS.getUserWatched 는 인메모리 캐시라 React 가 변화를 모르므로 tick 으로 강제 재계산)
  const items = useMemo<FeedItem[]>(() => {
    if (!user) return []
    return DS.getUserWatched(user.id)
      .map(w => {
        const c = DS.getContentById(w.contentId)
        return c ? { content: c, watchedYear: w.watchedYear ?? null } : null
      })
      .filter((i): i is FeedItem => Boolean(i))
  }, [user, tick])

  if (!user) return null

  /** 본 작품 공개 여부. 별점 쪽 스위치는 ProfileShowcase 가 갖고 있다.
   *  마이그레이션 전(undefined)이면 공개로 본다 — 지금까지 공개였던 것을 조용히 감추지 않는다.
   *  비공개로 둬도 이 화면(본인)에는 계속 보인다: 감춘 것도 관리는 해야 한다. */
  const watchedPublic = user.showWatched !== false
  const toggleWatchedPublic = async () => {
    if (!isAccount) { toast('공개 설정은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    try {
      await updateProfile({ showWatched: !watchedPublic })
      toast(!watchedPublic ? '공개로 바꿨어요.' : '비공개로 바꿨어요.'); rerender()
    } catch { toast('설정을 저장하지 못했어요.') }
  }

  const filtered = filter === 'all' ? items : items.filter(i => i.content.type === filter)
  const typesPresent = new Set(items.map(i => i.content.type))
  const yearOf = groupMode === 'release'
    ? (i: FeedItem) => i.content.releaseYear ?? null
    : (i: FeedItem) => i.watchedYear
  const yearGroups = groupByYear(filtered, yearOf)

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

  const openRegister = () => {
    if (!isAccount) { toast('본 작품 등록은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    setShowModal(true)
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

  // 시청 연도 편집 (본 연도별 정리에 쓰임 — 특히 연도 미상 항목 채우기)
  const editWatchedYear = async (e: React.MouseEvent, it: FeedItem) => {
    e.stopPropagation()
    const cur = it.watchedYear
    const input = window.prompt(`'${it.content.title}'을(를) 몇 년도에 봤어요? (숫자만, 모르면 비우기)`, cur ? String(cur) : '')
    if (input === null) return // 취소
    const t = input.trim()
    let year: number | null = null
    if (t) {
      const n = Number(t)
      if (!Number.isInteger(n) || n < 1900 || n > new Date().getFullYear() + 1) {
        toast('연도를 숫자로 입력해주세요 (예: 2023)'); return
      }
      year = n
    }
    await DS.updateWatchedYear(user.id, it.content.id, year)
    toast('시청 연도를 저장했어요.'); rerender()
  }

  return (
    <>
      <Seo title="내 피드" noindex />

      {/* 인생작품·프로필·취향·별점·많이 본 장르는 남의 프로필(/u/:id)과 같은 것을 쓴다 —
          본인이 꾸민 그대로 남에게 보여야 꾸미는 뜻이 있다. */}
      <ProfileShowcase user={user} watched={items.map(i => i.content)} editable={isAccount} />

      {/* ── 본 작품 (등록·묶기·필터는 그대로) ─────────────────── */}
      <div className="feed-header" style={{ marginTop: 24 }}>
        <h2 className="feed-title">본 작품 {items.length}</h2>
        <span className="feed-sec-right">
          {isAccount && (
            <button
              className={`feed-public ${watchedPublic ? 'on' : ''}`}
              onClick={toggleWatchedPublic}
              title={watchedPublic ? '남에게 보입니다. 누르면 비공개로 바꿔요' : '나만 봅니다. 누르면 공개로 바꿔요'}
            >{watchedPublic ? '공개' : '비공개'}</button>
          )}
          {/* 펼치기는 '어디까지 보여줄까'라 제목 옆에, 등록은 '무엇을 더 담을까'라 목록 아래에 둔다 */}
          {items.length > 0 && (
            <button className="btn-text btn-small" onClick={() => setExpandWatched(v => !v)}>
              {expandWatched ? '접기' : `${items.length}편 전체 보기 ›`}
            </button>
          )}
        </span>
      </div>

      {/* 접혀 있을 땐 가로 한 줄 — 최근에 담은 것부터. 관리(삭제·연도 수정)는 펼친 뒤에 한다.
          한 줄에서까지 ✕ 를 달면 훑어보다 손이 스쳐 지워진다. */}
      {items.length > 0 && !expandWatched && (
        <>
          <div className="feed-strip">
            {items.slice(0, STRIP_MAX).map(it => (
              <div key={it.content.id} className="feed-strip-item" {...clickable(() => openCard(it.content), it.content.title)}>
                <Poster content={it.content} showScore={false} />
                <div className="feed-strip-title">{it.content.title}</div>
              </div>
            ))}
          </div>
          <button className="feed-more" onClick={openRegister}>+ 본 작품 등록</button>
        </>
      )}

      {items.length > 0 && expandWatched && (
        <>
          {/* 묶는 기준 토글 */}
          <div className="feed-groupmode">
            <button className={groupMode === 'release' ? 'active' : ''} onClick={() => setGroupMode('release')}>작품 연도별</button>
            <button className={groupMode === 'watched' ? 'active' : ''} onClick={() => setGroupMode('watched')}>본 연도별</button>
          </div>

          <div className="feed-typefilter">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>전체</button>
            {CONTENT_TYPES.filter(t => typesPresent.has(t.code)).map(t => (
              <button key={t.code} className={filter === t.code ? 'active' : ''} onClick={() => setFilter(t.code)}>
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}

      {!items.length ? (
        <div className="empty-state fade-in">
          <p>아직 등록한 작품이 없어요.<br />본 영화·드라마·예능·웹툰·웹소설을 등록해보세요!</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openRegister}>+ 본 작품 등록</button>
        </div>
      ) : expandWatched && (
        <div className="feed-years">
          {yearGroups.map(g => (
            <section key={g.year ?? 'unknown'} className="feed-year-group">
              <div className="feed-year-head">
                <span className="feed-year-label">
                  {g.year ? `${g.year}년` : (groupMode === 'watched' ? '본 연도 미상' : '연도 미상')}
                </span>
                <span className="feed-year-count">{g.items.length}편</span>
                {groupMode === 'watched' && g.year && <span className="feed-year-sub">에 봄</span>}
              </div>
              <div className="content-grid">
                {g.items.map(it => {
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
                      <button className="watched-year-tag" onClick={e => editWatchedYear(e, it)} title="시청 연도 수정">
                        {it.watchedYear ? `${it.watchedYear}년 봄` : '본 연도 입력'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
          <button className="feed-more" onClick={openRegister}>+ 본 작품 등록</button>
        </div>
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

      {showModal && (
        <RegisterWatchedModal
          onClose={() => setShowModal(false)}
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
