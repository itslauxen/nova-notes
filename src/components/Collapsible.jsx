import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { DOMSerializer } from '@tiptap/pm/model'
import { ChevronRight } from 'lucide-react'
import { useLang } from '../context/LanguageContext'

// Bloco colapsável (toggle) estilo Notion: título (atributo) + corpo editável
// (parágrafos, código, etc). Abre/fecha com animação. Corpo guarda a animação.
const LEVEL_SCALE = [1, 1.6, 1.35, 1.15] // texto, h1, h2, h3

function ToggleView({ node, updateAttributes, editor, getPos }) {
  const { t } = useLang()
  const open = node.attrs.open
  const level = node.attrs.level || 0
  const toggle = () => updateAttributes({ open: !open })
  // atalhos no começo do título: "# / ## / ###" ou "/h1 /h2 /h3" -> h1/h2/h3,
  // e "/p" (ou "/texto") volta a texto normal.
  const onTitle = (val) => {
    let m = val.match(/^(#{1,3})\s(.*)$/)
    if (m) return updateAttributes({ level: m[1].length, title: m[2] })
    m = val.match(/^\/h([1-3])\s?(.*)$/i)
    if (m) return updateAttributes({ level: Number(m[1]), title: m[2] })
    m = val.match(/^\/(?:p|text|texto)\s?(.*)$/i)
    if (m) return updateAttributes({ level: 0, title: m[1] })
    updateAttributes({ title: val })
  }
  return (
    <NodeViewWrapper className={'toggle' + (open ? ' open' : '')}>
      <div
        className="toggle-head"
        contentEditable={false}
        onClick={() => {
          if (!editor.isEditable) toggle()
        }}
      >
        <button
          type="button"
          className="toggle-arrow"
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
          aria-label={open ? t('common.close') : t('common.open')}
        >
          <ChevronRight size={19} />
        </button>
        <input
          className="toggle-title"
          style={{
            fontSize: `calc(16.5px * var(--note-fs, 1) * ${LEVEL_SCALE[level] || 1})`,
            fontWeight: level ? 700 : 600,
          }}
          value={node.attrs.title || ''}
          placeholder={t('toggle.titlePlaceholder')}
          onChange={(e) => onTitle(e.target.value)}
          onKeyDown={(e) => {
            // backspace no começo de um título com nível -> volta a texto normal
            if (e.key === 'Backspace' && level && e.target.selectionStart === 0) {
              e.preventDefault()
              updateAttributes({ level: 0 })
              return
            }
            // Enter no título -> abre e pula pro corpo (primeira linha)
            if (e.key === 'Enter') {
              e.preventDefault()
              if (!open) updateAttributes({ open: true })
              const pos = typeof getPos === 'function' ? getPos() : null
              if (pos != null) {
                try {
                  editor.chain().focus().setTextSelection(pos + 2).run()
                } catch {}
              }
            }
          }}
          onMouseDown={(e) => {
            if (editor.isEditable) e.stopPropagation()
            else e.preventDefault()
          }}
        />
      </div>
      <div className="toggle-body-wrap">
        <NodeViewContent className="toggle-body" />
      </div>
    </NodeViewWrapper>
  )
}

const esc = (s) =>
  String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const Collapsible = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-title') || '',
        renderHTML: (a) => ({ 'data-title': a.title }),
      },
      open: {
        default: true,
        parseHTML: (el) => el.getAttribute('data-open') !== 'false',
        renderHTML: (a) => ({ 'data-open': a.open }),
      },
      level: {
        default: 0,
        parseHTML: (el) => parseInt(el.getAttribute('data-level'), 10) || 0,
        renderHTML: (a) => ({ 'data-level': a.level }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="toggle"]',
        contentElement: 'div.toggle-body',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'toggle', class: 'toggle' }),
      ['div', { class: 'toggle-body' }, 0],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleView)
  },

  // serializa o toggle INTEIRO como um bloco HTML (corpo como HTML), reparseado ao abrir
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
          state.write(
            `<div data-type="toggle" data-title="${esc(node.attrs.title)}" data-open="${node.attrs.open}" data-level="${node.attrs.level || 0}"><div class="toggle-body">${inner}</div></div>`,
          )
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})
