'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Sample } from '@/data/samples'
import { startAutosave } from '@/editor/autosave'
import { refreshRecents } from '@/editor/recents'
import { openImage } from '@/editor/store'
import { BestPractices, hasSeenTips, markTipsSeen } from './BestPractices'
import { Intro } from './intro/Intro'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { Viewport } from './Viewport'

function openFirst(files?: FileList | null) {
  const file = [...(files ?? [])].find((f) => f.type.startsWith('image/'))
  if (file) openImage(file)
}

export function EditorShell({ samples }: { samples: Sample[] }) {
  const [revealed, setRevealed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const reveal = useCallback(() => setRevealed(true), [])
  const input = useRef<HTMLInputElement>(null)
  const open = useCallback(() => input.current?.click(), [])
  const [tips, setTips] = useState(false)
  const closeTips = useCallback(() => {
    markTipsSeen()
    setTips(false)
  }, [])

  useEffect(() => {
    if (!revealed || hasSeenTips()) return
    const timer = setTimeout(() => setTips(true), 700)
    return () => clearTimeout(timer)
  }, [revealed])

  useEffect(() => {
    refreshRecents()
    return startAutosave()
  }, [])

  useEffect(() => {
    const paste = (event: ClipboardEvent) => openFirst(event.clipboardData?.files)
    window.addEventListener('paste', paste)
    return () => window.removeEventListener('paste', paste)
  }, [])

  return (
    <>
      <Intro onReveal={reveal} />
      <BestPractices open={tips} onClose={closeTips} />
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          openFirst(event.target.files)
          event.target.value = ''
        }}
      />
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          openFirst(event.dataTransfer.files)
        }}
        className={`flex min-h-dvh flex-col gap-2.5 bg-app-bg p-2.5 lg:h-dvh ${revealed ? 'console-in' : 'console-hidden'}`}
      >
        <TopBar onOpen={open} onTips={() => setTips(true)} />
        <main className="flex min-h-0 flex-1 flex-col gap-2.5 lg:flex-row">
          <Viewport onOpen={open} samples={samples} />
          <Sidebar />
        </main>
        {dragging && (
          <div className="anim-overlay-in pointer-events-none fixed inset-2.5 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-white/40 bg-black/50 text-lg font-semibold text-app-text backdrop-blur-sm">
            Drop to open
          </div>
        )}
      </div>
    </>
  )
}
