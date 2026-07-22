import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { Poster } from '@/components/content/Poster'
import { RegisterWatchedModal } from '@/components/content/RegisterWatchedModal'
import { CONTENT_TYPES, TYPE_LABELS } from '@/utils/constants'
import type { Content, ContentType } from '@/types'

type Filter = 'all' | ContentType

/** 개봉 연도별로 묶기 — 최신 연도부터, 연도 미상(null)은 맨 뒤 */
function groupByYear(list: Content[]): { year: number | null; items: Content[] }[] {
  const map = new Map<number | null, Content[]>()
  for (const c of list) {
    const y = c.releaseYear ?? null
    const arr = map.get(y)
    if (arr) arr.push(c)
    else map.set(y, [c])
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
  const [filter, setFilter] = useState<Filter>('all')
  const [tick, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)

  // tick 을 의존성에 포함해야 등록/삭제(rerender) 직후 watched 캐시를 다시 읽어 즉시 반영된다.
  // (DS.getUserWatched 는 인메모리 캐시라 React 가 변화를 모르므로 tick 으로 강제 재계산)
  const contents = useMemo(() => {
    if (!user) return []
    return DS.getUserWatched(user.id)
      .map(w => DS.getContentById(w.contentId))
      .filter((c): c is Content => Boolean(c))
  }, [user, tick])

  if (!user) return null

  const filtered = filter === 'all' ? contents : contents.filter(c => c.type === filter)
  const typesPresent = new Set(contents.map(c => c.type))
  const yearGroups = groupByYear(filtered) // 개봉 연도별 묶음 (최신순, 연도 미상은 맨 뒤)

  const openRegister = () => {
    if (!isAccount) { toast('본 작품 등록은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    setShowModal(true)
  }

  const remove = async (e: React.MouseEvent, c: Content) => {
    e.stopPropagation()
    if (!window.confirm(`'${c.title}'을(를) 내 피드에서 뺄까요?`)) return
    await DS.unregisterWatched(user.id, c.id)
    toast('내 피드에서 뺐어요.'); rerender()
  }

  return (
    <>
      <div className="feed-header">
        <h2 className="feed-title">내 피드</h2>
        <button className="btn btn-primary btn-small" onClick={openRegister}>+ 본 작품 등록</button>
      </div>

      <div className="feed-summary">
        <span><b>{contents.length}</b>편 봤어요</span>
        <div className="feed-quicklinks">
          <button className="btn-text btn-small" onClick={() => navigate('/my-reviews')}>내 리뷰 ›</button>
          <button className="btn-text btn-small" onClick={() => navigate('/bookmarks')}>찜 ›</button>
        </div>
      </div>

      {contents.length > 0 && (
        <div className="feed-typefilter">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>전체</button>
          {CONTENT_TYPES.filter(t => typesPresent.has(t.code)).map(t => (
            <button key={t.code} className={filter === t.code ? 'active' : ''} onClick={() => setFilter(t.code)}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      )}

      {!contents.length ? (
        <div className="empty-state fade-in">
          <p>아직 등록한 작품이 없어요.<br />본 영화·드라마·예능·웹툰·웹소설을 등록해보세요!</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openRegister}>+ 본 작품 등록</button>
        </div>
      ) : (
        <div className="feed-years">
          {yearGroups.map(g => (
            <section key={g.year ?? 'unknown'} className="feed-year-group">
              <div className="feed-year-head">
                <span className="feed-year-label">{g.year ? `${g.year}년` : '연도 미상'}</span>
                <span className="feed-year-count">{g.items.length}편</span>
              </div>
              <div className="content-grid">
                {g.items.map(c => (
                  <div key={c.id} className="content-card watched-card fade-in" onClick={() => navigate(`/content/${c.id}?tab=talk`)}>
                    <button className="watched-remove" title="내 피드에서 빼기" onClick={e => remove(e, c)}>✕</button>
                    <Poster content={c} showScore={false} />
                    <div className="c-title">{c.title}</div>
                    <div className="c-meta">
                      {TYPE_LABELS[c.type]}
                      {c.releaseYear ? ` · ${c.releaseYear}` : ''}
                    </div>
                  </div>
                ))}
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
    </>
  )
}
