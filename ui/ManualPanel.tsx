'use client'

import { IconFocusCentered, IconLayoutDistributeHorizontal, IconRotate, IconWand } from '@tabler/icons-react'
import { SLIDER_GROUPS } from '@/data/sliders'
import { autoManual, resetManual, resetParam, setParam, useEditor } from '@/editor/store'
import { Segmented, Slider } from './controls'
import { Heading } from './Panel'

export function ManualPanel() {
  const manual = useEditor((s) => s.manual)

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
