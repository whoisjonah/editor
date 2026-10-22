import { encodeImage, snapshot } from './output'
import { saveRecent } from './recents'
import { useEditor } from './store'

const DELAY = 1000

const WATCHED = ['id', 'edited', 'mode', 'preset', 'strength', 'manual', 'focus', 'removals'] as const
const SETTLED = ['cleaning', 'filling', 'comparing'] as const

let encoded: { image: ImageData; blob: Blob | null } | null = null
let timer: ReturnType<typeof setTimeout> | undefined

async function save() {
  const s = useEditor.getState()
  if (!s.id || !s.source || !s.original || !s.edited || SETTLED.some((key) => s[key])) return
  if (encoded?.image !== s.edited) {
    encoded = { image: s.edited, blob: s.edited === s.original ? null : await encodeImage(s.edited) }
  }
  const thumb = await snapshot()
  const latest = useEditor.getState()
  if (latest.id !== s.id || latest.edited !== s.edited) return
  await saveRecent({
    id: s.id,
    name: s.name,
    updatedAt: Date.now(),
    original: s.source,
    edited: encoded.blob,
    thumb,
    settings: { mode: s.mode, preset: s.preset, strength: s.strength, manual: s.manual, focus: s.focus, removals: s.removals },
  })
}

export function flushSave() {
  clearTimeout(timer)
  return save()
}

export function startAutosave() {
  const stop = useEditor.subscribe((s, prev) => {
    const changed = WATCHED.some((key) => s[key] !== prev[key]) || SETTLED.some((key) => prev[key] && !s[key])
    if (!changed || !s.id) return
    clearTimeout(timer)
    timer = setTimeout(save, DELAY)
  })
  return () => {
    clearTimeout(timer)
    stop()
  }
}
