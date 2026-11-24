import { useEffect, useId, type ReactNode } from 'react'

type ModalProps = { title: string; onClose: () => void; small?: boolean; children: ReactNode }

export function Modal({ title, onClose, small, children }: ModalProps) {
  const titleId = useId()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="module-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={`module-modal__box${small ? ' small' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="module-modal__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-close" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
