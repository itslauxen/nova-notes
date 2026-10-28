import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { marked } from 'marked'
import { ArrowUp, X, RotateCcw, Sparkles, Loader2, Check, AlertCircle, Mic, Square } from 'lucide-react'
import { runAgent, agentErrorMessage } from '../lib/agent'
import { useLang } from '../context/LanguageContext'
import { toast } from '../lib/toast'
import { recordVoice } from '../lib/recorder'
import { transcribe } from '../lib/ai'
import { MicrophoneWaveform } from './Waveform'
import { mirage } from 'ldrs'

mirage.register() // <l-mirage>: loader de "pensando" do chat

// conversa da sessão: vive na memória enquanto a aba está aberta (sair do modo chat não apaga)
const session = { history: [], messages: [] }

// markdown da resposta; o HTML cru é escapado antes (só a formatação Markdown vira HTML)
const render = (md) => marked.parse(String(md || '').replace(/</g, '&lt;'), { async: false, gfm: true, breaks: true })

function toolLabel(t, name, input = {}, result) {
  switch (name) {
    case 'search_notes':
      return input.tag && !input.query
        ? t('chat.tool.searchTag', { tag: input.tag })
        : t('chat.tool.search', { q: input.query || '' })
    case 'get_note':
      return result?.title ? t('chat.tool.readNamed', { title: result.title }) : t('chat.tool.read')
    case 'list_notes':
      return t('chat.tool.listNotes')
    case 'list_tags':
      return t('chat.tool.listTags')
    case 'list_habits':
      return t('chat.tool.listHabits')
    case 'create_note':
      return t(result ? 'chat.tool.createdNote' : 'chat.tool.creatingNote', { title: input.title || '' })
    case 'create_goal':
      return t(result ? 'chat.tool.createdGoal' : 'chat.tool.creatingGoal', { title: input.title || '' })
    case 'create_habit':
      return t(result ? 'chat.tool.createdHabit' : 'chat.tool.creatingHabit', { title: input.name || '' })
    default:
      return name
  }
}

export default function AiChat({ leaving, userName, onClose, onChanged }) {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const [messages, setMessages] = useState(session.messages)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  // microfone: grava -> transcreve -> o texto cai no campo pra revisar e enviar
  const [mic, setMic] = useState('idle') // idle | recording | transcribing
  const [micStream, setMicStream] = useState(null)
  const recRef = useRef(null)
  const [accent] = useState(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#a855f7')
  useEffect(() => () => recRef.current?.stop(), []) // saiu do chat gravando: para

  useEffect(() => { session.messages = messages }, [messages])
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 380) // depois da animação de abrir
    return () => clearTimeout(id)
  }, [])
  // rola pro fim a cada mudança
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])
  // Esc fecha o modo chat
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // atualiza a última mensagem (a resposta em andamento)
  const patchLast = (fn) =>
    setMessages((ms) => {
      const copy = ms.slice()
      copy[copy.length - 1] = fn(copy[copy.length - 1])
      return copy
    })

  const send = async (text) => {
    const q = text.trim()
    if (!q || busy) return
    setInput('')
    setBusy(true)
    setMessages((ms) => [...ms, { role: 'user', text: q }, { role: 'assistant', text: '', tools: [] }])
    try {
      const { created } = await runAgent({
        history: session.history,
        userText: q,
        userName,
        lang,
        on: {
          text: (d) => patchLast((m) => ({ ...m, text: m.text + d })),
          toolStart: ({ id, name, input }) =>
            patchLast((m) => ({ ...m, tools: [...m.tools, { id, name, input, status: 'run' }] })),
          toolEnd: ({ id, ok, result }) =>
            patchLast((m) => ({
              ...m,
              tools: m.tools.map((x) => (x.id === id ? { ...x, status: ok ? 'ok' : 'err', result } : x)),
            })),
        },
      })
      if (created.length) onChanged?.() // atualiza a barra lateral
    } catch (e) {
      toast(agentErrorMessage(e, t))
      // resposta que não chegou a ter conteúdo some da conversa (o erro vai pro toast)
      setMessages((ms) => {
        const last = ms[ms.length - 1]
        return last && !last.text && !last.tools?.length ? ms.slice(0, -1) : ms
      })
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const startMic = async () => {
    if (busy || mic !== 'idle') return
    setMic('recording')
    const rec = recordVoice({ onStream: setMicStream, silenceMs: 2500, maxMs: 120000 })
    recRef.current = rec
    let blob
    try {
      blob = await rec.promise
    } catch {
      recRef.current = null
      setMicStream(null)
      setMic('idle')
      toast(t('voice.micAccessFail'))
      return
    }
    setMicStream(null)
    setMic('transcribing')
    try {
      const text = await transcribe(blob)
      if (text) setInput((v) => (v.trim() ? v.trimEnd() + ' ' : '') + text)
    } catch (e) {
      toast(e.message || t('note.transcribeFail'))
    } finally {
      recRef.current = null
      setMic('idle')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  const reset = () => {
    if (busy) return
    session.history = []
    setMessages([])
    inputRef.current?.focus()
  }

  // links internos (/note/…, /habits) navegam pelo router
  const onListClick = (e) => {
    const a = e.target.closest('a')
    if (!a) return
    const href = a.getAttribute('href') || ''
    if (href.startsWith('/')) {
      e.preventDefault()
      navigate(href)
    } else {
      a.target = '_blank'
      a.rel = 'noopener'
    }
  }

  const suggestions = [t('chat.suggest1'), t('chat.suggest2'), t('chat.suggest3')]

  return (
    <div className={'ai-chat' + (leaving ? ' leaving' : '')}>
      <div className="ai-chat-top">
        {messages.length > 0 && (
          <button className="icon-btn" onClick={reset} disabled={busy} aria-label={t('chat.new')} title={t('chat.new')}>
            <RotateCcw size={17} />
          </button>
        )}
        <button className="icon-btn" onClick={onClose} aria-label={t('chat.close')} title={t('chat.close')}>
          <X size={19} />
        </button>
      </div>

      <div className="ai-chat-list" ref={listRef} onClick={onListClick}>
        <div className="ai-chat-col">
          {messages.length === 0 ? (
            <div className="ai-chat-intro">
              <Sparkles size={22} className="ai-chat-intro-ico" />
              <p className="ai-chat-intro-title">{t('chat.introTitle')}</p>
              <p className="ai-chat-intro-sub">{t('chat.introSub')}</p>
              <div className="ai-chat-suggest">
                {suggestions.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="ai-msg user">{m.text}</div>
              ) : (
                <div key={i} className="ai-msg bot">
                  {m.tools?.length > 0 && (
                    <ul className="ai-tools">
                      {m.tools.map((x) => (
                        <li key={x.id} className={'ai-tool ' + x.status}>
                          {x.status === 'run' ? <Loader2 size={13} className="voice-spin" /> : x.status === 'ok' ? <Check size={13} /> : <AlertCircle size={13} />}
                          {x.result?.link && x.status === 'ok' && x.name.startsWith('create_') ? (
                            <a href={x.result.link}>{toolLabel(t, x.name, x.input, x.result)}</a>
                          ) : (
                            <span>{toolLabel(t, x.name, x.input, x.status === 'run' ? null : x.result)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.text ? (
                    <div className="ai-md" dangerouslySetInnerHTML={{ __html: render(m.text) }} />
                  ) : busy && i === messages.length - 1 ? (
                    <div className="ai-thinking"><l-mirage size="44" speed="2.5" color={accent}></l-mirage></div>
                  ) : null}
                </div>
              ),
            )
          )}
        </div>
      </div>

      <form
        className="ai-input"
        onSubmit={(e) => { e.preventDefault(); send(input) }}
      >
        <Sparkles size={17} className="ai-input-ico" />
        {mic === 'idle' ? (
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('chat.placeholder')}
            aria-label={t('chat.placeholder')}
            enterKeyHint="send"
          />
        ) : (
          // waveform do ElevenLabs: a voz ao vivo enquanto grava; a onda de "processando" ao transcrever
          <MicrophoneWaveform
            className="ai-wave"
            active={mic === 'recording' && !!micStream}
            processing={mic === 'transcribing'}
            stream={micStream}
            height={30}
            barWidth={3}
            barGap={2}
            barRadius={2}
            barColor={accent}
            sensitivity={1.6}
            fadeEdges
            aria-label={mic === 'recording' ? t('chat.listening') : t('chat.transcribing')}
            role="img"
          />
        )}
        <button
          type="button"
          className={'icon-btn ai-mic' + (mic === 'recording' ? ' on' : '')}
          onClick={mic === 'recording' ? () => recRef.current?.stop() : startMic}
          disabled={busy || mic === 'transcribing'}
          aria-label={mic === 'recording' ? t('chat.micStop') : t('chat.mic')}
          title={mic === 'recording' ? t('chat.micStop') : t('chat.mic')}
        >
          {mic === 'recording' ? <Square size={13} fill="currentColor" /> : <Mic size={17} />}
        </button>
        <button type="submit" className="btn-arrow ai-send" disabled={busy || mic !== 'idle' || !input.trim()} aria-label={t('chat.send')}>
          {busy ? <Loader2 size={16} className="voice-spin" /> : <ArrowUp size={16} />}
        </button>
      </form>
    </div>
  )
}
