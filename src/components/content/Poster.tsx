import { scoreColor } from '@/utils/helpers'
import { isUnreleased } from '@/utils/ott'
import { todayKey } from '@/shared/contentSeo.mjs'
import type { Content } from '@/types'

/**
 * 작품 포스터.
 *
 * 포스터가 없는 작품이 18편 있고(2026-09-16 실측), **TMDB 에도 포스터가 없다** —
 * 대부분 아직 공개 전인 한국 드라마라 배급사가 포스터를 안 낸 것이다. 채울 데가 없으니
 * 빈 자리를 어떻게 보여 줄지의 문제가 된다. 두 단계로 물러선다.
 *
 *   ① 배경 이미지(backdropUrl)가 있으면 그걸 쓴다 — 가로 이미지를 세로로 자르는 셈이지만
 *      제목만 덩그러니 있는 것보다 작품이 뭔지 훨씬 빨리 전해진다 (18편 중 3편)
 *      ⚠️ backdropUrl 은 **상세 전용 컬럼**이다(CONTENT_DETAIL_COLS · 불변식 ②).
 *      목록·캘린더에서는 아직 안 와 있으므로 여기서는 늘 ②로 떨어진다. 그래도 끌어오지 말 것 —
 *      긴 URL 을 2,400 행에 얹자고 시작 로드를 키우는 건 18편 값을 훨씬 넘는다.
 *      정작 중요한 건 검색으로 들어오는 작품방이고, 거기서는 상세가 채워진 뒤 제대로 나온다.
 *   ② 그것도 없으면 제목 + 공개 예정 표시. "포스터가 아직 없다"를 말해 주면
 *      비어 있는 게 아니라 아직 안 나온 것으로 읽힌다
 *
 *  showVerified 를 끄는 자리: 포스터가 작아 '✓ 공식' 이 그림을 다 덮는 목록 (예: 매긴 별점 줄)
 */
export function Poster({ content, showScore = true, showVerified = true }: { content: Content; showScore?: boolean; showVerified?: boolean }) {
  const img = content.posterUrl || content.backdropUrl || null
  // 날짜가 있으면 날짜, 없으면(열혈사제2 등) status — 작품방 제목 줄과 같은 기준이다.
  const upcoming = isUnreleased(content, todayKey())

  return (
    <div
      className={`poster${!content.posterUrl && content.backdropUrl ? ' from-backdrop' : ''}`}
      style={img ? { backgroundImage: `url(${img}), linear-gradient(135deg, #3F3F46, #18181B)`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
      {!img && (
        <div className="poster-fallback">
          {content.title}
          {upcoming && <em>공개 예정</em>}
        </div>
      )}
      {showVerified && content.verified && <span className="verified-badge" title="관리자 공식 인증 작품">✓ 공식</span>}
      {/* 천만 관객 — 한국에서 '천만'은 그 자체로 이름표라 숫자보다 이 말이 빨리 읽힌다.
          2,594편 중 두 편뿐이라(2026-09-20) 포스터가 배지밭이 되지 않는다.
          값은 영화진흥위원회 집계(scripts/sync-kofic.mjs) */}
      {(content.koficAudience ?? 0) >= 10_000_000 && (
        <span className="audience-badge" title={`누적관객 ${content.koficAudience!.toLocaleString('ko-KR')}명 (영화진흥위원회)`}>
          천만 관객
        </span>
      )}
      {showScore && content.reviewCount > 0 && (
        <span className="score-corner" style={{ background: scoreColor(content.avgRating) }}>
          {content.avgRating.toFixed(1)}
        </span>
      )}
    </div>
  )
}
