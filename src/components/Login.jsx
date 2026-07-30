import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import PinwheelIcon from './PinwheelIcon'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const { t } = useLang()
  const [mode, setMode] = useState('in') // 'in' | 'up'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'in') {
        const { error } = await signIn(email, password)
        if (error) throw error
      } else {
        const { data, error } = await signUp(email, password, name.trim())
        if (error) throw error
        if (!data.session) setMsg({ type: 'ok', text: t('login.created') })
      }
    } catch (err) {
      setMsg({ type: 'err', text: err.message || t('login.authError') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <PinwheelIcon className="auth-logo" size={48} />
        <div className="auth-title glitch" data-text="Nova notes">Nova notes</div>
        <div className="auth-sub">{mode === 'in' ? t('login.signInSub') : t('login.signUpSub')}</div>

        {mode === 'up' && (
          <input className="field" type="text" placeholder={t('login.name')} value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <input className="field" type="email" placeholder={t('login.email')} value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <input className="field" type="password" placeholder={t('login.password')} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />

        {msg && <div className={'auth-msg ' + (msg.type === 'err' ? 'err' : 'ok')}>{msg.text}</div>}

        <button className="btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? '…' : mode === 'in' ? t('login.signIn') : t('login.signUp')}
        </button>

        <button type="button" className="auth-toggle" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null) }}>
          {mode === 'in' ? t('login.toSignUp') : t('login.toSignIn')}
        </button>
      </form>
    </div>
  )
}
