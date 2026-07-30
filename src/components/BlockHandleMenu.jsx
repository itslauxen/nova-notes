import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, Type, Heading1, Heading2, Heading3, List, ListChecks, Quote, Code } from 'lucide-react'
import { useLang } from '../context/LanguageContext'

// opções de "transformar em" (usa clearNodes pra normalizar antes de aplicar,
// então um to-do vira h1, um h1 vira lista, etc.)
const TRANSFORMS = [
  { labelKey: 'slash.text', Icon: Type, apply: (c) => c.clearNodes().run() },
  { labelKey: 'slash.h1', Icon: Heading1, apply: (c) => c.clearNodes().setNode('heading', { level: 1 }).run() },
  { labelKey: 'slash.h2', Icon: Heading2, apply: (c) => c.clearNodes().setNode('heading', { level: 2 }).run() },
  { labelKey: 'slash.h3', Icon: Heading3, apply: (c) => c.clearNodes().setNode('heading', { level: 3 }).run() },
  { labelKey: 'slash.list', Icon: List, apply: (c) => c.clearNodes().toggleBulletList().run() },
  { labelKey: 'slash.todo', Icon: ListChecks, apply: (c) => c.clearNodes().toggleTaskList().run() },
  { labelKey: 'slash.quote', Icon: Quote, apply: (c) => c.clearNodes().toggleBlockquote().run() },
  { labelKey: 'slash.code', Icon: Code, apply: (c) => c.clearNodes().toggleCodeBlock().run() },
]

// Menu que abre ao clicar no drag handle de um bloco: transformar ou excluir.
export default function BlockHandleMenu({ editor }) {
  const { t } = useLang()
  const [menu, setMenu] = useState(null) // { x, y, pos }

  useEffect(() => {
    // clicar no mesmo handle de novo fecha (toggle); em outro bloco, troca
    const onOpen = (e) =>
      setMenu((prev) => (prev && prev.pos === e.detail.pos ? null : { x: e.detail.x, y: e.detail.y, pos: e.detail.pos }))
    const onKey = (e) => e.key === 'Escape' && setMenu(null)
    window.addEventListener('nova:block-menu', onOpen)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('nova:block-menu', onOpen)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!menu || !editor) return null

  const at = () => editor.chain().focus().setTextSelection(menu.pos + 1)
  const transform = (item) => {
    item.apply(at())
    setMenu(null)
  }
  const del = () => {
    const node = editor.state.doc.nodeAt(menu.pos)
    if (node) editor.chain().focus().deleteRange({ from: menu.pos, to: menu.pos + node.nodeSize }).run()
    setMenu(null)
  }

  // mantém o menu dentro da tela
  const top = Math.min(menu.y, window.innerHeight - 360)
  const left = Math.min(menu.x, window.innerWidth - 190)

  return createPortal(
    <>
      <div
        className="menu-backdrop"
        onClick={() => setMenu(null)}
        onContextMenu={(e) => { e.preventDefault(); setMenu(null) }}
      />
      <div className="card-menu block-menu" style={{ position: 'fixed', top: Math.max(8, top), left: Math.max(8, left), right: 'auto', zIndex: 200 }}>
        <div className="block-menu-label">{t('block.transformInto')}</div>
        {TRANSFORMS.map((it) => (
          <button key={it.labelKey} onClick={() => transform(it)}>
            <it.Icon size={14} /> {t(it.labelKey)}
          </button>
        ))}
        <div className="block-menu-sep" />
        <button className="danger" onClick={del}>
          <Trash2 size={14} /> {t('block.deleteBlock')}
        </button>
      </div>
    </>,
    document.body,
  )
}
