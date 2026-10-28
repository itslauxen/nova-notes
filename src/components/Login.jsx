import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import PinwheelIcon from './PinwheelIcon'
import JarvisCore from './JarvisCore'
import Starfield from './Starfield'

// a galáxia só aparece (e só roda) em tela larga; no celular fica só o starfield
const WIDE = '(min-width: 901px)'
function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches)
  useEffect(() => {
    const mq = window.matchMedia(WIDE)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

export default function Login() {
  const { signIn, signUp } = useAuth()
  const wide = useWide()
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
      <Starfield />
      {/* o mesmo núcleo de partículas da Home, solto no fundo: arrastar gira a cena */}
      {wide && (
        <div className="auth-core" aria-hidden="true">
          <JarvisCore />
        </div>
      )}

      <div className="auth-side">
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-head">
            <PinwheelIcon className="auth-logo" size={32} />
            <h1 className="auth-title glitch" data-text="Nova notes">Nova notes</h1>
            <p className="auth-sub">{mode === 'in' ? t('login.signInSub') : t('login.signUpSub')}</p>
          </div>

          {mode === 'up' && (
            <label className="auth-field">
              <span>{t('login.name')}</span>
              <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
          )}
          <label className="auth-field">
            <span>{t('login.email')}</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label className="auth-field">
            <span>{t('login.password')}</span>
            <input
              type="password"
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              aria-describedby={mode === 'up' ? 'auth-pw-hint' : undefined}
            />
            {mode === 'up' && <small id="auth-pw-hint">{t('login.passwordHint')}</small>}
          </label>

          {msg && <div className={'auth-msg ' + (msg.type === 'err' ? 'err' : 'ok')} role={msg.type === 'err' ? 'alert' : 'status'}>{msg.text}</div>}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? '…' : mode === 'in' ? t('login.signIn') : t('login.signUp')}
          </button>

          <p className="auth-switch">
            {mode === 'in' ? t('login.noAccount') : t('login.hasAccount')}{' '}
            <button type="button" className="auth-toggle" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null) }}>
              {mode === 'in' ? t('login.signUpLink') : t('login.signInLink')}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
