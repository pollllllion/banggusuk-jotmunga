import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { isPasswordValid, getPasswordRules } from '@/utils/helpers'

export function SettingsPage() {
  const navigate = useNavigate()
  const { user, updateProfile, deleteAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [nickname, setNickname] = useState(user?.nickname || '')
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPwConfirm, setNewPwConfirm] = useState('')

  if (!user) return null

  const saveNickname = () => {
    if (!nickname.trim()) { toast('닉네임을 입력하세요.'); return }
    updateProfile({ nickname: nickname.trim() })
    toast('닉네임이 변경되었습니다.')
  }

  const changePassword = () => {
    if (curPw !== user.password) { toast('현재 비밀번호가 올바르지 않습니다.'); return }
    if (!isPasswordValid(newPw)) { toast('새 비밀번호 조건을 충족해야 합니다.'); return }
    if (newPw !== newPwConfirm) { toast('새 비밀번호가 일치하지 않습니다.'); return }
    updateProfile({ password: newPw })
    setCurPw(''); setNewPw(''); setNewPwConfirm('')
    toast('비밀번호가 변경되었습니다.')
  }

  const handleDelete = () => {
    if (!confirm('정말 탈퇴하시겠습니까?\n\n작성한 리뷰와 댓글은 익명 처리되며 되돌릴 수 없습니다.')) return
    deleteAccount()
    toast('회원 탈퇴가 완료되었습니다.')
    navigate('/auth')
  }

  const pwRules = getPasswordRules(newPw)

  return (
    <>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--dark)', marginBottom: 16 }}>계정 설정</h2>

      <div className="settings-section">
        <h3>기본 정보</h3>
        <div className="settings-row"><label>이메일</label><span className="val">{user.email}</span></div>
        <div className="settings-row"><label>가입일</label><span className="val">{new Date(user.createdAt).toLocaleDateString('ko-KR')}</span></div>
        <div className="form-group" style={{ marginTop: 8 }}>
          <label>닉네임</label>
          <div className="form-row">
            <input className="form-input" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={20} />
            <button className="btn btn-primary" onClick={saveNickname} style={{ whiteSpace: 'nowrap' }}>변경</button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>비밀번호 변경</h3>
        <div className="form-group"><label>현재 비밀번호</label><input type="password" className="form-input" value={curPw} onChange={e => setCurPw(e.target.value)} /></div>
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
        <button className="btn btn-primary" onClick={changePassword}>비밀번호 변경</button>
      </div>

      <div className="settings-section danger-zone">
        <h3>계정 삭제</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>탈퇴 시 작성한 리뷰·댓글은 익명 처리되며 계정은 복구할 수 없습니다.</p>
        <button className="btn btn-danger-solid" onClick={handleDelete}>회원 탈퇴</button>
      </div>
    </>
  )
}
