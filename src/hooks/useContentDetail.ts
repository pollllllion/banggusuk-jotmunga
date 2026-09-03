import { useCallback, useEffect, useState } from 'react'
import * as DS from '@/api/dataService'

export type DetailState = 'loading' | 'ready' | 'error'

/**
 * 작품 상세 컬럼(줄거리·출연진·채널·평점)의 지연 로드 상태.
 *
 * 이 컬럼들은 시작 로드 용량 때문에 빠져 있어서(contentColumns.ts) 화면을 연 뒤에
 * 한 행씩 채워진다. 그 사이를 '없음'으로 그리면 멀쩡한 작품이 정보 없는 작품처럼
 * 보이고, 요청이 실패하면 그 상태로 굳는다 — 그래서 세 상태를 구분해 돌려준다.
 *
 * state 가 바뀌면 컴포넌트가 다시 그려지므로, 캐시에 채워진 값도 이때 화면에 반영된다.
 */
export function useContentDetail(id: string | null | undefined) {
  const [state, setState] = useState<DetailState>(() => (DS.isContentDetailLoaded(id) ? 'ready' : 'loading'))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!id) { setState('ready'); return }
    if (DS.isContentDetailLoaded(id)) { setState('ready'); return }
    let alive = true
    setState('loading')
    DS.loadContentDetail(id).then(res => { if (alive) setState(res) })
    return () => { alive = false }
  }, [id, attempt])

  const retry = useCallback(() => setAttempt(a => a + 1), [])
  return { state, retry }
}
