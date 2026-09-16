import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { ContentCard } from '@/components/content/ContentCard'
import { Pager, usePageParam } from '@/components/ui/Pager'
import { CONTENT_TYPES, GENRES, TYPE_LABELS } from '@/utils/constants'
import { originOf, ORIGIN_FILTERS, type Origin } from '@/utils/origin'
import { CALENDAR_OTT_FILTERS, OTHER_FILTER, THEATER_FILTER, hasProvider, hasMinorProvider, isTheatricalRelease } from '@/utils/ott'
import { Seo } from '@/components/seo/Seo'
import type { Content, ContentType } from '@/types'

/**
 * 한 쪽에 보여줄 작품 수.
 *
 * 예전엔 필터 없이 들어오면 2,221개를 한 번에 그렸다. 그러면
 *   DOM 노드 약 17,800개(크롬 권장 ~1,500)
 *   포스터 이미지 요청 2,201건 ≈ 170MB   ← Poster 가 CSS background-image 라
 *                                          <img loading="lazy"> 같은 지연 로딩이 없다.
 *                                          화면 밖 카드의 이미지까지 전부 받는다.
 *   동시 CSS 애니메이션 2,221개
 * 40개면 이 셋이 전부 50배 넘게 줄고, 그리드가 대부분의 폭에서 딱 떨어진다.
 */
const PER_PAGE = 40

/** 연도 칩을 낱개로 세울 범위 — 올해 기준 위아래. 그보다 오래된 것은 한 칸('그 이전')에 묶는다.
 *  실측(2026-09-16): 2,419편 중 2026년이 896편이고 나머지 해는 대부분 10편 미만이라
 *  옛 연도를 낱개로 세우면 칩만 수십 개 늘고 결과는 한두 편이다. */
const YEAR_SPAN_BACK = 5
const YEAR_SPAN_FWD = 1
const OLD_YEARS = '__old__'

const STATUS_FILTERS: { code: string; label: string }[] = [
  { code: 'upcoming', label: '공개 예정' },
  { code: 'ongoing', label: '공개 중' },
  { code: 'completed', label: '완결' },
]

/** 상세 필터 한 줄 — 이름 + 칩들. 다섯 줄이 같은 모양을 쓴다 */
function FilterRow({ label, value, options, onPick }: {
  label: string
  value: string
  options: { code: string; label: string }[]
  onPick: (code: string) => void
}) {
  return (
    <div className="bf-row">
      <span className="bf-label">{label}</span>
      <div className="bf-chips">
        <button className={`filter-btn ${!value ? 'active' : ''}`} onClick={() => onPick('')}>전체</button>
        {options.map(o => (
          <button
            key={o.code}
            className={`filter-btn ${value === o.code ? 'active' : ''}`}
            onClick={() => onPick(o.code)}
          >{o.label}</button>
        ))}
      </div>
    </div>
  )
}

export function BrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const type = searchParams.get('type') || ''
  const genre = searchParams.get('genre') || ''
  const origin = searchParams.get('origin') || ''
  const year = searchParams.get('year') || ''
  const ott = searchParams.get('ott') || ''
  const status = searchParams.get('status') || ''
  const search = searchParams.get('search') || ''
  // 검색 중엔 사용자가 정렬을 직접 고르기 전까지 관련도 순(searchContents 결과 순서)을 유지한다.
  const sort = searchParams.get('sort') || (search ? 'relevance' : 'latest')

  /** 상세 필터를 펼쳤나 — 하나라도 걸려 있으면 처음부터 펼친 채로 연다
   *  (주소로 들어온 사람이 왜 결과가 적은지 모른 채 보게 두지 않는다) */
  const [open, setOpen] = useState(Boolean(origin || year || ott || status))

  /**
   * 필터·정렬을 바꾸면 **쪽 번호를 반드시 버린다.**
   * 30쪽을 보다가 장르를 고르면 결과가 2쪽뿐일 수 있는데, 그때 p=30 이 남아 있으면
   * (clamp 를 해도) 사용자는 자기가 왜 마지막 쪽에 있는지 알 수 없다. 처음부터 보여준다.
   */
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'sort') next.delete('search')
    next.delete('p')
    setSearchParams(next)
  }

  /** 걸린 필터를 한 번에 푼다 — 하나씩 '전체'로 되돌리면 네 번 눌러야 한다 */
  const clearAll = () => {
    const next = new URLSearchParams()
    if (sort !== 'latest' && sort !== 'relevance') next.set('sort', sort)
    setSearchParams(next)
  }

  const all = DS.getContents().filter(c => !c.hidden)

  /** 연도 칩 — 데이터에 실제로 있는 해만 세운다(빈 칩을 내놓지 않는다) */
  const yearsInData = new Set(all.map(c => c.releaseYear).filter((y): y is number => Boolean(y)))
  const thisYear = new Date().getFullYear()
  const yearOptions: { code: string; label: string }[] = []
  for (let y = thisYear + YEAR_SPAN_FWD; y >= thisYear - YEAR_SPAN_BACK; y--) {
    if (yearsInData.has(y)) yearOptions.push({ code: String(y), label: `${y}` })
  }
  // 낱개 칩의 마지막 해가 thisYear - YEAR_SPAN_BACK 이므로 묶음은 그보다 한 해 앞이다.
  // (라벨에 경계 연도를 그대로 쓰면 그 해가 어느 쪽인지 알 수 없다)
  const oldestShown = thisYear - YEAR_SPAN_BACK
  if ([...yearsInData].some(y => y < oldestShown)) {
    yearOptions.push({ code: OLD_YEARS, label: `${oldestShown - 1}년 이전` })
  }

  const ottOptions = [
    { code: THEATER_FILTER, label: '극장' },
    ...CALENDAR_OTT_FILTERS.map(o => ({ code: o.name, label: o.label })),
    { code: OTHER_FILTER, label: '기타' },
  ]

  /** 한 작품이 지금 걸린 필터를 전부 통과하는가 */
  const passes = (c: Content) => {
    if (type && c.type !== (type as ContentType)) return false
    if (genre && !c.genres.includes(genre)) return false
    if (origin && originOf(c) !== (origin as Origin)) return false
    if (status && c.status !== status) return false
    if (year) {
      if (!c.releaseYear) return false
      if (year === OLD_YEARS) { if (c.releaseYear >= oldestShown) return false }
      else if (String(c.releaseYear) !== year) return false
    }
    if (ott) {
      if (ott === THEATER_FILTER) { if (!isTheatricalRelease(c)) return false }
      else if (ott === OTHER_FILTER) { if (!hasMinorProvider(c)) return false }
      else if (!hasProvider(c, ott)) return false
    }
    return true
  }

  let contents = (search ? DS.searchContents(search, Infinity) : all).filter(passes)

  if (sort === 'top') contents = [...contents].sort((a, b) => b.avgRating - a.avgRating)
  else if (sort === 'reviews') contents = [...contents].sort((a, b) => b.reviewCount - a.reviewCount)
  else if (sort === 'year') contents = [...contents].sort((a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0))
  else if (sort !== 'relevance') contents = [...contents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const totalPages = Math.max(1, Math.ceil(contents.length / PER_PAGE))
  const { page, goPage } = usePageParam(searchParams, setSearchParams, totalPages)
  const pageItems = contents.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  /** 지금 걸린 필터를 한 줄로 — 누르면 그것만 풀린다 */
  const activeChips: { key: string; label: string }[] = []
  if (type) activeChips.push({ key: 'type', label: TYPE_LABELS[type] || type })
  if (origin) activeChips.push({ key: 'origin', label: ORIGIN_FILTERS.find(o => o.code === origin)?.label || origin })
  if (year) activeChips.push({ key: 'year', label: yearOptions.find(o => o.code === year)?.label || year })
  if (status) activeChips.push({ key: 'status', label: STATUS_FILTERS.find(s => s.code === status)?.label || status })
  if (ott) activeChips.push({ key: 'ott', label: ottOptions.find(o => o.code === ott)?.label || ott })
  if (genre) activeChips.push({ key: 'genre', label: genre })

  const typeLabel = TYPE_LABELS[type]
  const seoTitle = search ? `"${search}" 검색 결과`
    : typeLabel ? `${typeLabel}${genre ? ` · ${genre}` : ''} 전체보기`
    : genre ? `${genre} 작품 모아보기`
    : '작품 둘러보기'
  // 색인시킬 주소는 종류·장르 조합까지만 — 연도·OTT·제작국까지 조합하면 같은 목록이
  // 수백 개 주소로 갈라져 크롤 예산만 먹는다(중복 콘텐츠).
  const canonicalQuery = new URLSearchParams()
  if (type) canonicalQuery.set('type', type)
  if (genre) canonicalQuery.set('genre', genre)
  const canonicalPath = `/browse${canonicalQuery.toString() ? `?${canonicalQuery}` : ''}`
  const detailFiltered = Boolean(origin || year || ott || status)

  return (
    <>
      <Seo
        path={canonicalPath}
        title={seoTitle}
        description={`${seoTitle} — 공개일·평점·별점을 한 곳에서. 넷플릭스·디즈니+·티빙·웨이브 등 OTT 작품과 극장 개봉작, 웹툰·웹소설까지 ${contents.length}편을 모아봤습니다.`}
        noindex={!!search || detailFiltered}
      />
      <div className="feed-header">
        <h2 className="feed-title">{search ? `"${search}" 검색 결과` : '작품 둘러보기'}</h2>
        <div className="feed-sort">
          <button className={sort === 'latest' ? 'active' : ''} onClick={() => setParam('sort', 'latest')}>최신</button>
          <button className={sort === 'year' ? 'active' : ''} onClick={() => setParam('sort', 'year')}>공개연도</button>
          <button className={sort === 'top' ? 'active' : ''} onClick={() => setParam('sort', 'top')}>평점순</button>
          <button className={sort === 'reviews' ? 'active' : ''} onClick={() => setParam('sort', 'reviews')}>리뷰순</button>
        </div>
      </div>

      {/* 종류 — 늘 보인다. 여기서 고르는 사람이 가장 많다 */}
      <div className="filter-bar">
        <button className={`filter-btn ${!type ? 'active' : ''}`} onClick={() => setParam('type', '')}>전체</button>
        {CONTENT_TYPES.map(t => (
          <button key={t.code} className={`filter-btn ${type === t.code ? 'active' : ''}`} onClick={() => setParam('type', t.code)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 상세 필터 ────────────────────────────────────────
          기본은 접어 둔다. 여섯 줄을 한꺼번에 펴 놓으면 목록이 화면 밖으로 밀려
          "작품을 보러 온 화면"이 "필터를 고르는 화면"이 된다.
          걸린 필터는 접어 둔 동안에도 아래 요약 줄에 남아 눈에 보인다. */}
      <div className="bf-head">
        <button className={`bf-toggle ${open ? 'on' : ''}`} onClick={() => setOpen(v => !v)}>
          상세 필터 <span className="bf-caret" aria-hidden>{open ? '⌃' : '⌄'}</span>
        </button>
        {activeChips.length > 0 && (
          <div className="bf-active">
            {activeChips.map(a => (
              <button key={a.key} className="bf-active-chip" onClick={() => setParam(a.key, '')}>
                {a.label} <span aria-hidden>✕</span>
              </button>
            ))}
            <button className="bf-clear" onClick={clearAll}>전체 해제</button>
          </div>
        )}
      </div>

      {open && (
        <div className="bf-panel">
          <FilterRow label="제작" value={origin} options={ORIGIN_FILTERS.map(o => ({ code: o.code, label: o.label }))} onPick={v => setParam('origin', v)} />
          {yearOptions.length > 0 && (
            <FilterRow label="공개연도" value={year} options={yearOptions} onPick={v => setParam('year', v)} />
          )}
          <FilterRow label="상태" value={status} options={STATUS_FILTERS} onPick={v => setParam('status', v)} />
          <FilterRow label="OTT" value={ott} options={ottOptions} onPick={v => setParam('ott', v)} />
          <FilterRow label="장르" value={genre} options={GENRES.map(g => ({ code: g, label: g }))} onPick={v => setParam('genre', v)} />
        </div>
      )}

      {!contents.length ? (
        <div className="empty-state fade-in">
          <p>조건에 맞는 작품이 없습니다.</p>
          {activeChips.length > 0 && (
            <button className="btn btn-secondary btn-small" style={{ marginTop: 12 }} onClick={clearAll}>필터 전체 해제</button>
          )}
        </div>
      ) : (
        <>
          <p className="browse-count">
            총 {contents.length.toLocaleString()}편
            {totalPages > 1 && <> · {page}/{totalPages} 쪽</>}
          </p>
          <div className="content-grid">
            {pageItems.map(c => <ContentCard key={c.id} content={c} />)}
          </div>
          <Pager page={page} total={totalPages} onGo={goPage} />
        </>
      )}
    </>
  )
}
