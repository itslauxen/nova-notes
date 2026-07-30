import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FileText, Home, Target, CalendarCheck, Settings, Plus } from 'lucide-react'
import { useLang } from '../context/LanguageContext'

// Paleta de comandos (Ctrl/Cmd+K): busca em notas (título/conteúdo/tags)
// e ações rápidas de navegação. Teclado: ↑ ↓ navegam, Enter executa, Esc fecha.
export default function CommandPalette({ notes, onNewNote, onClose }) {
  const navigate = useNavigate()
  const { t } = useLang()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const go = (path) => { onClose(); navigate(path) }
  const actions = [
    { id: 'new', label: t('nav.newNote'), icon: <Plus size={16} />, run: () => { onClose(); onNewNote() } },
    { id: 'home', label: t('nav.home'), icon: <Home size={16} />, run: () => go('/') },
    { id: 'goals', label: t('nav.goals'), icon: <Target size={16} />, run: () => go('/goals') },
    { id: 'habits', label: t('nav.habits'), icon: <CalendarCheck size={16} />, run: () => go('/habits') },
    { id: 'settings', label: t('nav.settings'), icon: <Settings size={16} />, run: () => go('/settings') },
  ]

  const s = q.toLowerCase().trim()
  const acts = s ? actions.filter((a) => a.label.toLowerCase().includes(s)) : actions
  const noteHits = (s
    ? notes.filter((n) =>
        (n.title || '').toLowerCase().includes(s) ||
        (n.content || '').toLowerCase().includes(s) ||
        (n.tags || []).some((t) => t.toLowerCase().includes(s)),
      )
    : notes
  ).slice(0, 8)

  const items = [
    ...acts.map((a) => ({ type: 'action', key: 'a' + a.id, label: a.label, icon: a.icon, run: a.run })),
    ...noteHits.map((n) => ({
      type: 'note', key: 'n' + n.id, label: n.title || t('common.untitled'), emoji: n.emoji, tags: n.tags,
      run: () => go(`/note/${n.id}`),
    })),
  ]

  useEffect(() => { setSel(0) }, [q])

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => (items.length ? (i + 1) % items.length : 0)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => (items.length ? (i - 1 + items.length) % items.length : 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); items[sel]?.run() }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  return (
    <div className="cmdk-backdrop" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="cmdk-input">
          <Search size={17} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cmdk.placeholder')} />
          <kbd>esc</kbd>
        </div>
        <div className="cmdk-list">
          {items.length === 0 && <div className="cmdk-empty">{t('common.nothingFound')}</div>}
          {items.map((it, i) => (
            <button
              key={it.key}
              className={'cmdk-item' + (i === sel ? ' active' : '')}
              onMouseEnter={() => setSel(i)}
              onClick={it.run}
            >
              <span className="cmdk-ico">{it.type === 'note' ? (it.emoji || <FileText size={15} />) : it.icon}</span>
              <span className="cmdk-label">{it.label}</span>
              {it.type === 'note' && it.tags?.length > 0 && (
                <span className="cmdk-tags">{it.tags.slice(0, 3).map((t) => '#' + t).join(' ')}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
