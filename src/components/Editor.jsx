import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import CodeBlock from '@tiptap/extension-code-block'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { Markdown } from 'tiptap-markdown'
import GlobalDragHandle from 'tiptap-extension-global-drag-handle'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { CellSelection } from '@tiptap/pm/tables'
import { Copy, Check, Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon, Link2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { SlashCommands } from './slashCommands'
import { ProgressTracker } from './ProgressTracker'
import { Collapsible } from './Collapsible'
import { SmartDropcursor } from './SmartDropcursor'
import { NovaImage } from './NovaImage'
import { Reminder } from './Reminder'
import BlockHandleMenu from './BlockHandleMenu'
import { useLang } from '../context/LanguageContext'

// Garante sempre um parágrafo vazio no fim do documento, pra dar pra clicar
// abaixo de blocos (tabela, código, toggle…) e digitar uma nova linha.
const TrailingNode = Extension.create({
  name: 'trailingNode',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('trailingNode'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return
          const { doc, tr, schema } = newState
          const last = doc.lastChild
          const needs = !last || last.type.name !== 'paragraph' || last.content.size > 0
          if (needs) return tr.insert(doc.content.size, schema.nodes.paragraph.create())
        },
      }),
    ]
  },
})

// Apagar uma "área" (seleção que cruza vários blocos, tabelas, toggles…)
// com Backspace/Delete — estilo Notion. Roda na frente do keymap da tabela.
const AreaDelete = Extension.create({
  name: 'areaDelete',
  priority: 1000,
  addKeyboardShortcuts() {
    const del = ({ editor }) => {
      const sel = editor.state.selection
      if (sel.empty) return false
      // dentro da tabela (seleção de células): deixa o padrão limpar o conteúdo
      if (sel instanceof CellSelection) return false
      // mesma linha de texto: deleção normal de texto
      if (sel.$from.sameParent(sel.$to)) return false
      // seleção cruza blocos -> apaga tudo de uma vez
      return editor.chain().deleteSelection().scrollIntoView().run()
    }
    return { Backspace: del, Delete: del }
  },
})

// Destaque estilo Notion: quando a seleção cobre 2+ blocos, marca cada bloco
// inteiro (não só o texto). O handle do drag move todos juntos.
const BlockSelectionHighlight = Extension.create({
  name: 'blockSelectionHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockSelectionHighlight'),
        props: {
          decorations(state) {
            const sel = state.selection
            if (sel.empty || sel instanceof CellSelection) return null
            const { from, to, doc } = { from: sel.from, to: sel.to, doc: state.doc }
            const decos = []
            doc.forEach((node, offset) => {
              const nFrom = offset
              const nTo = offset + node.nodeSize
              if (nFrom < to && nTo > from) decos.push(Decoration.node(nFrom, nTo, { class: 'block-selected' }))
            })
            if (decos.length < 2) return null // 1 bloco -> seleção de texto normal
            return DecorationSet.create(doc, decos)
          },
        },
      }),
    ]
  },
})

// Code block com botão de copiar (mantém o nome 'codeBlock' p/ serialização md)
function CodeBlockView({ node }) {
  const { t } = useLang()
  const [copied, setCopied] = useState(false)
  const copy = () => {
    try {
      navigator.clipboard.writeText(node.textContent || '').then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
      })
    } catch {}
  }
  return (
    <NodeViewWrapper className="codeblock">
      <button
        type="button"
        className="code-copy"
        contentEditable={false}
        onClick={copy}
        title={copied ? t('editor.copied') : t('editor.copy')}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <pre>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  )
}
const CodeBlockCopy = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
})

// TaskItem com node view própria: o checkbox atualiza o nó via getPos (sempre
// atual) em qualquer modo — inclusive leitura — sem depender de identidade.
const CheckTaskItem = TaskItem.extend({
  addNodeView() {
    return ({ node, HTMLAttributes, getPos, editor }) => {
      const li = document.createElement('li')
      const label = document.createElement('label')
      const styler = document.createElement('span')
      const checkbox = document.createElement('input')
      const content = document.createElement('div')
      label.contentEditable = 'false'
      checkbox.type = 'checkbox'
      checkbox.checked = node.attrs.checked
      checkbox.addEventListener('mousedown', (e) => e.preventDefault())
      const setChecked = (checked) => {
        if (typeof getPos !== 'function') return
        const pos = getPos()
        if (typeof pos !== 'number') return
        const { state, view } = editor
        const cur = state.doc.nodeAt(pos)
        if (!cur) return
        view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, checked }))
      }
      checkbox.addEventListener('change', (event) => setChecked(event.target.checked))
      // no modo leitura, clicar no TEXTO do item também marca/desmarca
      content.addEventListener('click', () => {
        if (editor.isEditable) return
        const cur = typeof getPos === 'function' ? editor.state.doc.nodeAt(getPos()) : null
        setChecked(!(cur && cur.attrs.checked))
      })
      Object.entries(this.options.HTMLAttributes).forEach(([k, v]) => li.setAttribute(k, v))
      li.dataset.checked = node.attrs.checked
      label.append(checkbox, styler)
      li.append(label, content)
      Object.entries(HTMLAttributes).forEach(([k, v]) => li.setAttribute(k, v))
      return {
        dom: li,
        contentDOM: content,
        update: (updated) => {
          if (updated.type !== this.type) return false
          li.dataset.checked = updated.attrs.checked
          checkbox.checked = updated.attrs.checked
          return true
        },
      }
    }
  },
})

// O handle de arrastar é posicionado com coordenadas de viewport (position:fixed).
// Se ele for filho do editor e algum ancestral tiver transform, o fixed passa a
// ser relativo a esse ancestral (vai pro lugar errado / some). Por isso criamos
// o elemento no <body> e passamos via dragHandleSelector.
function ensureDragHandle() {
  if (typeof document === 'undefined') return ''
  let el = document.getElementById('nova-drag-handle')
  if (!el) {
    el = document.createElement('div')
    el.id = 'nova-drag-handle'
    el.className = 'drag-handle hide'
    document.body.appendChild(el)
  }
  return '#nova-drag-handle'
}

// Menu flutuante ao selecionar texto: negrito, itálico, sublinhar e link.
function BubbleToolbar({ editor }) {
  const { t } = useLang()
  const [box, setBox] = useState(null)
  const [linkMode, setLinkMode] = useState(false)
  const [linkVal, setLinkVal] = useState('')
  const inputRef = useRef(null)
  const barRef = useRef(null)
  const selecting = useRef(false) // mouse pressionado arrastando a seleção

  useEffect(() => {
    if (!editor) return
    let raf = 0
    const compute = () => {
      const { state, view } = editor
      const sel = state.selection
      const isText = sel instanceof TextSelection && !sel.empty
      // enquanto arrasta o mouse, não mostra — só quando soltar
      if (selecting.current || !isText || !editor.isEditable || !view.hasFocus() || editor.isActive('codeBlock')) {
        if (!linkMode) setBox(null)
        return
      }
      try {
        const a = view.coordsAtPos(sel.from)
        const b = view.coordsAtPos(sel.to)
        setBox({ left: (a.left + b.left) / 2, top: Math.min(a.top, b.top) })
      } catch {
        setBox(null)
      }
    }
    const onSel = () => {
      setLinkMode(false)
      compute()
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(compute)
    }
    const onBlur = () =>
      setTimeout(() => {
        if (linkMode) return
        if (barRef.current && barRef.current.contains(document.activeElement)) return
        if (editor.view.hasFocus()) return
        setBox(null)
      }, 120)
    // esconde durante o arrasto; recalcula ao soltar o mouse
    const onDown = () => {
      selecting.current = true
      if (!linkMode) setBox(null)
    }
    const onUp = () => {
      if (!selecting.current) return
      selecting.current = false
      setTimeout(compute, 0)
    }
    editor.on('selectionUpdate', onSel)
    editor.on('transaction', compute)
    editor.on('blur', onBlur)
    editor.view.dom.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('scroll', onScroll, true)
    compute()
    return () => {
      editor.off('selectionUpdate', onSel)
      editor.off('transaction', compute)
      editor.off('blur', onBlur)
      editor.view.dom.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('scroll', onScroll, true)
      cancelAnimationFrame(raf)
    }
  }, [editor, linkMode])

  useEffect(() => {
    if (linkMode) {
      setLinkVal(editor.getAttributes('link')?.href || '')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [linkMode, editor])

  if (!box) return null

  const applyLink = () => {
    const href = linkVal.trim()
    const chain = editor.chain().focus().extendMarkRange('link')
    if (href) chain.setLink({ href: /^\w+:/.test(href) ? href : 'https://' + href }).run()
    else chain.unsetLink().run()
    setLinkMode(false)
  }

  const btn = (active, onClick, children, title) => (
    <button
      type="button"
      className={'bubble-btn' + (active ? ' on' : '')}
      title={title}
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
    >
      {children}
    </button>
  )

  return createPortal(
    <div ref={barRef} className="bubble-bar" style={{ left: box.left, top: box.top }}>
      {linkMode ? (
        <input
          ref={inputRef}
          className="bubble-link"
          placeholder={t('editor.pasteLink')}
          value={linkVal}
          onChange={(e) => setLinkVal(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              applyLink()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setLinkMode(false)
            }
          }}
        />
      ) : (
        <>
          {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <BoldIcon size={16} />, t('editor.bold'))}
          {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <ItalicIcon size={16} />, t('editor.italic'))}
          {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon size={16} />, t('editor.underline'))}
          {btn(editor.isActive('link'), () => setLinkMode(true), <Link2 size={16} />, t('editor.link'))}
        </>
      )}
    </div>,
    document.body,
  )
}

// Editor de texto rico com armazenamento em Markdown.
// onChange recebe o conteúdo já convertido para markdown.
// onEditor entrega a instância (para foco a partir do título, etc).
export default function Editor({ content, onChange, onEditor, editable = true }) {
  const { t } = useLang()
  const edRef = useRef(null)
  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        dropcursor: false,
      }),
      SmartDropcursor,
      CodeBlockCopy,
      Placeholder.configure({
        includeChildren: true,
        placeholder: ({ node }) =>
          node.type.name === 'paragraph'
            ? t('editor.placeholder')
            : '',
      }),
      TaskList,
      CheckTaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener' } }),
      Underline,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      NovaImage.configure({ inline: false }),
      Reminder,
      ProgressTracker,
      Collapsible,
      TrailingNode,
      AreaDelete,
      BlockSelectionHighlight,
      GlobalDragHandle.configure({
        dragHandleWidth: 26,
        scrollTreshold: 100,
        dragHandleSelector: ensureDragHandle(),
      }),
      SlashCommands,
      Markdown.configure({ html: true, linkify: true, transformPastedText: true, transformCopiedText: true }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => onChange(editor.storage.markdown.getMarkdown()),
  })

  useEffect(() => {
    if (editor) {
      edRef.current = editor
      onEditor?.(editor)
    }
  }, [editor, onEditor])

  // alterna modo leitura (sem teclado) mantendo checkbox clicável
  useEffect(() => {
    if (editor) editor.setEditable(editable)
  }, [editor, editable])

  // recarrega conteúdo ao trocar de documento
  useEffect(() => {
    if (!editor) return
    const current = editor.storage.markdown.getMarkdown()
    if ((content || '') !== current) editor.commands.setContent(content || '', false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, editor])

  // clique rápido no drag handle -> menu do bloco; arraste -> reordena.
  // também esconde o handle de forma robusta (ele ficava "preso" sobre outras notas).
  useEffect(() => {
    if (!editor) return
    const el = document.getElementById('nova-drag-handle')
    if (!el) return
    let dragged = false
    const onDragStart = () => { dragged = true }
    const onDragEnd = () => { setTimeout(() => { dragged = false }, 60) }
    const onClick = (e) => {
      if (dragged) return // foi arraste, não clique
      e.preventDefault()
      e.stopPropagation()
      const rect = el.getBoundingClientRect()
      const info = editor.view.posAtCoords({ left: rect.right + 24, top: rect.top + rect.height / 2 })
      if (!info) return
      const size = editor.state.doc.content.size
      const $pos = editor.state.doc.resolve(Math.max(0, Math.min(info.pos, size)))
      const blockPos = $pos.depth >= 1 ? $pos.before(1) : info.pos
      window.dispatchEvent(new CustomEvent('nova:block-menu', { detail: { pos: blockPos, x: rect.left, y: rect.bottom + 4 } }))
    }
    const onDocMove = (ev) => {
      if (el.classList.contains('hide')) return
      const ed = editor.view.dom.getBoundingClientRect()
      const h = el.getBoundingClientRect()
      const inEd = ev.clientX >= ed.left - 44 && ev.clientX <= ed.right + 12 && ev.clientY >= ed.top && ev.clientY <= ed.bottom
      const inH = ev.clientX >= h.left - 6 && ev.clientX <= h.right + 6 && ev.clientY >= h.top - 6 && ev.clientY <= h.bottom + 6
      if (!inEd && !inH) el.classList.add('hide')
    }
    el.addEventListener('dragstart', onDragStart)
    el.addEventListener('dragend', onDragEnd)
    el.addEventListener('click', onClick)
    document.addEventListener('mousemove', onDocMove)
    return () => {
      el.removeEventListener('dragstart', onDragStart)
      el.removeEventListener('dragend', onDragEnd)
      el.removeEventListener('click', onClick)
      document.removeEventListener('mousemove', onDocMove)
      el.classList.add('hide') // ao trocar de nota/desmontar, some o handle
    }
  }, [editor])

  return (
    <>
      <EditorContent editor={editor} />
      {editor && <BubbleToolbar editor={editor} />}
      {editor && <BlockHandleMenu editor={editor} />}
    </>
  )
}
