import { useAuthStore } from '@/stores/authStore'
import { LevelMark } from '@/components/profile/LevelMark'
import { EXPERT_TIER, isExpertAuthor, levelBadgeFor } from '@/utils/level'

/** 닉네임 옆에 붙는 작은 활동 레벨 표시 — 단계 번호 하나.
 *  고정닉(계정)에만 붙는다 — 유동닉은 아무것도 렌더하지 않으므로 그 자체가 구분이 된다.
 *  좋문가는 사다리의 마지막 칸이라 티어 아이콘 대신 👑 가 나간다.
 *
 *  2026-09-10 — 'Lv.2' 글자 알약에서 아이콘 하나로 바꿨다. 닉네임 옆에 글자가 또 붙으면
 *  거기서부터는 뭐가 이름이고 뭐가 배지인지 한눈에 안 갈린다. 등급 이름은 툴팁에 있다.
 *
 *  2026-09-16 — 그 아이콘을 **숫자 마크**로 바꿨다. 이모지 셋(🛋️ 🎏 ⚔️)은 서로 안 닮아
 *  몇 단계인지가 한눈에 안 들어왔다 — 소파와 잉어와 칼 사이에는 순서가 없다.
 *
 *  툴팁의 XP 수치는 관리자에게만 — 목록마다 닉네임 옆에 붙는 배지라
 *  여기서 새면 남의 XP 까지 다 들여다볼 수 있다. */
export function LevelTag({ authorId, expertOnly }: {
  authorId: string | null | undefined
  /** 좋문가일 때만 그린다(👑). 목록처럼 줄이 빽빽한 곳에 쓴다. */
  expertOnly?: boolean
}) {
  const isAdmin = useAuthStore(s => s.user?.role === 'admin')
  const info = levelBadgeFor(authorId)
  if (!info) return null
  const xpPart = isAdmin ? ` · ${info.xp} XP` : ''
  if (isExpertAuthor(authorId)) {
    return (
      <span className="level-tag is-expert" title={`${EXPERT_TIER.emoji} ${EXPERT_TIER.name}${xpPart}`}>
        {EXPERT_TIER.emoji}
      </span>
    )
  }
  if (expertOnly) return null
  return <LevelMark level={info.level} title={`Lv.${info.level} ${info.tier.name}${xpPart}`} />
}
