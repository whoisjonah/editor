import { RawImage } from '@huggingface/transformers'
import { loadScene, type Box } from '../vision'

export const maxDuration = 60

const KINDS: Record<string, 'vehicle' | 'person'> = { car: 'vehicle', truck: 'vehicle', bus: 'vehicle', motorcycle: 'vehicle', bicycle: 'vehicle', person: 'person' }

function overlap(a: Box, b: Box) {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  return (w * h) / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - w * h)
}

export async function POST(request: Request) {
  const blob = await request.blob()
  if (!blob.type.startsWith('image/')) return new Response('Send an image', { status: 400 })
  const image = await RawImage.fromBlob(blob)
  const [estimate, detect] = await loadScene()
  const [{ depth }, found] = await Promise.all([estimate(image), detect(image, { threshold: 0.3, percentage: true })])
  const subjects: { kind: 'vehicle' | 'person'; score: number; box: Box }[] = []
  for (const { label, score, box } of found.sort((a, b) => b.score - a.score)) {
    const kind = KINDS[label]
    const clamped = [box.xmin, box.ymin, box.xmax, box.ymax].map((v) => Math.min(1, Math.max(0, v))) as Box
    if (kind && !subjects.some((s) => s.kind === kind && overlap(s.box, clamped) > 0.5)) subjects.push({ kind, score, box: clamped })
  }
  const png = await depth.toSharp().toColourspace('b-w').png().toBuffer()
  return Response.json({ depth: `data:image/png;base64,${png.toString('base64')}`, subjects })
}
