'use client'

import type { Icon } from '@tabler/icons-react'
import { useEffect, useId, type ReactNode } from 'react'
import { usePresence } from './usePresence'

export function Modal({
  open,
  onClose,
  icon: ModalIcon,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  icon: Icon
  title: string
  children: ReactNode
}) {
  const { mounted, closing } = usePresence(open)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted) return null

  return (
    <div
      className={`fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm ${closing ? 'anim-overlay-out' : 'anim-overlay-in'}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full max-w-[420px] rounded-2xl border border-app-line bg-app-panel p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.04)_inset] ${
          closing ? 'anim-dialog-out' : 'anim-dialog-in'
        }`}
      >
        <div className="tile flex size-11 items-center justify-center rounded-xl">
          <ModalIcon size={20} stroke={1.75} className="text-app-text" />
        </div>
        <h2 id={titleId} className="mt-4 text-lg font-semibold text-app-text">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
