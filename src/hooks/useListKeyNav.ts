import { useEffect, useRef, useState } from 'react'

/**
 * 검색 결과 목록을 ↑↓ 로 고르고 Enter 로 확정 — 검색해서 고르는 자리는 전부 이걸 쓴다.
 *
 * 헤더 통합검색·본 작품 등록·인물 고르기에 같은 코드가 따로 들어가 있었는데, 새 검색칸을 만들 때마다
 * 빠뜨려서(토론 글쓰기·인생작품·큐레이션) 훅으로 뺐다. 새 검색칸은 이 훅부터 붙인다.
 *
 * 목록이 여러 덩어리(DB → TMDB)여도 화면 차례대로 한 줄로 센다: total 은 합계, onPick 의 i 도 합친 번호.
 * 고른 줄에는 호출하는 쪽이 `active` 클래스를 붙인다 — 그걸 찾아 스크롤을 따라가게 한다.
 *
 * @param resetKey 바뀌면 선택을 푼다(보통 검색어).
 * @returns onKeyDown 은 키를 먹었으면 true — Enter 에 다른 뜻(검색 실행)이 있는 칸이 나머지를 처리한다.
 */
export function useListKeyNav<T extends HTMLElement = HTMLDivElement>(
  total: number, resetKey: unknown, onPick: (i: number) => void,
) {
  const [activeIdx, setActiveIdx] = useState(-1)
  const listRef = useRef<T>(null)

  useEffect(() => { setActiveIdx(-1) }, [resetKey])
  useEffect(() => {
    if (activeIdx >= 0) listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const onKeyDown = (e: React.KeyboardEvent): boolean => {
    if (e.key === 'ArrowDown' && total) {
      e.preventDefault(); setActiveIdx(i => (i + 1) % total)
      return true
    }
    if (e.key === 'ArrowUp' && total) {
      e.preventDefault(); setActiveIdx(i => (i <= 0 ? total : i) - 1)
      return true
    }
    // 한글 조합 중의 Enter 는 글자 확정이지 선택이 아니다
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && activeIdx >= 0 && activeIdx < total) {
      e.preventDefault(); onPick(activeIdx)
      return true
    }
    return false
  }

  return { activeIdx, listRef, onKeyDown }
}
