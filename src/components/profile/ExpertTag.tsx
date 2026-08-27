import { EXPERT_TIER, isExpertAuthor } from '@/utils/level'

/** 글·평점 옆에 붙는 좋문가 배지.
 *  2026-08-27 부터 분야 구분이 없다 — 관리자가 지정한 단일 배지라 작성자 하나당 하나. */
export function ExpertTag({ authorId }: { authorId: string | null | undefined }) {
  if (!isExpertAuthor(authorId)) return null
  return (
    <span className="expert-tag rank-senior" title="관리자가 인정한 좋문가">
      {EXPERT_TIER.emoji} {EXPERT_TIER.name}
    </span>
  )
}
