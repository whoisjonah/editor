export type BlurMode = 'radial' | 'tilt'

export type Params = {
  exposure: number
  contrast: number
  highlights: number
  shadows: number
  whites: number
  blacks: number
  temperature: number
  tint: number
  vibrance: number
  saturation: number
  shadowHue: number
  shadowTint: number
  highlightHue: number
  highlightTint: number
  fade: number
  clarity: number
  dehaze: number
  sharpen: number
  glow: number
  vignette: number
  grain: number
  fringe: number
  blur: number
  focusSize: number
  blurMode: BlurMode
}

export type NumericKey = Exclude<keyof Params, 'blurMode'>

export type Focus = { x: number; y: number }

export const NEUTRAL: Params = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
  shadowHue: 220,
  shadowTint: 0,
  highlightHue: 35,
  highlightTint: 0,
  fade: 0,
  clarity: 0,
  dehaze: 0,
  sharpen: 0,
  glow: 0,
  vignette: 0,
  grain: 0,
  fringe: 0,
  blur: 0,
  focusSize: 45,
  blurMode: 'radial',
}

const FIXED: NumericKey[] = ['shadowHue', 'highlightHue', 'focusSize']

export function blend(look: Partial<Params>, strength: number): Params {
  const out = { ...NEUTRAL, ...look }
  for (const key of Object.keys(NEUTRAL) as (keyof Params)[]) {
    if (key === 'blurMode' || FIXED.includes(key)) continue
    out[key] = NEUTRAL[key] + (out[key] - NEUTRAL[key]) * strength
  }
  return out
}

export function combine(...looks: Partial<Params>[]): Partial<Params> {
  const out: Partial<Params> = {}
  for (const look of looks) {
    for (const [key, value] of Object.entries(look) as [keyof Params, Params[keyof Params]][]) {
      if (key === 'blurMode' || FIXED.includes(key) || out[key] === undefined) Object.assign(out, { [key]: value })
      else Object.assign(out, { [key]: (out[key] as number) + (value as number) })
    }
  }
  return out
}
