import { canvasOf, pixels, scaled, toBlob } from './canvas'
import type { Focus, Targets } from './params'

type Box = [number, number, number, number]

export type Subject = { kind: 'vehicle' | 'person'; score: number; box: Box; depth: number; mask: Uint8Array }

export type Sight = { map: ImageData; subjects: Subject[] }

export type Depth = Sight | 'loading' | null

async function decode(url: string) {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob())
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d', { willReadFrequently: true })!.drawImage(bitmap, 0, 0)
  bitmap.close()
  return pixels(canvas)
}

function outline(map: ImageData, box: Box) {
  const { data, width, height } = map
  const [x0, y0, x1, y1] = [box[0] * width, box[1] * height, box[2] * width, box[3] * height].map(Math.round)
  const [px0, py0, px1] = [Math.max(0, x0 - (x1 - x0) * 0.04), Math.max(0, y0 - (y1 - y0) * 0.18), Math.min(width, x1 + (x1 - x0) * 0.04)].map(Math.round)
  const inside: number[] = []
  const core: number[] = []
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const d = data[(y * width + x) * 4]
      inside.push(d)
      if (Math.abs(x - (x0 + x1) / 2) < (x1 - x0) * 0.2 && Math.abs(y - (y0 + y1) / 2) < (y1 - y0) * 0.2) core.push(d)
    }
  }
  const middle = (values: number[], q: number) => values.sort((a, b) => a - b)[Math.floor((values.length - 1) * q)] ?? 0
  const depth = middle(core, 0.5)
  const cut = depth - Math.max(24, (depth - middle(inside, 0.1)) * 0.7)
  const mask = new Uint8Array(width * height)
  for (let y = py0; y < y1; y++) {
    for (let x = px0; x < px1; x++) {
      if (data[(y * width + x) * 4] < cut) continue
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) mask[Math.min(height - 1, Math.max(0, y + dy)) * width + Math.min(width - 1, Math.max(0, x + dx))] = 1
    }
  }
  return { depth: depth / 255, mask }
}

function shared(a: Box, b: Box) {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  return (w * h) / Math.min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
}

export async function estimateDepth(image: ImageData): Promise<Depth> {
  try {
    const response = await fetch('/api/focus', { method: 'POST', body: await toBlob(scaled(canvasOf(image), 640), 'image/jpeg', 0.85) })
    if (!response.ok) return null
    const { depth, subjects }: { depth: string; subjects: Omit<Subject, 'depth' | 'mask'>[] } = await response.json()
    const map = await decode(depth)
    const merged: Omit<Subject, 'mask'>[] = []
    for (const s of subjects.map((s) => ({ ...s, depth: outline(map, s.box).depth }))) {
      const twin = merged.find((m) => m.kind === s.kind && Math.abs(m.depth - s.depth) < 0.08 && shared(m.box, s.box) > 0.3)
      if (twin) twin.box = [Math.min(twin.box[0], s.box[0]), Math.min(twin.box[1], s.box[1]), Math.max(twin.box[2], s.box[2]), Math.max(twin.box[3], s.box[3])]
      else merged.push(s)
    }
    return { map, subjects: merged.map((s) => ({ ...s, ...outline(map, s.box) })) }
  } catch {
    return null
  }
}

const area = ({ box }: Subject) => (box[2] - box[0]) * (box[3] - box[1])

const weight = (s: Subject) => area(s) * s.score * (s.score < 0.5 ? 0.2 : 1) * (0.5 + s.depth) * (s.box[0] < 0.01 || s.box[2] > 0.99 ? 0.5 : 1)

export function chooseTargets(subjects: Subject[], targets: Targets = 'auto') {
  if (Array.isArray(targets)) return targets.filter((i) => subjects[i])
  const best = Math.max(0, ...subjects.map(weight))
  const picked = subjects.flatMap((s, i) => {
    const keep = targets === 'auto' ? area(s) >= 0.015 && (weight(s) === best || (weight(s) >= best * 0.08 && s.box[0] > 0.01 && s.box[2] < 0.99)) : targets === 'all' || (targets === 'vehicles' ? s.kind === 'vehicle' : s.kind === 'person')
    return keep ? [i] : []
  })
  if (targets !== 'auto') return picked
  return subjects.flatMap((s, i) => (picked.includes(i) || picked.some((j) => Math.abs(subjects[j].depth - s.depth) < 0.06) ? [i] : []))
}

export function standout(subjects: Subject[]) {
  const total = subjects.reduce((sum, s) => sum + weight(s), 0)
  const lead = subjects.reduce((a, s) => (weight(s) > weight(a) ? s : a))
  return total ? (weight(lead) / total) * Math.min(1, Math.max(0, (area(lead) - 0.01) / 0.025)) : 0
}

export function focusField({ map, subjects }: Sight, focus: Focus, size: number) {
  const { data, width, height } = map
  const chosen = chooseTargets(subjects, focus.targets).map((i) => subjects[i])
  const leads = chosen.filter((s) => area(s) >= 0.015)
  const planes = leads.length ? leads.map((s) => s.depth) : [data[(Math.min(height - 1, Math.round(focus.y * height)) * width + Math.min(width - 1, Math.round(focus.x * width))) * 4] / 255]
  const near = Math.max(...planes)
  const far = Math.min(...planes)
  const tolerance = 0.02 + 0.1 * size
  let blur = new Float32Array(width * height).map((_, p) => {
    if (chosen.some((s) => s.mask[p])) return 0
    const d = data[p * 4] / 255
    return Math.min(1, Math.max(0, (d > near ? (d - near) * 0.7 : (far - d) / Math.max(far, 0.1)) - tolerance) / 1)
  })
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 0], [0, 1]]) {
    const next = new Float32Array(blur.length)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0
        for (let k = -3; k <= 3; k++) sum += blur[Math.min(height - 1, Math.max(0, y + k * dy)) * width + Math.min(width - 1, Math.max(0, x + k * dx))]
        next[y * width + x] = sum / 7
      }
    }
    blur = next
  }
  const field = new ImageData(width, height)
  blur.forEach((v, p) => {
    field.data[p * 4] = v * 255
    field.data[p * 4 + 3] = 255
  })
  return field
}

export function subjectCenter(subjects: Subject[], targets: Targets = 'auto') {
  const chosen = chooseTargets(subjects, targets).map((i) => subjects[i])
  if (!chosen.length) return null
  const total = chosen.reduce((sum, s) => sum + area(s), 0)
  return {
    x: chosen.reduce((sum, s) => sum + ((s.box[0] + s.box[2]) / 2) * area(s), 0) / total,
    y: chosen.reduce((sum, s) => sum + ((s.box[1] + s.box[3]) / 2) * area(s), 0) / total,
  }
}
