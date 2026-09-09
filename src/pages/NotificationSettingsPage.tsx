import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { Seo } from '@/components/seo/Seo'
import { BackIcon } from '@/components/ui/Icons'
import { getPushState, enablePush, disablePush, type PushState } from '@/utils/push'
import { isIos, isStandalone } from '@/utils/pwa'
import type { User } from '@/types'
import { clickable } from '@/utils/a11y'

/** 폰 알림 스위치 한 줄 — profiles 의 한 칸에 대응한다 */
type ActivityPref = { key: 'notifyComment' | 'notifyReply' | 'notifyLike'; label: string; hint: string }

/**
 * 댓글·추천의 폰 푸시 발송 장치가 연결됐나.
 *
 * 알림 행을 만드는 건 댓글 단 사람의 브라우저라, 실제 발송은 서버(Supabase Edge
 * Function)가 해야 한다. 그게 아직 배포·연결되지 않았다 — 붙이는 절차는
 * supabase/README-push.md 에 있다. **연결한 뒤 이 값을 true 로 바꿀 것.**
 * (클라이언트가 연결 여부를 알아낼 방법이 없어서 손으로 든다)
 */
const ACTIVITY_PUSH_READY = false

const ACTIVITY_PREFS: ActivityPref[] = [
  { key: 'notifyComment', label: '내 글에 댓글', hint: '내가 쓴 글에 누가 댓글을 남겼을 때' },
  { key: 'notifyReply', label: '내가 댓글 단 글에 새 댓글', hint: '대화가 이어질 때. 알림이 잦다면 이것부터 끄세요.' },
  { key: 'notifyLike', label: '내 글·댓글 추천', hint: '누가 내 글이나 댓글을 추천했을 때' },
]

/**
 * 알림 설정 — **전부 폰 알림(웹푸시) 설정이다.**
 *
 * 2026-09-09 정리:
 *   사이트 안 종 아이콘은 **항상** 뜬다. 여기서 끄고 켜는 건 주머니에서 울리는 쪽뿐이다.
 *   (종은 사이트에 들어와야 보이니 꺼 둘 이유가 없다)
 *
 * 저장되는 곳이 서로 달라서 화면에서도 그 차이를 밝힌다:
 *   무엇을 받을지  profiles 의 칸(notifyComment/Reply/Like) → 계정을 따라다닌다
 *   어느 기기로    이 브라우저의 푸시 구독                  → **기기마다 따로 켜야 한다**
 *   신청한 작품    content_alerts                          → 계정을 따라다닌다
 *
 * 실제 발송 판정은 Edge Function(supabase/functions/push-on-activity)이 한다.
 */
export function NotificationSettingsPage() {
  const navigate = useNavigate()
  const { user, isAccount, updateProfile } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [pushState, setPushState] = useState<PushState>('unsupported')
  const [pushBusy, setPushBusy] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)

  useEffect(() => { getPushState().then(setPushState) }, [])

  if (!user) return null

  // 유동닉은 알림을 받을 수 없다(RLS 상 auth.uid() 가 없어 자기 알림을 못 읽는다).
  // 스위치만 보여주고 끝나면 "켜 놨는데 왜 안 오지"가 된다 — 이유를 먼저 말한다.
  if (!isAccount) {
    return (
      <>
        <Seo title="알림 설정" noindex />
        <div className="back-btn" {...clickable(() => navigate('/settings'))}><BackIcon /> 계정 설정</div>
        <h2 className="settings-title">알림 설정</h2>
        <div className="settings-section">
          <h3>고정닉 계정이 필요해요</h3>
          <p className="settings-desc">
            알림은 로그인(고정닉) 계정에만 갈 수 있어요. 유동닉은 이 브라우저에만 남는 임시 신원이라
            서버가 "누구에게 보낼지"를 알 수 없거든요.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/auth')}>고정닉 만들기 / 로그인</button>
        </div>
      </>
    )
  }

  /** 활동 알림 스위치 — 저장이 서버까지 간 걸 확인하고 나서 바뀐 걸로 친다 */
  const toggleActivity = async (key: ActivityPref['key']) => {
    if (savingKey) return
    const next = (user[key] as boolean | undefined) === false
    setSavingKey(key)
    try {
      await updateProfile({ [key]: next } as Partial<User>)
    } catch (e) {
      toast(e instanceof Error ? e.message : '설정을 저장하지 못했어요.')
    } finally {
      setSavingKey(null)
    }
  }

  const togglePush = async () => {
    setPushBusy(true)
    try {
      if (pushState === 'on') { await disablePush(); toast('공개일 알림을 껐어요.') }
      else { await enablePush(user.id); toast('신청한 작품이 공개되는 날 알려드릴게요.') }
      setPushState(await getPushState())
    } catch (e: any) {
      toast(e?.message || '알림 설정에 실패했어요.')
      setPushState(await getPushState())
    } finally {
      setPushBusy(false)
    }
  }

  // iOS 는 홈화면에 추가한 뒤에만 웹푸시가 동작한다 (사파리 탭에서는 구독 자체가 안 된다)
  const iosNeedsInstall = isIos() && !isStandalone()

  // 개봉알림 신청한 작품 — 캐시에서 사라진 작품(병합·삭제)은 걸러낸다
  const alerts = DS.getUserContentAlerts(user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(a => DS.getContentById(a.contentId))
    .filter((c): c is NonNullable<typeof c> => !!c)

  const removeAlert = (contentId: string, title: string) => {
    DS.toggleContentAlert(user.id, contentId)
    rerender()
    toast(title + ' 개봉알림을 해제했어요.')
  }

  return (
    <>
      <Seo title="알림 설정" noindex />
      <div className="back-btn" {...clickable(() => navigate('/settings'))}><BackIcon /> 계정 설정</div>
      <h2 className="settings-title">알림 설정</h2>

      {/* ── 폰 알림: 무엇을 받을지 (계정을 따라다닌다) ──
          ⚠️ 발송 장치(Edge Function)가 아직 연결되지 않았다. 연결 전까지는 이 스위치가
             아무 효과도 없으므로 그 사실을 화면에 그대로 밝힌다 — 켜 놓고 왜 안 오냐가
             되는 것보다, 아직 안 된다고 말하는 게 낫다.
             연결이 끝나면 아래 ACTIVITY_PUSH_READY 를 true 로 바꾸면 안내가 사라진다.
             (supabase/README-push.md) */}
      <div className="settings-section">
        <h3>폰 알림으로 받을 것</h3>
        {!ACTIVITY_PUSH_READY && (
          <p className="settings-note danger" style={{ marginBottom: 12 }}>
            🚧 댓글·추천의 <b>폰 알림은 아직 준비 중</b>이에요. 지금은 사이트 안
            <b> 종 아이콘</b>에만 쌓입니다. 아래 설정은 미리 저장해 두면 준비되는 대로 적용돼요.
          </p>
        )}
        <p className="settings-desc">
          아래를 꺼도 <b>사이트 안 종 아이콘에는 그대로 쌓여요.</b> 여기서 끄는 건 휴대폰·PC 화면에
          울리는 알림뿐이에요. 계정에 저장돼서 어느 기기에서든 똑같이 적용돼요.
        </p>
        {ACTIVITY_PUSH_READY && pushState !== 'on' && (
          <p className="settings-note" style={{ marginBottom: 12 }}>
            ⚠️ 아직 이 기기에서 알림을 켜지 않았어요. 아래 <b>‘이 기기에서 알림 받기’</b>를 눌러야
            실제로 울립니다.
          </p>
        )}
        {ACTIVITY_PREFS.map(p => {
          const on = (user[p.key] as boolean | undefined) !== false
          return (
            <div key={p.key} className="notif-pref-row">
              <div className="notif-pref-text">
                <span className="notif-pref-label">{p.label}</span>
                <span className="notif-pref-hint">{p.hint}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={p.label}
                className={on ? 'switch on' : 'switch'}
                disabled={savingKey === p.key}
                onClick={() => void toggleActivity(p.key)}>
                <span className="switch-knob" />
              </button>
            </div>
          )
        })}
      </div>

      {/* ── 어느 기기로 받을지 (이 브라우저의 구독) ── */}
      <div className="settings-section">
        <h3>이 기기에서 알림 받기</h3>
        <p className="settings-desc">
          <b>개봉일 알림</b>이 이 기기로 옵니다{ACTIVITY_PUSH_READY ? ' (위의 활동 알림도 함께)' : ''}.
          브라우저 구독이라 <b>기기마다 따로 켜야 해요</b> — 폰에서 켰다고 노트북에도 오지는 않아요.
        </p>

        {iosNeedsInstall ? (
          <p className="settings-note">
            아이폰·아이패드는 <b>공유 → 홈 화면에 추가</b>로 설치한 뒤, 홈화면 아이콘으로 열어야 알림을 켤 수 있어요.
          </p>
        ) : pushState === 'unsupported' ? (
          <p className="settings-note">이 브라우저는 알림을 지원하지 않아요.</p>
        ) : pushState === 'denied' ? (
          <p className="settings-note danger">
            브라우저에서 알림이 차단돼 있어요. 주소창 옆 자물쇠 → 알림을 <b>허용</b>으로 바꾼 뒤 새로고침해주세요.
          </p>
        ) : (
          <button
            className={pushState === 'on' ? 'btn btn-secondary' : 'btn btn-primary'}
            onClick={togglePush}
            disabled={pushBusy}>
            {pushBusy ? '처리 중...' : pushState === 'on' ? '이 기기 알림 끄기' : '이 기기에서 알림 받기'}
          </button>
        )}
      </div>

      {/* ── 개봉알림 신청한 작품 ── */}
      <div className="settings-section">
        <h3>개봉알림 신청한 작품 ({alerts.length})</h3>
        {!alerts.length ? (
          <>
            <p className="settings-desc">
              아직 없어요. 캘린더나 작품 페이지에서 🔔 를 누르면 그 작품이 공개되는 날 알림을 받아요.
            </p>
            <button className="btn btn-secondary" onClick={() => navigate('/')}>캘린더로 가기</button>
          </>
        ) : (
          <div className="alert-list">
            {alerts.map(c => (
              <div key={c.id} className="alert-row">
                <button className="alert-main" onClick={() => navigate('/content/' + c.id)}>
                  {c.posterUrl
                    ? <img src={c.posterUrl} alt="" loading="lazy" />
                    : <span className="noimg">No Image</span>}
                  <span className="alert-info">
                    <span className="alert-title">{c.title}</span>
                    <span className="alert-meta">
                      {c.releaseDate ? c.releaseDate.replace(/-/g, '. ') : '공개일 미정'}
                      {c.platform ? ' · ' + c.platform : ''}
                    </span>
                  </span>
                </button>
                <button className="btn btn-secondary btn-small" onClick={() => removeAlert(c.id, c.title)}>
                  해제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
