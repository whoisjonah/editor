import type { Params } from './params'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function autoTone(image: ImageData): Partial<Params> {
  const { data, width, height } = image
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 120000)))
  const histogram = new Uint32Array(256)
  let count = 0
  let r = 0
  let b = 0
  let mids = 0

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      const l = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])
      histogram[l]++
      count++
      if (l > 40 && l < 215) {
        r += data[i]
        b += data[i + 2]
        mids++
      }
    }
  }

  const percentile = (p: number) => {
    const goal = count * p
    let sum = 0
    for (let i = 0; i < 256; i++) {
      sum += histogram[i]
      if (sum >= goal) return i / 255
    }
    return 1
  }

  const low = percentile(0.005)
  const median = percentile(0.5)
  const high = percentile(0.995)
  const night = median < 0.22

  const target = night ? 0.24 : 0.42
  const exposure = clamp(Math.log2(target / Math.max(median, 0.02)) * 0.45, -0.5, night ? 0.35 : 0.7)
  const whites = clamp((0.96 - high) * 160, 0, 35)
  const blacks = clamp((-(low - 0.02) / 0.16) * 100 * 0.85, -70, 6)
  const dehaze = clamp((low - 0.08) * 120, 0, 15)
  const contrast = clamp((0.62 - (high - low)) * 45, -5, 18)

  let temperature = 0
  if (mids > 0) {
    const warmth = (r - b) / mids / 255
    temperature = clamp(-warmth * 20, -6, 6)
  }

  return {
    exposure: Math.round(exposure * 100) / 100,
    whites: Math.round(whites),
    blacks: Math.round(blacks),
    contrast: Math.round(contrast),
    temperature: Math.round(temperature),
    shadows: night ? Math.round(clamp((0.22 - median) * 120, 0, 18)) : 0,
    dehaze: Math.round(dehaze),
  }
}
