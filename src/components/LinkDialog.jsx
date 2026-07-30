import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../context/LanguageContext'

// Diálogo para inserir link: texto a exibir + (URL externa OU outra nota).
export default function LinkDialog({ notes = [], onConfirm, onCancel }) {
  const { t } = useLang()
  const [text, setText] = useState('')
  const [mode, setMode] = useState('url') // 'url' | 'note'
  const [url, setUrl] = useState('https://')
  const [noteId, setNoteId] = useState('')
  const firstRef = useRef(null)

  useEffect(() => { firstRef.current?.focus() }, [])

  const submit = () => {
    if (mode === 'url') {
      const href = url.trim()
      if (!href || href === 'https://') return
      onConfirm({ text: text.trim() || href, href })
    } else {
      if (!noteId) return
      const n = notes.find((x) => x.id === noteId)
      onConfirm({ text: text.trim() || (n ? n.title || t('link.noteFallback') : t('link.noteFallback')), href: `/note/${noteId}` })
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit() }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="modal-title">{t('link.title')}</div>

        <label className="modal-label">{t('link.displayText')}</label>
        <input ref={firstRef} className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('link.textPlaceholder')} />

        <div className="seg" style={{ margin: '14px 0 10px' }}>
          <button className={'seg-btn' + (mode === 'url' ? ' on' : '')} onClick={() => setMode('url')}>URL</button>
          <button className={'seg-btn' + (mode === 'note' ? ' on' : '')} onClick={() => setMode('note')}>{t('link.otherNote')}</button>
        </div>

        {mode === 'url' ? (
          <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        ) : (
          <select className="field" value={noteId} onChange={(e) => setNoteId(e.target.value)}>
            <option value="">{t('link.chooseNote')}</option>
            {notes.map((n) => (
              <option key={n.id} value={n.id}>{n.emoji} {n.title || t('common.untitled')}</option>
            ))}
          </select>
        )}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onCancel}>{t('common.cancel')}</button>
          <button className="btn-primary" onClick={submit}>{t('common.insert')}</button>
        </div>
        <div className="modal-hint">{t('link.hint')}</div>
      </div>
    </div>,
    document.body,
  )
}
