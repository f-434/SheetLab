import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconAlert, IconX } from './Icons'

interface ModalProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
  dismissible?: boolean
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 560,
  dismissible = true,
}: ModalProps) {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, dismissible])

  return createPortal(
    <div
      className="modal-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose()
      }}
    >
      <div
        className="modal"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭" disabled={!dismissible}>
            <IconX size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

interface ConfirmDialogProps {
  title: string
  message: ReactNode
  confirmText?: string
  busy?: boolean
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmText = '确认',
  busy = false,
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      dismissible={!busy}
      width={440}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <span className="spinner spinner-sm" />}
            {confirmText}
          </button>
        </>
      }
    >
      <div className="confirm-content">
        {danger && (
          <div className="confirm-icon">
            <IconAlert size={20} />
          </div>
        )}
        <div className="confirm-text">{message}</div>
      </div>
    </Modal>
  )
}
