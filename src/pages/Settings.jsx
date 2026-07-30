import { useState, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { FONTS, PRESET_COLORS } from '../theme/palette'
import {
  getGeminiKey, setGeminiKey, getGroqKey, setGroqKey,
  getCerebrasKey, setCerebrasKey, getProvider, setProvider,
} from '../lib/ai'
import { Moon, Sun, LogOut, Check, Sparkles, ChevronDown, Bell, BellOff } from 'lucide-react'
import { pushStatus, enablePush, disablePush } from '../lib/push'

const PROVIDERS = [
  { id: 'groq', label: 'Groq' },
  { id: 'cerebras', label: 'Cerebras' },
  { id: 'gemini', label: 'Gemini' },
]

// Ativa/desativa push neste dispositivo (lembretes de nota + hábitos)
function PushSettings() {
  const { t } = useLang()
  const [status, setStatus] = useState('off')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const refresh = () => pushStatus().then(setStatus).catch(() => {})
  useEffect(() => { refresh() }, [])

  const enable = async () => {
    setBusy(true); setErr('')
    try { await enablePush(); await refresh() }
    catch (e) { setErr(e.message || t('settings.pushFail')) }
    finally { setBusy(false) }
  }
  const disable = async () => {
    setBusy(true)
    try { await disablePush(); await refresh() } catch {}
    finally { setBusy(false) }
  }

  return (
    <div className="settings-row">
      <label>{t('settings.notifications')}</label>
      <span className="hint">{t('settings.notifHint')}</span>
      {status === 'unsupported' && (
        <div className="hint">{t('settings.pushUnsupported')}</div>
      )}
      {status === 'need-install' && (
        <div className="push-warn">{t('settings.pushNeedInstall')}</div>
      )}
      {status === 'denied' && (
        <div className="push-warn">{t('settings.pushDenied')}</div>
      )}
      {(status === 'off' || status === 'enabled') && (
        <div className="chip-row" style={{ marginTop: 10, alignItems: 'center' }}>
          {status === 'enabled' ? (
            <>
              <span className="push-ok"><Check size={13} /> {t('settings.pushEnabledOn')}</span>
              <button className="chip" onClick={disable} disabled={busy}>
                <BellOff size={14} style={{ verticalAlign: 'middle' }} /> {t('settings.disable')}
              </button>
            </>
          ) : (
            <button className="btn-primary" onClick={enable} disabled={busy}>
              <Bell size={14} style={{ verticalAlign: 'middle' }} /> {busy ? t('settings.enabling') : t('settings.enableNotifications')}
            </button>
          )}
        </div>
      )}
      {err && <div className="push-warn">{err}</div>}
    </div>
  )
}

export default function Settings() {
  const { settings, setColor, setFont, setMode } = useTheme()
  const { t, lang, setLang, langs } = useLang()
  const {
    user, signOut, updateName,
    updateGeminiKey, updateGroqKey, updateCerebrasKey, updateAiProvider,
  } = useAuth()
  const [name, setName] = useState(user?.user_metadata?.name || '')
  const [nameStatus, setNameStatus] = useState('idle') // idle | saving | saved
  const [keysOpen, setKeysOpen] = useState(false)
  const [provider, setProviderState] = useState(getProvider())
  const [gemKey, setGemKey] = useState(getGeminiKey())
  const [gemStatus, setGemStatus] = useState('idle')
  const [groqKey, setGroqKeyState] = useState(getGroqKey())
  const [groqStatus, setGroqStatus] = useState('idle')
  const [cereKey, setCereKey] = useState(getCerebrasKey())
  const [cereStatus, setCereStatus] = useState('idle')

  const chooseProvider = async (p) => {
    setProviderState(p)
    setProvider(p)
    if (user) await updateAiProvider(p)
  }

  const saveGemKey = async () => {
    const k = gemKey.trim()
    setGeminiKey(k) // cache local (runtime)
    if (user) await updateGeminiKey(k) // salva na conta (Supabase)
    setGemStatus('saved')
    setTimeout(() => setGemStatus('idle'), 1500)
  }

  const saveGroqKey = async () => {
    const k = groqKey.trim()
    setGroqKey(k)
    if (user) await updateGroqKey(k)
    setGroqStatus('saved')
    setTimeout(() => setGroqStatus('idle'), 1500)
  }

  const saveCereKey = async () => {
    const k = cereKey.trim()
    setCerebrasKey(k)
    if (user) await updateCerebrasKey(k)
    setCereStatus('saved')
    setTimeout(() => setCereStatus('idle'), 1500)
  }

  const saveName = async () => {
    if (!name.trim() || name.trim() === (user?.user_metadata?.name || '')) return
    setNameStatus('saving')
    await updateName(name.trim())
    setNameStatus('saved')
    setTimeout(() => setNameStatus('idle'), 1500)
  }

  return (
    <div className="panel" style={{ maxWidth: 720 }}>
      <div className="panel-title">{t('settings.title')}</div>
      <div className="panel-sub">{t('settings.sub')}</div>

      {user && (
        <div className="settings-row">
          <label>{t('settings.account')}</label>
          <span className="hint">{t('settings.connectedAs')} <strong>{user.email}</strong></span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 360 }}>
            <input
              className="field"
              value={name}
              placeholder={t('settings.yourName')}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
            />
            <button className="btn-primary" onClick={saveName} disabled={nameStatus === 'saving'}>
              {nameStatus === 'saved' ? <Check size={15} /> : t('common.save')}
            </button>
          </div>
          <div className="chip-row" style={{ marginTop: 12 }}>
            <button className="chip" onClick={() => signOut()}>
              <LogOut size={14} style={{ verticalAlign: 'middle' }} /> {t('settings.signOut')}
            </button>
          </div>
        </div>
      )}

      <div className="settings-row">
        <label>{t('settings.language')}</label>
        <span className="hint">{t('settings.languageHint')}</span>
        <div className="chip-row">
          {langs.map((l) => (
            <button
              key={l.id}
              className={'chip' + (lang === l.id ? ' active' : '')}
              onClick={() => setLang(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <PushSettings />

      <div className="settings-row">
        <label>{t('settings.themeColor')}</label>
        <span className="hint">{t('settings.themeColorHint')}</span>
        <div className="swatches">
          {PRESET_COLORS.map((c) => (
            <button
              key={c.value}
              className={'swatch' + (settings.color.toLowerCase() === c.value.toLowerCase() ? ' active' : '')}
              style={{ background: c.value }}
              title={c.label}
              onClick={() => setColor(c.value)}
            />
          ))}
          <label
            className="swatch"
            title={t('settings.customColor')}
            style={{
              background: 'conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <input
              type="color"
              value={settings.color}
              onChange={(e) => setColor(e.target.value)}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
          </label>
        </div>
      </div>

      <div className="settings-row">
        <label>{t('settings.typography')}</label>
        <span className="hint">{t('settings.typographyHint')}</span>
        <div className="chip-row">
          {FONTS.map((f) => (
            <button
              key={f.id}
              className={'chip' + (settings.font === f.id ? ' active' : '')}
              style={{ fontFamily: f.stack }}
              onClick={() => setFont(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <label>{t('settings.appearance')}</label>
        <div className="chip-row">
          <button className={'chip' + (settings.mode === 'dark' ? ' active' : '')} onClick={() => setMode('dark')}>
            <Moon size={14} style={{ verticalAlign: 'middle' }} /> {t('settings.dark')}
          </button>
          <button className={'chip' + (settings.mode === 'light' ? ' active' : '')} onClick={() => setMode('light')}>
            <Sun size={14} style={{ verticalAlign: 'middle' }} /> {t('settings.light')}
          </button>
        </div>
      </div>

      <div className="settings-row">
        <label><Sparkles size={14} style={{ verticalAlign: 'middle', color: 'var(--accent)' }} /> {t('settings.aiModel')}</label>
        <span className="hint">{t('settings.aiModelHint')}</span>
        <div className="chip-row">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              className={'chip' + (provider === p.id ? ' active' : '')}
              onClick={() => chooseProvider(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ai-keys">
      <button className="ai-keys-toggle" onClick={() => setKeysOpen((o) => !o)}>
        <Sparkles size={14} style={{ verticalAlign: 'middle' }} /> AI API keys
        <ChevronDown size={16} className={'ai-keys-arrow' + (keysOpen ? ' open' : '')} />
      </button>
      <div className={'ai-keys-content' + (keysOpen ? ' open' : '')}>
      <div className="ai-keys-inner">

      <div className="settings-row">
        <label>{t('settings.groqKey')}</label>
        <span className="hint">
          {t('settings.groqHint')}
          <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a>{t('settings.savedLocal')}
        </span>
        <div style={{ display: 'flex', gap: 8, maxWidth: 460 }}>
          <input
            className="field"
            type="password"
            placeholder="gsk_…"
            value={groqKey}
            onChange={(e) => setGroqKeyState(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveGroqKey()}
          />
          <button className="btn-primary" onClick={saveGroqKey}>
            {groqStatus === 'saved' ? <Check size={15} /> : t('common.save')}
          </button>
        </div>
      </div>

      <div className="settings-row">
        <label>{t('settings.cerebrasKey')}</label>
        <span className="hint">
          {t('settings.cerebrasHint')}
          <a href="https://cloud.cerebras.ai" target="_blank" rel="noopener">cloud.cerebras.ai</a>{t('settings.savedLocal')}
        </span>
        <div style={{ display: 'flex', gap: 8, maxWidth: 460 }}>
          <input
            className="field"
            type="password"
            placeholder="csk-…"
            value={cereKey}
            onChange={(e) => setCereKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveCereKey()}
          />
          <button className="btn-primary" onClick={saveCereKey}>
            {cereStatus === 'saved' ? <Check size={15} /> : t('common.save')}
          </button>
        </div>
      </div>

      <div className="settings-row">
        <label>{t('settings.geminiKey')}</label>
        <span className="hint">
          {t('settings.geminiHint')}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>{t('settings.savedLocal')}
        </span>
        <div style={{ display: 'flex', gap: 8, maxWidth: 460 }}>
          <input
            className="field"
            type="password"
            placeholder="AIza…"
            value={gemKey}
            onChange={(e) => setGemKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveGemKey()}
          />
          <button className="btn-primary" onClick={saveGemKey}>
            {gemStatus === 'saved' ? <Check size={15} /> : t('common.save')}
          </button>
        </div>
      </div>

      </div>
      </div>
      </div>
    </div>
  )
}
