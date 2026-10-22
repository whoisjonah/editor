'use client'

import { IconAdjustments, IconAdjustmentsHorizontal, IconLoader2, IconSparkles } from '@tabler/icons-react'
import { setMode, setRemoval, useEditor, type Removal } from '@/editor/store'
import { AutoPanel } from './AutoPanel'
import { Segmented, Switch } from './controls'
import { ManualPanel } from './ManualPanel'
import { Card, Panel } from './Panel'

const REMOVALS: { id: Removal; label: string }[] = [
  { id: 'left', label: 'Top left buttons' },
  { id: 'right', label: 'Top right buttons' },
  { id: 'banner', label: 'Screenshot banner' },
]

export function Sidebar() {
  const mode = useEditor((s) => s.mode)
  const removals = useEditor((s) => s.removals)
  const detection = useEditor((s) => s.detection)
  const cleaning = useEditor((s) => s.cleaning)
  const hasImage = useEditor((s) => !!s.original)

  return (
    <Panel title="Edit" icon={IconAdjustments} className="lg:w-[360px] lg:shrink-0">
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'auto', label: 'Automatic', icon: IconSparkles },
          { value: 'manual', label: 'Manual', icon: IconAdjustmentsHorizontal },
        ]}
      />
      <Card className="mt-3">
        <div className="flex items-center gap-2 px-3.5 pt-3 pb-1 text-sm text-app-text">
          Remove Roblox UI
          {cleaning && <IconLoader2 size={13} className="spin text-app-dim" />}
        </div>
        {REMOVALS.map(({ id, label }) => {
          const found = !!detection?.[id]
          const status = !hasImage ? null : !found ? 'Not on this photo' : removals[id] ? 'Removed' : 'Kept'
          return (
            <div key={id} className="flex items-center gap-3 px-3.5 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-app-text">{label}</div>
                {status && (
                  <div key={status} className={`anim-swap text-[11px] ${found && removals[id] ? 'text-app-text/70' : 'text-app-dim'}`}>
                    {status}
                  </div>
                )}
              </div>
              <Switch label={label} checked={removals[id]} onChange={(on) => setRemoval(id, on)} />
            </div>
          )
        })}
      </Card>
      {mode === 'auto' ? <AutoPanel /> : <ManualPanel />}
    </Panel>
  )
}
