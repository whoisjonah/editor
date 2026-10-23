'use client'

import { IconFocusCentered, IconLayoutDistributeHorizontal, IconRotate, IconWand } from '@tabler/icons-react'
import { SLIDER_GROUPS } from '@/data/sliders'
import { autoManual, resetManual, resetParam, setParam, setTargets, useEditor } from '@/editor/store'
import { Segmented, Slider } from './controls'
import { Heading } from './Panel'

export function ManualPanel() {
  const manual = useEditor((s) => s.manual)
  const targets = useEditor((s) => s.focus.targets ?? 'auto')
  const detected = useEditor((s) => !!s.depth && s.depth !== 'loading' && s.depth.subjects.length > 0)

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={autoManual} className="btn-skeu-dark flex h-8 items-center justify-center gap-2 rounded-lg text-sm">
          <IconWand size={15} />
          Auto tone
        </button>
        <button type="button" onClick={resetManual} className="btn-skeu-dark flex h-8 items-center justify-center gap-2 rounded-lg text-sm">
          <IconRotate size={15} />
          Reset all
        </button>
      </div>
      {SLIDER_GROUPS.map((group) => (
        <div key={group.id}>
          <Heading>{group.title}</Heading>
          {group.id === 'lens' && (
            <div className="mb-2">
              <Segmented
                size="sm"
                value={manual.blurMode}
                onChange={(v) => setParam('blurMode', v)}
                options={[
                  { value: 'radial', label: 'Radial', icon: IconFocusCentered },
                  { value: 'tilt', label: 'Tilt shift', icon: IconLayoutDistributeHorizontal },
                ]}
              />
              {detected && manual.blurMode === 'radial' && (
                <div className="mt-2">
                  <Segmented
                    size="sm"
                    value={Array.isArray(targets) ? 'custom' : targets}
                    onChange={(v) => v !== 'custom' && setTargets(v)}
                    options={[
                      { value: 'auto', label: 'Auto' },
                      { value: 'vehicles', label: 'Vehicles' },
                      { value: 'people', label: 'People' },
                      { value: 'all', label: 'All' },
                      ...(Array.isArray(targets) ? [{ value: 'custom' as const, label: 'Picked' }] : []),
                    ]}
                  />
                </div>
              )}
            </div>
          )}
          {group.sliders.map((def) => (
            <Slider
              key={def.key}
              label={def.label}
              value={manual[def.key]}
              min={def.min}
              max={def.max}
              step={def.step}
              track={def.track}
              format={def.format}
              onChange={(v) => setParam(def.key, v)}
              onReset={() => resetParam(def.key)}
            />
          ))}
        </div>
      ))}
    </>
  )
}
