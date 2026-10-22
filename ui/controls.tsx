'use client'

import type { Icon } from '@tabler/icons-react'
import type { CSSProperties } from 'react'
import type { Track } from '@/data/sliders'

const TRACKS: Record<Track, string> = {
  temperature: 'linear-gradient(90deg, #3f6fd1, #8b8b94 50%, #e2b33a)',
  tint: 'linear-gradient(90deg, #3faa5a, #8b8b94 50%, #c64bc4)',
  hue: 'linear-gradient(90deg, #f44, #fb4, #ef4, #4e6, #4de, #46f, #c4f, #f44)',
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  track,
  format = (v) => `${v}`,
  onChange,
  onReset,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  track?: Track
  format?: (value: number) => string
  onChange: (value: number) => void
  onReset?: () => void
}) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100
  const anchor = min < 0 ? pct(0) : 0
  const style = {
    '--fill-from': `${Math.min(anchor, pct(value))}%`,
    '--fill-to': `${Math.max(anchor, pct(value))}%`,
    ...(track ? { '--track': TRACKS[track] } : {}),
  } as CSSProperties

  return (
    <label className="grid grid-cols-[96px_minmax(0,1fr)_44px] items-center gap-3 py-1" onDoubleClick={onReset}>
      <span className="truncate text-xs text-app-dim">{label}</span>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={style}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="text-right text-xs text-app-text tabular-nums">{format(Math.round(value / step) * step)}</span>
    </label>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${checked ? 'border-white/40 bg-app-accent' : 'border-white/10 bg-white/[0.08]'}`}
    >
      <span
        className={`absolute top-[1px] left-[1px] size-4 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.6)] transition-transform ${checked ? 'translate-x-4 bg-[#18181b]' : 'bg-app-dim'}`}
      />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: { value: T; label: string; icon?: Icon }[]
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="grid gap-1 rounded-xl border border-app-line bg-black/25 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`flex items-center justify-center gap-2 rounded-lg ${size === 'md' ? 'h-8 text-sm' : 'h-7 text-xs'} ${
            value === v ? 'btn-skeu font-medium' : 'text-app-dim transition-colors hover:text-app-text'
          }`}
        >
          {Icon && <Icon size={size === 'md' ? 15 : 13} />}
          {label}
        </button>
      ))}
    </div>
  )
}
