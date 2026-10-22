import type { NumericKey } from '@/editor/params'

export type Track = 'temperature' | 'tint' | 'hue'

type SliderDef = {
  key: NumericKey
  label: string
  min: number
  max: number
  step?: number
  track?: Track
  format?: (value: number) => string
}

type SliderGroup = { id: string; title: string; sliders: SliderDef[] }

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`)
const stops = (value: number) => (value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2))

export const SLIDER_GROUPS: SliderGroup[] = [
  {
    id: 'light',
    title: 'Light',
    sliders: [
      { key: 'exposure', label: 'Exposure', min: -3, max: 3, step: 0.01, format: stops },
      { key: 'contrast', label: 'Contrast', min: -100, max: 100, format: signed },
      { key: 'highlights', label: 'Highlights', min: -100, max: 100, format: signed },
      { key: 'shadows', label: 'Shadows', min: -100, max: 100, format: signed },
      { key: 'whites', label: 'Whites', min: -100, max: 100, format: signed },
      { key: 'blacks', label: 'Blacks', min: -100, max: 100, format: signed },
    ],
  },
  {
    id: 'color',
    title: 'Color',
    sliders: [
      { key: 'temperature', label: 'Temp', min: -100, max: 100, track: 'temperature', format: signed },
      { key: 'tint', label: 'Tint', min: -100, max: 100, track: 'tint', format: signed },
      { key: 'vibrance', label: 'Vibrance', min: -100, max: 100, format: signed },
      { key: 'saturation', label: 'Saturation', min: -100, max: 100, format: signed },
    ],
  },
  {
    id: 'grading',
    title: 'Color grading',
    sliders: [
      { key: 'shadowHue', label: 'Shadow hue', min: 0, max: 360, track: 'hue', format: (v) => `${v}°` },
      { key: 'shadowTint', label: 'Shadow amount', min: 0, max: 100 },
      { key: 'highlightHue', label: 'Highlight hue', min: 0, max: 360, track: 'hue', format: (v) => `${v}°` },
      { key: 'highlightTint', label: 'Highlight amount', min: 0, max: 100 },
      { key: 'fade', label: 'Fade', min: 0, max: 100 },
    ],
  },
  {
    id: 'effects',
    title: 'Effects',
    sliders: [
      { key: 'clarity', label: 'Clarity', min: -100, max: 100, format: signed },
      { key: 'dehaze', label: 'Dehaze', min: -100, max: 100, format: signed },
      { key: 'sharpen', label: 'Sharpen', min: 0, max: 100 },
      { key: 'glow', label: 'Glow', min: 0, max: 100 },
      { key: 'vignette', label: 'Vignette', min: 0, max: 100 },
      { key: 'grain', label: 'Grain', min: 0, max: 100 },
      { key: 'fringe', label: 'Fringe', min: 0, max: 100 },
    ],
  },
  {
    id: 'lens',
    title: 'Lens blur',
    sliders: [
      { key: 'blur', label: 'Amount', min: 0, max: 100 },
      { key: 'focusSize', label: 'Focus area', min: 0, max: 100 },
    ],
  },
]
