'use client'

import { IconBulb, IconCameraSpark, IconChevronDown, IconDownload, IconHistory, IconPhotoUp, IconX } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { exportImage, type ExportFormat } from '@/editor/output'
import { useRecents } from '@/editor/recents'
import { restoreRecent, useEditor } from '@/editor/store'
import { CloseDialog } from './CloseDialog'
import { usePresence } from './usePresence'

const FORMATS: { value: ExportFormat; label: string; detail: string }[] = [
  { value: 'png', label: 'PNG', detail: 'Full quality' },
  { value: 'jpeg', label: 'JPG', detail: 'Smaller file' },
]

export function TopBar({ onOpen, onTips }: { onOpen: () => void; onTips: () => void }) {
  const name = useEditor((s) => s.name)
  const image = useEditor((s) => s.original)
  const [closing, setClosing] = useState(false)

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 rounded-2xl border border-app-line bg-app-panel px-3">
      <div className="tile flex size-9 shrink-0 items-center justify-center rounded-xl">
        <IconCameraSpark size={18} stroke={1.75} className="text-app-text" />
      </div>
      <div className="flex min-w-0 flex-col leading-tight">
        {image ? (
          <span key={name} className="anim-swap truncate text-sm">
            <span className="font-semibold text-app-text">{name}</span>{' '}
            <span className="text-app-dim tabular-nums">
              {image.width} × {image.height}
            </span>
          </span>
        ) : (
          <span className="text-sm text-app-dim">No photo open</span>
        )}
      </div>
      {image && (
        <button
          type="button"
          onClick={() => setClosing(true)}
          title="Close photo"
          aria-label="Close photo"
          className="anim-pop flex size-7 shrink-0 items-center justify-center rounded-lg text-app-dim transition-colors hover:bg-white/[0.06] hover:text-app-text"
        >
          <IconX size={15} />
        </button>
      )}
      <CloseDialog open={closing} onClose={() => setClosing(false)} />
      <div className="ml-auto flex items-center gap-2">
        <button type="button" onClick={onTips} title="Best practices" aria-label="Best practices" className="btn-skeu-dark flex size-8 items-center justify-center rounded-lg">
          <IconBulb size={15} />
        </button>
        <HistoryButton />
        <button type="button" onClick={onOpen} className="btn-skeu-dark flex h-8 items-center gap-2 rounded-lg px-3 text-sm">
          <IconPhotoUp size={15} />
          <span className="hidden sm:inline">Open</span>
        </button>
        <ExportButton disabled={!image} />
      </div>
    </header>
  )
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function ago(time: number) {
  const seconds = Math.round((time - Date.now()) / 1000)
  if (seconds > -60) return 'Just now'
  const minutes = Math.round(seconds / 60)
  if (minutes > -60) return relative.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours > -24) return relative.format(hours, 'hour')
  return relative.format(Math.round(hours / 24), 'day')
}

function useMenu() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const { mounted, closing } = usePresence(open, 140)

  useEffect(() => {
    if (!open) return
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [open])

  return { open, setOpen, root, mounted, closing }
}

function HistoryButton() {
  const items = useRecents((s) => s.items)
  const current = useEditor((s) => s.id)
  const { open, setOpen, root, mounted, closing } = useMenu()

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="History"
        aria-label="History"
        className="btn-skeu-dark flex size-8 items-center justify-center rounded-lg"
      >
        <IconHistory size={15} />
      </button>
      {mounted && (
        <div
          className={`absolute top-10 right-0 z-50 w-72 rounded-xl border border-app-line bg-app-raised p-1 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.9)] ${closing ? 'anim-overlay-out' : 'anim-pop'}`}
        >
          {items.length ? (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setOpen(false)
                  if (item.id !== current) restoreRecent(item.id)
                }}
                className={`flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-white/[0.06] ${item.id === current ? 'bg-white/[0.06]' : ''}`}
              >
                <span className="block h-10 w-16 shrink-0 overflow-hidden rounded-md border border-app-line/70 bg-app-panel">
                  {item.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumb} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-app-text">{item.name}</span>
                  <span className="block text-xs text-app-dim">{item.id === current ? 'Open now' : ago(item.updatedAt)}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-app-dim">No recent photos</div>
          )}
        </div>
      )}
    </div>
  )
}

function ExportButton({ disabled }: { disabled: boolean }) {
  const [saving, setSaving] = useState(false)
  const { open, setOpen, root, mounted, closing } = useMenu()

  const save = async (format: ExportFormat) => {
    setOpen(false)
    setSaving(true)
    await exportImage(format)
    setSaving(false)
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        disabled={disabled || saving}
        onClick={() => setOpen(!open)}
        className="btn-skeu flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium disabled:opacity-50"
      >
        <IconDownload size={15} />
        Export
        <IconChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {mounted && (
        <div
          className={`absolute top-10 right-0 z-50 w-48 rounded-xl border border-app-line bg-app-raised p-1 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.9)] ${closing ? 'anim-overlay-out' : 'anim-pop'}`}
        >
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => save(f.value)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-app-text transition-colors hover:bg-white/[0.06]"
            >
              <span className="font-medium">{f.label}</span>
              <span className="text-xs text-app-dim">{f.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
