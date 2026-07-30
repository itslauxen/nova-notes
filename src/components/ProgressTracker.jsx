import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { useLang } from '../context/LanguageContext'

// Nó customizado: grade de checkboxes (1 por dia) para acompanhar um
// hábito/objetivo diário. Guarda quantos dias (count) e quais foram
// marcados (done = string de 0/1). Conta para o progresso do objetivo.

function TrackerView({ node, updateAttributes }) {
  const { t } = useLang()
  const count = node.attrs.count || 7
  const doneStr = String(node.attrs.done || '').padEnd(count, '0').slice(0, count)
  const cells = doneStr.split('').map((c) => c === '1')
  const checked = cells.filter(Boolean).length

  const toggle = (i) => {
    const arr = cells.slice()
    arr[i] = !arr[i]
    updateAttributes({ done: arr.map((b) => (b ? '1' : '0')).join('') })
  }

  return (
    <NodeViewWrapper className="tracker" contentEditable={false}>
      <div className="tracker-head">
        <input
          className="tracker-label"
          value={node.attrs.label || ''}
          placeholder={t('tracker.label')}
          onChange={(e) => updateAttributes({ label: e.target.value })}
        />
        <span className="tracker-count">{checked}/{count}</span>
      </div>
      <div className="tracker-grid">
        {cells.map((on, i) => (
          <button
            key={i}
            type="button"
            className={'tracker-cell' + (on ? ' on' : '')}
            onClick={() => toggle(i)}
            title={t('tracker.day', { n: i + 1 })}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </NodeViewWrapper>
  )
}

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

export const ProgressTracker = Node.create({
  name: 'progressTracker',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      count: {
        default: 7,
        parseHTML: (el) => parseInt(el.getAttribute('data-count'), 10) || 7,
        renderHTML: (a) => ({ 'data-count': a.count }),
      },
      done: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-done') || '',
        renderHTML: (a) => ({ 'data-done': a.done }),
      },
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-label') || '',
        renderHTML: (a) => ({ 'data-label': a.label }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="progress-tracker"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'progress-tracker', class: 'tracker' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(TrackerView)
  },

  // serialização para Markdown (salva como HTML, reparseado ao abrir)
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write(
            `<div data-type="progress-tracker" data-count="${node.attrs.count}" data-done="${esc(node.attrs.done)}" data-label="${esc(node.attrs.label)}"></div>`,
          )
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})
