import { useMemo, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { EXPERT_TIER, computeStats, computeXp, computeLevel, isExpert } from '@/utils/level'
import { LevelGuideModal } from '@/components/profile/LevelGuideModal'
import type { User } from '@/types'

/** 내 피드(프로필) 상단 레벨 카드.
 *  활동 레벨(재미) 과 좋문가(권위) 를 함께 보여준다. tick 으로 강제 재계산.
 *  카드를 누르면 레벨 시스템 안내가 열린다. */
export function LevelCard({ user, tick }: { user: User; tick?: number }) {
  const [showGuide, setShowGuide] = useState(false)
  const expert = isExpert(user)
  // 총 XP 수치는 관리자만 본다. 일반 사용자에게는 '다음 단계까지 남은 XP' 만 준다
  // — 누적 점수를 보여주면 그걸 올리는 방법을 역산하게 된다. (LevelGuideModal 주석 참고)
  const isAdmin = useAuthStore(s => s.user?.role === 'admin')
  const { level, stats } = useMemo(() => {
    const s = computeStats(user.id, user.createdAt)
    return { level: computeLevel(computeXp(s)), stats: s }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.createdAt, user.banned, user.role, user.nickname, user.streak, user.visitDays, tick])

  return (
    <>
    <div className="level-card clickable fade-in" onClick={() => setShowGuide(true)} title="방좋 레벨 시스템 보기">
      <div className="level-card-head">
        <span className="level-emoji" aria-hidden>{expert ? EXPERT_TIER.emoji : level.tier.emoji}</span>
        <div className="level-head-text">
          <div className="level-tier-row">
            <span className="level-tier-name">{expert ? EXPERT_TIER.name : level.tier.name}</span>
            {!expert && <span className="level-lv">Lv.{level.tierIndex + 1}</span>}
            {stats.streak > 0 && <span className="level-streak" title={`누적 방문 ${stats.visitDays}일`}>🔥 {stats.streak}일 연속</span>}
          </div>
          <div className="level-xp-sub">
            {expert
              ? <>관리자가 인정한 좋문가예요 👑</>
              : level.next
                ? (isAdmin
                    ? <>다음 <b>{level.next.name}</b>까지 {level.toNext} XP</>
                    : <>다음 단계는 <b>{level.next.name}</b></>)
                : <>활동 레벨 최고 단계 🎉</>}
          </div>
        </div>
        {/* 일반 사용자에게는 XP 수치를 일절 안 보여준다 — 진행 상황은 아래 진행바로만 */}
        {isAdmin && <span className="level-xp-num">{level.xp}<small>XP</small></span>}
      </div>

      <div className="level-bar" role="progressbar" aria-valuenow={Math.round(level.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="level-bar-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
      </div>

      <div className="level-stats">
        <span><b>{stats.ratedPosts}</b> 평가</span>
        <span><b>{stats.longPosts}</b> 장문글</span>
        <span><b>{stats.receivedNetLikes}</b> 받은추천</span>
        <span><b>{stats.watched}</b> 시청</span>
      </div>

      {/* 좋문가 — XP 로는 못 오르는 마지막 칸. 관리자가 글을 읽어보고 준다. */}
      <div className="level-expert">
        {expert ? (
          <div className="expert-badges">
            <span className="expert-badge rank-senior" title="관리자가 인정한 좋문가">
              {EXPERT_TIER.emoji} {EXPERT_TIER.name}
            </span>
          </div>
        ) : (
          <div className="expert-progress">
            <span className="expert-missing">
              <b>좋문가</b>는 XP로 오를 수 없어요. 관리자가 글을 보고 직접 지정합니다.
            </span>
          </div>
        )}
      </div>

      <div className="level-card-hint">방좋 레벨 시스템 보기 ›</div>
    </div>
    {showGuide && <LevelGuideModal level={level} isExpert={expert} onClose={() => setShowGuide(false)} />}
    </>
  )
}
