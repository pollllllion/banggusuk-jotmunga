/**
 * 2단계 로드(cache.ts 의 loadRest)가 도는 동안 잠깐 뜨는 자리.
 *
 * 시작 로드가 2단계라 "캐시에 작품이 없다"가 곧 "없는 작품"이 아니다.
 * 그 둘을 가르는 화면들(작품 상세·토론글 상세)이 이걸 공유한다 —
 * 구분하지 않으면 멀쩡한 공유 링크가 목록으로 튕긴다.
 */
export function StillLoading() {
  return (
    <div className="empty-state fade-in">
      <p>불러오는 중...</p>
    </div>
  )
}
