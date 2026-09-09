import { create } from 'zustand'

/**
 * 데이터 로딩 진행 상태.
 *
 * 시작 로드가 2단계라(cache.ts) "작품이 없다"에는 두 가지가 있다:
 *   ① 정말 없는 작품 (삭제됐거나 잘못된 주소)
 *   ② 2단계가 아직 안 끝나서 캐시에 안 온 작품
 * 이 둘을 구분하지 못하면 멀쩡한 딥링크가 목록으로 튕긴다.
 * 화면은 이 값을 구독해서, 2단계가 끝날 때 다시 그린다.
 */
interface DataState {
  /** 작품 전체가 캐시에 들어왔나 */
  contentsComplete: boolean
}

export const useDataStore = create<DataState>(() => ({
  contentsComplete: false,
}))

export function markContentsComplete() {
  useDataStore.setState({ contentsComplete: true })
}
