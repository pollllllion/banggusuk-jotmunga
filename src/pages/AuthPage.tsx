import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import { isPasswordValid, getPasswordRules, isValidEmail } from '@/utils/helpers'
import * as DS from '@/api/dataService'

export function AuthPage() {
  const navigate = useNavigate()
  const { login, register, user } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [error, setError] = useState('')

  // login state
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPw, setLoginPw] = useState('')

  // register state
  const [regEmail, setRegEmail] = useState('')
  const [regPw, setRegPw] = useState('')
  const [regPwConfirm, setRegPwConfirm] = useState('')
  const [regNickname, setRegNickname] = useState('')
  const [emailChecked, setEmailChecked] = useState(false)
  const [emailMsg, setEmailMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // reset state
  const [resetEmail, setResetEmail] = useState('')
  const [resetStep, setResetStep] = useState(1)
  const [resetPw, setResetPw] = useState('')
  const [resetPwConfirm, setResetPwConfirm] = useState('')

  if (user) { navigate('/'); return null }

  const handleLogin = () => {
    setError('')
    if (!loginEmail || !loginPw) { setError('이메일과 비밀번호를 입력하세요.'); return }
    const result = login(loginEmail, loginPw)
    if (!result.ok) { setError(result.error || '로그인 실패'); return }
    navigate('/')
  }

  const checkEmailDuplicate = () => {
    if (!regEmail) { setEmailMsg({ text: '이메일을 입력하세요.', ok: false }); setEmailChecked(false); return }
    if (!isValidEmail(regEmail)) { setEmailMsg({ text: '올바른 이메일 형식이 아닙니다.', ok: false }); setEmailChecked(false); return }
    if (DS.findUserByEmail(regEmail)) { setEmailMsg({ text: '이미 사용 중인 이메일입니다.', ok: false }); setEmailChecked(false); return }
    setEmailMsg({ text: '✓ 사용 가능한 이메일입니다.', ok: true })
    setEmailChecked(true)
  }

  const handleRegister = () => {
    setError('')
    if (!emailChecked) { setError('이메일 중복확인을 해주세요.'); return }
    if (!isPasswordValid(regPw)) { setError('비밀번호 조건을 모두 충족해야 합니다.'); return }
    if (regPw !== regPwConfirm) { setError('비밀번호가 일치하지 않습니다.'); return }
    if (!regNickname.trim()) { setError('닉네임을 입력하세요.'); return }
    register({ nickname: regNickname.trim(), email: regEmail, password: regPw })
    toast('가입 완료! 이제 마음껏 직설 리뷰를 남겨보세요.')
    navigate('/')
  }

  const verifyResetEmail = () => {
    if (!resetEmail) { setError('이메일을 입력하세요.'); return }
    if (!DS.findUserByEmail(resetEmail)) { setError('등록되지 않은 이메일입니다.'); return }
    setError('')
    setResetStep(2)
  }

  const handlePasswordReset = () => {
    if (!isPasswordValid(resetPw)) { setError('비밀번호 조건을 충족해야 합니다.'); return }
    if (resetPw !== resetPwConfirm) { setError('비밀번호가 일치하지 않습니다.'); return }
    const u = DS.findUserByEmail(resetEmail)
    if (!u) { setError('오류가 발생했습니다.'); return }
    DS.updateUser(u.id, { password: resetPw })
    toast('비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.')
    setMode('login')
    setError('')
  }

  const pwRules = getPasswordRules(mode === 'register' ? regPw : resetPw)
  const canRegister = emailChecked && isPasswordValid(regPw) && regPw === regPwConfirm && regNickname.trim().length > 0
  const canReset = isPasswordValid(resetPw) && resetPw === resetPwConfirm
  const pwMatch = mode === 'register' ? regPwConfirm && regPw === regPwConfirm : resetPwConfirm && resetPw === resetPwConfirm
  const pwMismatch = mode === 'register' ? regPwConfirm && regPw !== regPwConfirm : resetPwConfirm && resetPw !== resetPwConfirm

  const subtitle = mode === 'login' ? '가장 솔직한 컨텐츠 리뷰 플랫폼'
    : mode === 'register' ? '돌직구에 가입하고 직설 리뷰를 남기세요'
    : '비밀번호 재설정'

  return (
    <div className="auth-page">
      <div className="auth-card fade-in">
        <div className="auth-logo-area">
          <div className="auth-logo-big">&#9889;</div>
        </div>
        <div className="logo" style={{ justifyContent: 'center', marginBottom: 8 }}>
          <span className="logo-text"><span>돌</span>직구</span>
        </div>
        <p className="auth-subtitle">{subtitle}</p>

        {error && <div className="auth-error">{error}</div>}

        {/* Login Form */}
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
            <button type="submit" className="auth-btn">로그인</button>
            <div className="auth-switch">계정이 없으신가요? <a onClick={() => { setMode('register'); setError('') }}>회원가입</a></div>
            <div className="auth-switch" style={{ marginTop: 8 }}><a onClick={() => { setMode('reset'); setError(''); setResetStep(1) }}>비밀번호를 잊으셨나요?</a></div>
          </form>
        )}

        {/* Register Form */}
        {mode === 'register' && (
          <form onSubmit={e => { e.preventDefault(); handleRegister() }}>
            <div className="form-group">
              <label>이메일 (아이디)</label>
              <div className="form-row">
                <input type="email" className="form-input" placeholder="example@email.com"
                  value={regEmail} onChange={e => { setRegEmail(e.target.value); setEmailChecked(false); setEmailMsg(null) }} />
                <button type="button" className="btn btn-secondary" onClick={checkEmailDuplicate} style={{ whiteSpace: 'nowrap' }}>중복확인</button>
              </div>
              {emailMsg && <div className={`email-check-msg ${emailMsg.ok ? 'ok' : 'err'}`}>{emailMsg.text}</div>}
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
              <input type="password" className="form-input" placeholder="비밀번호를 다시 입력"
                value={regPwConfirm} onChange={e => setRegPwConfirm(e.target.value)} />
              {pwMatch && <div className="email-check-msg ok">{'✓'} 비밀번호가 일치합니다.</div>}
              {pwMismatch && <div className="email-check-msg err">비밀번호가 일치하지 않습니다.</div>}
            </div>
            <div className="form-group">
              <label>닉네임</label>
              <input type="text" className="form-input" placeholder="리뷰에 표시될 닉네임" maxLength={20}
                value={regNickname} onChange={e => setRegNickname(e.target.value)} />
            </div>
            <button type="submit" className="auth-btn" disabled={!canRegister}>가입하기</button>
            <div className="auth-switch">이미 계정이 있으신가요? <a onClick={() => { setMode('login'); setError('') }}>로그인</a></div>
          </form>
        )}

        {/* Reset Form */}
        {mode === 'reset' && (
          <form onSubmit={e => e.preventDefault()}>
            {resetStep === 1 && (
              <>
                <div className="form-group">
                  <label>가입한 이메일</label>
                  <input type="email" className="form-input" placeholder="example@email.com" value={resetEmail} onChange={e => setResetEmail(e.target.value)} />
                </div>
                <button className="auth-btn" onClick={verifyResetEmail}>다음</button>
              </>
            )}
            {resetStep === 2 && (
              <>
                <p style={{ fontSize: 13, color: 'var(--success)', marginBottom: 16, fontWeight: 600 }}>이메일이 확인되었습니다. 새 비밀번호를 설정하세요.</p>
                <div className="form-group">
                  <label>새 비밀번호</label>
                  <input type="password" className="form-input" placeholder="새 비밀번호" value={resetPw} onChange={e => setResetPw(e.target.value)} />
                  <ul className="validation-list">
                    {pwRules.map(r => (
                      <li key={r.key} className={r.pass ? 'pass' : 'fail'}>
                        <span className="vicon">{r.pass ? '✓' : '✗'}</span> {r.label}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="form-group">
                  <label>새 비밀번호 확인</label>
                  <input type="password" className="form-input" placeholder="비밀번호 확인" value={resetPwConfirm} onChange={e => setResetPwConfirm(e.target.value)} />
                  {pwMatch && <div className="email-check-msg ok">{'✓'} 비밀번호가 일치합니다.</div>}
                  {pwMismatch && <div className="email-check-msg err">비밀번호가 일치하지 않습니다.</div>}
                </div>
                <button className="auth-btn" onClick={handlePasswordReset} disabled={!canReset}>비밀번호 변경</button>
              </>
            )}
            <div className="auth-switch">기억나셨나요? <a onClick={() => { setMode('login'); setError('') }}>로그인</a></div>
          </form>
        )}
      </div>
    </div>
  )
}
