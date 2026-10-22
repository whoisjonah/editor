'use client'

import { useEffect, useState } from 'react'
import { INTRO } from '@/data/intro'
import { DotField } from './DotField'

type Stage = 'dots' | 'logo' | 'zoom' | 'done'

const ORIGIN = '50% 60%'

export function Intro({ onReveal }: { onReveal: () => void }) {
  const [stage, setStage] = useState<Stage>('dots')

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timing = reduced ? INTRO.reduced : INTRO.full
    const timers = [
      setTimeout(() => setStage('logo'), timing.logoAt),
      setTimeout(() => {
        setStage('zoom')
        onReveal()
      }, timing.zoomAt),
      setTimeout(() => setStage('done'), timing.doneAt),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onReveal])

  if (stage === 'done') return null
  const zooming = stage === 'zoom'

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-hidden>
      <div className={`absolute inset-0 bg-app-bg ${zooming ? 'intro-backdrop-out' : ''}`}>
        <DotField />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(9,9,11,0.75)_0%,rgba(9,9,11,0.2)_35%,rgba(9,9,11,0.5)_100%)]" />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-7">
        <div style={{ transformOrigin: ORIGIN }} className={`${stage === 'dots' ? 'opacity-0' : zooming ? 'intro-logo-zoom' : 'intro-logo-in'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/camera.png" alt="" width={140} height={109} draggable={false} className="h-auto w-[140px] drop-shadow-[0_0_28px_rgba(255,255,255,0.18)]" />
        </div>
        <div className={`h-[3px] w-[180px] overflow-hidden rounded-full bg-white/10 ${stage === 'dots' ? 'opacity-0' : zooming ? 'intro-bar-out' : 'intro-logo-in'}`}>
          <div className={`h-full rounded-full bg-app-accent ${stage === 'dots' ? 'w-0' : 'intro-bar-fill'}`} />
        </div>
      </div>
    </div>
  )
}
