import { combine, type Focus, type Params } from './params'
import { findSubject } from './subject'

export type Scene = { median: number; lights: number; blown: number; subject: Focus & { spread: number } }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function readScene(image: ImageData): Scene {
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
  return {
    median: lumas[Math.floor(lumas.length / 2)],
    lights: lights / lumas.length,
    blown: blown / lumas.length,
    subject: findSubject(image),
  }
}

export function tailor(look: Partial<Params>, { median, lights, blown, subject }: Scene): Partial<Params> {
  const tweaks: Partial<Params> = {}
  if (look.blur) {
    const blur = clamp(look.blur * (1 + (0.17 - subject.spread) * 5) * (median < 0.22 ? 1.2 : 1), 10, 36)
    tweaks.blur = blur - look.blur
    tweaks.focusSize = clamp((look.focusSize ?? 45) + (subject.spread - 0.17) * 300, 44, 64)
  }
  if (median < 0.18) tweaks.exposure = 0.2
  if (median < 0.35 && lights > 0.01) tweaks.glow = clamp(lights * 600, 10, 30)
  if (blown > 0.04) {
    tweaks.highlights = -15
    tweaks.glow = (tweaks.glow ?? 0) - 15
  }
  if ((look.glow ?? 0) + (tweaks.glow ?? 0) > 0) {
    let threshold = look.bloomThreshold ?? 50
    let size = look.bloomSize ?? 50
    if (median < 0.35 && lights > 0.01) {
      threshold -= 12
      size += 12
    }
    if (median > 0.45) threshold += 12
    if (blown > 0.04) threshold += 15
    tweaks.bloomThreshold = clamp(threshold, 10, 85)
    tweaks.bloomSize = clamp(size, 20, 90)
  }
  return combine(look, tweaks)
}

type Features = { mean: number; contrast: number; hi: number; lo: number; colorful: number; tint: [number, number]; shade: [number, number]; detail: number }

export function measure(image: ImageData, subject: Focus): Features {
  const { data, width, height } = image
  const n = width * height
  let sum = 0
  let sq = 0
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
    if (l > 0.985) hi++
    if (l < 0.012) lo++
    rg += a
    yb += c
    rg2 += a * a
    yb2 += c * c
    if (l > 0.2 && l < 0.8) {
      midRg += a
      midYb += c
      mids++
    } else if (l > 0.03 && l <= 0.2) {
      darkRg += a
      darkYb += c
      darks++
    }
  }
  const mean = sum / n
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
  }
}

export function score(f: Features, base: Features, { median }: Scene) {
  const target = median < 0.22 ? 0.18 : 0.27
  const moved = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])
  return {
    exposure: -(((f.mean - target) / 0.06) ** 2),
    contrast: -(((f.contrast - 0.21) / 0.05) ** 2),
    color: -(((f.colorful - 0.27) / 0.08) ** 2),
    clipping: -f.hi * 40 - Math.max(0, f.lo - 0.05) * 20,
    green: -((Math.max(0, base.tint[0] - f.tint[0] - 0.02) / 0.03) ** 2),
    shift: -((Math.max(0, moved(f.tint, base.tint) - 0.08) / 0.05) ** 2),
    shade: -((Math.max(0, moved(f.shade, base.shade) - 0.07) / 0.04) ** 2),
    sharpness: -((Math.max(0, 0.8 - f.detail / Math.max(base.detail, 1e-4)) / 0.1) ** 2),
  }
}
