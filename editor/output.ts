import { PRESETS } from '@/data/presets'
import { canvasOf, pixels, scaled, toBlob } from './canvas'
import { Renderer } from './renderer'
import { currentParams, presetParams, useEditor } from './store'

let active: Renderer | null = null
let thumbs: Renderer | null = null

export function setActiveRenderer(renderer: Renderer | null) {
  active = renderer
}

export type ExportFormat = 'png' | 'jpeg'

export async function exportImage(format: ExportFormat) {
  const state = useEditor.getState()
  if (!active || !state.edited) return
  active.render(currentParams(state), state.focus)
  const blob = await toBlob(active.canvas, `image/${format}`, 0.95)
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${state.name}-edited.${format === 'png' ? 'png' : 'jpg'}`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function renderThumbnails(): Record<string, string> {
  const state = useEditor.getState()
  if (!state.edited) return {}
  try {
    thumbs ??= new Renderer(document.createElement('canvas'))
  } catch {
    return {}
  }
  thumbs.setImage(pixels(scaled(canvasOf(state.edited), 360)))
  thumbs.setDepth(state.depth)
  thumbs.setGlow(state.glow)
  thumbs.glowStrength = state.glowStrength / 100
  const out: Record<string, string> = {}
  for (const id of ['auto', ...PRESETS.map((p) => p.id)]) {
    thumbs.render(presetParams(state, id, 100), state.focus)
    out[id] = thumbs.canvas.toDataURL('image/jpeg', 0.85)
  }
  return out
}

export function encodeImage(image: ImageData) {
  return toBlob(canvasOf(image), 'image/png')
}

export async function snapshot() {
  return active ? toBlob(scaled(active.canvas, 320), 'image/jpeg', 0.85) : null
}
