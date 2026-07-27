import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import { Poster } from '@/components/content/Poster'
import { ContentInfo } from '@/components/content/ContentInfo'
import { BookmarkIcon, CommentIcon } from '@/components/ui/Icons'
import { TYPE_LABELS, TYPE_EMOJIS } from '@/utils/constants'
import { getAirPattern } from '@/utils/airPattern'
import {
  effectiveReleaseDate, isUpcoming, providersOf, providerLogoUrl,
  OTT_FILTERS, hasProvider, releaseSourceLabel, platformSortRank,
} from '@/utils/ott'
import type { Content, ContentType, ContentProvider } from '@/types'
import { Seo } from '@/components/seo/Seo'
import { SITE_NAME, SITE_URL } from '@/utils/seo'
import '@/styles/calendar.css'

/** 홈(캘린더) 구조화 데이터 — 검색결과에 사이트명·검색창을 노출시키기 위한 것 */
const WEBSITE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: 'ko-KR',
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/browse?search={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const FILTERS: { code: ContentType | 'all'; label: string }[] = [
  { code: 'all', label: '작품전체' },
  { code: 'movie', label: '영화' },
  { code: 'drama', label: '드라마·예능' },
  { code: 'webtoon', label: '웹툰' },
  { code: 'webnovel', label: '웹소설' },
]

const MAX_PER_CELL = 3
const MAX_LOGOS = 3

/** 로컬 기준 YYYY-MM-DD 키 (타임존 시프트 방지) */
function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 'YYYY-MM-DD' → 'YYYY. MM. DD (요일)' */
function fmtDateKo(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return `${d.replace(/-/g, '. ')} (${WEEKDAYS[dt.getDay()]})`
}

function ddayOf(release: string): { label: string; over: boolean } {
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const r = new Date(release + 'T00:00:00')
  const diff = Math.round((r.getTime() - t.getTime()) / 86400000)
  if (diff > 0) return { label: `D-${diff}`, over: false }
  if (diff === 0) return { label: 'D-DAY', over: false }
  return { label: '공개됨', over: true }
}

/** OTT 로고 묶음 — 최대 3개 + N */
function ProviderLogos({ providers, size = 20 }: { providers: ContentProvider[]; size?: number }) {
  if (!providers.length) return null
  const shown = providers.slice(0, MAX_LOGOS)
  const rest = providers.length - shown.length
  return (
    <span className="ott-logos">
      {shown.map(p => {
        const url = providerLogoUrl(p.logoPath, p.providerName)
        return url
          ? <img key={p.providerId} className="ott-logo" src={url} alt={p.providerName} title={p.providerName} style={{ width: size, height: size }} />
          : <span key={p.providerId} className="ott-logo ott-logo-text" title={p.providerName} style={{ width: size, height: size }}>{p.providerName.slice(0, 1)}</span>
      })}
      {rest > 0 && <span className="ott-more">+{rest}</span>}
    </span>
  )
}

export function CalendarPage() {
  const navigate = useNavigate()
  const { user, isAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)

  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [filter, setFilter] = useState<ContentType | 'all'>('all')
  const [ott, setOtt] = useState<string>('all')
  const [selected, setSelected] = useState<Content | null>(null)
  const [bookmarked, setBookmarked] = useState(false)
  const [dayList, setDayList] = useState<{ key: string; items: Content[] } | null>(null)
  const [airPattern, setAirPattern] = useState<string | null>(null)

  // 선택된 작품의 공개 패턴(매주 수목/한번에 등)을 TMDB 회차 데이터로 조회. alive 로 경쟁 조건 방지.
  useEffect(() => {
    setAirPattern(null)
    if (!selected || selected.releasePattern) return // 수동 입력이 있으면 자동 조회 불필요
    let alive = true
    getAirPattern(selected.id).then(p => { if (alive) setAirPattern(p) })
    return () => { alive = false }
  }, [selected])

  const todayKey = keyOf(now)

  // 최종 공개일(수동 우선) 기준으로 날짜별 그룹핑 + 필터. 같은 날짜는 화제도 내림차순.
  const byDate = useMemo(() => {
    const map: Record<string, Content[]> = {}
    for (const c of DS.getContents()) {
      if (c.hidden) continue
      const date = effectiveReleaseDate(c)
      if (!date) continue
      // '드라마·예능' 필터는 drama·variety 둘 다 포함
      if (filter !== 'all') {
        const match = filter === 'drama' ? (c.type === 'drama' || c.type === 'variety') : c.type === filter
        if (!match) continue
      }
      if (ott !== 'all' && !hasProvider(c, ott)) continue
      ;(map[date] ||= []).push(c)
    }
    // 플랫폼 순서(넷플릭스→티빙→디즈니→극장→웨이브) 우선, 동일 플랫폼은 화제도 내림차순
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const ra = platformSortRank(a), rb = platformSortRank(b)
        if (ra !== rb) return ra - rb
        return (b.popularity || 0) - (a.popularity || 0)
      })
    }
    return map
  }, [filter, ott, todayKey])

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
    if (!isAccount) { toast('찜·공개알림은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    setBookmarked(DS.toggleBookmark(user.id, selected.id))
  }

  const selDate = selected ? effectiveReleaseDate(selected) : null
  const selProviders = selected ? providersOf(selected) : []
  const selSource = selected ? releaseSourceLabel(selected.releaseDateSource) : null

  return (
    <div className="cal-wrap">
      <Seo path="/" jsonLd={WEBSITE_JSONLD} />
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
        {user?.role === 'admin' && (
          <button className="cal-today-btn" style={{ marginLeft: 'auto' }}
            onClick={() => navigate('/admin', { state: { newContent: true } })}>+ 신작 등록</button>
        )}
      </div>

      {/* 작품 타입 필터 */}
      <div className="cal-subfilters">
        <div className="cal-filters">
          {FILTERS.map(f => (
            <button
              key={f.code}
              className={`cal-chip sm ${filter === f.code ? 'active' : ''}`}
              onClick={() => setFilter(f.code)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* OTT 필터 */}
      <div className="cal-subfilters">
        <div className="cal-filters cal-ott-filters">
          <button className={`cal-chip sm ${ott === 'all' ? 'active' : ''}`} onClick={() => setOtt('all')}>OTT 전체</button>
          {OTT_FILTERS.map(o => (
            <button key={o.name} className={`cal-chip sm ${ott === o.name ? 'active' : ''}`} onClick={() => setOtt(o.name)}>{o.label}</button>
          ))}
        </div>
      </div>

      {monthCount === 0 ? (
        <div className="cal-grid"><div className="cal-empty">이 달에는 조건에 맞는 공개작이 없어요. 다른 달·필터를 확인해보세요.</div></div>
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
                  <div
                    className={`cal-cell ${cls} ${k === todayKey ? 'today' : ''} ${items.length ? 'has-items' : ''}`}
                    key={di}
                    onClick={() => items.length && setDayList({ key: k, items })}
                    title={items.length ? `${date.getMonth() + 1}.${date.getDate()} 공개 ${items.length}편 보기` : undefined}>
                    <span className="cal-daynum">{date.getDate()}</span>
                    {items.slice(0, MAX_PER_CELL).map(c => {
                      const provs = providersOf(c)
                      return (
                        <div
                          key={c.id}
                          className={`cal-item type-${c.type}`}
                          onClick={e => { e.stopPropagation(); openItem(c) }}
                          title={c.title}>
                          {provs.length > 0
                            ? <ProviderLogos providers={provs.slice(0, 1)} size={14} />
                            : <span className="emoji">{TYPE_EMOJIS[c.type]}</span>}
                          <span className="t">{c.title}</span>
                        </div>
                      )
                    })}
                    {items.length > MAX_PER_CELL && (
                      <span className="cal-more" onClick={e => { e.stopPropagation(); setDayList({ key: k, items }) }}>
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

      <p className="cal-attribution">
        영화·드라마 정보 및 OTT 제공 여부: <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">TMDB</a> · OTT 제공 정보 <a href="https://www.justwatch.com/" target="_blank" rel="noreferrer">JustWatch</a> 제공 · 웹툰/웹소설은 직접 큐레이션<br />
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>

      {dayList && (
        <div className="cal-modal-back" onClick={() => setDayList(null)}>
          <div className="cal-daylist" onClick={e => e.stopPropagation()}>
            <button className="cal-modal-close" onClick={() => setDayList(null)}>×</button>
            <h3 className="cal-daylist-title">
              📅 {dayList.key.replace(/-/g, '. ')}
              <span className="cal-daylist-count">공개 {dayList.items.length}개</span>
            </h3>
            <div className="cal-daylist-items">
              {dayList.items.map(c => {
                const provs = providersOf(c)
                return (
                  <button
                    key={c.id}
                    className={`cal-daylist-item type-${c.type}`}
                    onClick={() => { setDayList(null); openItem(c) }}>
                    {provs.length > 0
                      ? <ProviderLogos providers={provs.slice(0, 3)} size={18} />
                      : <span className="emoji">{TYPE_EMOJIS[c.type]}</span>}
                    <span className="cal-daylist-t">{c.title}</span>
                    <span className="cal-daylist-type">{TYPE_LABELS[c.type]}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

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
                  {selDate && (
                    <span className="cal-badge dday">{ddayOf(selDate).label}</span>
                  )}
                  {selDate && isUpcoming(selected, todayKey) && (
                    <span className="cal-badge upcoming">공개 예정</span>
                  )}
                  <span className="cal-badge type">{TYPE_EMOJIS[selected.type]} {TYPE_LABELS[selected.type]}</span>
                  {selected.releaseDateSource === 'kr_ott_post_theatrical' && (
                    <span className="cal-badge ott-release">극장 개봉작 · OTT 공개</span>
                  )}
                  {selProviders.length === 0 && selected.platform && <span className="cal-badge plat">{selected.platform}</span>}
                </div>
                <h2>{selected.title}</h2>
                {selProviders.length > 0 && (
                  <div className="cal-modal-ott">
                    <ProviderLogos providers={selProviders} size={26} />
                  </div>
                )}
                {selDate && (
                  <div className="cal-modal-date">
                    📅 {fmtDateKo(selDate)} {isUpcoming(selected, todayKey) ? '공개 예정' : '공개'}
                    {selSource && <span className="cal-src"> · {selSource}</span>}
                  </div>
                )}
                {(selected.releasePattern || airPattern) && <div className="cal-modal-pattern">📺 {selected.releasePattern || airPattern}</div>}
              </div>
            </div>

            {/* 상세 정보 (네이버 검색 스타일) */}
            <div className="cal-detail">
              <ContentInfo content={selected} />
              <p className="cal-modal-syn">{selected.synopsis || '아직 등록된 소개가 없어요.'}</p>
            </div>
            <div className="cal-modal-actions">
              <button className={`cal-act ${bookmarked ? 'on' : ''}`} onClick={toggleAlarm}>
                <BookmarkIcon filled={bookmarked} />
                {bookmarked ? '알림 신청됨' : '찜하고 알림받기'}
              </button>
              <button className="cal-act primary" onClick={() => navigate(`/content/${selected.id}`)}>
                <CommentIcon /> 작품방 들어가기
              </button>
            </div>
            {user?.role === 'admin' && (
              <button className="cal-admin-edit" onClick={() => navigate('/admin', { state: { editContentId: selected.id } })}>
                ✏️ 관리자 · 이 작품 정보 수정
              </button>
            )}
            {selProviders.length > 0 && (
              <p className="cal-modal-just">OTT 제공 정보: JustWatch · 실제 국내 공개일과 다를 수 있어요.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
