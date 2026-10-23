import { PRESETS } from '@/data/presets'
import { canvasOf, pixels, scaled } from './canvas'
import { blend, combine, NEUTRAL, type Params } from './params'
import { Renderer } from './renderer'
import { measure, score, tailor, type Scene } from './scene'

export type AutoLook = { base: string; look: Partial<Params> }

const FAVORITE = 'movie'
const FAVORITE_BONUS = 0.5

let renderer: Renderer | null = null

export function autoLook(image: ImageData, auto: Partial<Params>, scene: Scene): AutoLook {
  const fallback = PRESETS.find((p) => p.id === FAVORITE)!
  try {
    renderer ??= new Renderer(document.createElement('canvas'))
  } catch {
    return { base: fallback.id, look: tailor(fallback.look, scene) }
  }
  renderer.setImage(pixels(scaled(canvasOf(image), 320)))
  const grab = (params: Params) => {
    renderer!.render(params, scene.subject)
    return measure(pixels(scaled(renderer!.canvas, renderer!.width)), scene.subject)
  }
  const base = grab(NEUTRAL)
  let best = { base: fallback.id, look: tailor(fallback.look, scene) }
  let bestScore = -Infinity
  for (const preset of PRESETS) {
    if (preset.dark && scene.median >= 0.3) continue
    const look = tailor(preset.look, scene)
    const parts = score(grab(blend(combine(auto, look), 1)), base, scene)
    const total = Object.values(parts).reduce((a, b) => a + b, 0) + (preset.id === FAVORITE ? FAVORITE_BONUS : 0)
    if (total > bestScore) {
      bestScore = total
      best = { base: preset.id, look }
    }
  }
  return best
}
