'use client'

import { IconArrowsMaximize, IconMessageOff, IconPhoto, IconSparkles, IconTypographyOff, type Icon } from '@tabler/icons-react'
import { Modal } from './Modal'

const TIPS: { icon: Icon; title: string; detail: string }[] = [
  { icon: IconPhoto, title: 'Use the raw screenshot', detail: "Don't crop, filter or edit it before uploading" },
  { icon: IconTypographyOff, title: 'No text or stickers', detail: 'Add captions after you export.' },
  { icon: IconArrowsMaximize, title: 'Keep it full size', detail: 'Upload the original file' },
  { icon: IconMessageOff, title: 'Close chat and menus', detail: 'The Roblox buttons and screenshot banner are removed for you' },
]

const COOKIE = 'roblox-editor-tips'

export function hasSeenTips() {
  return document.cookie.split('; ').some((c) => c.startsWith(`${COOKIE}=`))
}

export function markTipsSeen() {
  document.cookie = `${COOKIE}=1; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`
}

export function BestPractices({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} icon={IconSparkles} title="Best practices">
      <ul className="mt-3 divide-y divide-app-line/60 rounded-xl border border-app-line/70 bg-white/[0.02]">
        {TIPS.map(({ icon: TipIcon, title, detail }) => (
          <li key={title} className="flex items-start gap-3 px-3.5 py-3">
            <TipIcon size={16} stroke={1.75} className="mt-0.5 shrink-0 text-app-dim" />
            <div className="min-w-0">
              <div className="text-sm text-app-text">{title}</div>
              <div className="text-xs text-app-dim">{detail}</div>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" autoFocus onClick={onClose} className="btn-skeu mt-4 h-9 w-full rounded-lg text-sm font-medium">
        Got it
      </button>
    </Modal>
  )
}
