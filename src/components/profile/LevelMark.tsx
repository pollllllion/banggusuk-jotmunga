import type { CSSProperties } from 'react'
import { LEVELS_PER_TIER, MAX_LEVEL } from '@/utils/level'

/**
 * 레벨 숫자 마크 — Lv.1~30.
 *
 * 2026-09-17 — 등급 번호(1·2·3) 대신 **숫자 레벨**을 적는다. 등급당 10칸(level.ts 의 LEVEL_MINS).
 * 색 계열은 등급이 정하고(초록·파랑·보라), 같은 등급 안에서는 레벨이 오를수록 진해진다 —
 * 등급이 셋뿐이라 한 번 오르면 다음까지 화면에 아무 변화가 없던 걸 메운다.
 * 만렙(Lv.30)만 진한 빨강이다.
 *
 * ── 아래는 이 마크가 생길 때의 기록 ──
 *
 * 2026-09-16 — 티어 이모지(🛋️ 🎏 ⚔️)를 걷어냈다. 그림 셋이 서로 안 닮아서
 * "몇 단계인지"가 한눈에 안 들어왔다 — 소파와 잉어와 칼 사이에는 순서가 없다.
 * 숫자는 작게 줄여도 순서가 그대로 읽힌다. 등급 이름은 툴팁에 있다.
 *
 * 모양은 모서리 둥근 사각(12px), 색은 파스텔 초록 → 파랑 → 보라. 게시판에서 익숙한 꼴이다.
 * 처음엔 동그라미로 냈는데 프로필 사진과 모양이 겹쳐 한 덩어리로 뭉쳐 보였다.
 * 크기·간격·색은 전부 CSS 쪽에 있다(.level-mark · variables.css 의 --lv-1~3).
 *
 * 마지막 칸(좋문가 👑)은 그림 그대로 둔다 — 그건 4단계가 아니라 **다른 종류**의 표시다.
 * 숫자를 붙이면 "XP 로 오를 수 있는 다음 칸"처럼 보인다.
 */
export function LevelMark({ level, big, title }: {
  /** 숫자 레벨 1~30 (LevelInfo.level) */
  level: number
  /** 레벨 카드·안내처럼 넓은 자리에서 쓰는 큰 마크 */
  big?: boolean
  title?: string
}) {
  const lv = Math.min(MAX_LEVEL, Math.max(1, Math.round(level) || 1))
  const tierNo = Math.ceil(lv / LEVELS_PER_TIER)               // 1·2·3 — 색 계열
  const step = (lv - 1) % LEVELS_PER_TIER                      // 0~9 — 진하기
  const pct = Math.round((step / (LEVELS_PER_TIER - 1)) * 100)
  const style = { '--lv-pct': `${pct}%` } as CSSProperties
  return (
    <span className={`level-mark lv${tierNo}${lv === MAX_LEVEL ? ' max' : ''}${big ? ' big' : ''}`} style={style} title={title}>
      {lv}
    </span>
  )
}
