import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { useAuthStore } from '@/stores/authStore'
import { Poster } from '@/components/content/Poster'
import { BookmarkIcon, CommentIcon } from '@/components/ui/Icons'
import { TYPE_LABELS, TYPE_EMOJIS } from '@/utils/constants'
import type { Content, ContentType } from '@/types'
import '@/styles/calendar.css'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const FILTERS: { code: ContentType | 'all'; label: string }[] = [
  { code: 'all', label: '전체' },
  { code: 'movie', label: '영화' },
  { code: 'drama', label: '드라마·예능' },
  { code: 'webtoon', label: '웹툰' },
  { code: 'webnovel', label: '웹소설' },
]

const MAX_PER_CELL = 3

/** 로컬 기준 YYYY-MM-DD 키 (타임존 시프트 방지) */
function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ddayOf(release: string): { label: string; over: boolean } {
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const r = new Date(release + 'T00:00:00')
  const diff = Math.round((r.getTime() - t.getTime()) / 86400000)
  if (diff > 0) return { label: `D-${diff}`, over: false }
  if (diff === 0) return { label: 'D-DAY', over: false }
  return { label: '공개됨', over: true }
}

export function CalendarPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [filter, setFilter] = useState<ContentType | 'all'>('all')
  const [selected, setSelected] = useState<Content | null>(null)
  const [bookmarked, setBookmarked] = useState(false)

  const todayKey = keyOf(now)

  // releaseDate 있는 작품을 날짜별로 그룹핑
  const byDate = useMemo(() => {
    const map: Record<string, Content[]> = {}
    for (const c of DS.getContents()) {
      if (!c.releaseDate) continue
      if (filter !== 'all' && c.type !== filter) continue
      ;(map[c.releaseDate] ||= []).push(c)
    }
    return map
  }, [filter])

  // 이번 달 그리드 (일요일 시작)
  const weeks = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1)
    const startPad = first.getDay()
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
    const cells: (Date | null)[] = []
    for (let i = 0; i < startPad; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.y, cursor.m, d))
    while (cells.length % 7 !== 0) cells.push(null)
    const rows: (Date | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
    return rows
  }, [cursor])

  const monthCount = useMemo(() => {
    const prefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`
    return Object.entries(byDate)
      .filter(([k]) => k.startsWith(prefix))
      .reduce((s, [, arr]) => s + arr.length, 0)
  }, [byDate, cursor])

  const shift = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1)
    setCursor({ y: d.getFullYear(), m: d.getMonth() })
  }
  const goToday = () => setCursor({ y: now.getFullYear(), m: now.getMonth() })

  const openItem = (c: Content) => {
    setSelected(c)
    setBookmarked(user ? DS.isBookmarked(user.id, c.id) : false)
  }

  const toggleAlarm = () => {
    if (!user || !selected) return
    setBookmarked(DS.toggleBookmark(user.id, selected.id))
  }

  return (
    <div className="cal-wrap">
      <div className="cal-hero">
        <h1>🗓️ 개봉·공개 캘린더</h1>
        <p>앞으로 나올 영화·드라마·예능·웹툰·웹소설의 출시일을 한눈에. 찜해두면 공개일에 알려드려요.</p>
      </div>

      <div className="cal-toolbar">
        <div className="cal-monthnav">
          <button className="cal-navbtn" onClick={() => shift(-1)} aria-label="이전 달">‹</button>
          <span className="m-label">{cursor.y}년 {cursor.m + 1}월</span>
          <button className="cal-navbtn" onClick={() => shift(1)} aria-label="다음 달">›</button>
          <button className="cal-today-btn" onClick={goToday}>오늘</button>
        </div>
        <div className="cal-filters">
          {FILTERS.map(f => (
            <button
              key={f.code}
              className={`cal-chip ${filter === f.code ? 'active' : ''}`}
              onClick={() => setFilter(f.code)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {monthCount === 0 ? (
        <div className="cal-grid"><div className="cal-empty">이 달에는 등록된 공개 예정작이 없어요. 다른 달을 확인해보세요.</div></div>
      ) : (
        <div className="cal-grid">
          <div className="cal-weekdays">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{w}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div className="cal-week" key={wi}>
              {week.map((date, di) => {
                if (!date) return <div className="cal-cell empty" key={di} />
                const k = keyOf(date)
                const items = byDate[k] || []
                const cls = di === 0 ? 'sun' : di === 6 ? 'sat' : ''
                return (
                  <div className={`cal-cell ${cls} ${k === todayKey ? 'today' : ''}`} key={di}>
                    <span className="cal-daynum">{date.getDate()}</span>
                    {items.slice(0, MAX_PER_CELL).map(c => (
                      <div
                        key={c.id}
                        className={`cal-item type-${c.type}`}
                        onClick={() => openItem(c)}
                        title={c.title}>
                        <span className="emoji">{TYPE_EMOJIS[c.type]}</span>
                        <span className="t">{c.title}</span>
                      </div>
                    ))}
                    {items.length > MAX_PER_CELL && (
                      <span className="cal-more" onClick={() => openItem(items[MAX_PER_CELL])}>
                        +{items.length - MAX_PER_CELL}개 더
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--subtext)', textAlign: 'center', marginTop: 16 }}>
        영화·드라마 정보 제공: TMDB · 웹툰/웹소설은 직접 큐레이션
      </p>

      {selected && (
        <div className="cal-modal-back" onClick={() => setSelected(null)}>
          <div className="cal-modal" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
            <button className="cal-modal-close" onClick={() => setSelected(null)}>×</button>
            <div className="cal-modal-top">
              <div style={{ width: 96, flexShrink: 0 }}>
                <Poster content={selected} showScore={false} />
              </div>
              <div className="cal-modal-info">
                <div className="cal-badges">
                  {selected.releaseDate && (
                    <span className="cal-badge dday">{ddayOf(selected.releaseDate).label}</span>
                  )}
                  <span className="cal-badge type">{TYPE_EMOJIS[selected.type]} {TYPE_LABELS[selected.type]}</span>
                  {selected.platform && <span className="cal-badge plat">{selected.platform}</span>}
                </div>
                <h2>{selected.title}</h2>
                {selected.releaseDate && (
                  <div className="cal-modal-date">
                    📅 {selected.releaseDate.replace(/-/g, '. ')} 공개 예정
                  </div>
                )}
                <p className="cal-modal-syn">{selected.synopsis || '아직 등록된 소개가 없어요.'}</p>
              </div>
            </div>
            <div className="cal-modal-actions">
              <button className={`cal-act ${bookmarked ? 'on' : ''}`} onClick={toggleAlarm}>
                <BookmarkIcon filled={bookmarked} />
                {bookmarked ? '알림 신청됨' : '찜하고 알림받기'}
              </button>
              <button className="cal-act primary" onClick={() => navigate(`/content/${selected.id}`)}>
                <CommentIcon /> 수다방 들어가기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
