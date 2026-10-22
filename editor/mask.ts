export type MaskRegion = { x: number; y: number; w: number; h: number; data: Uint8Array }

export function dilate(region: MaskRegion, radius: number, bounds: { width: number; height: number }): MaskRegion {
  const x = Math.max(0, region.x - radius)
  const y = Math.max(0, region.y - radius)
  const right = Math.min(bounds.width, region.x + region.w + radius)
  const bottom = Math.min(bounds.height, region.y + region.h + radius)
  const w = right - x
  const h = bottom - y
  const horizontal = new Uint8Array(w * region.h)
  for (let j = 0; j < region.h; j++) {
    for (let i = 0; i < region.w; i++) {
      if (!region.data[j * region.w + i]) continue
      const cx = region.x + i - x
      for (let k = Math.max(0, cx - radius); k <= Math.min(w - 1, cx + radius); k++) horizontal[j * w + k] = 1
    }
  }
  const data = new Uint8Array(w * h)
  const r2 = radius * radius
  for (let j = 0; j < region.h; j++) {
    const cy = region.y + j - y
    for (let i = 0; i < w; i++) {
      if (!horizontal[j * w + i]) continue
      for (let k = Math.max(0, cy - radius); k <= Math.min(h - 1, cy + radius); k++) {
        const dy = k - cy
        if (dy * dy <= r2) data[k * w + i] = 1
      }
    }
  }
  return { x, y, w, h, data }
}
