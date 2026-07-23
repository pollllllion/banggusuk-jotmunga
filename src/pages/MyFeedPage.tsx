import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { Poster } from '@/components/content/Poster'
import { RegisterWatchedModal } from '@/components/content/RegisterWatchedModal'
import { EditContentModal } from '@/components/content/EditContentModal'
import { CONTENT_TYPES, TYPE_LABELS } from '@/utils/constants'
import type { Content, ContentType } from '@/types'

type Filter = 'all' | ContentType
/** 묶는 기준: 작품(개봉) 연도 vs 내가 본(시청) 연도 */
type GroupMode = 'release' | 'watched'

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
  const { user, isAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Content | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [groupMode, setGroupMode] = useState<GroupMode>('release')
  const [tick, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)

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

  const filtered = filter === 'all' ? items : items.filter(i => i.content.type === filter)
  const typesPresent = new Set(items.map(i => i.content.type))
  const yearOf = groupMode === 'release'
    ? (i: FeedItem) => i.content.releaseYear ?? null
    : (i: FeedItem) => i.watchedYear
  const yearGroups = groupByYear(filtered, yearOf)

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
      <div className="feed-header">
        <h2 className="feed-title">내 피드</h2>
        <button className="btn btn-primary btn-small" onClick={openRegister}>+ 본 작품 등록</button>
      </div>

      <div className="feed-summary">
        <span><b>{items.length}</b>편 봤어요</span>
        <div className="feed-quicklinks">
          <button className="btn-text btn-small" onClick={() => navigate('/my-reviews')}>내 리뷰 ›</button>
          <button className="btn-text btn-small" onClick={() => navigate('/bookmarks')}>찜 ›</button>
        </div>
      </div>

      {items.length > 0 && (
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
                {t.emoji} {t.label}
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
      ) : (
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
                    <div key={c.id} className="content-card watched-card fade-in" onClick={() => openCard(c)}>
                      <button className="watched-remove" title="내 피드에서 빼기" onClick={e => remove(e, c)}>✕</button>
                      {editable(c) && <span className="watched-editable" title="클릭하면 정보 수정">✏️</span>}
                      <Poster content={c} showScore={false} />
                      <div className="c-title">{c.title}</div>
                      <div className="c-meta">
                        {TYPE_LABELS[c.type]}
                        {c.releaseYear ? ` · ${c.releaseYear}` : ''}
                      </div>
                      <button className="watched-year-tag" onClick={e => editWatchedYear(e, it)} title="시청 연도 수정">
                        {it.watchedYear ? `👀 ${it.watchedYear}년 봄` : '👀 본 연도 입력'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
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
