import { create } from 'zustand'
import { DEFAULT_PRESET, PRESETS } from '@/data/presets'
import { autoLook, type AutoLook } from './autoLook'
import { autoTone } from './autoTone'
import { detectUi, undim, type Detection } from './detectUi'
import { inpaint } from './inpaint'
import type { MaskRegion } from './mask'
import { blend, combine, NEUTRAL, type Focus, type NumericKey, type Params } from './params'
import { loadRecent } from './recents'
import { readScene } from './scene'
import { MAX_SIZE } from './renderer'

type Mode = 'auto' | 'manual'
export type Removal = 'left' | 'right' | 'banner'

type EditorState = {
  id: string | null
  source: Blob | null
  name: string
  original: ImageData | null
  edited: ImageData | null
  detection: Detection | null
  removals: Record<Removal, boolean>
  cleaning: boolean
  history: ImageData[]
  future: ImageData[]
  filling: boolean
  mode: Mode
  preset: string
  strength: number
  auto: Partial<Params>
  autoLook: AutoLook
  manual: Params
  focus: Focus
  comparing: boolean
  erasing: boolean
  brush: number
  error: string | null
}

const IDLE = { history: [], future: [], cleaning: false, filling: false, comparing: false, erasing: false, error: null }

const EMPTY = { id: null, source: null, name: '', original: null, edited: null, detection: null, ...IDLE }

export const useEditor = create<EditorState>(() => ({
  ...EMPTY,
  removals: { left: true, right: true, banner: true },
  mode: 'auto',
  preset: DEFAULT_PRESET,
  strength: 100,
  auto: {},
  autoLook: { base: DEFAULT_PRESET, look: {} },
  manual: NEUTRAL,
  focus: { x: 0.5, y: 0.5 },
  brush: 4,
}))

export function presetParams(state: Pick<EditorState, 'auto' | 'autoLook'>, id: string, strength: number) {
  const look = id === 'auto' ? state.autoLook.look : (PRESETS.find((p) => p.id === id) ?? PRESETS[0]).look
  return blend(combine(state.auto, look), strength / 100)
}

function analyze(image: ImageData) {
  const scene = readScene(image)
  const auto = autoTone(image)
  return { auto, autoLook: autoLook(image, auto, scene), focus: { x: scene.subject.x, y: scene.subject.y } }
}

export function currentParams(state: EditorState): Params {
  return state.mode === 'auto' ? presetParams(state, state.preset, state.strength) : state.manual
}

async function decode(file: Blob) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIZE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return ctx.getImageData(0, 0, width, height)
}

let token = 0

export async function openImage(file: File) {
  if (!file.type.startsWith('image/')) {
    useEditor.setState({ error: 'That file is not an image' })
    return
  }
  const run = ++token
  try {
    const image = await decode(file)
    if (run !== token) return
    useEditor.setState({
      ...IDLE,
      id: crypto.randomUUID(),
      source: file,
      name: file.name.replace(/\.[^.]+$/, '') || 'screenshot',
      original: image,
      edited: image,
      detection: detectUi(image),
      ...analyze(image),
    })
    await clean(run)
  } catch {
    if (run === token) useEditor.setState({ error: 'Could not read that image', cleaning: false })
  }
}

export function closePhoto() {
  token++
  useEditor.setState(EMPTY)
}

export async function restoreRecent(id: string) {
  const run = ++token
  const recent = await loadRecent(id)
  if (!recent || run !== token) return
  try {
    const original = await decode(recent.original)
    const edited = recent.edited ? await decode(recent.edited) : original
    if (run !== token) return
    useEditor.setState({
      ...IDLE,
      ...analyze(original),
      ...recent.settings,
      id: recent.id,
      source: recent.original,
      name: recent.name,
      original,
      edited,
      detection: detectUi(original),
    })
  } catch {
    if (run === token) useEditor.setState({ error: 'Could not open that photo' })
  }
}

async function clean(run: number) {
  const { original, detection, removals } = useEditor.getState()
  if (!original || !detection) return
  const { left, right, banner } = detection
  const undimmed = removals.banner && banner && 'rect' in banner
  const masks = [removals.banner && banner && ('rect' in banner ? banner.text : banner), removals.left && left, removals.right && right]
  useEditor.setState({ cleaning: true })
  let image = undimmed ? undim(original, banner) : original
  for (const mask of masks) {
    if (!mask) continue
    image = await inpaint(image, mask)
    if (run !== token) return
  }
  useEditor.setState({ edited: image, history: [], future: [], cleaning: false })
}

export async function setRemoval(removal: Removal, on: boolean) {
  const run = ++token
  useEditor.setState((s) => ({ removals: { ...s.removals, [removal]: on } }))
  await clean(run)
}

export async function eraseRegion(region: MaskRegion) {
  const { edited, history } = useEditor.getState()
  if (!edited) return
  const run = token
  useEditor.setState({ filling: true })
  const filled = await inpaint(edited, region)
  if (run !== token) return useEditor.setState({ filling: false })
  useEditor.setState({ edited: filled, history: [...history, edited].slice(-15), future: [], filling: false })
}

export function undoErase() {
  const { edited, history, future } = useEditor.getState()
  if (!edited || !history.length) return
  useEditor.setState({ edited: history[history.length - 1], history: history.slice(0, -1), future: [...future, edited] })
}

export function redoErase() {
  const { edited, history, future } = useEditor.getState()
  if (!edited || !future.length) return
  useEditor.setState({ edited: future[future.length - 1], history: [...history, edited].slice(-15), future: future.slice(0, -1) })
}

export function setMode(mode: Mode) {
  useEditor.setState({ mode })
}

export function choosePreset(preset: string) {
  useEditor.setState({ preset, mode: 'auto' })
}

export function fineTune() {
  const state = useEditor.getState()
  useEditor.setState({ manual: presetParams(state, state.preset, state.strength), mode: 'manual' })
}

export function setParam<K extends keyof Params>(key: K, value: Params[K]) {
  useEditor.setState((s) => ({ manual: { ...s.manual, [key]: value } }))
}

export function resetParam(key: NumericKey) {
  setParam(key, NEUTRAL[key])
}

export function resetManual() {
  useEditor.setState({ manual: NEUTRAL })
}

export function autoManual() {
  const state = useEditor.getState()
  useEditor.setState({ manual: { ...NEUTRAL, ...state.auto } })
}
