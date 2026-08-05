import { useMemo } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { computeSeasonRanking } from '@/utils/level'
import { Seo } from '@/components/seo/Seo'

const MEDALS = ['🥇', '🥈', '🥉']

export function RankingPage() {
  const { user } = useAuthStore()
  const { entries, days } = useMemo(() => computeSeasonRanking(30), [])

  return (
    <>
      <Seo title="이달의 랭킹" noindex />
      <div className="feed-header">
        <h2 className="feed-title">🏆 이달의 랭킹</h2>
      </div>
      <p className="ranking-sub">
        최근 {days}일간의 활동 점수예요. 영구 레벨과 별개로 매달 새로 겨룹니다 — 신규 회원에게도 기회가 열려 있어요.
      </p>

      {!entries.length ? (
        <div className="empty-state fade-in"><p>아직 이번 시즌 활동이 없어요.<br />리뷰·평가를 남기면 랭킹에 올라요!</p></div>
      ) : (
        <div className="ranking-list fade-in">
          {entries.map((e, i) => (
            <div key={e.userId} className={`ranking-row ${i < 3 ? 'top' : ''} ${user?.id === e.userId ? 'me' : ''}`}>
              <span className="ranking-rank">{i < 3 ? MEDALS[i] : i + 1}</span>
              <div className="ranking-main">
                <div className="ranking-name-row">
                  <span className="ranking-name">{e.nickname}</span>
                  {e.topBadge && (
                    <span className={`expert-tag rank-${e.topBadge.rank}`}>{e.topBadge.emoji} {e.topBadge.label}</span>
                  )}
                </div>
                <span className="ranking-tier">{e.level.tier.emoji} {e.level.tier.name} · Lv.{e.level.tierIndex + 1}</span>
              </div>
              <span className="ranking-score"><b>{e.score}</b><small>pt</small></span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
