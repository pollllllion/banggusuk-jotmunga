import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { ContentCard } from '@/components/content/ContentCard'
import { RegisterWatchedModal } from '@/components/content/RegisterWatchedModal'
import { Pager, usePageParam } from '@/components/ui/Pager'
import { CONTENT_TYPES, GENRES, TYPE_LABELS } from '@/utils/constants'
import { originOf, ORIGIN_FILTERS } from '@/utils/origin'
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

/** 연도 칩을 낱개로 세울 범위 — 올해 기준 위아래. 그보다 오래된 해는 직접 입력으로 넣는다.
 *  실측(2026-09-16): 2,419편 중 2026년이 896편이고 나머지 해는 대부분 10편 미만이라
 *  옛 연도를 전부 칩으로 세우면 칩만 수십 개 늘고 결과는 한두 편이다. */
const YEAR_SPAN_BACK = 5
const YEAR_SPAN_FWD = 1
/** 직접 입력으로 받을 수 있는 연도 범위 — 이 밖은 오타로 본다 */
const YEAR_MIN = 1900
const YEAR_MAX = 2100

const STATUS_FILTERS: { code: string; label: string }[] = [
  { code: 'upcoming', label: '공개 예정' },
  { code: 'ongoing', label: '공개 중' },
  { code: 'completed', label: '완결' },
]

/**
 * 상세 필터 한 줄 — 이름 + 칩들. 다섯 줄이 같은 모양을 쓴다.
 *
 * 칩은 **여러 개를 함께 고를 수 있다**(2026-09-16). 한 줄 안에서는 OR 이고
 * (넷플릭스 또는 티빙), 줄과 줄 사이는 AND 다(한국 작품 **이면서** 넷플릭스).
 * 하나만 고르게 하면 "넷플릭스랑 티빙 둘 다 보고 싶다"를 못 한다 — 그게 이 화면에서
 * 제일 흔한 요구다.
 */
function FilterRow({ label, values, options, onToggle, onClear, children }: {
  label: string
  values: string[]
  options: { code: string; label: string }[]
  onToggle: (code: string) => void
  onClear: () => void
  /** 줄 끝에 덧붙일 것(연도 직접 입력 등) */
  children?: React.ReactNode
}) {
  return (
    <div className="bf-row">
      <span className="bf-label">{label}</span>
      <div className="bf-chips">
        <button className={`filter-btn ${!values.length ? 'active' : ''}`} onClick={onClear}>전체</button>
        {options.map(o => (
          <button
            key={o.code}
            className={`filter-btn ${values.includes(o.code) ? 'active' : ''}`}
            onClick={() => onToggle(o.code)}
          >{o.label}</button>
        ))}
        {children}
      </div>
    </div>
  )
}

export function BrowsePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  /** 여러 개를 고를 수 있는 값은 주소에 쉼표로 붙는다 — ?type=movie,drama */
  const list = (key: string) => (searchParams.get(key) || '').split(',').filter(Boolean)
  const types = list('type')
  const genres = list('genre')
  const origins = list('origin')
  const years = list('year')
  const otts = list('ott')
  const statuses = list('status')
  const search = searchParams.get('search') || ''
  // 검색 중엔 사용자가 정렬을 직접 고르기 전까지 관련도 순(searchContents 결과 순서)을 유지한다.
  const sort = searchParams.get('sort') || (search ? 'relevance' : 'latest')

  const detailFiltered = Boolean(origins.length || years.length || otts.length || statuses.length)
  /** 상세 필터를 펼쳤나 — 하나라도 걸려 있으면 처음부터 펼친 채로 연다
   *  (주소로 들어온 사람이 왜 결과가 적은지 모른 채 보게 두지 않는다) */
  const [open, setOpen] = useState(detailFiltered)
  /** 없는 작품 등록 창 */
  const [registering, setRegistering] = useState(false)
  /** 연도 직접 입력칸 */
  const [yearInput, setYearInput] = useState('')

  /**
   * 필터·정렬을 바꾸면 **쪽 번호를 반드시 버린다.**
   * 30쪽을 보다가 장르를 고르면 결과가 2쪽뿐일 수 있는데, 그때 p=30 이 남아 있으면
   * (clamp 를 해도) 사용자는 자기가 왜 마지막 쪽에 있는지 알 수 없다. 처음부터 보여준다.
   */
  const setList = (key: string, values: string[]) => {
    const next = new URLSearchParams(searchParams)
    if (values.length) next.set(key, values.join(',')); else next.delete(key)
    if (key !== 'sort') next.delete('search')
    next.delete('p')
    setSearchParams(next)
  }
  const toggle = (key: string, value: string) => {
    const cur = list(key)
    setList(key, cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value])
  }
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value); else next.delete(key)
    next.delete('p')
    setSearchParams(next)
  }

  /** 걸린 필터를 한 번에 푼다 — 하나씩 '전체'로 되돌리면 여러 번 눌러야 한다 */
  const clearAll = () => {
    const next = new URLSearchParams()
    if (sort !== 'latest' && sort !== 'relevance') next.set('sort', sort)
    setSearchParams(next)
  }

  const all = DS.getContents().filter(c => !c.hidden)

  /** 연도 칩 — 최근 몇 해만 낱개로. 그보다 옛 해는 직접 입력으로 넣는다 */
  const thisYear = new Date().getFullYear()
  const yearsInData = new Set(all.map(c => c.releaseYear).filter((y): y is number => Boolean(y)))
  const yearOptions: { code: string; label: string }[] = []
  for (let y = thisYear + YEAR_SPAN_FWD; y >= thisYear - YEAR_SPAN_BACK; y--) {
    if (yearsInData.has(y)) yearOptions.push({ code: String(y), label: `${y}` })
  }
  // 직접 입력해 고른 옛 연도도 칩으로 세운다 — 안 그러면 고른 걸 이 줄에서 못 뺀다
  for (const y of years) {
    if (!yearOptions.some(o => o.code === y)) yearOptions.push({ code: y, label: y })
  }

  const addYear = () => {
    const n = Number(yearInput.trim())
    if (!Number.isInteger(n) || n < YEAR_MIN || n > YEAR_MAX) return
    const y = String(n)
    if (!years.includes(y)) setList('year', [...years, y])
    setYearInput('')
  }

  const ottOptions = [
    { code: THEATER_FILTER, label: '극장' },
    ...CALENDAR_OTT_FILTERS.map(o => ({ code: o.name, label: o.label })),
    { code: OTHER_FILTER, label: '기타' },
  ]

  /**
   * 한 작품이 지금 걸린 필터를 전부 통과하는가.
   * 한 줄 안은 OR(고른 것 중 아무거나), 줄과 줄 사이는 AND(전부 만족).
   */
  const passes = (c: Content) => {
    if (types.length && !types.includes(c.type)) return false
    if (genres.length && !genres.some(g => c.genres.includes(g))) return false
    if (origins.length && !origins.includes(originOf(c))) return false
    if (statuses.length && !statuses.includes(c.status || '')) return false
    if (years.length && !years.includes(String(c.releaseYear ?? ''))) return false
    if (otts.length && !otts.some(o =>
      o === THEATER_FILTER ? isTheatricalRelease(c)
        : o === OTHER_FILTER ? hasMinorProvider(c)
          : hasProvider(c, o))) return false
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

  /** 지금 걸린 필터를 한 줄로 — 누르면 그 값 하나만 풀린다 */
  const activeChips: { key: string; code: string; label: string }[] = [
    ...types.map(v => ({ key: 'type', code: v, label: TYPE_LABELS[v] || v })),
    ...origins.map(v => ({ key: 'origin', code: v, label: ORIGIN_FILTERS.find(o => o.code === v)?.label || v })),
    ...years.map(v => ({ key: 'year', code: v, label: `${v}년` })),
    ...statuses.map(v => ({ key: 'status', code: v, label: STATUS_FILTERS.find(s => s.code === v)?.label || v })),
    ...otts.map(v => ({ key: 'ott', code: v, label: ottOptions.find(o => o.code === v)?.label || v })),
    ...genres.map(v => ({ key: 'genre', code: v, label: v })),
  ]

  const typeLabel = types.length === 1 ? TYPE_LABELS[types[0]] : undefined
  const genreLabel = genres.length === 1 ? genres[0] : undefined
  const seoTitle = search ? `"${search}" 검색 결과`
    : typeLabel ? `${typeLabel}${genreLabel ? ` · ${genreLabel}` : ''} 전체보기`
    : genreLabel ? `${genreLabel} 작품 모아보기`
    : '작품 둘러보기'
  // 색인시킬 주소는 종류·장르를 **하나씩만** 고른 경우까지 — 여러 개를 조합하면 같은 목록이
  // 수백 개 주소로 갈라져 크롤 예산만 먹는다(중복 콘텐츠).
  const canonicalQuery = new URLSearchParams()
  if (typeLabel) canonicalQuery.set('type', types[0])
  if (genreLabel) canonicalQuery.set('genre', genres[0])
  const canonicalPath = `/browse${canonicalQuery.toString() ? `?${canonicalQuery}` : ''}`
  const multiPicked = types.length > 1 || genres.length > 1

  return (
    <>
      <Seo
        path={canonicalPath}
        title={seoTitle}
        description={`${seoTitle} — 공개일·평점·별점을 한 곳에서. 넷플릭스·디즈니+·티빙·웨이브 등 OTT 작품과 극장 개봉작, 웹툰·웹소설까지 ${contents.length}편을 모아봤습니다.`}
        noindex={!!search || detailFiltered || multiPicked}
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
        <button className={`filter-btn ${!types.length ? 'active' : ''}`} onClick={() => setList('type', [])}>전체</button>
        {CONTENT_TYPES.map(t => (
          <button key={t.code} className={`filter-btn ${types.includes(t.code) ? 'active' : ''}`} onClick={() => toggle('type', t.code)}>
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
        {/* 찾다가 없으면 그 자리에서 등록한다 — 없다는 걸 알게 된 자리가 곧 넣는 자리다 */}
        <button className="bf-add" onClick={() => setRegistering(true)}>＋ 없는 작품 등록</button>
        {activeChips.length > 0 && (
          <div className="bf-active">
            {activeChips.map(a => (
              <button key={`${a.key}-${a.code}`} className="bf-active-chip" onClick={() => toggle(a.key, a.code)}>
                {a.label} <span aria-hidden>✕</span>
              </button>
            ))}
            <button className="bf-clear" onClick={clearAll}>전체 해제</button>
          </div>
        )}
      </div>

      {open && (
        <div className="bf-panel">
          <FilterRow
            label="제작" values={origins} onClear={() => setList('origin', [])}
            options={ORIGIN_FILTERS.map(o => ({ code: o.code, label: o.label }))}
            onToggle={v => toggle('origin', v)}
          />
          <FilterRow
            label="공개연도" values={years} onClear={() => setList('year', [])}
            options={yearOptions} onToggle={v => toggle('year', v)}
          >
            {/* 옛 연도는 칩으로 다 세울 수 없다(1992년까지 있다) — 직접 친다 */}
            <span className="bf-yearin">
              <input
                type="number" inputMode="numeric" className="bf-yearin-input"
                placeholder="연도" value={yearInput} min={YEAR_MIN} max={YEAR_MAX}
                onChange={e => setYearInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addYear() }}
                aria-label="공개연도 직접 입력"
              />
              <button className="bf-yearin-add" onClick={addYear} disabled={!yearInput.trim()}>추가</button>
            </span>
          </FilterRow>
          <FilterRow
            label="상태" values={statuses} onClear={() => setList('status', [])}
            options={STATUS_FILTERS} onToggle={v => toggle('status', v)}
          />
          <FilterRow
            label="OTT" values={otts} onClear={() => setList('ott', [])}
            options={ottOptions} onToggle={v => toggle('ott', v)}
          />
          <FilterRow
            label="장르" values={genres} onClear={() => setList('genre', [])}
            options={GENRES.map(g => ({ code: g, label: g }))} onToggle={v => toggle('genre', v)}
          />
        </div>
      )}

      {!contents.length ? (
        <div className="empty-state fade-in">
          <p>조건에 맞는 작품이 없습니다.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            {activeChips.length > 0 && (
              <button className="btn btn-secondary btn-small" onClick={clearAll}>필터 전체 해제</button>
            )}
            <button className="btn btn-primary btn-small" onClick={() => setRegistering(true)}>＋ 없는 작품 등록</button>
          </div>
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

      {/* 등록하면 그 작품방으로 데려간다 — 넣어 놓고 어디 갔는지 찾게 두지 않는다 */}
      {registering && (
        <RegisterWatchedModal
          mode="catalog"
          onClose={() => setRegistering(false)}
          onRegistered={(c: Content) => navigate(`/content/${c.id}`)}
        />
      )}
    </>
  )
}
