import { canvasOf, pixels, scaled, toBlob } from './canvas'
import type { Focus, Targets } from './params'

type Box = [number, number, number, number]

export type Subject = { kind: 'vehicle' | 'person' | 'object'; score: number; box: Box; depth: number; mask: Float32Array }

export type Sight = { map: ImageData; guide: ImageData; photo: Blob; subjects: Subject[] }

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

function planeOf({ data, width, height }: ImageData, box: Box) {
  const [x0, y0, x1, y1] = [box[0] * width, box[1] * height, box[2] * width, box[3] * height].map(Math.round)
  const core: number[] = []
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (Math.abs(x - (x0 + x1) / 2) < (x1 - x0) * 0.2 && Math.abs(y - (y0 + y1) / 2) < (y1 - y0) * 0.2) core.push(data[(y * width + x) * 4])
    }
  }
  return (core.sort((a, b) => a - b)[Math.floor((core.length - 1) / 2)] ?? 0) / 255
}

type Prompt = { box: Box } | { point: [number, number] }

async function segment(photo: Blob, prompts: Prompt[]) {
  const form = new FormData()
  form.append('image', photo)
  form.append('prompts', JSON.stringify(prompts))
  const response = await fetch('/api/segment', { method: 'POST', body: form })
  if (!response.ok) throw new Error('Could not find the subject')
  const { masks }: { masks: string[] } = await response.json()
  return Promise.all(
    masks.map(async (url) => {
      const { data } = await decode(url)
      return Float32Array.from({ length: data.length / 4 }, (_, p) => data[p * 4] / 255)
    }),
  )
}

const reach = ({ kind, box }: Pick<Subject, 'kind' | 'box'>): Box => {
  const h = box[3] - box[1]
  const w = box[2] - box[0]
  const up = kind === 'vehicle' ? 0.12 : 0.04
  return [Math.max(0, box[0] - w * 0.02), Math.max(0, box[1] - h * up), Math.min(1, box[2] + w * 0.02), Math.min(1, box[3] + h * 0.02)]
}

function shared(a: Box, b: Box) {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  return (w * h) / Math.min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
}

export async function estimateDepth(image: ImageData): Promise<Depth> {
  try {
    const canvas = canvasOf(image)
    const response = await fetch('/api/focus', { method: 'POST', body: await toBlob(scaled(canvas, 640), 'image/jpeg', 0.85) })
    if (!response.ok) return null
    const { depth, subjects }: { depth: string; subjects: Omit<Subject, 'depth' | 'mask'>[] } = await response.json()
    const map = await decode(depth)
    const merged: Omit<Subject, 'mask'>[] = []
    for (const s of subjects.map((s) => ({ ...s, depth: planeOf(map, s.box) }))) {
      const twin = merged.find((m) => m.kind === s.kind && Math.abs(m.depth - s.depth) < 0.08 && shared(m.box, s.box) > 0.3)
      if (twin) twin.box = [Math.min(twin.box[0], s.box[0]), Math.min(twin.box[1], s.box[1]), Math.max(twin.box[2], s.box[2]), Math.max(twin.box[3], s.box[3])]
      else merged.push(s)
    }
    const view = scaled(canvas, Math.min(1024, image.width))
    const photo = (await toBlob(view, 'image/jpeg', 0.92))!
    const masks = merged.length ? await segment(photo, merged.map((s) => ({ box: reach(s) }))) : []
    return { map, guide: pixels(view), photo, subjects: merged.map((s, i) => ({ ...s, mask: masks[i] })) }
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

export async function findObject({ map, guide, photo }: Sight, x: number, y: number): Promise<Subject | null> {
  const [mask] = await segment(photo, [{ point: [x, y] }])
  const { width, height } = guide
  const bounds = [width, height, 0, 0]
  let count = 0
  mask.forEach((v, p) => {
    if (v < 0.5) return
    const px = p % width
    const py = (p - px) / width
    bounds[0] = Math.min(bounds[0], px)
    bounds[1] = Math.min(bounds[1], py)
    bounds[2] = Math.max(bounds[2], px + 1)
    bounds[3] = Math.max(bounds[3], py + 1)
    count++
  })
  if (count < 40) return null
  const box: Box = [bounds[0] / width, bounds[1] / height, bounds[2] / width, bounds[3] / height]
  return { kind: 'object', score: 1, box, depth: planeOf(map, box), mask }
}

export function standout(subjects: Subject[]) {
  const total = subjects.reduce((sum, s) => sum + weight(s), 0)
  const lead = subjects.reduce((a, s) => (weight(s) > weight(a) ? s : a))
  return total ? (weight(lead) / total) * Math.min(1, Math.max(0, (area(lead) - 0.01) / 0.025)) : 0
}

function boxBlur(source: Float32Array, width: number, height: number, radius: number) {
  const scale = 1 / (radius * 2 + 1)
  const across = new Float32Array(source.length)
  for (let y = 0; y < height; y++) {
    const row = y * width
    let sum = 0
    for (let i = -radius; i <= radius; i++) sum += source[row + Math.min(width - 1, Math.max(0, i))]
    for (let x = 0; x < width; x++) {
      across[row + x] = sum * scale
      sum += source[row + Math.min(width - 1, x + radius + 1)] - source[row + Math.max(0, x - radius)]
    }
  }
  const out = new Float32Array(source.length)
  const sums = new Float32Array(width)
  for (let i = -radius; i <= radius; i++) {
    const row = Math.min(height - 1, Math.max(0, i)) * width
    for (let x = 0; x < width; x++) sums[x] += across[row + x]
  }
  for (let y = 0; y < height; y++) {
    const add = Math.min(height - 1, y + radius + 1) * width
    const drop = Math.max(0, y - radius) * width
    for (let x = 0; x < width; x++) {
      out[y * width + x] = sums[x] * scale
      sums[x] += across[add + x] - across[drop + x]
    }
  }
  return out
}

function upscale(values: Float32Array, width: number, height: number, w: number, h: number) {
  const out = new Float32Array(w * h)
  for (let p = 0; p < out.length; p++) {
    const x = Math.min(width - 1, Math.max(0, (((p % w) + 0.5) * width) / w - 0.5))
    const y = Math.min(height - 1, Math.max(0, ((Math.floor(p / w) + 0.5) * height) / h - 0.5))
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const x1 = Math.min(width - 1, x0 + 1)
    const y1 = Math.min(height - 1, y0 + 1)
    const fx = x - x0
    const fy = y - y0
    out[p] = (values[y0 * width + x0] * (1 - fx) + values[y0 * width + x1] * fx) * (1 - fy) + (values[y1 * width + x0] * (1 - fx) + values[y1 * width + x1] * fx) * fy
  }
  return out
}

export function focusField({ map, guide, subjects }: Sight, focus: Focus, size: number) {
  const { data, width, height } = map
  const { width: w, height: h } = guide
  const chosen = chooseTargets(subjects, focus.targets).map((i) => subjects[i])
  const leads = chosen.filter((s) => area(s) >= 0.015)
  const planes = leads.length ? leads.map((s) => s.depth) : [data[(Math.min(height - 1, Math.round(focus.y * height)) * width + Math.min(width - 1, Math.round(focus.x * width))) * 4] / 255]
  const near = Math.max(...planes)
  const far = Math.min(...planes)
  const tolerance = 0.02 + 0.1 * size
  const cutout = new Float32Array(w * h).map((_, p) => Math.max(0, ...chosen.map((s) => s.mask[p])))
  const open = new Float32Array(width * height).map((_, p) => 1 - cutout[Math.min(h - 1, Math.floor(((Math.floor(p / width) + 0.5) * h) / height)) * w + Math.min(w - 1, Math.floor((((p % width) + 0.5) * w) / width))])
  const blur = open.map((o, p) => {
    const d = data[p * 4] / 255
    return o * Math.min(1, Math.max(0, (d > near ? (d - near) * 0.7 : (far - d) / Math.max(far, 0.1)) - tolerance))
  })
  const total = boxBlur(blur, width, height, 3)
  const weight = boxBlur(open, width, height, 3)
  const background = upscale(total.map((v, p) => v / Math.max(weight[p], 1e-3)), width, height, w, h)
  const radius = Math.round(w / 120)
  const fade = boxBlur(boxBlur(cutout, w, h, radius), w, h, radius)
  const field = new ImageData(w, h)
  background.forEach((v, p) => {
    field.data[p * 4] = v * (1 - Math.min(1, Math.max(cutout[p], fade[p] * 2))) * 255
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
