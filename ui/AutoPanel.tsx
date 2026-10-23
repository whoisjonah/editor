'use client'

import { IconAdjustmentsHorizontal, IconSparkles } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { PRESET_GROUPS } from '@/data/presets'
import { renderThumbnails } from '@/editor/output'
import { choosePreset, fineTune, useEditor } from '@/editor/store'
import { Slider } from './controls'
import { Heading } from './Panel'

export function AutoPanel() {
  const preset = useEditor((s) => s.preset)
  const strength = useEditor((s) => s.strength)
  const edited = useEditor((s) => s.edited)
  const auto = useEditor((s) => s.auto)
  const base = useEditor((s) => s.autoLook.base)
  const depth = useEditor((s) => s.depth)
  const glow = useEditor((s) => s.glow)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!edited) return
    const timer = setTimeout(() => setThumbs(renderThumbnails()), 60)
    return () => clearTimeout(timer)
  }, [edited, auto, base, depth, glow])

  const thumb = (id: string) =>
    edited &&
    thumbs[id] && (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={thumbs[id]} alt="" className="anim-swap h-full w-full object-cover" />
    )

  return (
    <>
      <Heading>Auto</Heading>
      <button
        type="button"
        onClick={() => choosePreset('auto')}
        aria-pressed={preset === 'auto'}
        className={`group flex w-full items-center gap-3 rounded-xl border p-1.5 text-left transition-colors ${
          preset === 'auto' ? 'border-white/50 bg-white/[0.06]' : 'border-app-line/70 bg-white/[0.02] hover:border-white/20'
        }`}
      >
        <div className="aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-app-raised">{thumb('auto')}</div>
        <div className="min-w-0">
          <div className={`flex items-center gap-1.5 text-sm font-medium ${preset === 'auto' ? 'text-app-text' : 'text-app-dim group-hover:text-app-text'}`}>
            <IconSparkles size={14} />
            Auto
          </div>
        </div>
      </button>
      {PRESET_GROUPS.map((group) => (
        <div key={group.title}>
          <Heading>{group.title}</Heading>
          <div className="grid grid-cols-2 gap-2">
            {group.presets.map((p) => {
              const active = p.id === preset
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => choosePreset(p.id)}
                  aria-pressed={active}
                  className={`group flex flex-col gap-1.5 rounded-xl border p-1.5 text-left transition-colors ${
                    active ? 'border-white/50 bg-white/[0.06]' : 'border-app-line/70 bg-white/[0.02] hover:border-white/20'
                  }`}
                >
                  <div className="aspect-video w-full overflow-hidden rounded-lg bg-app-raised">{thumb(p.id)}</div>
                  <span className={`px-1 pb-0.5 text-xs font-medium ${active ? 'text-app-text' : 'text-app-dim group-hover:text-app-text'}`}>{p.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <Heading>Strength</Heading>
      <Slider label="Amount" value={strength} min={0} max={150} format={(v) => `${v}%`} onChange={(v) => useEditor.setState({ strength: v })} onReset={() => useEditor.setState({ strength: 100 })} />
      <button type="button" onClick={fineTune} className="btn-skeu-dark mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg text-sm">
        <IconAdjustmentsHorizontal size={15} />
        Fine-tune with sliders
      </button>
    </>
  )
}
