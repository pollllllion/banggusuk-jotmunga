import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Poster } from '@/components/content/Poster'
import { CONTENT_TYPES } from '@/utils/constants'
import { clickable } from '@/utils/a11y'
import type { Content, ContentType } from '@/types'

/**
 * 본 작품 선반 — 내 피드(/feed)와 공개 프로필(/u/:id)이 함께 쓴다.
 *
 * 두 화면에서 '보는 방법'(가로 줄 → 전체 보기 → 별점순·추천작만·갈래)은 똑같아야 한다:
 * 남의 피드를 구경하는 쪽도 "이 사람 별점 높은 순으로" "추천작만" 을 눌러 볼 수 있어야
 * 남의 취향을 읽는 뜻이 산다. 다른 것은 **카드 안**뿐이라(내 것은 지우고 별점 매기고,
 * 남의 것은 보기만 한다) 카드는 card 로 받아서 그린다.
 *
 * 수백 편이 쌓였을 때를 두 가지로 막는다:
 *   · 한 번에 PAGE 편씩만 그린다 — 펼치자마자 화면이 수십 미터가 되지 않는다
 *   · 펼친 동안 '접기' 알약이 화면 아래 가운데에 따라붙는다 — 어디까지 내려갔든 한 번에 접는다
 */

/** 선반 항목 = 작품 + 그 사람이 매긴 별점 */
export interface WatchedEntry { content: Content; rating: number | null }

/** 줄 세우기: 작품(개봉) 연도별 · 별점 높은 순 */
type GroupMode = 'release' | 'rating'
type Filter = 'all' | ContentType

/** 접혀 있을 때 가로 줄에 세울 최대 개수 — 그 이상은 어차피 밀어서 보지 않는다 */
const STRIP_MAX = 12
/** 펼쳤을 때 한 번에 그리는 개수. '더 보기'를 누른 만큼만 길어진다 */
const PAGE = 60

/** 최신 연도부터, 연도 미상(null)은 맨 뒤 */
function byYearDesc(a: WatchedEntry, b: WatchedEntry) {
  const ay = a.content.releaseYear ?? null
  const by = b.content.releaseYear ?? null
  if (ay === by) return 0
  if (ay === null) return 1
  if (by === null) return -1
  return by - ay
}

/** 이미 연도순으로 정렬된 목록을 연도 묶음으로 자른다 */
function groupByYear(list: WatchedEntry[]): { year: number | null; items: WatchedEntry[] }[] {
  const out: { year: number | null; items: WatchedEntry[] }[] = []
  for (const it of list) {
    const y = it.content.releaseYear ?? null
    const last = out[out.length - 1]
    if (last && last.year === y) last.items.push(it)
    else out.push({ year: y, items: [it] })
  }
  return out
}

export function WatchedShelf({
  items,
  recommended,
  card,
  onOpen,
  title = '본 작품',
}: {
  items: WatchedEntry[]
  /** 이 사람이 추천작으로 담은 작품 id — '추천작만' 거르개가 쓴다 */
  recommended: string[]
  /** 펼친 격자에 그릴 카드 한 장 (key 는 카드 쪽에서 단다) */
  card: (it: WatchedEntry) => ReactNode
  /** 접힌 가로 줄에서 한 편을 눌렀을 때 */
  onOpen: (c: Content) => void
  /** 고정 바에 적을 칸 이름 */
  title?: string
}) {
  /** 다 펼칠지 — 기본은 가로 한 줄. 수백 편이면 아래가 끝없이 길어진다 */
  const [expanded, setExpanded] = useState(false)
  const [groupMode, setGroupMode] = useState<GroupMode>('release')
  const [recOnly, setRecOnly] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  /** 지금까지 그린 개수 — 거르개를 바꾸면 처음부터 다시 센다 */
  const [shown, setShown] = useState(PAGE)
  const ref = useRef<HTMLDivElement>(null)
  /** 고정 '접기' 바를 띄울지 — 목록이 화면을 지나가는 동안만 */
  const [barOn, setBarOn] = useState(false)

  useEffect(() => {
    if (!expanded) { setBarOn(false); return }
    const onScroll = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      // 목록이 화면 위쪽까지 차오른 뒤부터, 목록이 화면을 벗어나기 전까지.
      // 다 지나가고 아래 칸(찜·토론)을 보는 중이라면 이 알약은 남의 일이다.
      setBarOn(r.top < 120 && r.bottom > 220)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [expanded])

  if (!items.length) return null

  /** 거르개를 건드리면 다시 첫 PAGE 편부터 — 안 그러면 필터를 바꿔도 아까 만큼 길다 */
  const refilter = (fn: () => void) => { fn(); setShown(PAGE) }

  /**
   * 접기 — 접고 나서 목록 머리로 돌려보낸다.
   * 한참 내려온 자리에서 접으면 화면이 통째로 짧아져 엉뚱한 칸(찜·토론) 한복판에 떨어진다.
   */
  const collapse = () => {
    const top = (ref.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 100
    setExpanded(false)
    setShown(PAGE)
    window.scrollTo({ top: Math.max(0, top) })
  }

  // 갈래 필터 + '추천작만'. 둘은 곱해진다(영화 중 추천작).
  const filtered = items
    .filter(i => filter === 'all' || i.content.type === filter)
    .filter(i => !recOnly || recommended.includes(i.content.id))
  const typesPresent = new Set(items.map(i => i.content.type))

  // 별점순은 연도로 묶지 않는다 — 묶으면 '연도 안에서만 높은 순' 이 되어 뜻이 어긋난다.
  // 안 매긴 것은 맨 뒤로 보낸다(0점이 아니라 '아직 없음' 이다).
  const ordered = groupMode === 'rating'
    ? [...filtered].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
    : [...filtered].sort(byYearDesc)
  const visible = ordered.slice(0, shown)
  const rest = ordered.length - visible.length

  /** 목록 끝에 붙는 펼치기·접기 — 세 화면(가로 줄·별점순·연도별)이 같은 버튼을 쓴다 */
  const toggle = (
    <button className="feed-more" onClick={() => (expanded ? collapse() : setExpanded(true))}>
      {expanded ? '접기' : `${items.length}편 전체 보기 ›`}
    </button>
  )

  /* 접혀 있을 땐 가로 한 줄 — 최근에 담은 것부터. 관리(삭제·별점)는 펼친 뒤에 한다.
     한 줄에서까지 ✕ 를 달면 훑어보다 손이 스쳐 지워진다. */
  if (!expanded) {
    return (
      <div ref={ref}>
        <div className="feed-strip">
          {items.slice(0, STRIP_MAX).map(it => (
            <div key={it.content.id} className="feed-strip-item" {...clickable(() => onOpen(it.content), it.content.title)}>
              <Poster content={it.content} showScore={false} />
              <div className="feed-strip-title">{it.content.title}</div>
            </div>
          ))}
        </div>
        {toggle}
      </div>
    )
  }

  return (
    <div ref={ref}>
      {/* 따라붙는 접기 알약 — 화면 **아래 가운데**에 뜬다. 위에 붙이면 헤더·고정 바와 섞여
          있는 줄도 모르고 지나간다. 지금 무엇으로 줄을 세웠는지도 적는다
          (수백 편을 내리다 보면 별점순으로 보던 중인지 연도별인지 잊는다).
          sticky 가 아니라 fixed 인 이유는 .board-topbar 와 같다 — .main 의 overflow-x: hidden. */}
      {barOn && (
        <div className="shelf-dock">
          <div className="shelf-bar">
            <span className="shelf-bar-title">{title} {ordered.length}</span>
            <span className="shelf-bar-note">
              {groupMode === 'rating' ? '별점순' : '작품 연도별'}{recOnly ? ' · 추천작만' : ''}
            </span>
            <button className="shelf-bar-close" onClick={collapse}>접기</button>
          </div>
        </div>
      )}

      {/* 줄 세우기 · 추천작만 — 한 줄에 둔다. 추천작만은 갈래 필터와 곱해진다(영화 중 추천작) */}
      <div className="feed-sortrow">
        <div className="feed-groupmode">
          <button className={groupMode === 'release' ? 'active' : ''} onClick={() => refilter(() => setGroupMode('release'))}>작품 연도별</button>
          <button className={groupMode === 'rating' ? 'active' : ''} onClick={() => refilter(() => setGroupMode('rating'))}>별점순</button>
        </div>
        <button className={`feed-reconly ${recOnly ? 'active' : ''}`} onClick={() => refilter(() => setRecOnly(v => !v))}>
          추천작만
        </button>
      </div>

      {/* 어떤 갈래를 볼까 */}
      <div className="feed-typefilter">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => refilter(() => setFilter('all'))}>전체</button>
        {CONTENT_TYPES.filter(t => typesPresent.has(t.code)).map(t => (
          <button key={t.code} className={filter === t.code ? 'active' : ''} onClick={() => refilter(() => setFilter(t.code))}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="feed-years">
        {!filtered.length && (
          <div className="empty-state fade-in"><p>여기에 해당하는 작품이 없어요.</p></div>
        )}
        {/* 별점순 — 연도로 묶지 않고 한 판에 늘어놓는다. 안 매긴 것은 맨 뒤. */}
        {groupMode === 'rating' ? (
          visible.length > 0 && <div className="content-grid">{visible.map(card)}</div>
        ) : (
          groupByYear(visible).map(g => (
            <section key={g.year ?? 'unknown'} className="feed-year-group">
              <div className="feed-year-head">
                <span className="feed-year-label">{g.year ? `${g.year}년` : '연도 미상'}</span>
                <span className="feed-year-count">{g.items.length}편</span>
              </div>
              <div className="content-grid">
                {g.items.map(card)}
              </div>
            </section>
          ))
        )}
        {rest > 0 && (
          <button className="feed-more" onClick={() => setShown(n => n + PAGE)}>
            {rest}편 더 보기
          </button>
        )}
        {toggle}
      </div>
    </div>
  )
}
