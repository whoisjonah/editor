import type { Focus } from './params'

const COLS = 48
const ROWS = 27

export function autoFocus(image: ImageData): Focus {
  const { data, width, height } = image
  const score = new Float32Array(COLS * ROWS)
  const luma = (x: number, y: number) => {
    const i = (Math.min(height - 1, y) * width + Math.min(width - 1, x)) * 4
    return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
  }

  for (let gy = 0; gy < ROWS; gy++) {
    for (let gx = 0; gx < COLS; gx++) {
      const x0 = Math.floor((gx / COLS) * width)
      const y0 = Math.floor((gy / ROWS) * height)
      const x1 = Math.floor(((gx + 1) / COLS) * width)
      const y1 = Math.floor(((gy + 1) / ROWS) * height)
      const step = Math.max(1, Math.floor((x1 - x0) / 6))
      let sat = 0
      let edge = 0
      let bright = 0
      let n = 0
      for (let y = y0; y < y1; y += step) {
        for (let x = x0; x < x1; x += step) {
          const i = (y * width + x) * 4
          sat += Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2])
          const l = luma(x, y)
          edge += Math.abs(luma(x + step, y) - l) + Math.abs(luma(x, y + step) - l)
          bright += l
          n++
        }
      }
      sat /= n * 255
      edge /= n * 255
      bright /= n * 255
      const v = (gy + 0.5) / ROWS
      const u = (gx + 0.5) / COLS
      const sky = v < 0.4 && bright > 0.55 && edge < 0.06 ? 1 : 0
      const prior = Math.exp(-((u - 0.5) ** 2) / 0.12 - (v - 0.58) ** 2 / 0.08)
      score[gy * COLS + gx] = (sat * 1.2 + Math.min(edge, 0.3) * 3) * (1 - sky) * prior
    }
  }

  const sorted = [...score].sort((a, b) => b - a)
  const cut = sorted[Math.floor(sorted.length * 0.12)]
  let sx = 0
  let sy = 0
  let total = 0
  for (let gy = 0; gy < ROWS; gy++) {
    for (let gx = 0; gx < COLS; gx++) {
      const s = score[gy * COLS + gx]
      if (s < cut) continue
      sx += ((gx + 0.5) / COLS) * s
      sy += ((gy + 0.5) / ROWS) * s
      total += s
    }
  }
  if (!total) return { x: 0.5, y: 0.5 }
  return {
    x: Math.min(0.75, Math.max(0.25, sx / total)),
    y: Math.min(0.75, Math.max(0.3, sy / total)),
  }
}
