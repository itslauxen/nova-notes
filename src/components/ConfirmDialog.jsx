import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../context/LanguageContext'

// Modal de confirmação. Enter confirma, Esc cancela.
export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }) {
  const { t } = useLang()
  const titleText = title ?? t('common.confirm')
  const confirmText = confirmLabel ?? t('common.delete')
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onConfirm() }
      else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm, onCancel])

  return createPortal(
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{titleText}</div>
        {message && <div className="modal-msg">{message}</div>}
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onCancel}>{t('common.cancel')}</button>
          <button className="btn-danger" onClick={onConfirm} autoFocus>{confirmText}</button>
        </div>
        <div className="modal-hint">{t('dialog.confirmHint')}</div>
      </div>
    </div>,
    document.body,
  )
}
