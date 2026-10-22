import { dilate, type MaskRegion } from './mask'

type Blob = { minX: number; minY: number; maxX: number; maxY: number; cx: number; cy: number; area: number; pixels: number[] }

type Rect = { x: number; y: number; w: number; h: number }

type Side = 'left' | 'right'

export type Banner = { rect: Rect; factor: number; skipRows: number[]; text: MaskRegion }

export type Detection = { left: MaskRegion | null; right: MaskRegion | null; banner: Banner | MaskRegion | null }

const luma = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
const chroma = (d: Uint8ClampedArray, i: number) => Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2])
const lumaAt = (image: ImageData, x: number, y: number) => luma(image.data, (y * image.width + x) * 4)
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]

export function detectUi(image: ImageData): Detection {
  return { left: detectTopBar(image, 'left'), right: detectTopBar(image, 'right'), banner: detectBanner(image) }
}

function findBlobs(image: ImageData, region: Rect, maxGlyph: number, isGlyph: (i: number) => boolean) {
  const { width } = image
  const glyph = new Uint8Array(region.w * region.h)
  for (let y = 0; y < region.h; y++) {
    for (let x = 0; x < region.w; x++) {
      if (isGlyph(((y + region.y) * width + x + region.x) * 4)) glyph[y * region.w + x] = 1
    }
  }

  const seen = new Uint8Array(glyph.length)
  const blobs: Blob[] = []
  const stack: number[] = []
  for (let start = 0; start < glyph.length; start++) {
    if (!glyph[start] || seen[start]) continue
    const blob: Blob = { minX: Infinity, minY: Infinity, maxX: -1, maxY: -1, cx: 0, cy: 0, area: 0, pixels: [] }
    stack.push(start)
    seen[start] = 1
    let overflow = false
    while (stack.length) {
      const p = stack.pop()!
      const lx = p % region.w
      const ly = (p - lx) / region.w
      const x = lx + region.x
      const y = ly + region.y
      blob.pixels.push(y * width + x)
      blob.area++
      blob.cx += x
      blob.cy += y
      blob.minX = Math.min(blob.minX, x)
      blob.maxX = Math.max(blob.maxX, x)
      blob.minY = Math.min(blob.minY, y)
      blob.maxY = Math.max(blob.maxY, y)
      if (blob.area > maxGlyph * maxGlyph) overflow = true
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = lx + dx
          const ny = ly + dy
          if (nx < 0 || ny < 0 || nx >= region.w || ny >= region.h) continue
          const n = ny * region.w + nx
          if (glyph[n] && !seen[n]) {
            seen[n] = 1
            stack.push(n)
          }
        }
      }
    }
    if (overflow) continue
    blob.cx /= blob.area
    blob.cy /= blob.area
    const bw = blob.maxX - blob.minX + 1
    const bh = blob.maxY - blob.minY + 1
    if (bw > maxGlyph || bh > maxGlyph) continue
    blobs.push(blob)
  }
  return blobs
}

function ring(image: ImageData, blob: Blob) {
  const pad = Math.max(3, Math.round(Math.max(blob.maxX - blob.minX, blob.maxY - blob.minY) * 0.25))
  const out: number[] = []
  const x0 = Math.max(0, blob.minX - pad)
  const y0 = Math.max(0, blob.minY - pad)
  const x1 = Math.min(image.width - 1, blob.maxX + pad)
  const y1 = Math.min(image.height - 1, blob.maxY + pad)
  for (let x = x0; x <= x1; x++) out.push((y0 * image.width + x) * 4, (y1 * image.width + x) * 4)
  for (let y = y0; y <= y1; y++) out.push((y * image.width + x0) * 4, (y * image.width + x1) * 4)
  return out
}

function enclosed(image: ImageData, blob: Blob) {
  const points = ring(image, blob)
  let dark = 0
  for (const i of points) if (luma(image.data, i) < 70 && chroma(image.data, i) < 30) dark++
  return dark / points.length >= 0.7
}

function ringColor(image: ImageData, blobs: Blob[]): [number, number, number] {
  const r: number[] = []
  const g: number[] = []
  const b: number[] = []
  for (const blob of blobs) {
    for (const i of ring(image, blob)) {
      r.push(image.data[i])
      g.push(image.data[i + 1])
      b.push(image.data[i + 2])
    }
  }
  return [median(r), median(g), median(b)]
}

function detectTopBar(image: ImageData, side: Side): MaskRegion | null {
  const { data, width, height } = image
  const rw = Math.min(width, Math.max(600, Math.round(width * 0.35)))
  const rh = Math.min(height, Math.max(160, Math.round(height * 0.15)))
  const region = { x: side === 'left' ? 0 : width - rw, y: 0, w: rw, h: rh }
  const maxGlyph = Math.max(60, height * 0.08)
  const edge = Math.max(120, width * 0.06)

  const blobs = findBlobs(image, region, maxGlyph, (i) => luma(data, i) > 170 && chroma(data, i) < 35).filter((b) => {
    const bw = b.maxX - b.minX + 1
    const bh = b.maxY - b.minY + 1
    if (b.area < 6 || Math.max(bw, bh) < 4) return false
    if (b.minY < 3 || b.minX < 3 || b.maxX > width - 4) return false
    return enclosed(image, b)
  })
  if (!blobs.length) return null

  const toEdge = (b: Blob) => (side === 'left' ? b.minX : width - 1 - b.maxX)
  blobs.sort((a, b) => toEdge(a) - toEdge(b))
  const seed = blobs[0]
  if (toEdge(seed) > edge) return null

  const row = [seed]
  let rowH = Math.max(seed.maxY - seed.minY + 1, 8)
  let reach = side === 'left' ? seed.maxX : seed.minX
  for (const blob of blobs.slice(1)) {
    const bh = blob.maxY - blob.minY + 1
    if (Math.abs(blob.cy - seed.cy) > Math.max(rowH, bh) * 0.75) continue
    const gap = side === 'left' ? blob.minX - reach : reach - blob.maxX
    if (gap > rowH * 6) break
    row.push(blob)
    reach = side === 'left' ? Math.max(reach, blob.maxX) : Math.min(reach, blob.minX)
    rowH = Math.max(rowH, bh)
  }

  const minX = Math.min(...row.map((b) => b.minX))
  const minY = Math.min(...row.map((b) => b.minY))
  const maxX = Math.max(...row.map((b) => b.maxX))
  const maxY = Math.max(...row.map((b) => b.maxY))
  const pad = Math.round(rowH * 0.85 + 4)
  const x0 = Math.max(0, minX - pad)
  const y0 = Math.max(0, minY - pad)
  const x1 = Math.min(width, maxX + pad + 1)
  const y1 = Math.min(height, maxY + pad + 1)
  const w = x1 - x0
  const h = y1 - y0

  const background = ringColor(image, row)
  const mask = new Uint8Array(w * h)
  const queue: number[] = []
  for (const blob of row) {
    for (const p of blob.pixels) {
      const gx = p % width
      const gy = (p - gx) / width
      const m = (gy - y0) * w + (gx - x0)
      if (!mask[m]) {
        mask[m] = 1
        queue.push(m)
      }
    }
  }
  const close = (i: number) =>
    Math.abs(data[i] - background[0]) <= 12 && Math.abs(data[i + 1] - background[1]) <= 12 && Math.abs(data[i + 2] - background[2]) <= 12
  while (queue.length) {
    const m = queue.pop()!
    const mx = m % w
    const my = (m - mx) / w
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = mx + dx
      const ny = my + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const n = ny * w + nx
      if (mask[n]) continue
      const i = ((ny + y0) * width + nx + x0) * 4
      if (close(i) || (luma(data, i) > 60 && chroma(data, i) < 40 && near(mask, w, h, nx, ny))) {
        mask[n] = 1
        queue.push(n)
      }
    }
  }

  return dilate({ x: x0, y: y0, w, h, data: mask }, Math.max(3, Math.round(rowH * 0.18)), image)
}

function near(mask: Uint8Array, w: number, h: number, x: number, y: number) {
  let count = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny * w + nx]) count++
    }
  }
  return count >= 3
}

function detectBanner(image: ImageData): Banner | MaskRegion | null {
  const { data, width, height } = image
  const rw = Math.min(width, Math.max(320, Math.round(width * 0.22)))
  const rh = Math.min(height, Math.max(260, Math.round(height * 0.35)))
  const region = { x: width - rw, y: height - rh, w: rw, h: rh }
  const maxGlyph = Math.max(30, height * 0.035)

  const glyphs = findBlobs(image, region, maxGlyph, (i) => luma(data, i) > 175 && chroma(data, i) < 45).filter((b) => {
    if (b.area < 3) return false
    const points = ring(image, b)
    let dim = 0
    for (const i of points) if (luma(data, i) < 155) dim++
    return dim / points.length >= 0.85
  })
  if (glyphs.length < 12) return null

  const lineH = median(glyphs.map((b) => b.maxY - b.minY + 1))
  const parent = glyphs.map((_, i) => i)
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])))
  for (let i = 0; i < glyphs.length; i++) {
    for (let j = i + 1; j < glyphs.length; j++) {
      const a = glyphs[i]
      const b = glyphs[j]
      if (Math.abs(a.cy - b.cy) < lineH * 4 && b.minX - a.maxX < lineH * 3 && a.minX - b.maxX < lineH * 3) parent[root(i)] = root(j)
    }
  }
  const clusters = new Map<number, Blob[]>()
  glyphs.forEach((g, i) => clusters.set(root(i), [...(clusters.get(root(i)) ?? []), g]))
  const block = [...clusters.values()].sort((a, b) => b.length - a.length)[0]
  if (block.length < 12) return null
  const box = {
    minX: Math.min(...block.map((b) => b.minX)),
    minY: Math.min(...block.map((b) => b.minY)),
    maxX: Math.max(...block.map((b) => b.maxX)),
    maxY: Math.max(...block.map((b) => b.maxY)),
  }
  if (box.maxX - box.minX < lineH * 6 || box.maxY - box.minY < lineH * 2) return null

  const L = (x: number, y: number) => lumaAt(image, x, y)
  const reach = Math.round(Math.max(24, lineH * 6))

  const edge = (positions: number[], samples: number[], ratio: (p: number, s: number) => number | null) => {
    let best = -1
    let bestScore = 0
    let bestRatios: number[] = []
    for (const p of positions) {
      const ratios = samples.map((s) => ratio(p, s)).filter((r) => r !== null)
      const good = ratios.filter((r) => r > 0.35 && r < 0.8)
      const score = ratios.length > samples.length * 0.3 ? good.length / ratios.length : 0
      if (score > bestScore) {
        bestScore = score
        best = p
        bestRatios = good
      }
    }
    return bestScore >= 0.6 ? { at: best, factor: median(bestRatios) } : null
  }

  const range = (from: number, to: number) => {
    const out: number[] = []
    const step = from <= to ? 1 : -1
    for (let v = from; v !== to + step; v += step) out.push(v)
    return out
  }
  const rows = range(box.minY, box.maxY)
  const step = (a: number, b: number) => (b > 20 ? a / b : null)

  const left = edge(range(box.minX - 1, Math.max(1, box.minX - reach)), rows, (x, y) => step(L(x, y), L(x - 1, y)))
  const right = edge(range(box.maxX + 1, Math.min(width - 2, box.maxX + reach)), rows, (x, y) => step(L(x, y), L(x + 1, y)))
  const x0 = left?.at ?? -1
  const x1 = right?.at ?? (left && width - 1 - box.maxX < reach ? width - 1 : -1)
  if (x0 >= 0 && x1 >= 0) {
    const cols = range(x0, x1)
    const top = edge(range(box.minY - 1, Math.max(1, box.minY - reach)), cols, (y, x) => step(L(x, y), L(x, y - 1)))
    const bottom = edge(range(box.maxY + 1, Math.min(height - 2, box.maxY + reach)), cols, (y, x) => step(L(x, y), L(x, y + 1)))
    if (top && bottom) {
      const rect = { x: x0, y: top.at, w: x1 - x0 + 1, h: bottom.at - top.at + 1 }
      const factor = median([left!.factor, top.factor, bottom.factor, ...(right ? [right.factor] : [])])
      const text = bannerText(image, rect, factor)
      return { rect, factor, skipRows: undimmedRows(image, rect, factor, text), text }
    }
  }

  const pad = Math.round(lineH * 2.5)
  const x = Math.max(0, box.minX - pad)
  const y = Math.max(0, box.minY - pad)
  const w = Math.min(width, box.maxX + pad + 1) - x
  const h = Math.min(height, box.maxY + pad + 1) - y
  return { x, y, w, h, data: new Uint8Array(w * h).fill(1) }
}

function undimmedRows(image: ImageData, rect: Rect, factor: number, text: MaskRegion) {
  const isText = (x: number, y: number) => {
    const tx = x - text.x
    const ty = y - text.y
    return tx >= 0 && ty >= 0 && tx < text.w && ty < text.h && text.data[ty * text.w + tx] === 1
  }
  const L = (x: number, y: number) => lumaAt(image, x, y)
  const threshold = 1 + (1 / factor - 1) * 0.5
  const out: number[] = []
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    const ratios: number[] = []
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (isText(x, y)) continue
      const around = [y - 2, y + 2].filter((n) => n >= rect.y && n < rect.y + rect.h && !isText(x, n))
      if (!around.length) continue
      const base = around.reduce((sum, n) => sum + L(x, n), 0) / around.length
      if (base > 10) ratios.push(L(x, y) / base)
    }
    if (ratios.length > rect.w * 0.2 && median(ratios) > threshold) out.push(y)
  }
  return out
}

function bannerText(image: ImageData, rect: Rect, factor: number): MaskRegion {
  const data = new Uint8Array(rect.w * rect.h)
  const limit = factor * 255 + 8
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      if (lumaAt(image, x + rect.x, y + rect.y) > limit) data[y * rect.w + x] = 1
    }
  }
  return dilate({ ...rect, data }, 3, image)
}

export function undim(image: ImageData, banner: Banner) {
  const out = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height)
  const skip = new Set(banner.skipRows)
  const gain = 1 / banner.factor
  const { x, y, w, h } = banner.rect
  for (let row = y; row < y + h; row++) {
    if (skip.has(row)) continue
    for (let col = x; col < x + w; col++) {
      const i = (row * image.width + col) * 4
      out.data[i] = image.data[i] * gain
      out.data[i + 1] = image.data[i + 1] * gain
      out.data[i + 2] = image.data[i + 2] * gain
    }
  }
  return out
}
