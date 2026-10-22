export type FillJob = { width: number; height: number; pixels: Uint8ClampedArray; mask: Uint8Array }

const WORK_AREA = 180_000

function shortSide(mask: Uint8Array, w: number, h: number) {
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  return maxX < 0 ? 0 : Math.min(maxX - minX, maxY - minY) + 1
}

export function fill({ width, height, pixels, mask }: FillJob) {
  const side = shortSide(mask, width, height)
  if (!side) return pixels

  const scale = Math.min(1, 44 / side, Math.sqrt(WORK_AREA / (width * height)))
  const w = Math.floor((width - 1) * scale) + 1
  const h = Math.floor((height - 1) * scale) + 1

  const color = new Float32Array(w * h * 3)
  const weight = new Float32Array(w * h)
  const hole = new Uint8Array(w * h)
  for (let y = 0; y < height; y++) {
    const cy = Math.floor(y * scale)
    for (let x = 0; x < width; x++) {
      const c = cy * w + Math.floor(x * scale)
      const i = (y * width + x) * 4
      color[c * 3] += pixels[i]
      color[c * 3 + 1] += pixels[i + 1]
      color[c * 3 + 2] += pixels[i + 2]
      weight[c]++
      if (mask[y * width + x]) hole[c] = 1
    }
  }
  for (let c = 0; c < w * h; c++) {
    color[c * 3] /= weight[c]
    color[c * 3 + 1] /= weight[c]
    color[c * 3 + 2] /= weight[c]
  }

  const nnf = synthesize({ w, h, color, hole })

  const out = new Uint8ClampedArray(pixels)
  const offsetX = new Int32Array(width * height)
  const offsetY = new Int32Array(width * height)
  for (let y = 0; y < height; y++) {
    const cy = Math.floor(y * scale)
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (!mask[p]) continue
      const c = cy * w + Math.floor(x * scale)
      const s = nnf[c] >= 0 ? nnf[c] : c
      const sx = s % w
      const sy = (s - sx) / w
      const dx = Math.round((sx - Math.floor(x * scale)) / scale)
      const dy = Math.round((sy - cy) / scale)
      offsetX[p] = dx
      offsetY[p] = dy
      const tx = Math.min(width - 1, Math.max(0, x + dx))
      const ty = Math.min(height - 1, Math.max(0, y + dy))
      const t = ty * width + tx
      const o = p * 4
      if (!mask[t]) {
        out[o] = pixels[t * 4]
        out[o + 1] = pixels[t * 4 + 1]
        out[o + 2] = pixels[t * 4 + 2]
      } else {
        out[o] = color[s * 3]
        out[o + 1] = color[s * 3 + 1]
        out[o + 2] = color[s * 3 + 2]
      }
    }
  }

  const smoothed = new Uint8ClampedArray(out)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      if (!mask[p]) continue
      let seam = false
      for (const n of [p - 1, p + 1, p - width, p + width]) {
        if (!mask[n] || offsetX[n] !== offsetX[p] || offsetY[n] !== offsetY[p]) seam = true
      }
      if (!seam) continue
      for (let k = 0; k < 3; k++) {
        let sum = 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += out[((y + dy) * width + x + dx) * 4 + k]
        smoothed[p * 4 + k] = sum / 9
      }
    }
  }
  return smoothed
}

type Level = { w: number; h: number; color: Float32Array; hole: Uint8Array }

const HALF = 3
const SPREAD = 1350

function random(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function shrink(level: Level): Level {
  const w = Math.ceil(level.w / 2)
  const h = Math.ceil(level.h / 2)
  const color = new Float32Array(w * h * 3)
  const count = new Float32Array(w * h)
  const hole = new Uint8Array(w * h)
  for (let y = 0; y < level.h; y++) {
    for (let x = 0; x < level.w; x++) {
      const p = y * level.w + x
      const c = (y >> 1) * w + (x >> 1)
      if (level.hole[p]) {
        hole[c] = 1
        continue
      }
      color[c * 3] += level.color[p * 3]
      color[c * 3 + 1] += level.color[p * 3 + 1]
      color[c * 3 + 2] += level.color[p * 3 + 2]
      count[c]++
    }
  }
  for (let c = 0; c < w * h; c++) {
    if (!count[c]) continue
    color[c * 3] /= count[c]
    color[c * 3 + 1] /= count[c]
    color[c * 3 + 2] /= count[c]
  }
  return { w, h, color, hole }
}

function regions(level: Level) {
  const { w, h, hole } = level
  const s = w + 1
  const integral = new Int32Array(s * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += hole[y * w + x]
      integral[(y + 1) * s + x + 1] = integral[y * s + x + 1] + row
    }
  }
  const valid = new Uint8Array(w * h)
  const sources: number[] = []
  const targets: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - HALF)
      const y0 = Math.max(0, y - HALF)
      const x1 = Math.min(w, x + HALF + 1)
      const y1 = Math.min(h, y + HALF + 1)
      const holes = integral[y1 * s + x1] - integral[y0 * s + x1] - integral[y1 * s + x0] + integral[y0 * s + x0]
      if (holes) targets.push(y * w + x)
      else if (x >= HALF && y >= HALF && x < w - HALF && y < h - HALF) {
        valid[y * w + x] = 1
        sources.push(y * w + x)
      }
    }
  }
  return { valid, sources, targets }
}

function solve(level: Level, seed: Int32Array | null, iterations: number, rand: () => number) {
  const { w, h, color, hole } = level
  const { valid, sources, targets } = regions(level)
  const nnf = new Int32Array(w * h).fill(-1)
  if (!sources.length) return nnf
  const cost = new Float32Array(w * h)
  const area = new Float32Array(w * h)
  const pick = () => sources[Math.floor(rand() * sources.length)]

  for (const p of targets) {
    nnf[p] = seed && seed[p] >= 0 && valid[seed[p]] ? seed[p] : pick()
    const px = p % w
    const py = (p - px) / w
    area[p] = (Math.min(w - 1, px + HALF) - Math.max(0, px - HALF) + 1) * (Math.min(h - 1, py + HALF) - Math.max(0, py - HALF) + 1)
  }

  const distance = (p: number, q: number, limit: number) => {
    const px = p % w
    const py = (p - px) / w
    let sum = 0
    for (let dy = -HALF; dy <= HALF; dy++) {
      const yy = py + dy
      if (yy < 0 || yy >= h) continue
      for (let dx = -HALF; dx <= HALF; dx++) {
        const xx = px + dx
        if (xx < 0 || xx >= w) continue
        const a = (yy * w + xx) * 3
        const b = (q + dy * w + dx) * 3
        const dr = color[a] - color[b]
        const dg = color[a + 1] - color[b + 1]
        const db = color[a + 2] - color[b + 2]
        sum += dr * dr + dg * dg + db * db
      }
      if (sum >= limit) return sum
    }
    return sum
  }

  const sum = new Float32Array(w * h * 3)
  const weight = new Float32Array(w * h)

  for (let iteration = 0; iteration < iterations; iteration++) {
    for (const p of targets) cost[p] = distance(p, nnf[p], Infinity)

    for (const step of [1, -1]) {
      for (let k = 0; k < targets.length; k++) {
        const p = targets[step > 0 ? k : targets.length - 1 - k]
        const px = p % w
        const py = (p - px) / w
        let best = nnf[p]
        let bestCost = cost[p]
        const tryCandidate = (q: number) => {
          if (q < 0 || q >= w * h || !valid[q] || q === best) return
          const d = distance(p, q, bestCost)
          if (d < bestCost) {
            bestCost = d
            best = q
          }
        }
        const left = nnf[p - step]
        if (px - step >= 0 && px - step < w && left >= 0 && ((left + step) % w) - (left % w) === step) tryCandidate(left + step)
        const above = nnf[p - step * w]
        if (py - step >= 0 && py - step < h && above >= 0) tryCandidate(above + step * w)
        const bx = best % w
        const by = (best - bx) / w
        for (let radius = Math.max(w, h); radius >= 1; radius >>= 1) {
          const rx = bx + Math.round((rand() * 2 - 1) * radius)
          const ry = by + Math.round((rand() * 2 - 1) * radius)
          if (rx >= 0 && ry >= 0 && rx < w && ry < h) tryCandidate(ry * w + rx)
        }
        nnf[p] = best
        cost[p] = bestCost
      }
    }

    sum.fill(0)
    weight.fill(0)
    for (const p of targets) {
      const q = nnf[p]
      const px = p % w
      const py = (p - px) / w
      const wgt = Math.max(1e-4, Math.exp(-cost[p] / area[p] / SPREAD))
      for (let dy = -HALF; dy <= HALF; dy++) {
        const yy = py + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -HALF; dx <= HALF; dx++) {
          const xx = px + dx
          if (xx < 0 || xx >= w) continue
          const x = yy * w + xx
          if (!hole[x]) continue
          const b = (q + dy * w + dx) * 3
          sum[x * 3] += color[b] * wgt
          sum[x * 3 + 1] += color[b + 1] * wgt
          sum[x * 3 + 2] += color[b + 2] * wgt
          weight[x] += wgt
        }
      }
    }
    for (const p of targets) {
      if (!hole[p] || !weight[p]) continue
      color[p * 3] = sum[p * 3] / weight[p]
      color[p * 3 + 1] = sum[p * 3 + 1] / weight[p]
      color[p * 3 + 2] = sum[p * 3 + 2] / weight[p]
    }
  }
  return nnf
}

function synthesize(base: Level) {
  const pyramid = [base]
  for (let top = base; top.w >= 48 && top.h >= 48 && shortSide(top.hole, top.w, top.h) > 12; ) {
    const next = shrink(top)
    if (!regions(next).sources.length) break
    pyramid.push(next)
    top = next
  }
  diffuse(pyramid[pyramid.length - 1])

  const rand = random(base.w * 73856093 + base.h * 19349663)
  let nnf = solve(pyramid[pyramid.length - 1], null, 10, rand)
  for (let i = pyramid.length - 2; i >= 0; i--) {
    const level = pyramid[i]
    const up = pyramid[i + 1]
    const seed = new Int32Array(level.w * level.h).fill(-1)
    for (let y = 0; y < level.h; y++) {
      for (let x = 0; x < level.w; x++) {
        const p = y * level.w + x
        const c = (y >> 1) * up.w + (x >> 1)
        if (level.hole[p]) level.color.set(up.color.subarray(c * 3, c * 3 + 3), p * 3)
        const q = nnf[c]
        if (q < 0) continue
        const qx = q % up.w
        const qy = (q - qx) / up.w
        seed[p] = Math.min(level.h - 1, qy * 2 + (y & 1)) * level.w + Math.min(level.w - 1, qx * 2 + (x & 1))
      }
    }
    nnf = solve(level, seed, 5, rand)
  }
  return nnf
}

function diffuse({ w, h, color, hole }: Level) {
  const known = hole.map((v) => 1 - v)
  let changed = true
  while (changed) {
    changed = false
    const next: [number, number, number, number][] = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x
        if (known[p]) continue
        let r = 0
        let g = 0
        let b = 0
        let n = 0
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
          if (q < 0 || !known[q]) continue
          r += color[q * 3]
          g += color[q * 3 + 1]
          b += color[q * 3 + 2]
          n++
        }
        if (n) next.push([p, r / n, g / n, b / n])
      }
    }
    for (const [p, r, g, b] of next) {
      color[p * 3] = r
      color[p * 3 + 1] = g
      color[p * 3 + 2] = b
      known[p] = 1
      changed = true
    }
  }
}
