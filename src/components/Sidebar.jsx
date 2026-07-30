import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Home, Target, CalendarCheck, Settings, Plus, FileText, Trash2, Bot, Search, ChevronRight } from 'lucide-react'
import ConfirmDialog from './ConfirmDialog'
import PinwheelIcon from './PinwheelIcon'
import { useLang } from '../context/LanguageContext'
import { buildTree, flattenTree, removeChildrenOf, getProjection } from '../lib/tree'

const INDENT = 18 // px de indentação por nível

function NoteItem({ n, depth = 0, hasChildren = false, collapsed = false, onToggleCollapse, onAddChild, ghostDepth, onContextMenu, onDelete }) {
  const { t } = useLang()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: n.id })
  const [dx, setDx] = useState(0)
  const [open, setOpen] = useState(false)
  const live = useRef(false)
  const sx = useRef(0), sy = useRef(0), swiping = useRef(false)

  // enquanto o dnd-kit estiver reordenando, zera o swipe pra não encolher o item
  useEffect(() => {
    if (isDragging) {
      swiping.current = false
      live.current = false
      setDx(0)
      setOpen(false)
    }
  }, [isDragging])

  const onTouchStart = (e) => {
    listeners?.onTouchStart?.(e) // mantém o drag de reordenar (TouchSensor)
    const t = e.touches[0]
    sx.current = t.clientX; sy.current = t.clientY; swiping.current = false
  }
  const onTouchMove = (e) => {
    if (isDragging) return // reordenando -> não interpreta como swipe
    const t = e.touches[0]
    const ddx = t.clientX - sx.current, ddy = t.clientY - sy.current
    if (!swiping.current) {
      // só vira swipe se o gesto for claramente horizontal
      if (Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy) * 1.6) swiping.current = true
      else return
    }
    live.current = true
    const base = open ? -72 : 0
    setDx(Math.max(-86, Math.min(0, base + ddx)))
  }
  const onTouchEnd = () => {
    if (!swiping.current) return
    live.current = false
    const willOpen = dx < -36
    setOpen(willOpen)
    setDx(willOpen ? -72 : 0)
    swiping.current = false
  }

  const revealed = !isDragging && (open || dx < -2)
  const reveal = -dx // 0..72 -> quanto o item encolhe (revela o botão)
  // reordenar só na vertical: zera o deslocamento horizontal do dnd-kit
  const vTransform = transform ? { ...transform, x: 0 } : null
  const style = {
    transform: CSS.Transform.toString(vTransform),
    // o item ENCOLHE pela direita; o título fica no lugar (não desliza)
    width: revealed ? `calc(100% - ${reveal}px)` : undefined,
    transition: isDragging ? transition : live.current ? 'none' : 'width 0.2s ease, transform 0.2s ease',
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
    ...(revealed ? { backgroundColor: 'var(--bg-elev)', overflow: 'hidden' } : null),
  }
  const indent = (ghostDepth != null ? ghostDepth : depth) * INDENT
  return (
    <div
      className={'nav-swipe' + (revealed ? ' swiping' : '')}
      style={{ paddingLeft: indent, ...(isDragging ? { zIndex: 50 } : null) }}
    >
      {revealed && (
        <button
          className="nav-del"
          onClick={() => { setOpen(false); setDx(0); onDelete(n) }}
          aria-label={t('note.deleteNote')}
        >
          <Trash2 size={16} />
        </button>
      )}
      <NavLink
        ref={setNodeRef}
        style={style}
        to={`/note/${n.id}`}
        draggable={false}
        className={({ isActive }) => 'nav-item note-item' + (isActive ? ' active' : '')}
        onContextMenu={(e) => onContextMenu(e, n.id)}
        onClick={(e) => { if (open) { e.preventDefault(); setOpen(false); setDx(0) } }}
        {...attributes}
        {...listeners}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <span className="emoji">{n.emoji || <FileText size={15} />}</span>
        <span className="title">{n.title || t('common.untitled')}</span>
        <span className="nav-actions">
          <button
            type="button"
            className="nav-add"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddChild?.(n.id) }}
            tabIndex={-1}
            title={t('sidebar.addSubpage')}
          >
            <Plus size={14} />
          </button>
          {hasChildren && (
            <button
              type="button"
              className={'nav-caret' + (collapsed ? '' : ' open')}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleCollapse?.(n.id) }}
              tabIndex={-1}
              aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            >
              <ChevronRight size={14} />
            </button>
          )}
        </span>
      </NavLink>
    </div>
  )
}

export default function Sidebar({ notes, sharedNotes = [], onNewNote, onDeleteNote, onMoveNotes, onAddSubpage, onSearch, open, onClose }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(null) // { id, x, y }
  const [confirm, setConfirm] = useState(null) // { id, title }

  // collapse por nota (persistido no localStorage)
  const [collapsed, setCollapsed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('nova-collapsed') || '[]')) } catch { return new Set() }
  })
  const toggleCollapse = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      try { localStorage.setItem('nova-collapsed', JSON.stringify([...next])) } catch {}
      return next
    })
  // botão + do item: cria subpágina e garante que o pai fique expandido
  const addChild = (id) => {
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      try { localStorage.setItem('nova-collapsed', JSON.stringify([...next])) } catch {}
      return next
    })
    onAddSubpage?.(id)
  }

  // estado do drag em árvore
  const [activeId, setActiveId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [offsetLeft, setOffsetLeft] = useState(0)

  const flattened = useMemo(() => {
    const flat = flattenTree(buildTree(notes, collapsed))
    const collapsedIds = flat.reduce((acc, i) => (i.collapsed && i.children.length ? [...acc, i.id] : acc), [])
    return removeChildrenOf(flat, activeId != null ? [activeId, ...collapsedIds] : collapsedIds)
  }, [notes, collapsed, activeId])
  const sortedIds = useMemo(() => flattened.map((i) => i.id), [flattened])
  const projected =
    activeId != null && overId != null ? getProjection(flattened, activeId, overId, offsetLeft, INDENT) : null

  // mouse: arrasta após 6px (clique simples navega).
  // toque (iPhone): segura ~220ms pra arrastar; toque rápido navega; rolar cancela.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  )

  const openMenu = (e, id) => {
    e.preventDefault()
    setMenu({ id, x: Math.min(e.clientX, window.innerWidth - 200), y: e.clientY })
  }

  const resetDnd = () => { setActiveId(null); setOverId(null); setOffsetLeft(0) }
  const onDragStart = ({ active }) => { setActiveId(active.id); setOverId(active.id) }
  const onDragMove = ({ delta }) => setOffsetLeft(delta.x)
  const onDragOver = ({ over }) => setOverId(over?.id ?? null)
  const onDragCancel = () => resetDnd()

  const onDragEnd = ({ active, over }) => {
    // engole o clique pós-drop (senão soltar em cima de um link navega/carrega)
    const swallow = (ev) => { ev.preventDefault(); ev.stopPropagation() }
    document.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => document.removeEventListener('click', swallow, true), 320)

    const proj = projected
    resetDnd()
    if (!over || !proj) return
    const clone = [...flattened]
    const activeIndex = clone.findIndex((i) => i.id === active.id)
    const overIndex = clone.findIndex((i) => i.id === over.id)
    if (activeIndex < 0 || overIndex < 0) return
    clone[activeIndex] = { ...clone[activeIndex], parentId: proj.parentId, depth: proj.depth }
    const ordered = arrayMove(clone, activeIndex, overIndex)
    // posição = índice global (buildTree ordena filhos por position, e a ordem
    // global já respeita a ordem visual dentro de cada pai)
    onMoveNotes?.(ordered.map((i, idx) => ({ id: i.id, parent_id: i.parentId ?? null, position: idx })))
  }

  return (
    <>
      {open && <div className="nav-backdrop" onClick={onClose} />}
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="brand">
          <PinwheelIcon className="logo" size={28} />
          <span className="brand-name">Nova notes</span>
        </div>

        <button type="button" className="nav-item nav-search" onClick={onSearch}>
          <Search size={17} /> <span className="title">{t('nav.search')}</span>
          <span className="nav-kbd">⌘K</span>
        </button>

        <NavLink to="/" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} end>
          <Home size={17} /> <span className="title">{t('nav.home')}</span>
        </NavLink>
        <NavLink to="/goals" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <Target size={17} /> <span className="title">{t('nav.goals')}</span>
        </NavLink>
        <NavLink to="/habits" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <CalendarCheck size={17} /> <span className="title">{t('nav.habits')}</span>
        </NavLink>
        <NavLink to="/agents" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <Bot size={17} /> <span className="title">{t('nav.agents')}</span>
        </NavLink>

        <div className="nav-section">{t('nav.notes')}</div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
            {flattened.map((item) => (
              <NoteItem
                key={item.id}
                n={item}
                depth={item.depth}
                ghostDepth={activeId === item.id && projected ? projected.depth : null}
                hasChildren={(item.children?.length || 0) > 0}
                collapsed={collapsed.has(item.id)}
                onToggleCollapse={toggleCollapse}
                onAddChild={addChild}
                onContextMenu={openMenu}
                onDelete={(note) => setConfirm({ id: note.id, title: note.title || t('common.untitled') })}
              />
            ))}
          </SortableContext>
        </DndContext>
        <button className="add-btn" onClick={onNewNote}><Plus size={15} /> {t('nav.newNote')}</button>

        {sharedNotes.length > 0 && (
          <>
            <div className="nav-section">{t('nav.shared')}</div>
            {sharedNotes.map((n) => (
              <NavLink
                key={n.id}
                to={`/note/${n.id}`}
                className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
              >
                <span className="emoji">{n.emoji || <FileText size={15} />}</span>
                <span className="title">{n.title || t('common.untitled')}</span>
              </NavLink>
            ))}
          </>
        )}

        <div className="sidebar-footer">
          <NavLink to="/settings" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <Settings size={17} /> <span className="title">{t('nav.settings')}</span>
          </NavLink>
        </div>
      </aside>

      {menu && createPortal(
        <>
          <div className="menu-backdrop" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }} />
          <div className="card-menu" style={{ position: 'fixed', top: menu.y, left: menu.x, right: 'auto', zIndex: 120 }}>
            <button className="danger" onClick={() => {
              const n = notes.find((x) => x.id === menu.id)
              setConfirm({ id: menu.id, title: n?.title || t('common.untitled') })
              setMenu(null)
            }}>
              <Trash2 size={14} /> {t('note.deleteNote')}
            </button>
          </div>
        </>,
        document.body,
      )}

      {confirm && (
        <ConfirmDialog
          title={t('note.deleteNote')}
          message={t('note.deleteConfirm', { title: confirm.title })}
          onConfirm={() => { onDeleteNote?.(confirm.id); setConfirm(null) }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  )
}
