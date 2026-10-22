import { PRESETS } from '@/data/presets'
import { Renderer } from './renderer'
import { currentParams, presetParams, useEditor } from './store'

let active: Renderer | null = null
let thumbs: Renderer | null = null

export function setActiveRenderer(renderer: Renderer | null) {
  active = renderer
}

export type ExportFormat = 'png' | 'jpeg'

function canvasOf(image: ImageData) {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext('2d')!.putImageData(image, 0, 0)
  return canvas
}

function scaled(source: HTMLCanvasElement, width: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.max(1, Math.round((source.height / source.width) * width))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

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
  const small = scaled(canvasOf(state.edited), 360)
  thumbs.setImage(small.getContext('2d')!.getImageData(0, 0, small.width, small.height))
  const out: Record<string, string> = {}
  for (const preset of PRESETS) {
    thumbs.render(presetParams(state, preset.id, 100), state.focus)
    out[preset.id] = thumbs.canvas.toDataURL('image/jpeg', 0.85)
  }
  return out
}

export function encodeImage(image: ImageData) {
  return toBlob(canvasOf(image), 'image/png')
}

export async function snapshot() {
  return active ? toBlob(scaled(active.canvas, 320), 'image/jpeg', 0.85) : null
}
