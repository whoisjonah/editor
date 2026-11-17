import { canvasOf, pixels, scaled, toBlob } from './canvas'
import type { Focus, Targets } from './params'

type Box = [number, number, number, number]

export type Subject = { kind: 'vehicle' | 'person' | 'object'; score: number; box: Box; depth: number; mask: Uint8Array }

export type Sight = { map: ImageData; guide: ImageData; subjects: Subject[] }

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

function spread(solid: Uint8Array, width: number, height: number) {
  const mask = new Uint8Array(width * height)
  solid.forEach((on, p) => {
    if (!on) return
    const x = p % width
    const y = (p - x) / width
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mask[Math.min(height - 1, Math.max(0, y + dy)) * width + Math.min(width - 1, Math.max(0, x + dx))] = 1
  })
  return mask
}

function roofline(solid: Uint8Array, { data, width }: ImageData, [x0, y0, x1, y1]: Box, reach: number) {
  const tops = Array.from({ length: x1 - x0 }, (_, i) => {
    let y = y0
    while (y < y1 && !solid[y * width + x0 + i]) y++
    return y
  })
  const roof = Math.min(...tops)
  tops.forEach((top, i) => {
    const x = x0 + i
    if (top > roof + reach / 2 || top - reach < 1) return
    const bg = ((top - reach - 1) * width + x) * 4
    for (let y = top - reach; y < top; y++) {
      const p = (y * width + x) * 4
      if (Math.abs(data[p] - data[bg]) + Math.abs(data[p + 1] - data[bg + 1]) + Math.abs(data[p + 2] - data[bg + 2]) < 90) continue
      for (let k = y; k < top; k++) solid[k * width + x] = 1
      return
    }
  })
}

function outline(map: ImageData, box: Box, color?: ImageData) {
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
  const solid = new Uint8Array(width * height)
  for (let y = py0; y < y1; y++) for (let x = px0; x < px1; x++) if (data[(y * width + x) * 4] >= cut) solid[y * width + x] = 1
  if (color) roofline(solid, color, [px0, py0, px1, y1], Math.round((y1 - y0) * 0.08))
  return { depth: depth / 255, mask: spread(solid, width, height) }
}

function shared(a: Box, b: Box) {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  return (w * h) / Math.min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
}

export async function estimateDepth(image: ImageData): Promise<Depth> {
  try {
    const canvas = canvasOf(image)
    const small = scaled(canvas, 640)
    const response = await fetch('/api/focus', { method: 'POST', body: await toBlob(small, 'image/jpeg', 0.85) })
    if (!response.ok) return null
    const { depth, subjects }: { depth: string; subjects: Omit<Subject, 'depth' | 'mask'>[] } = await response.json()
    const map = await decode(depth)
    const merged: Omit<Subject, 'mask'>[] = []
    for (const s of subjects.map((s) => ({ ...s, depth: outline(map, s.box).depth }))) {
      const twin = merged.find((m) => m.kind === s.kind && Math.abs(m.depth - s.depth) < 0.08 && shared(m.box, s.box) > 0.3)
      if (twin) twin.box = [Math.min(twin.box[0], s.box[0]), Math.min(twin.box[1], s.box[1]), Math.max(twin.box[2], s.box[2]), Math.max(twin.box[3], s.box[3])]
      else merged.push(s)
    }
    const color = pixels(small)
    return { map, guide: pixels(scaled(canvas, Math.min(960, image.width))), subjects: merged.map((s) => ({ ...s, ...outline(map, s.box, s.kind === 'vehicle' ? color : undefined) })) }
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

export function findObject({ map }: Sight, x: number, y: number): Subject | null {
  const { data, width, height } = map
  const at = (px: number, py: number) => data[(py * width + px) * 4]
  const sx = Math.min(width - 1, Math.round(x * width))
  const sy = Math.min(height - 1, Math.round(y * height))
  const seed = at(sx, sy)
  const tolerance = Math.max(8, seed * 0.15)
  const solid = new Uint8Array(width * height)
  const bounds = [sx, sy, sx, sy]
  const stack = [sy * width + sx]
  solid[stack[0]] = 1
  let count = 0
  while (stack.length) {
    const p = stack.pop()!
    const px = p % width
    const py = (p - px) / width
    count++
    bounds[0] = Math.min(bounds[0], px)
    bounds[1] = Math.min(bounds[1], py)
    bounds[2] = Math.max(bounds[2], px)
    bounds[3] = Math.max(bounds[3], py)
    for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || Math.abs(nx - sx) > width * 0.12 || Math.abs(ny - sy) > height * 0.3) continue
      const q = ny * width + nx
      const d = at(nx, ny)
      if (solid[q] || Math.abs(d - seed) > tolerance || Math.abs(d - at(px, py)) > 3 || Math.abs(at(nx, Math.min(height - 1, ny + 6)) - d) > 3) continue
      solid[q] = 1
      stack.push(q)
    }
  }
  if (count < 30) return null
  return {
    kind: 'object',
    score: 1,
    box: [bounds[0] / width, bounds[1] / height, (bounds[2] + 1) / width, (bounds[3] + 1) / height],
    depth: seed / 255,
    mask: spread(solid, width, height),
  }
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

function refine(blur: Float32Array, width: number, height: number, { data, width: w, height: h }: ImageData) {
  const n = w * h
  const luma = new Float32Array(n)
  const coarse = new Float32Array(n)
  const square = new Float32Array(n)
  const product = new Float32Array(n)
  for (let p = 0; p < n; p++) {
    const x = Math.min(width - 1, Math.max(0, (((p % w) + 0.5) * width) / w - 0.5))
    const y = Math.min(height - 1, Math.max(0, ((Math.floor(p / w) + 0.5) * height) / h - 0.5))
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const x1 = Math.min(width - 1, x0 + 1)
    const y1 = Math.min(height - 1, y0 + 1)
    const fx = x - x0
    const fy = y - y0
    const l = (0.2126 * data[p * 4] + 0.7152 * data[p * 4 + 1] + 0.0722 * data[p * 4 + 2]) / 255
    const b = (blur[y0 * width + x0] * (1 - fx) + blur[y0 * width + x1] * fx) * (1 - fy) + (blur[y1 * width + x0] * (1 - fx) + blur[y1 * width + x1] * fx) * fy
    luma[p] = l
    coarse[p] = b
    square[p] = l * l
    product[p] = l * b
  }
  const radius = Math.max(2, Math.round(w / 106))
  const meanL = boxBlur(luma, w, h, radius)
  const meanB = boxBlur(coarse, w, h, radius)
  const varL = boxBlur(square, w, h, radius)
  const cov = boxBlur(product, w, h, radius)
  for (let p = 0; p < n; p++) {
    const a = (cov[p] - meanL[p] * meanB[p]) / (varL[p] - meanL[p] * meanL[p] + 0.0003)
    square[p] = a
    product[p] = meanB[p] - a * meanL[p]
  }
  const gain = boxBlur(square, w, h, radius)
  const offset = boxBlur(product, w, h, radius)
  const field = new ImageData(w, h)
  for (let p = 0; p < n; p++) {
    field.data[p * 4] = (gain[p] * luma[p] + offset[p]) * 255
    field.data[p * 4 + 3] = 255
  }
  return field
}

export function focusField({ map, guide, subjects }: Sight, focus: Focus, size: number) {
  const { data, width, height } = map
  const chosen = chooseTargets(subjects, focus.targets).map((i) => subjects[i])
  const leads = chosen.filter((s) => area(s) >= 0.015)
  const planes = leads.length ? leads.map((s) => s.depth) : [data[(Math.min(height - 1, Math.round(focus.y * height)) * width + Math.min(width - 1, Math.round(focus.x * width))) * 4] / 255]
  const near = Math.max(...planes)
  const far = Math.min(...planes)
  const tolerance = 0.02 + 0.1 * size
  const blur = new Float32Array(width * height).map((_, p) => {
    if (chosen.some((s) => s.mask[p])) return 0
    const d = data[p * 4] / 255
    return Math.min(1, Math.max(0, (d > near ? (d - near) * 0.7 : (far - d) / Math.max(far, 0.1)) - tolerance) / 1)
  })
  return refine(boxBlur(blur, width, height, 3), width, height, guide)
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
