'use client'

import { IconDownload, IconLoader2, IconPhotoX } from '@tabler/icons-react'
import { useState } from 'react'
import { flushSave } from '@/editor/autosave'
import { exportImage } from '@/editor/output'
import { closePhoto } from '@/editor/store'
import { Modal } from './Modal'

export function CloseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false)

  const finish = async (save: boolean) => {
    setBusy(true)
    await flushSave()
    if (save) await exportImage('png')
    closePhoto()
    setBusy(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} icon={IconPhotoX} title="Export before closing?">
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => finish(false)} className="btn-skeu-dark h-9 rounded-lg text-sm disabled:opacity-60">
          Just close
        </button>
        <button
          type="button"
          autoFocus
          disabled={busy}
          onClick={() => finish(true)}
          className="btn-skeu flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium disabled:opacity-60"
        >
          {busy ? <IconLoader2 size={15} className="spin" /> : <IconDownload size={15} />}
          Export and close
        </button>
      </div>
    </Modal>
  )
}
