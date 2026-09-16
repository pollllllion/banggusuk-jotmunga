import { useCallback, useEffect, useState } from 'react'
import * as DS from '@/api/dataService'
import { useDataStore } from '@/stores/dataStore'

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
  // 2단계 로드가 끝나면 다시 본다. 1단계 창 밖 작품은 그때 캐시에 들어오는데,
  // 그 전에 받아 둔 상세가 pendingDetail 에 걸려 있을 수 있다(요청은 다시 안 나간다).
  // 이 의존성이 없으면 id 가 그대로라 효과가 다시 안 돌고, 화면이 '정보 없음'으로 굳는다.
  const contentsComplete = useDataStore(s => s.contentsComplete)

  useEffect(() => {
    if (!id) { setState('ready'); return }
    if (DS.isContentDetailLoaded(id)) { setState('ready'); return }
    let alive = true
    setState('loading')
    // pending = 상세는 손에 있고 작품 행만 기다리는 중 — 화면에는 '로딩 중'으로 보인다
    DS.loadContentDetail(id).then(res => { if (alive) setState(res === 'pending' ? 'loading' : res) })
    return () => { alive = false }
  }, [id, attempt, contentsComplete])

  const retry = useCallback(() => setAttempt(a => a + 1), [])
  return { state, retry }
}
