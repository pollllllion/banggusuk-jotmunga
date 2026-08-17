import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabaseClient'
import { isPasswordValid, getPasswordRules } from '@/utils/helpers'
import { Seo } from '@/components/seo/Seo'
import { getPushState, enablePush, disablePush, type PushState } from '@/utils/push'
import { isIos, isStandalone } from '@/utils/pwa'

export function SettingsPage() {
  const navigate = useNavigate()
  const { user, isAccount, updateProfile, deleteAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [nickname, setNickname] = useState(user?.nickname || '')
  const [newPw, setNewPw] = useState('')
  const [newPwConfirm, setNewPwConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [pushState, setPushState] = useState<PushState>('unsupported')
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => { getPushState().then(setPushState) }, [])

  if (!user) return null

  const togglePush = async () => {
    setPushBusy(true)
    try {
      if (pushState === 'on') { await disablePush(); toast('공개일 알림을 껐어요.') }
      else { await enablePush(user.id); toast('찜한 작품이 공개되는 날 알려드릴게요.') }
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

  const saveNickname = async () => {
    if (!nickname.trim()) { toast('닉네임을 입력하세요.'); return }
    await updateProfile({ nickname: nickname.trim() })
    toast('닉네임이 변경되었습니다.')
  }

  const changePassword = async () => {
    if (!isPasswordValid(newPw)) { toast('새 비밀번호 조건을 충족해야 합니다.'); return }
    if (newPw !== newPwConfirm) { toast('새 비밀번호가 일치하지 않습니다.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setBusy(false)
    if (error) { toast(error.message); return }
    setNewPw(''); setNewPwConfirm('')
    toast('비밀번호가 변경되었습니다.')
  }

  const handleDelete = async () => {
    if (!confirm('정말 탈퇴하시겠습니까?\n\n계정 정보와 찜·알림 등 개인 데이터는 삭제되고,\n작성한 글과 댓글은 작성자 표시를 지운 채 남습니다.\n되돌릴 수 없습니다.')) return
    setBusy(true)
    const res = await deleteAccount()
    setBusy(false)
    if (!res.ok) { toast(res.error || '탈퇴 처리에 실패했습니다.'); return }
    toast('회원 탈퇴가 완료되었습니다.')
    navigate('/')
  }

  const pwRules = getPasswordRules(newPw)

  return (
    <>
      <Seo title="계정 설정" noindex />
      <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--dark)', marginBottom: 16 }}>계정 설정</h2>

      {!isAccount && (
        <div className="settings-section">
          <h3>유동닉으로 이용 중</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
            지금은 로그인 없이 유동닉으로 활동하고 있어요. 고정닉(계정)을 만들면 내 글 관리·알림·비밀번호 보호를 쓸 수 있어요.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/auth')}>고정닉 만들기 / 로그인</button>
        </div>
      )}

      <div className="settings-section">
        <h3>기본 정보</h3>
        {isAccount && <div className="settings-row"><label>이메일</label><span className="val">{user.email}</span></div>}
        <div className="settings-row"><label>가입일</label><span className="val">{new Date(user.createdAt).toLocaleDateString('ko-KR')}</span></div>
        <div className="form-group" style={{ marginTop: 8 }}>
          <label>닉네임</label>
          <div className="form-row">
            <input className="form-input" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={20} />
            <button className="btn btn-primary" onClick={saveNickname} style={{ whiteSpace: 'nowrap' }}>변경</button>
          </div>
        </div>
      </div>

      {isAccount && (
        <div className="settings-section">
          <h3>비밀번호 변경</h3>
          <div className="form-group">
            <label>새 비밀번호</label>
            <input type="password" className="form-input" value={newPw} onChange={e => setNewPw(e.target.value)} />
            {newPw && (
              <ul className="validation-list">
                {pwRules.map(r => <li key={r.key} className={r.pass ? 'pass' : 'fail'}><span className="vicon">{r.pass ? '✓' : '✗'}</span> {r.label}</li>)}
              </ul>
            )}
          </div>
          <div className="form-group"><label>새 비밀번호 확인</label><input type="password" className="form-input" value={newPwConfirm} onChange={e => setNewPwConfirm(e.target.value)} /></div>
          <button className="btn btn-primary" onClick={changePassword} disabled={busy}>{busy ? '변경 중...' : '비밀번호 변경'}</button>
        </div>
      )}

      {isAccount && (
        <div className="settings-section">
          <h3>공개일 알림</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
            찜해둔 작품이 공개·개봉하는 날 아침에 알림을 보내드려요. 기기마다 따로 켜야 합니다.
          </p>

          {iosNeedsInstall ? (
            <p style={{ fontSize: 13, color: 'var(--subtext)', lineHeight: 1.7 }}>
              아이폰·아이패드는 <b>공유 → 홈 화면에 추가</b>로 설치한 뒤, 홈화면 아이콘으로 열어야 알림을 켤 수 있어요.
            </p>
          ) : pushState === 'unsupported' ? (
            <p style={{ fontSize: 13, color: 'var(--subtext)' }}>이 브라우저는 알림을 지원하지 않아요.</p>
          ) : pushState === 'denied' ? (
            <p style={{ fontSize: 13, color: 'var(--danger)', lineHeight: 1.7 }}>
              브라우저에서 알림이 차단돼 있어요. 주소창 옆 자물쇠 → 알림을 <b>허용</b>으로 바꾼 뒤 새로고침해주세요.
            </p>
          ) : (
            <button
              className={`btn ${pushState === 'on' ? 'btn-secondary' : 'btn-primary'}`}
              onClick={togglePush}
              disabled={pushBusy}>
              {pushBusy ? '처리 중...' : pushState === 'on' ? '이 기기 알림 끄기' : '이 기기에서 알림 받기'}
            </button>
          )}
        </div>
      )}

      <div className="settings-section">
        <h3>저작권 안내</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 10 }}>
          작품의 제목·출연·개봉정보 등 사실 정보와 포스터 이미지는 <b>비평 및 정보 제공 목적</b>으로 공식 데이터 소스(KOBIS·KMDb·TMDB 등)를 통해 게시됩니다.
          각 리뷰·댓글의 저작권은 이를 작성한 회원에게 있습니다.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
          권리자(배급사·제작사 등)께서 게시 중단을 원하시면 해당 작품 페이지의 <b>신고 → '저작권 침해 (권리자 삭제요청)'</b> 를 이용하시거나, 아래 이메일로 요청해 주시면 확인 후 신속히 삭제 조치합니다.
        </p>
        <div className="settings-row"><label>삭제요청 접수</label><span className="val">copyright@bangjot.kr</span></div>
      </div>

      {isAccount && (
        <div className="settings-section danger-zone">
          <h3>계정 삭제</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>탈퇴 시 작성한 리뷰·댓글은 익명 처리되며 계정은 복구할 수 없습니다.</p>
          <button className="btn btn-danger-solid" onClick={handleDelete}>회원 탈퇴</button>
        </div>
      )}
    </>
  )
}
