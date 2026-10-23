import { PRESETS } from '@/data/presets'
import { canvasOf, pixels, scaled } from './canvas'
import { blend, combine, NEUTRAL, type Params } from './params'
import { Renderer } from './renderer'
import { clamp, measure, score, tailor, type Scene } from './scene'

export type AutoLook = { base: string; look: Partial<Params>; looks: Record<string, Partial<Params>> }

const FAVORITE = 'movie'
const FAVORITE_BONUS = 0.15
const STRENGTHS = [0.5, 0.75, 1, 1.25]

let renderer: Renderer | null = null

export function autoLook(image: ImageData, auto: Partial<Params>, scene: Scene): AutoLook {
  const tailored = Object.fromEntries(PRESETS.map((p) => [p.id, tailor(p.look, scene)]))
  const fallback = PRESETS.find((p) => p.id === FAVORITE)!
  try {
    renderer ??= new Renderer(document.createElement('canvas'))
  } catch {
    return { base: fallback.id, look: tailored[fallback.id], looks: tailored }
  }
  renderer.setImage(pixels(scaled(canvasOf(image), 320)))
  renderer.setDepth(scene.sight)
  const view = (params: Params) => {
    renderer!.render(params, scene.focus)
    return pixels(scaled(renderer!.canvas, renderer!.width))
  }
  const base = measure(view(NEUTRAL), scene.focus)
  const grab = (params: Params) => measure(view(params), scene.focus, base.zones)
  const toned = grab(blend(auto, 1))
  const looks: Record<string, Partial<Params>> = {}
  let best = { base: fallback.id, look: tailored[fallback.id] }
  let bestScore = -Infinity
  for (const preset of PRESETS) {
    let look = tailored[preset.id]
    const { mean } = grab(blend(combine(auto, look), 1))
    const want = toned.mean * 2 ** ((preset.look.exposure ?? 0) / 2.2)
    const fix = clamp(2.2 * Math.log2(want / Math.max(mean, 0.01)) * 0.75, -0.35, 0.35)
    if (Math.abs(fix) > 0.02) look = combine(look, { exposure: Math.round(fix * 100) / 100 })
    looks[preset.id] = look
    if (preset.styled || (preset.dark && scene.median >= 0.3)) continue
    for (const strength of STRENGTHS) {
      const dialed = blend(look, strength)
      const parts = score(grab(blend(combine(auto, dialed), 1)), base, scene)
      const total = Object.values(parts).reduce((a, b) => a + b, 0) - strength * 0.1 + (preset.id === FAVORITE ? FAVORITE_BONUS : 0)
      if (total > bestScore) {
        bestScore = total
        best = { base: preset.id, look: dialed }
      }
    }
  }
  if (scene.presence > 0.04) best.look = { ...best.look, blur: Math.max(best.look.blur ?? 0, 16 + 30 * Math.min(1, scene.presence / 0.25)), blurMode: 'radial' }
  const day = clamp((scene.median - 0.15) / 0.3, 0, 1)
  for (let pass = 0; pass < 3; pass++) {
    const f = grab(blend(combine(auto, best.look), 1))
    const { vignette = 0, blacks = 0 } = { ...auto, ...best.look }
    best.look = combine(best.look, {
      exposure: clamp(2.2 * Math.log2(clamp(base.mean * (0.85 + 0.07 * day), 0.2, 0.5) / f.mean) * 0.6, -0.25, 0.25),
      contrast: clamp((0.235 + 0.015 * day - f.contrast) * 200, -8, 8),
      blacks: clamp((f.floor - 0.012 - 0.02 * day) * -250, -10 - blacks, Math.min(10, 15 - blacks)),
      vignette: clamp((f.frame / Math.max(base.frame, 0.2) - 0.74) * 120, -vignette, Math.min(12, 60 - vignette)),
      temperature: clamp((0.012 * day + Math.max(base.tint[1], -0.01) * (1 - day) - f.tint[1]) * 250, -6, 6),
    })
  }
  return { ...best, looks }
}
