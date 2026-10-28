import { Plus } from 'lucide-react'

// estado vazio padrão: a frase e a ação de criar dentro da mesma moldura
export default function EmptyState({ text, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      <p>{text}</p>
      {onAction && (
        <button className="btn-primary" onClick={onAction}>
          <Plus size={16} /> {actionLabel}
        </button>
      )}
    </div>
  )
}
