import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabaseClient'
import { isPasswordValid, getPasswordRules } from '@/utils/helpers'
import { Seo } from '@/components/seo/Seo'
import * as DS from '@/api/dataService'
import { readTheme, applyTheme, watchSystemTheme, type Theme } from '@/utils/theme'

const THEME_OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: 'system', label: '시스템', icon: '🖥️' },
  { value: 'light', label: '라이트', icon: '☀️' },
  { value: 'dark', label: '다크', icon: '🌙' },
]

export function SettingsPage() {
  const navigate = useNavigate()
  const { user, isAccount, updateProfile, deleteAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [nickname, setNickname] = useState(user?.nickname || '')
  const [newPw, setNewPw] = useState('')
  const [newPwConfirm, setNewPwConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [theme, setTheme] = useState<Theme>(readTheme)

  // '시스템'을 고른 동안 OS 설정이 바뀌면 주소창 색도 따라가야 한다
  useEffect(() => watchSystemTheme(), [])

  const pickTheme = (t: Theme) => { applyTheme(t); setTheme(t) }

  if (!user) return null

  // 알림 설정 줄에 "신청한 작품 N편"을 미리 보여준다 — 들어가 봐야 아는 것보다 낫다
  const alertCount = DS.getUserContentAlerts(user.id).length

  const saveNickname = async () => {
    if (!nickname.trim()) { toast('닉네임을 입력하세요.'); return }
    try {
      await updateProfile({ nickname: nickname.trim() })
      toast('닉네임이 변경되었습니다.')
    } catch (e) {
      toast(e instanceof Error ? e.message : '닉네임을 바꾸지 못했어요.')
    }
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
      <h2 className="settings-title">계정 설정</h2>

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

      {/* 알림은 종류가 셋(활동·공개일 푸시·신청 작품)이라 이 페이지에 다 넣으면 길어진다.
          여기서는 지금 상태만 한 줄로 보여주고 전용 페이지로 넘긴다. */}
      <div className="settings-section">
        <h3>알림</h3>
        <button className="settings-link" onClick={() => navigate('/settings/notifications')}>
          <span>
            알림 설정
            <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--subtext)', marginTop: 3 }}>
              댓글·추천 알림 · 공개일 알림{isAccount && alertCount > 0 ? ` · 신청한 작품 ${alertCount}편` : ''}
            </span>
          </span>
          <span className="chev">›</span>
        </button>
      </div>

      <div className="settings-section">
        <h3>화면</h3>
        <p className="settings-desc">
          이 브라우저에만 저장돼요. '시스템'은 휴대폰·PC 의 다크모드 설정을 그대로 따릅니다.
        </p>
        <div className="theme-picker" role="radiogroup" aria-label="화면 테마">
          {THEME_OPTIONS.map(o => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={theme === o.value}
              className={theme === o.value ? 'theme-opt on' : 'theme-opt'}
              onClick={() => pickTheme(o.value)}>
              <span className="theme-opt-icon" aria-hidden="true">{o.icon}</span>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h3>저작권 안내</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 10 }}>
          작품의 제목·출연·개봉정보 등 사실 정보와 포스터 이미지는 <b>비평 및 정보 제공 목적</b>으로 공식 데이터 소스(KOBIS·KMDb·TMDB 등)를 통해 게시됩니다.
          각 리뷰·댓글의 저작권은 이를 작성한 회원에게 있습니다.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
          권리자(배급사·제작사 등)께서 게시 중단을 원하시면 해당 작품 페이지의 <b>신고 → '저작권 침해 (권리자 삭제요청)'</b> 를 이용하시거나, 아래 이메일로 요청해 주시면 확인 후 신속히 삭제 조치합니다.
        </p>
        <div className="settings-row"><label>삭제요청 접수</label><span className="val"><a href="mailto:ttcal.help@gmail.com">ttcal.help@gmail.com</a></span></div>
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
