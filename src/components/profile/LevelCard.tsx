import { useMemo, useState } from 'react'
import { TYPE_LABELS } from '@/utils/constants'
import { computeStats, computeXp, computeLevel, resolveExperts } from '@/utils/level'
import { LevelGuideModal } from '@/components/profile/LevelGuideModal'
import type { User } from '@/types'

/** 내 피드(프로필) 상단 레벨 카드.
 *  활동 레벨(재미) 과 좋문가 자격(권위) 을 함께 보여준다. tick 으로 강제 재계산.
 *  카드를 누르면 레벨 시스템 안내가 열린다. */
export function LevelCard({ user, tick }: { user: User; tick?: number }) {
  const [showGuide, setShowGuide] = useState(false)
  const { level, stats, experts } = useMemo(() => {
    const s = computeStats(user.id, user.createdAt)
    return { level: computeLevel(computeXp(s)), stats: s, experts: resolveExperts(user, s) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.createdAt, user.banned, user.role, user.nickname, user.streak, user.visitDays, tick])

  return (
    <>
    <div className="level-card clickable fade-in" onClick={() => setShowGuide(true)} title="방좋 레벨 시스템 보기">
      <div className="level-card-head">
        <span className="level-emoji" aria-hidden>{level.tier.emoji}</span>
        <div className="level-head-text">
          <div className="level-tier-row">
            <span className="level-tier-name">{level.tier.name}</span>
            <span className="level-lv">Lv.{level.tierIndex + 1}</span>
            {stats.streak > 0 && <span className="level-streak" title={`누적 방문 ${stats.visitDays}일`}>🔥 {stats.streak}일 연속</span>}
          </div>
          <div className="level-xp-sub">
            {level.next
              ? <>다음 <b>{level.next.name}</b>까지 {level.toNext} XP</>
              : <>최고 레벨 달성 🎉</>}
          </div>
        </div>
        <span className="level-xp-num">{level.xp}<small>XP</small></span>
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

      {/* 좋문가 자격 — 별도 권위 배지 */}
      <div className="level-expert">
        {experts.badges.length > 0 ? (
          <div className="expert-badges">
            {experts.badges.map(b => (
              <span key={b.type} className={`expert-badge rank-${b.rank}`} title={`${TYPE_LABELS[b.type]} 평가 ${b.stat.rated}편 · 장문글 ${b.stat.longPosts}개 · 추천 ${b.stat.netLikes}`}>
                {b.emoji} {b.label}
              </span>
            ))}
          </div>
        ) : experts.closest ? (
          <div className="expert-progress">
            <span className="expert-prospect">🔰 예비 {experts.closest.label}</span>
            {experts.closest.missing.length > 0 && (
              <span className="expert-missing">달성까지 {experts.closest.missing.join(' · ')} 남음</span>
            )}
          </div>
        ) : (
          <div className="expert-progress">
            <span className="expert-missing">평가를 남기면 분야별 <b>좋문가</b> 자격에 도전할 수 있어요.</span>
          </div>
        )}
      </div>

      <div className="level-card-hint">방좋 레벨 시스템 보기 ›</div>
    </div>
    {showGuide && <LevelGuideModal currentTierIndex={level.tierIndex} onClose={() => setShowGuide(false)} />}
    </>
  )
}
