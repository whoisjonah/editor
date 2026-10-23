import { chooseTargets, subjectCenter, type Depth, type Sight } from './depth'
import { combine, type Focus, type Params } from './params'
import { findSubject } from './subject'

export type Scene = { median: number; lights: number; blown: number; close: number; focus: Focus; sight: Sight | null; presence: number }

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const GRID_COLS = 24
const GRID_ROWS = 14

function closeness(image: ImageData) {
  const { data, width, height } = image
  const step = Math.max(1, Math.round(width / 480))
  const luma = (x: number, y: number) => {
    const i = (y * width + x) * 4
    return (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
  }
  let smooth = 0
  for (let gy = 0; gy < GRID_ROWS; gy++) {
    for (let gx = 0; gx < GRID_COLS; gx++) {
      const x0 = Math.floor((gx / GRID_COLS) * width)
      const y0 = Math.floor((gy / GRID_ROWS) * height)
      const x1 = Math.floor(((gx + 1) / GRID_COLS) * width) - step
      const y1 = Math.floor(((gy + 1) / GRID_ROWS) * height) - step
      let edge = 0
      let n = 0
      for (let y = y0; y < y1; y += step) {
        for (let x = x0; x < x1; x += step) {
          const l = luma(x, y)
          edge += Math.abs(luma(x + step, y) - l) + Math.abs(luma(x, y + step) - l)
          n++
        }
      }
      if (n && edge / n < 0.025) smooth++
    }
  }
  return clamp((smooth / (GRID_COLS * GRID_ROWS) - 0.12) / 0.2, 0, 1)
}

export function readScene(image: ImageData, depth: Depth = null): Scene {
  const { data, width, height } = image
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 120000)))
  const lumas: number[] = []
  let lights = 0
  let blown = 0
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      const r = data[i] / 255
      const g = data[i + 1] / 255
      const b = data[i + 2] / 255
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
      lumas.push(l)
      if (Math.max(r, g, b) > 0.9 && Math.max(r, g, b) - Math.min(r, g, b) > 0.35) lights++
      if (l > 0.97) blown++
    }
  }
  lumas.sort((a, b) => a - b)
  const sight = depth && depth !== 'loading' ? depth : null
  const { x, y } = (sight && subjectCenter(sight.subjects)) ?? findSubject(image)
  return {
    median: lumas[Math.floor(lumas.length / 2)],
    lights: lights / lumas.length,
    blown: blown / lumas.length,
    close: closeness(image),
    focus: { x, y },
    sight,
    presence: sight ? Math.max(0, ...chooseTargets(sight.subjects).map((i) => sight.subjects[i]).map(({ box }) => (box[2] - box[0]) * (box[3] - box[1]))) : 0,
  }
}

export function tailor(look: Partial<Params>, { median, lights, blown, close, sight, presence }: Scene): Partial<Params> {
  const tweaks: Partial<Params> = {}
  if (look.blur) {
    tweaks.blur = look.blur * ((sight ? clamp(presence / 0.1, 0.15, 1) : 0.2 + 0.95 * close) * (median < 0.22 ? 1.1 : 1) - 1)
    tweaks.focusSize = clamp((look.focusSize ?? 45) + (1 - close) * 12, 40, 66)
  }
  const night = median < 0.3
  const soften = -0.45 * close - (night ? 0.2 : 0)
  const { clarity = 0, sharpen = 0, glow = 0 } = look
  if (clarity > 0) tweaks.clarity = clarity * soften
  if (sharpen) tweaks.sharpen = sharpen * soften
  if (night && lights > 0.005) tweaks.glow = clamp(lights * 500, 8, 25)
  else if (median > 0.45) tweaks.glow = -glow * 0.45
  if (blown > 0.04) {
    tweaks.highlights = -15
    tweaks.glow = (tweaks.glow ?? 0) - 12
  }
  if (glow + (tweaks.glow ?? 0) > 0) {
    let threshold = look.bloomThreshold ?? 50
    let size = look.bloomSize ?? 50
    if (night && lights > 0.005) size += 10
    if (median > 0.45) threshold += 25
    else if (median > 0.3) threshold += 12
    if (blown > 0.04) threshold += 15
    tweaks.bloomThreshold = clamp(threshold, 10, 85)
    tweaks.bloomSize = clamp(size, 20, 90)
  }
  return combine(look, tweaks)
}

type Features = {
  mean: number
  contrast: number
  hi: number
  lo: number
  colorful: number
  tint: [number, number]
  shade: [number, number]
  detail: number
  floor: number
  frame: number
  zones: Uint8Array
}

export function measure(image: ImageData, subject: Focus, reference?: Uint8Array): Features {
  const { data, width, height } = image
  const n = width * height
  const zones = reference ?? new Uint8Array(n)
  const histogram = new Uint32Array(64)
  let sum = 0
  let sq = 0
  let edge = 0
  let middle = 0
  let hi = 0
  let lo = 0
  let rg = 0
  let yb = 0
  let rg2 = 0
  let yb2 = 0
  let midRg = 0
  let midYb = 0
  let mids = 0
  let darkRg = 0
  let darkYb = 0
  let darks = 0
  for (let p = 0; p < n; p++) {
    const r = data[p * 4] / 255
    const g = data[p * 4 + 1] / 255
    const b = data[p * 4 + 2] / 255
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const a = r - g
    const c = (r + g) / 2 - b
    sum += l
    sq += l * l
    const fx = (p % width) / width - 0.5
    const fy = Math.floor(p / width) / height - 0.5
    if (Math.abs(fx) > 0.35 && Math.abs(fy) > 0.35) edge += l
    else if (Math.abs(fx) < 0.15 && Math.abs(fy) < 0.15) middle += l
    histogram[Math.min(63, Math.floor(l * 64))]++
    if (l > 0.985) hi++
    if (l < 0.012) lo++
    rg += a
    yb += c
    rg2 += a * a
    yb2 += c * c
    if (!reference) zones[p] = l > 0.2 && l < 0.8 ? 1 : l > 0.03 && l <= 0.2 ? 2 : 0
    if (zones[p] === 1) {
      midRg += a
      midYb += c
      mids++
    } else if (zones[p] === 2) {
      darkRg += a
      darkYb += c
      darks++
    }
  }
  const mean = sum / n
  let floor = 0
  for (let i = 0, seen = 0; i < 64; i++) {
    seen += histogram[i]
    if (seen >= n * 0.02) {
      floor = i / 64
      break
    }
  }
  const sd = (s2: number, s1: number) => Math.sqrt(Math.max(0, s2 / n - (s1 / n) ** 2))

  const luma = (x: number, y: number) => {
    const i = (y * width + x) * 4
    return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
  }
  const cx = Math.round(subject.x * width)
  const cy = Math.round(subject.y * height)
  const rx = Math.round(width * 0.2)
  const ry = Math.round(height * 0.18)
  let detail = 0
  let count = 0
  for (let y = Math.max(1, cy - ry); y < Math.min(height - 1, cy + ry); y++) {
    for (let x = Math.max(1, cx - rx); x < Math.min(width - 1, cx + rx); x++) {
      detail += Math.abs(luma(x + 1, y) - luma(x - 1, y)) + Math.abs(luma(x, y + 1) - luma(x, y - 1))
      count++
    }
  }

  return {
    mean,
    contrast: sd(sq, sum),
    hi: hi / n,
    lo: lo / n,
    colorful: Math.hypot(sd(rg2, rg), sd(yb2, yb)) + 0.3 * Math.hypot(rg / n, yb / n),
    tint: mids ? [midRg / mids, midYb / mids] : [0, 0],
    shade: darks ? [darkRg / darks, darkYb / darks] : [0, 0],
    detail: count ? detail / count / 255 : 0,
    floor,
    frame: edge / Math.max(middle, 1e-4),
    zones,
  }
}

const band = (v: number, lo: number, hi: number, width: number) => -((Math.max(0, lo - v, v - hi) / width) ** 2)

const mix = (a: number, b: number, t: number) => a + (b - a) * t

export function score(f: Features, base: Features, { median }: Scene) {
  const day = clamp((median - 0.15) / 0.3, 0, 1)
  const gain = f.colorful / Math.max(base.colorful, 1e-4)
  const tint: [number, number] = [base.tint[0] * gain, base.tint[1] * gain]
  const shade: [number, number] = [base.shade[0] * gain, base.shade[1] * gain]
  const moved = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])
  return {
    exposure: band(f.mean, mix(0.2, 0.38, day), mix(0.3, 0.52, day), 0.05),
    contrast: band(f.contrast, 0.23, 0.29, 0.025),
    color: band(f.colorful, mix(0.25, 0.22, day), mix(0.33, 0.3, day), 0.035),
    depth: band(f.floor, 0, mix(0.025, 0.06, day), 0.03),
    frame: band(f.frame / Math.max(base.frame, 0.2), 0.6, 0.82, 0.08),
    warmth: band(f.tint[1], -0.01, 0.06, 0.025) + band(f.tint[0], -0.02, 0.06, 0.03),
    clipping: -Math.max(0, f.hi - Math.max(base.hi, 0.004)) * 60 - Math.max(0, f.lo - base.lo - 0.015) * 40,
    cool: -((Math.max(0, shade[1] - f.shade[1] - 0.01) / 0.025) ** 2),
    change: -(((f.mean - base.mean) / 0.14) ** 2) - (moved(f.tint, tint) / 0.14) ** 2 - (moved(f.shade, shade) / 0.14) ** 2,
    sharpness: -((Math.max(0, 0.8 - f.detail / Math.max(base.detail, 1e-4)) / 0.1) ** 2),
  }
}
