import { EXPERT_TIER, isExpertAuthor, levelBadgeFor } from '@/utils/level'

/** 닉네임 앞에 붙는 작은 활동 레벨 배지.
 *  고정닉(계정)에만 붙는다 — 유동닉은 아무것도 렌더하지 않으므로 그 자체가 구분이 된다.
 *  좋문가는 사다리의 마지막 칸이라 Lv 대신 좋문가 표시가 나간다. */
export function LevelTag({ authorId }: { authorId: string | null | undefined }) {
  const info = levelBadgeFor(authorId)
  if (!info) return null
  if (isExpertAuthor(authorId)) {
    return (
      <span className="level-tag is-expert" title={`${EXPERT_TIER.emoji} ${EXPERT_TIER.name} · ${info.xp} XP`}>
        {EXPERT_TIER.emoji}
      </span>
    )
  }
  return (
    <span className="level-tag" title={`${info.tier.emoji} ${info.tier.name} · ${info.xp} XP`}>
      Lv.{info.tierIndex + 1}
    </span>
  )
}
