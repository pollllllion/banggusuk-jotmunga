/**
 * 게시판·목록 공용 페이지 번호.
 *
 * 토론방·자유방에 똑같은 구현이 복붙되어 있던 것을 하나로 모았다.
 * (같은 컴포넌트가 두 벌이면 한쪽만 고쳐지는 날이 온다)
 */

/** 한 번에 보여줄 번호 개수 — 5개면 모바일 폭에서도 넘치지 않는다 */
const PAGER_WINDOW = 5

/** 페이지 번호. 총 1쪽이면 아무것도 그리지 않는다. */
export function Pager({ page, total, onGo }: { page: number; total: number; onGo: (p: number) => void }) {
  if (total <= 1) return null
  const half = Math.floor(PAGER_WINDOW / 2)
  let from = Math.max(1, page - half)
  const to = Math.min(total, from + PAGER_WINDOW - 1)
  from = Math.max(1, to - PAGER_WINDOW + 1)
  const nums = Array.from({ length: to - from + 1 }, (_, i) => from + i)

  return (
    <nav className="disc-pager" aria-label="페이지">
      <button disabled={page === 1} onClick={() => onGo(page - 1)} aria-label="이전 페이지">‹</button>
      {from > 1 && <><button onClick={() => onGo(1)}>1</button>{from > 2 && <span className="disc-pager-gap">…</span>}</>}
      {nums.map(n => (
        <button key={n} className={n === page ? 'on' : ''} aria-current={n === page ? 'page' : undefined} onClick={() => onGo(n)}>
          {n}
        </button>
      ))}
      {to < total && <>{to < total - 1 && <span className="disc-pager-gap">…</span>}<button onClick={() => onGo(total)}>{total}</button></>}
      <button disabled={page === total} onClick={() => onGo(page + 1)} aria-label="다음 페이지">›</button>
    </nav>
  )
}

/**
 * ?p= 값을 실제로 보여줄 쪽 번호로 (?p= 는 남이 만든 주소일 수도 있다).
 * 검색·필터로 결과가 줄면 지금 쪽이 범위를 넘을 수 있어서 반드시 clamp 해야 한다 —
 * 안 하면 목록이 텅 빈 채로 뜬다.
 */
export function clampPage(raw: string | number | null | undefined, totalPages: number): number {
  const n = Math.floor(Number(raw))
  const last = Math.max(1, Math.floor(totalPages) || 1)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, last)
}

/**
 * ?p= 로 페이지를 읽고 쓰는 짝꿍.
 * 목록 화면 세 곳이 같은 규칙을 쓴다 — 1쪽이면 파라미터를 지워 주소를 깨끗하게 두고,
 * 페이지를 넘기면 맨 위로 올린다(안 그러면 스크롤이 중간에 남아 다음 쪽 중간부터 보인다).
 */
export function usePageParam(
  searchParams: URLSearchParams,
  setSearchParams: (p: URLSearchParams) => void,
  totalPages: number,
) {
  const page = clampPage(searchParams.get('p'), totalPages)

  const goPage = (p: number) => {
    const next = new URLSearchParams(searchParams)
    if (p <= 1) next.delete('p'); else next.set('p', String(p))
    setSearchParams(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return { page, goPage }
}

