import type { DetailState } from '@/hooks/useContentDetail'

/**
 * 줄거리 자리의 '아직 안 옴 / 못 받음' 표시.
 *
 * 줄거리·출연진은 시작 로드에서 빠진 컬럼이라 화면을 연 뒤에 따로 받아온다.
 * 그 사이를 "등록된 줄거리가 없습니다"로 그리면 정보가 다 있는 작품이
 * 정보 없는 작품으로 보이고, 받아오기에 실패하면 그 상태로 굳어 버린다.
 * 실패는 사용자에게 보여 주고 다시 시도할 길을 준다 — 조용히 삼키지 않는다.
 */
export function ContentDetailFallback({ state, onRetry }: { state: DetailState; onRetry: () => void }) {
  if (state === 'loading') {
    return (
      <p className="content-synopsis" aria-busy="true">
        <span className="sk sk-line" style={{ width: '100%' }} />
        <span className="sk sk-line" style={{ width: '92%' }} />
        <span className="sk sk-line" style={{ width: '64%' }} />
      </p>
    )
  }
  return (
    <p className="content-synopsis detail-error">
      작품 정보를 불러오지 못했어요.
      <button type="button" className="btn-text btn-small" onClick={onRetry}>다시 시도</button>
    </p>
  )
}
