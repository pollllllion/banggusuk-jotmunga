import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabaseClient'
import { isPasswordValid, getPasswordRules, isValidEmail } from '@/utils/helpers'
import { Seo } from '@/components/seo/Seo'

export function AuthPage() {
  const navigate = useNavigate()
  const { login, register, isAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // login
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPw, setLoginPw] = useState('')

  // register
  const [regEmail, setRegEmail] = useState('')
  const [regPw, setRegPw] = useState('')
  const [regPwConfirm, setRegPwConfirm] = useState('')
  const [regNickname, setRegNickname] = useState('')

  // reset
  const [resetEmail, setResetEmail] = useState('')

  // 로그인 계정 상태면 홈으로 (게스트는 통과 — /auth 직접 접근 허용)
  if (isAccount) { navigate('/'); return null }

  const handleLogin = async () => {
    setError('')
    if (!loginEmail || !loginPw) { setError('이메일과 비밀번호를 입력하세요.'); return }
    setBusy(true)
    const result = await login(loginEmail, loginPw)
    setBusy(false)
    if (!result.ok) { setError(result.error || '로그인 실패'); return }
    navigate('/')
  }

  const handleRegister = async () => {
    setError('')
    if (!isValidEmail(regEmail)) { setError('올바른 이메일 형식이 아닙니다.'); return }
    if (!isPasswordValid(regPw)) { setError('비밀번호 조건을 모두 충족해야 합니다.'); return }
    if (regPw !== regPwConfirm) { setError('비밀번호가 일치하지 않습니다.'); return }
    if (!regNickname.trim()) { setError('닉네임을 입력하세요.'); return }
    setBusy(true)
    const result = await register({ nickname: regNickname.trim(), email: regEmail, password: regPw })
    setBusy(false)
    if (!result.ok) { setError(result.error || '가입 실패'); return }
    if (result.needsConfirm) {
      toast('가입 확인 메일을 보냈어요. 메일의 링크를 눌러 인증을 완료해주세요.')
      setMode('login')
      return
    }
    toast('가입 완료! 이제 고정닉으로 활동할 수 있어요.')
    navigate('/')
  }

  const handleReset = async () => {
    setError('')
    if (!isValidEmail(resetEmail)) { setError('올바른 이메일을 입력하세요.'); return }
    setBusy(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail)
    setBusy(false)
    if (err) { setError(err.message); return }
    toast('비밀번호 재설정 링크를 이메일로 보냈어요.')
    setMode('login')
  }

  const pwRules = getPasswordRules(regPw)
  const canRegister = isValidEmail(regEmail) && isPasswordValid(regPw) && regPw === regPwConfirm && regNickname.trim().length > 0
  const pwMatch = regPwConfirm && regPw === regPwConfirm
  const pwMismatch = regPwConfirm && regPw !== regPwConfirm

  const subtitle = mode === 'login' ? '고정닉으로 로그인'
    : mode === 'register' ? '방구석좋문가 고정닉 만들기'
    : '비밀번호 재설정'

  return (
    <div className="auth-page">
      <Seo title="로그인" noindex />
      <div className="auth-card fade-in">
        <div className="auth-logo-area">
          <div className="auth-logo-big">&#9889;</div>
        </div>
        <div className="logo" style={{ justifyContent: 'center', marginBottom: 8 }}>
          <span className="logo-text"><span>방구석</span>좋문가</span>
        </div>
        <p className="auth-subtitle">{subtitle}</p>
        <p style={{ fontSize: 12, color: 'var(--subtext)', textAlign: 'center', marginBottom: 16 }}>
          로그인 없이 유동닉으로도 글을 쓸 수 있어요. 고정닉은 내 글 관리·알림에 좋아요.
        </p>

        {error && <div className="auth-error">{error}</div>}

        {mode === 'login' && (
          <form onSubmit={e => { e.preventDefault(); handleLogin() }}>
            <div className="form-group">
              <label>이메일</label>
              <input type="email" className="form-input" placeholder="example@email.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label>비밀번호</label>
              <input type="password" className="form-input" placeholder="비밀번호를 입력하세요" value={loginPw} onChange={e => setLoginPw(e.target.value)} />
            </div>
            <button type="submit" className="auth-btn" disabled={busy}>{busy ? '처리 중...' : '로그인'}</button>
            <div className="auth-switch">계정이 없으신가요? <a onClick={() => { setMode('register'); setError('') }}>회원가입</a></div>
            <div className="auth-switch" style={{ marginTop: 8 }}><a onClick={() => { setMode('reset'); setError('') }}>비밀번호를 잊으셨나요?</a></div>
            <div className="auth-switch" style={{ marginTop: 12 }}><a onClick={() => navigate('/')}>← 유동닉으로 둘러보기</a></div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={e => { e.preventDefault(); handleRegister() }}>
            <div className="form-group">
              <label>이메일 (아이디)</label>
              <input type="email" className="form-input" placeholder="example@email.com" value={regEmail} onChange={e => setRegEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label>비밀번호</label>
              <input type="password" className="form-input" placeholder="비밀번호를 입력하세요" value={regPw} onChange={e => setRegPw(e.target.value)} />
              <ul className="validation-list">
                {pwRules.map(r => (
                  <li key={r.key} className={r.pass ? 'pass' : 'fail'}>
                    <span className="vicon">{r.pass ? '✓' : '✗'}</span> {r.label}
                  </li>
                ))}
              </ul>
            </div>
            <div className="form-group">
              <label>비밀번호 확인</label>
              <input type="password" className="form-input" placeholder="비밀번호를 다시 입력" value={regPwConfirm} onChange={e => setRegPwConfirm(e.target.value)} />
              {pwMatch && <div className="email-check-msg ok">{'✓'} 비밀번호가 일치합니다.</div>}
              {pwMismatch && <div className="email-check-msg err">비밀번호가 일치하지 않습니다.</div>}
            </div>
            <div className="form-group">
              <label>닉네임 (고정닉)</label>
              <input type="text" className="form-input" placeholder="활동할 닉네임" maxLength={20} value={regNickname} onChange={e => setRegNickname(e.target.value)} />
            </div>
            <button type="submit" className="auth-btn" disabled={!canRegister || busy}>{busy ? '처리 중...' : '가입하기'}</button>
            <div className="auth-switch">이미 계정이 있으신가요? <a onClick={() => { setMode('login'); setError('') }}>로그인</a></div>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={e => { e.preventDefault(); handleReset() }}>
            <div className="form-group">
              <label>가입한 이메일</label>
              <input type="email" className="form-input" placeholder="example@email.com" value={resetEmail} onChange={e => setResetEmail(e.target.value)} />
            </div>
            <button type="submit" className="auth-btn" disabled={busy}>{busy ? '전송 중...' : '재설정 메일 보내기'}</button>
            <div className="auth-switch">기억나셨나요? <a onClick={() => { setMode('login'); setError('') }}>로그인</a></div>
          </form>
        )}
      </div>
    </div>
  )
}
