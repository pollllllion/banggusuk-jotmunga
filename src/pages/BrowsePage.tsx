import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { ContentCard } from '@/components/content/ContentCard'
import { RegisterWatchedModal } from '@/components/content/RegisterWatchedModal'
import { Pager, usePageParam } from '@/components/ui/Pager'
import { CONTENT_TYPES, TYPE_LABELS } from '@/utils/constants'
import { BROWSE_GENRES, matchesGenres } from '@/utils/genres'
import { originOf, ORIGIN_FILTERS } from '@/utils/origin'
import { CALENDAR_OTT_FILTERS, OTHER_FILTER, THEATER_FILTER, hasProvider, hasMinorProvider, isTheatricalRelease } from '@/utils/ott'
import { Seo } from '@/components/seo/Seo'
import { SearchIcon } from '@/components/ui/Icons'
import { useToastStore } from '@/components/ui/Toast'
import { useTmdbFallback, ensureFromTmdb, type TmdbHit } from '@/hooks/useTmdbFallback'
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
  const toast = useToastStore(st => st.show)
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
  // 기본은 평점순. ('최신'은 우리 표에 등록된 차례(createdAt)라 보는 사람에게 뜻이 없어
  //  버튼과 기본에서 둘 다 내렸다. ?sort=latest 옛 링크는 아래 정렬이 그대로 받는다.)
  const sort = searchParams.get('sort') || (search ? 'relevance' : 'top')

  const detailFiltered = Boolean(origins.length || years.length || otts.length || statuses.length)
  /** 상세 필터를 펼쳤나 — 하나라도 걸려 있으면 처음부터 펼친 채로 연다
   *  (주소로 들어온 사람이 왜 결과가 적은지 모른 채 보게 두지 않는다) */
  const [open, setOpen] = useState(detailFiltered)
  /** 없는 작품 등록 창 */
  const [registering, setRegistering] = useState(false)
  /** 연도 직접 입력칸 */
  const [yearInput, setYearInput] = useState('')
  /**
   * 작품 검색칸 — 이 화면 안에서 찾는다.
   *
   * ?search= 는 예전부터 있었지만 헤더 통합검색·통합검색 화면에서 넘어올 때만 붙었다.
   * 정작 목록을 보다가 "그 작품 어딨지" 할 때 칠 곳이 이 화면에 없었다.
   * 입력칸은 로컬 상태로 두고 주소는 replace 로 따라 붙인다 —
   * 글자마다 push 하면 뒤로가기가 타이핑 기록으로 가득 찬다.
   */
  const [q, setQ] = useState(search)
  // 주소의 검색어가 밖에서 바뀌면(통합검색에서 들어옴 · 뒤로가기 · 필터가 검색을 지움) 칸도 따라간다
  useEffect(() => { setQ(search) }, [search])

  /** 좁은 화면에서 검색칸을 펼쳤나 — 넓은 화면에서는 늘 펼쳐져 있다(CSS) */
  const [searchOpen, setSearchOpen] = useState(!!search)

  /**
   * 우리 표에 **아직 없는 작품**도 보여준다 — 헤더 통합검색과 같은 TMDB 폴백이다.
   * 여기가 없으면 옛 영화·옛 시즌을 찾을 때 "조건에 맞는 작품이 없습니다" 로 끝났다.
   * 누르면 그 작품만 우리 표에 만들고 작품방으로 데려간다.
   */
  const { hits: tmdbHits, loading: tmdbLoading } = useTmdbFallback(search, 12)
  const [adding, setAdding] = useState(false)
  const addTmdb = async (hit: TmdbHit) => {
    if (adding) return
    setAdding(true)
    try { navigate(`/content/${(await ensureFromTmdb(hit)).id}`) }
    catch (e: any) { toast(e?.message || '작품을 불러오지 못했어요.') }
    finally { setAdding(false) }
  }

  /**
   * 검색칸에서 ↓ 를 누르면 결과 카드로 내려가고, 카드 사이는 화살표로 다닌다(Enter 로 연다).
   * 결과가 드롭다운이 아니라 격자라, 줄 수를 세지 않고 **화면 위치**로 위·아래 카드를 찾는다 —
   * 우리 작품 격자와 TMDB 격자가 따로라 마지막 줄이 덜 찬 채로 이어지기 때문이다.
   */
  const searchInputRef = useRef<HTMLInputElement>(null)
  const resultCards = () => Array.from(document.querySelectorAll<HTMLElement>('.content-grid .content-card, .content-grid .tmdb-card:not(:disabled)'))
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown') return
    const first = resultCards()[0]
    if (first) { e.preventDefault(); first.focus() }
  }
  const onGridKey = (e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
    const cards = resultCards()
    const i = cards.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    e.preventDefault()
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      cards[i + (e.key === 'ArrowRight' ? 1 : -1)]?.focus()
      return
    }
    const cur = cards[i].getBoundingClientRect()
    const down = e.key === 'ArrowDown'
    // 같은 줄이 아닌 것 중 가장 가까운 줄 → 그 줄에서 가로로 가장 가까운 카드
    const rows = cards.map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => (down ? r.top > cur.top + 1 : r.top < cur.top - 1))
    if (!rows.length) { if (!down) searchInputRef.current?.focus(); return }
    const rowTop = down ? Math.min(...rows.map(x => x.r.top)) : Math.max(...rows.map(x => x.r.top))
    rows.filter(x => Math.abs(x.r.top - rowTop) < 1)
      .sort((a, b) => Math.abs(a.r.left - cur.left) - Math.abs(b.r.left - cur.left))[0]?.el.focus()
  }

  const runSearch = (value: string) => {
    setQ(value)
    const next = new URLSearchParams(searchParams)
    if (value.trim()) next.set('search', value.trim()); else next.delete('search')
    next.delete('p')   // 검색어가 바뀌면 결과가 통째로 달라진다 → 1쪽부터
    setSearchParams(next, { replace: true })
  }

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
    if (sort !== 'top' && sort !== 'relevance') next.set('sort', sort)
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
    // 정확일치가 아니라 정규화 후 비교다 — TMDB 의 `SF·판타지`·`액션·모험` 을
    // 'SF'·'액션' 으로도 찾을 수 있어야 한다 (utils/genres.ts)
    if (!matchesGenres(c, genres)) return false
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

  // 평점순 — 별점이 달린 작품은 2,421편 중 33편뿐이라, 동점(0점) 뒤가 아무 차례나 되면
  // 첫 화면이 무작위로 보인다. 리뷰 수 → 공개연도로 한 번 더 갈라 준다.
  if (sort === 'top') contents = [...contents].sort((a, b) =>
    b.avgRating - a.avgRating ||
    (b.reviewCount ?? 0) - (a.reviewCount ?? 0) ||
    (b.releaseYear ?? 0) - (a.releaseYear ?? 0))
  else if (sort === 'reviews') contents = [...contents].sort((a, b) => b.reviewCount - a.reviewCount)
  // 관객순 — 한국 극장 개봉 영화만 값이 있다(영화진흥위원회). 없는 작품은 뒤로 밀되 순서가
  // 아무렇게나 되지 않게 공개연도로 한 번 더 가른다. 영화 필터를 같이 걸면 이 줄만 남는다.
  else if (sort === 'audience') contents = [...contents].sort((a, b) =>
    (b.koficAudience ?? 0) - (a.koficAudience ?? 0) ||
    (b.releaseYear ?? 0) - (a.releaseYear ?? 0))
  else if (sort === 'year') contents = [...contents].sort((a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0))
  // ?sort=latest (옛 링크) — 등록순. 버튼은 없앴지만 주소로 들어오면 그대로 보여준다
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
      <div className="feed-header browse-head">
        <h2 className="feed-title">{search ? `"${search}" 검색 결과` : '작품 둘러보기'}</h2>
        {/* 좁은 화면 전용 돋보기 — '최신'을 뺀 자리다. 검색칸을 늘 펼쳐 두면 한 줄을
            통째로 먹는데, 여기 와서 제일 먼저 하는 일은 검색이 아니라 목록 훑기다.
            (게시판 고정 바의 돋보기와 같은 규칙 — 다시 누르면 닫히고 검색어도 비운다) */}
        <button
          className={`browse-find ${searchOpen ? 'on' : ''}`}
          onClick={() => { if (searchOpen) runSearch(''); setSearchOpen(v => !v) }}
          aria-label={searchOpen ? '검색 닫기' : '작품 검색'}
          aria-expanded={searchOpen}
        >
          <SearchIcon size={17} />
        </button>
        {/* 넓은 화면에서는 제목 줄 안, 정렬 왼쪽 — 게시판 검색칸과 같은 자리다 */}
        <div className={`browse-search ${searchOpen ? 'open' : ''}`}>
          <input
            ref={searchInputRef}
            className="form-input"
            value={q}
            onChange={e => runSearch(e.target.value)}
            onKeyDown={onSearchKey}
            autoComplete="off" placeholder="작품 검색"
            aria-label="작품 검색"
          />
          {q && (
            <button className="browse-search-clear" onClick={() => runSearch('')} aria-label="검색어 지우기">✕</button>
          )}
        </div>
        <div className="feed-sort">
          <button className={sort === 'top' ? 'active' : ''} onClick={() => setParam('sort', 'top')}>평점순</button>
          <button className={sort === 'year' || sort === 'latest' ? 'active' : ''} onClick={() => setParam('sort', 'year')}>공개연도</button>
          <button className={sort === 'reviews' ? 'active' : ''} onClick={() => setParam('sort', 'reviews')}>리뷰순</button>
          <button className={sort === 'audience' ? 'active' : ''} onClick={() => setParam('sort', 'audience')}>관객순</button>
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
            options={BROWSE_GENRES.map(g => ({ code: g, label: g }))} onToggle={v => toggle('genre', v)}
          />
        </div>
      )}

      {/* 우리 표에 없어도 아래 TMDB 칸이 결과를 들고 있으면 "없습니다" 를 띄우지 않는다 —
          바로 아래에 고를 것이 여섯 개 있는데 없다고 말하면 앞뒤가 안 맞는다 */}
      {!contents.length ? (!!search && (tmdbHits.length > 0 || tmdbLoading) ? null : (
        <div className="empty-state fade-in">
          <p>조건에 맞는 작품이 없습니다.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            {activeChips.length > 0 && (
              <button className="btn btn-secondary btn-small" onClick={clearAll}>필터 전체 해제</button>
            )}
            <button className="btn btn-primary btn-small" onClick={() => setRegistering(true)}>＋ 없는 작품 등록</button>
          </div>
        </div>
      )) : (
        <>
          <p className="browse-count">
            총 {contents.length.toLocaleString()}편
            {totalPages > 1 && <> · {page}/{totalPages} 쪽</>}
          </p>
          <div className="content-grid" onKeyDown={onGridKey}>
            {pageItems.map(c => <ContentCard key={c.id} content={c} />)}
          </div>
          <Pager page={page} total={totalPages} onGo={goPage} />
        </>
      )}

      {/* 우리 표에 아직 없는 작품 — 누르면 그 작품만 만들고 작품방으로 간다.
          검색 중에만 나온다(필터만 걸었을 때 TMDB 를 뒤질 이유가 없다). */}
      {!!search && (tmdbHits.length > 0 || tmdbLoading) && (
        <section className="browse-tmdb">
          <h3>{tmdbLoading && !tmdbHits.length ? '더 찾는 중…' : '아직 등록 안 된 작품'}</h3>
          <div className="content-grid" onKeyDown={onGridKey}>
            {tmdbHits.map(h => (
              <button
                key={`tmdb-${h.type}-${h.r.tmdbId}-${h.r.seasonNumber ?? 0}`}
                className="tmdb-card"
                onClick={() => addTmdb(h)}
                disabled={adding}
              >
                {h.r.posterUrl
                  ? <img src={h.r.posterUrl} alt="" loading="lazy" />
                  : <span className="tmdb-card-noimg">No Image</span>}
                <span className="tmdb-card-title">{h.r.title}</span>
                <span className="tmdb-card-meta">
                  {TYPE_LABELS[h.type] || h.type}{h.r.year ? ` · ${h.r.year}` : ''}
                  <b> 새로 등록</b>
                </span>
              </button>
            ))}
          </div>
        </section>
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
