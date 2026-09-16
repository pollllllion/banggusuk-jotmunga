import { useEffect, useRef, useState } from 'react'
import { Poster } from '@/components/content/Poster'
import { CONTENT_TYPES, TYPE_LABELS } from '@/utils/constants'
import { clickable } from '@/utils/a11y'
import type { Content, ContentType } from '@/types'

/**
 * 찜한 작품 선반 — 본 작품 선반(WatchedShelf)과 **같은 방식으로 움직인다**.
 *
 * 2026-09-16 이전에는 '전체 보기'가 찜 화면(/bookmarks)으로 건너뛰었다. 두 칸이
 * 나란히 붙어 있는데 한쪽은 아래로 펼쳐지고 한쪽은 화면을 갈아치우니, 누르기 전에는
 * 무슨 일이 일어날지 알 수 없었다. 같은 자리의 같은 버튼은 같은 일을 해야 한다.
 *
 * WatchedShelf 를 그대로 쓰지 않는 이유: 저쪽은 별점이 달린 항목(WatchedEntry)을 받아
 * '별점순'·'추천작만' 으로 거른다. 찜은 아직 안 본 것이라 별점도 추천도 없다 —
 * 빈 거르개만 남는다. 그래서 움직임(펼치기·쪽 나눔·따라붙는 접기)만 같게 맞췄다.
 */

/** 접혀 있을 때 가로 줄에 세울 최대 개수 — 그 이상은 어차피 밀어서 보지 않는다 */
const STRIP_MAX = 12
/** 펼쳤을 때 한 번에 그리는 개수. '더 보기'를 누른 만큼만 길어진다 */
const PAGE = 60

export function BookmarkShelf({ items, onOpen, title = '찜한 작품' }: {
  /** 최근에 담은 것부터 정렬돼 들어온다 */
  items: Content[]
  onOpen: (c: Content) => void
  /** 따라붙는 접기 바에 적을 칸 이름 */
  title?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [filter, setFilter] = useState<'all' | ContentType>('all')
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

  /**
   * 접기 — 접고 나서 목록 머리로 돌려보낸다.
   * 한참 내려온 자리에서 접으면 화면이 통째로 짧아져 엉뚱한 칸 한복판에 떨어진다.
   */
  const collapse = () => {
    const top = (ref.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 100
    setExpanded(false)
    setShown(PAGE)
    window.scrollTo({ top: Math.max(0, top) })
  }

  const filtered = items.filter(c => filter === 'all' || c.type === filter)
  const visible = filtered.slice(0, shown)
  const rest = filtered.length - visible.length
  const typesPresent = new Set(items.map(c => c.type))

  /** 목록 끝에 붙는 펼치기·접기 — 본 작품 쪽과 글자까지 같다 */
  const toggle = (
    <button className="feed-more" onClick={() => (expanded ? collapse() : setExpanded(true))}>
      {expanded ? '접기' : `${items.length}편 전체 보기 ›`}
    </button>
  )

  if (!expanded) {
    return (
      <div ref={ref}>
        <div className="feed-strip fade-in">
          {items.slice(0, STRIP_MAX).map(c => (
            <div key={c.id} className="feed-strip-item" {...clickable(() => onOpen(c), c.title)}>
              <Poster content={c} showScore={false} />
              <div className="feed-strip-title">{c.title}</div>
            </div>
          ))}
        </div>
        {toggle}
      </div>
    )
  }

  return (
    <div ref={ref}>
      {/* 따라붙는 접기 알약 — 본 작품 선반과 같은 것(.shelf-dock). 화면 아래 가운데. */}
      {barOn && (
        <div className="shelf-dock">
          <div className="shelf-bar">
            <span className="shelf-bar-title">{title} {filtered.length}</span>
            <span className="shelf-bar-note">{filter === 'all' ? '담은 순' : TYPE_LABELS[filter]}</span>
            <button className="shelf-bar-close" onClick={collapse}>접기</button>
          </div>
        </div>
      )}

      {/* 어떤 갈래를 볼까 — 찜이 쌓이면 영화와 드라마가 섞여 찾기 어려워진다 */}
      {typesPresent.size > 1 && (
        <div className="feed-typefilter">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => { setFilter('all'); setShown(PAGE) }}>전체</button>
          {CONTENT_TYPES.filter(t => typesPresent.has(t.code)).map(t => (
            <button key={t.code} className={filter === t.code ? 'active' : ''} onClick={() => { setFilter(t.code); setShown(PAGE) }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="feed-years">
        {!filtered.length && (
          <div className="empty-state fade-in"><p>여기에 해당하는 작품이 없어요.</p></div>
        )}
        {visible.length > 0 && (
          <div className="content-grid">
            {visible.map(c => (
              <div key={c.id} className="content-card fade-in" {...clickable(() => onOpen(c))}>
                <Poster content={c} showScore={false} />
                <div className="c-title">{c.title}</div>
                <div className="c-meta">
                  {TYPE_LABELS[c.type]}
                  {c.releaseYear ? ` · ${c.releaseYear}` : ''}
                </div>
              </div>
            ))}
          </div>
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
