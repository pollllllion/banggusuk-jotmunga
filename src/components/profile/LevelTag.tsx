import { levelBadgeFor } from '@/utils/level'

/** 닉네임 앞에 붙는 작은 활동 레벨 배지.
 *  고정닉(계정)에만 붙는다 — 유동닉은 아무것도 렌더하지 않으므로 그 자체가 구분이 된다. */
export function LevelTag({ authorId }: { authorId: string | null | undefined }) {
  const info = levelBadgeFor(authorId)
  if (!info) return null
  return (
    <span className="level-tag" title={`${info.tier.emoji} ${info.tier.name} · ${info.xp} XP`}>
      Lv.{info.tierIndex + 1}
    </span>
  )
}
