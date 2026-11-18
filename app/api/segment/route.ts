import { segment, type Prompt } from '../vision'

export const maxDuration = 60

const unit = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1

function isPrompt(value: unknown): value is Prompt {
  if (!value || typeof value !== 'object') return false
  if ('box' in value) return Array.isArray(value.box) && value.box.length === 4 && value.box.every(unit)
  return 'point' in value && Array.isArray(value.point) && value.point.length === 2 && value.point.every(unit)
}

export async function POST(request: Request) {
  const form = await request.formData()
  const image = form.get('image')
  let prompts: unknown
  try {
    prompts = JSON.parse(String(form.get('prompts')))
  } catch {
    prompts = null
  }
  if (!(image instanceof Blob) || !image.type.startsWith('image/')) return new Response('Send an image', { status: 400 })
  if (!Array.isArray(prompts) || !prompts.length || prompts.length > 20 || !prompts.every(isPrompt)) return new Response('Send up to 20 prompts', { status: 400 })
  return Response.json({ masks: await segment(image, prompts) })
}
