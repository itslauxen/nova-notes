import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { DOMSerializer } from '@tiptap/pm/model'
import { Bell } from 'lucide-react'
import { useLang } from '../context/LanguageContext'
import { translate } from '../lib/i18n'

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Bloco de lembrete: parece um to-do (checkbox + texto) mas tem um agendamento
// de notificação. O sino abre o modal de configuração. Marcar como concluído
// interrompe os envios.
function ReminderView({ node, updateAttributes }) {
  const { t } = useLang()
  const { id, done, summary } = node.attrs
  const toggle = () => {
    const next = !done
    updateAttributes({ done: next })
    if (id) window.dispatchEvent(new CustomEvent('nova:reminder-done', { detail: { id, done: next } }))
  }
  const openConfig = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (id) window.dispatchEvent(new CustomEvent('nova:reminder-config', { detail: { id } }))
  }
  return (
    <NodeViewWrapper className={'reminder' + (done ? ' done' : '')}>
      <label className="reminder-check" contentEditable={false}>
        <input
          type="checkbox"
          checked={!!done}
          onChange={toggle}
          onMouseDown={(e) => e.preventDefault()}
        />
        <span />
      </label>
      <NodeViewContent className="reminder-text" as="div" />
      <button
        className="reminder-bell"
        contentEditable={false}
        onMouseDown={openConfig}
        title={summary || t('reminder.configure')}
      >
        <Bell size={14} />
        {summary ? <span className="reminder-sum">{summary}</span> : null}
      </button>
    </NodeViewWrapper>
  )
}

export const Reminder = Node.create({
  name: 'reminder',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-id') || null,
        renderHTML: (a) => (a.id ? { 'data-id': a.id } : {}),
      },
      done: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-done') === 'true',
        renderHTML: (a) => ({ 'data-done': a.done }),
      },
      kind: {
        default: 'once',
        parseHTML: (el) => el.getAttribute('data-kind') || 'once',
        renderHTML: (a) => ({ 'data-kind': a.kind }),
      },
      fireAt: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-fire-at') || null,
        renderHTML: (a) => (a.fireAt ? { 'data-fire-at': a.fireAt } : {}),
      },
      time: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-time') || null,
        renderHTML: (a) => (a.time ? { 'data-time': a.time } : {}),
      },
      intervalHours: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute('data-interval')
          return v ? Number(v) : null
        },
        renderHTML: (a) => (a.intervalHours ? { 'data-interval': a.intervalHours } : {}),
      },
      summary: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-summary') || '',
        renderHTML: (a) => (a.summary ? { 'data-summary': a.summary } : {}),
      },
    }
  },

  // Enter dentro do lembrete sai pro parágrafo de baixo (não cria outro lembrete)
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection
        if (!empty || $from.parent.type.name !== 'reminder') return false
        const after = $from.after()
        return editor
          .chain()
          .insertContentAt(after, { type: 'paragraph' })
          .setTextSelection(after + 1)
          .focus()
          .run()
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="reminder"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'reminder', class: 'reminder' }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(ReminderView)
  },

  // serializa o lembrete como bloco HTML (texto inline + atributos do agendamento)
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          let inner = ''
          try {
            const frag = DOMSerializer.fromSchema(node.type.schema).serializeFragment(node.content)
            const tmp = document.createElement('div')
            tmp.appendChild(frag)
            inner = tmp.innerHTML
          } catch {
            inner = ''
          }
          const a = node.attrs
          state.write(
            `<div data-type="reminder" data-id="${esc(a.id)}" data-done="${a.done}" data-kind="${esc(a.kind)}"` +
              (a.fireAt ? ` data-fire-at="${esc(a.fireAt)}"` : '') +
              (a.time ? ` data-time="${esc(a.time)}"` : '') +
              (a.intervalHours ? ` data-interval="${a.intervalHours}"` : '') +
              (a.summary ? ` data-summary="${esc(a.summary)}"` : '') +
              `>${inner}</div>`,
          )
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

// calcula o próximo disparo (UTC, ISO) e um resumo legível a partir da config.
// recebe `t` (do componente) para o resumo; cai no PT se não vier.
export function computeSchedule(cfg, t) {
  const tr = t || ((k, v) => translate('pt', k, v))
  const pad = (n) => String(n).padStart(2, '0')
  if (cfg.kind === 'once' && cfg.fireAt) {
    const d = new Date(cfg.fireAt) // datetime-local (horário local)
    const when = `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    return {
      next_fire_at: d.toISOString(),
      summary: tr('reminder.sumOnce', { when }),
    }
  }
  if (cfg.kind === 'daily' && cfg.time) {
    const [h, m] = cfg.time.split(':').map(Number)
    const d = new Date()
    d.setHours(h, m, 0, 0)
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
    return { next_fire_at: d.toISOString(), summary: tr('reminder.sumDaily', { time: cfg.time }) }
  }
  if (cfg.kind === 'interval' && cfg.intervalHours) {
    const d = new Date(Date.now() + cfg.intervalHours * 3600 * 1000)
    return { next_fire_at: d.toISOString(), summary: tr('reminder.sumInterval', { hours: cfg.intervalHours }) }
  }
  return { next_fire_at: null, summary: '' }
}
