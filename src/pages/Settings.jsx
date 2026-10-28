import { useState, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { FONTS, PRESET_COLORS } from '../theme/palette'
import {
  getGeminiKey, setGeminiKey, getGroqKey, setGroqKey,
  getCerebrasKey, setCerebrasKey, getProvider, setProvider,
  getClaudeKey, setClaudeKey, getClaudeModel, setClaudeModel, CLAUDE_MODELS,
} from '../lib/ai'
import { LogOut, Check, ChevronDown, Bell, BellOff, Pipette } from 'lucide-react'
import { pushStatus, enablePush, disablePush } from '../lib/push'
import PageHeader from '../components/PageHeader'
import { toast } from '../lib/toast'

const PROVIDERS = [
  { id: 'claude', label: 'Claude' },
  { id: 'groq', label: 'Groq' },
  { id: 'cerebras', label: 'Cerebras' },
  { id: 'gemini', label: 'Gemini' },
]

// seção: título + descrição à esquerda, controles à direita (empilha no celular)
function Section({ title, desc, children }) {
  return (
    <section className="settings-section">
      <div className="settings-label">
        <h2>{title}</h2>
        {desc && <p>{desc}</p>}
      </div>
      <div className="settings-controls">{children}</div>
    </section>
  )
}

// Ativa/desativa push neste dispositivo (lembretes de nota + hábitos)
function PushSettings() {
  const { t } = useLang()
  const [status, setStatus] = useState('off')
  const [busy, setBusy] = useState(false)
  const refresh = () => pushStatus().then(setStatus).catch(() => {})
  useEffect(() => { refresh() }, [])

  const enable = async () => {
    setBusy(true)
    try { await enablePush(); await refresh() }
    catch (e) { toast(e.message || t('settings.pushFail')) }
    finally { setBusy(false) }
  }
  const disable = async () => {
    setBusy(true)
    try { await disablePush(); await refresh() } catch {}
    finally { setBusy(false) }
  }

  return (
    <Section title={t('settings.notifications')} desc={t('settings.notifHint')}>
      {status === 'unsupported' && <div className="settings-note">{t('settings.pushUnsupported')}</div>}
      {status === 'need-install' && <div className="push-warn">{t('settings.pushNeedInstall')}</div>}
      {status === 'denied' && <div className="push-warn">{t('settings.pushDenied')}</div>}
      {(status === 'off' || status === 'enabled') && (
        <div className="chip-row" style={{ alignItems: 'center' }}>
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
    </Section>
  )
}

export default function Settings() {
  const { settings, setColor, setFont } = useTheme()
  const { t, lang, setLang, langs } = useLang()
  const {
    user, signOut, updateName,
    updateGeminiKey, updateGroqKey, updateCerebrasKey, updateAiProvider,
    updateClaudeKey, updateClaudeModel,
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
  const [claudeKey, setClaudeKeyState] = useState(getClaudeKey())
  const [claudeStatus, setClaudeStatus] = useState('idle')
  const [claudeModel, setClaudeModelState] = useState(getClaudeModel())

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

  const saveClaudeKey = async () => {
    const k = claudeKey.trim()
    setClaudeKey(k)
    if (user) await updateClaudeKey(k)
    setClaudeStatus('saved')
    setTimeout(() => setClaudeStatus('idle'), 1500)
  }

  const chooseClaudeModel = async (m) => {
    setClaudeModelState(m)
    setClaudeModel(m)
    if (user) await updateClaudeModel(m)
  }

  const saveName = async () => {
    if (!name.trim() || name.trim() === (user?.user_metadata?.name || '')) return
    setNameStatus('saving')
    await updateName(name.trim())
    setNameStatus('saved')
    setTimeout(() => setNameStatus('idle'), 1500)
  }

  // com login a chave vai pro user_metadata da conta; sem login fica só no navegador
  const savedWhere = user ? t('settings.savedAccount') : t('settings.savedLocal')
  const allKeys = [groqKey, cereKey, gemKey, claudeKey]
  const keysSet = allKeys.filter((k) => (k || '').trim()).length
  const customColor = !PRESET_COLORS.some((c) => c.value.toLowerCase() === settings.color.toLowerCase())

  const keyRow = (label, hint, href, linkText, placeholder, value, onChange, onSave, status) => (
    <div className="settings-row">
      <label>{label}</label>
      <span className="hint">
        {hint}
        <a href={href} target="_blank" rel="noopener">{linkText}</a>{savedWhere}
      </span>
      <div className="settings-inline">
        <input
          className="field"
          type="password"
          placeholder={placeholder}
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSave()}
        />
        <button className="btn-primary" onClick={onSave}>
          {status === 'saved' ? <Check size={15} /> : t('common.save')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="panel settings">
      <PageHeader title={t('settings.title')} sub={user && <>{t('settings.connectedAs')} <strong>{user.email}</strong></>} />

      {user && (
        <Section title={t('settings.account')}>
          <div className="settings-row">
            <label htmlFor="settings-name">{t('settings.yourName')}</label>
            <div className="settings-inline">
              <input
                id="settings-name"
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
              />
              <button className="btn-primary" onClick={saveName} disabled={nameStatus === 'saving'}>
                {nameStatus === 'saved' ? <Check size={15} /> : t('common.save')}
              </button>
            </div>
          </div>
          <div className="chip-row">
            <button className="chip" onClick={() => signOut()}>
              <LogOut size={14} style={{ verticalAlign: 'middle' }} /> {t('settings.signOut')}
            </button>
          </div>
        </Section>
      )}

      <Section title={t('settings.appearance')} desc={t('settings.appearanceHint')}>
        <div className="settings-row">
          <label>{t('settings.themeColor')}</label>
          <div className="swatches">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.value}
                className={'swatch' + (settings.color.toLowerCase() === c.value.toLowerCase() ? ' active' : '')}
                style={{ background: c.value }}
                title={c.label}
                aria-label={c.label}
                aria-pressed={settings.color.toLowerCase() === c.value.toLowerCase()}
                onClick={() => setColor(c.value)}
              />
            ))}
            {/* cor livre: mostra a cor atual quando ela não é um preset */}
            <label
              className={'swatch swatch-custom' + (customColor ? ' active' : '')}
              title={t('settings.customColor')}
              style={customColor ? { background: settings.color } : undefined}
            >
              {!customColor && <Pipette size={16} />}
              <input
                type="color"
                aria-label={t('settings.customColor')}
                value={settings.color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="settings-row">
          <label>{t('settings.typography')}</label>
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

      </Section>

      <Section title={t('settings.language')}>
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
      </Section>

      <PushSettings />

      <Section title={t('settings.aiModel')} desc={t('settings.aiModelHint')}>
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

        <div className="ai-keys">
          <button className="ai-keys-toggle" onClick={() => setKeysOpen((o) => !o)} aria-expanded={keysOpen}>
            {t('settings.apiKeys')}
            <span className="ai-keys-count">{t('settings.keysCount', { n: keysSet, total: allKeys.length })}</span>
            <ChevronDown size={16} className={'ai-keys-arrow' + (keysOpen ? ' open' : '')} />
          </button>
          <div className={'ai-keys-content' + (keysOpen ? ' open' : '')}>
            <div className="ai-keys-inner">
              {keyRow(t('settings.claudeKey'), t('settings.claudeHint'), 'https://platform.claude.com', 'platform.claude.com', 'sk-ant-…', claudeKey, setClaudeKeyState, saveClaudeKey, claudeStatus)}
              <div className="settings-row">
                <label htmlFor="settings-claude-model">{t('settings.claudeModel')}</label>
                <span className="hint">{t('settings.claudeModelHint')}</span>
                <select
                  id="settings-claude-model"
                  className="field settings-select"
                  value={claudeModel}
                  onChange={(e) => chooseClaudeModel(e.target.value)}
                >
                  {CLAUDE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
              {keyRow(t('settings.groqKey'), t('settings.groqHint'), 'https://console.groq.com/keys', 'console.groq.com/keys', 'gsk_…', groqKey, setGroqKeyState, saveGroqKey, groqStatus)}
              {keyRow(t('settings.cerebrasKey'), t('settings.cerebrasHint'), 'https://cloud.cerebras.ai', 'cloud.cerebras.ai', 'csk-…', cereKey, setCereKey, saveCereKey, cereStatus)}
              {keyRow(t('settings.geminiKey'), t('settings.geminiHint'), 'https://aistudio.google.com/apikey', 'aistudio.google.com/apikey', 'AIza…', gemKey, setGemKey, saveGemKey, gemStatus)}
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}
