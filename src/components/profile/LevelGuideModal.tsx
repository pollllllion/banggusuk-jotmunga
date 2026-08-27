import { useAuthStore } from '@/stores/authStore'
import { LEVEL_TIERS, EXPERT_TIER, LONG_POST_MIN, XP_RULE, ANTIABUSE, QUALITY_CURVE, type LevelInfo } from '@/utils/level'

/**
 * 방좋 레벨 시스템 안내.
 *
 * ★ XP 산정 방식은 관리자에게만 보인다 ★
 * 규칙을 공개하면 점수를 노리고 움직이게 된다 — 상한 채우기, 장문 기준(200자)에 맞춘
 * 분량 늘리기, 추천 품앗이 같은 것들. 일반 사용자에게는 사다리와 "다음 단계까지 남은 XP"
 * 만 보여주고, 무엇으로 오르는지는 감추는 편이 글의 질에 낫다.
 * 판정 기준은 보는 사람(로그인 계정)의 role 이다 — 남의 프로필을 열어봐도 마찬가지.
 */
export function LevelGuideModal({ level, isExpert, onClose }: {
  level?: LevelInfo
  isExpert?: boolean
  onClose: () => void
}) {
  const isAdmin = useAuthStore(s => s.user?.role === 'admin')
  const overlayClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose() }
  const curve = QUALITY_CURVE.filter(([n]) => [1, 5, 10, 50, 100].includes(n))
  const currentTierIndex = level?.tierIndex

  return (
    <div className="modal-overlay show" onClick={overlayClick}>
      <div className="modal level-guide" style={{ maxWidth: 480, width: '94vw' }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>🏅 방좋 레벨 시스템</h3>
        <p className="lg-sub">
          <b>백수 → 한량 → 여포</b>까지는 활동으로 오르고, 마지막 <b>좋문가</b>는 관리자가 직접 줍니다.
          많이 하는 사람보다 <b>다른 사람에게 가치 있는 활동</b>을 꾸준히 하는 사람이 높이 올라가요.
        </p>

        {/* 4단계 사다리 — 마지막 칸만 XP 가 아니다 */}
        <div className="lg-sec-title">레벨 · 총 {LEVEL_TIERS.length + 1}단계</div>
        <div className="lg-tiers">
          {LEVEL_TIERS.map((t, i) => (
            <div key={t.name} className={`lg-tier ${!isExpert && i === currentTierIndex ? 'cur' : ''}`}>
              <span className="lg-tier-emoji">{t.emoji}</span>
              <span className="lg-tier-lv">Lv.{i + 1}</span>
              <span className="lg-tier-name">{t.name}</span>
              {isAdmin && <span className="lg-tier-xp">{t.min.toLocaleString()} XP</span>}
              {!isExpert && i === currentTierIndex && <span className="lg-tier-here">현재</span>}
            </div>
          ))}
          <div className={`lg-tier ${isExpert ? 'cur' : ''}`}>
            <span className="lg-tier-emoji">{EXPERT_TIER.emoji}</span>
            <span className="lg-tier-lv">—</span>
            <span className="lg-tier-name">{EXPERT_TIER.name}</span>
            <span className="lg-tier-xp">관리자 승인</span>
            {isExpert && <span className="lg-tier-here">현재</span>}
          </div>
        </div>

        {/* 일반 사용자에겐 수치를 주지 않는다 — 어디쯤인지는 프로필의 진행바로만 */}
        {!isAdmin && !isExpert && level && (
          <p className="lg-note">
            {level.next
              ? <>지금은 <b>{level.tier.name}</b>. 다음 단계는 <b>{level.next.name}</b>예요. 진행 상황은 프로필의 막대로 확인할 수 있어요.</>
              : <>활동 레벨 최고 단계예요 🎉</>}
          </p>
        )}

        {/* ── 여기부터 관리자 전용 ── */}
        {isAdmin && (
          <>
            <div className="lg-sec-title">XP 어떻게 오르나 <span className="lg-admin-only">관리자만 보임</span></div>
            <ul className="lg-list">
              <li>토론글 작성 — 장문({LONG_POST_MIN}자+) <b>+{XP_RULE.postLong}</b> / 단문 <b>+{XP_RULE.postShort}</b></li>
              <li>받은 추천 — 많을수록 <b>증가폭이 줄어드는</b> 품질 점수:
                <span className="lg-curve">{curve.map(([n, xp]) => <span key={n}>{n}개→{xp}</span>)}</span>
              </li>
              <li>시청 등록 <b>+{XP_RULE.watchedEach}</b> (상한 {XP_RULE.watchedCap}) · 유효 댓글 <b>+{XP_RULE.commentEach}</b> (상한 {XP_RULE.commentCap})</li>
              <li>출석 <b>+{XP_RULE.attendanceEach}</b>/일 (상한 {XP_RULE.attendanceCap})</li>
            </ul>
            <p className="lg-note">
              ⚖️ 공정성: 추천은 <b>추천자당 최대 {ANTIABUSE.perLikerCap}</b>까지만 인정되고,
              서로 반복 추천(품앗이)하면 크게 깎여요. 글이 삭제되면 XP도 자동 회수됩니다.
              시청·댓글·출석은 상한이 있어서, <b>여포부터는 글을 써야</b> 닿습니다.
            </p>
          </>
        )}

        {/* 좋문가 */}
        <div className="lg-sec-title">{EXPERT_TIER.emoji} 좋문가</div>
        <p className="lg-note">
          XP로는 오를 수 없어요. <b>관리자가 글을 읽어보고 직접 지정</b>합니다.
          좋문가의 별점은 작품 화면에서 <b>좋문가 평점</b>으로 따로 집계돼요.
        </p>
      </div>
    </div>
  )
}
