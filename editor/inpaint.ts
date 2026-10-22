import type { MaskRegion } from './mask'

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, (pixels: Uint8ClampedArray) => void>()

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./fill.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<{ id: number; pixels: Uint8ClampedArray }>) => {
    pending.get(event.data.id)?.(event.data.pixels)
    pending.delete(event.data.id)
  }
  return worker
}

export async function inpaint(image: ImageData, region: MaskRegion): Promise<ImageData> {
  const { width, height, data } = image
  const margin = Math.max(64, Math.round(Math.min(region.w, region.h) * 3))
  const x0 = Math.max(0, region.x - margin)
  const y0 = Math.max(0, region.y - margin)
  const x1 = Math.min(width, region.x + region.w + margin)
  const y1 = Math.min(height, region.y + region.h + margin)
  const cw = x1 - x0
  const ch = y1 - y0

  const pixels = new Uint8ClampedArray(cw * ch * 4)
  const mask = new Uint8Array(cw * ch)
  for (let y = 0; y < ch; y++) {
    pixels.set(data.subarray(((y + y0) * width + x0) * 4, ((y + y0) * width + x1) * 4), y * cw * 4)
    for (let x = 0; x < cw; x++) {
      const mx = x + x0 - region.x
      const my = y + y0 - region.y
      if (mx >= 0 && my >= 0 && mx < region.w && my < region.h && region.data[my * region.w + mx]) mask[y * cw + x] = 1
    }
  }

  const id = nextId++
  const filled = await new Promise<Uint8ClampedArray>((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage({ id, width: cw, height: ch, pixels, mask }, [pixels.buffer, mask.buffer])
  })

  const out = new ImageData(new Uint8ClampedArray(data), width, height)
  for (let y = 0; y < ch; y++) out.data.set(filled.subarray(y * cw * 4, (y + 1) * cw * 4), ((y + y0) * width + x0) * 4)
  return out
}
