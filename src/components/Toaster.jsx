import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Info, X } from 'lucide-react'
import { useLang } from '../context/LanguageContext'

const LEAVE_MS = 220 // duração da animação de saída

// pilha de toasts no topo: somem sozinhos (pausam com o mouse em cima) ou no ×
export default function Toaster() {
  const { t } = useLang()
  const [items, setItems] = useState([])
  const timers = useRef({})

  const dismiss = (id) => {
    clearTimeout(timers.current[id])
    delete timers.current[id]
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)))
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), LEAVE_MS)
  }
  const arm = (id, ms) => {
    clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(() => dismiss(id), ms)
  }

  useEffect(() => {
    const onToast = (e) => {
      const { message, type, duration } = e.detail
      const id = Date.now() + Math.random()
      setItems((xs) => {
        // a mesma mensagem repetida não empilha: só renova o tempo
        const same = xs.find((x) => x.message === message && !x.leaving)
        if (same) {
          arm(same.id, duration)
          return xs
        }
        arm(id, duration)
        return [...xs.slice(-2), { id, message, type, duration }]
      })
    }
    window.addEventListener('nova:toast', onToast)
    return () => window.removeEventListener('nova:toast', onToast)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!items.length) return null
  return (
    <div className="toaster" aria-live="polite">
      {items.map((x) => (
        <div
          key={x.id}
          className={'toast ' + x.type + (x.leaving ? ' leaving' : '')}
          role={x.type === 'error' ? 'alert' : 'status'}
          onMouseEnter={() => clearTimeout(timers.current[x.id])}
          onMouseLeave={() => !x.leaving && arm(x.id, 2500)}
        >
          {x.type === 'error' ? <AlertCircle size={16} className="toast-ico" /> : <Info size={16} className="toast-ico" />}
          <span className="toast-msg">{x.message}</span>
          <button className="toast-close" onClick={() => dismiss(x.id)} aria-label={t('common.close')}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
