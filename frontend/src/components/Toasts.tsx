import { useCallback, useRef, useState } from 'react'
import type { ToastItem, ToastKind } from '../types'
import { IconAlert, IconCheck, IconInfo, IconX } from './Icons'

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((item) => item.id !== id))
  }, [])

  const push = useCallback(
    (kind: ToastKind, text: string) => {
      const id = ++counter.current
      setToasts((list) => [...list.slice(-3), { id, kind, text }])
      window.setTimeout(() => dismiss(id), 5000)
    },
    [dismiss],
  )

  return { toasts, dismiss, push }
}

interface ToastsProps {
  items: ToastItem[]
  onDismiss: (id: number) => void
}

export function Toasts({ items, onDismiss }: ToastsProps) {
  return (
    <div className="toast-stack" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`toast toast-${item.kind}`}>
          <span className="toast-icon">
            {item.kind === 'success' && <IconCheck size={16} />}
            {item.kind === 'error' && <IconAlert size={16} />}
            {item.kind === 'info' && <IconInfo size={16} />}
          </span>
          <span className="toast-text">{item.text}</span>
          <button className="toast-close" onClick={() => onDismiss(item.id)} aria-label="关闭">
            <IconX size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
