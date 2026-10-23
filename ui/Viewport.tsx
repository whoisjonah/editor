'use client'

import { IconArrowBackUp, IconArrowForwardUp, IconCameraSpark, IconEraser, IconEye, IconLoader2, IconPhotoUp, IconSun } from '@tabler/icons-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { Sample } from '@/data/samples'
import { chooseTargets } from '@/editor/depth'
import { dilate } from '@/editor/mask'
import { setActiveRenderer } from '@/editor/output'
import { Renderer } from '@/editor/renderer'
import { NEUTRAL } from '@/editor/params'
import { currentParams, eraseRegion, openImage, paintGlow, redo, toggleTarget, undo, useEditor, type Tool } from '@/editor/store'

type Point = { x: number; y: number }

const TOOLS: { id: Exclude<Tool, null>; label: string; icon: typeof IconEraser; title: string }[] = [
  { id: 'erase', label: 'Erase', icon: IconEraser, title: 'Paint over anything you want gone' },
  { id: 'glow', label: 'Glow', icon: IconSun, title: 'Paint where light should bloom' },
]

export function Viewport({ onOpen, samples }: { onOpen: () => void; samples: Sample[] }) {
  const original = useEditor((s) => s.original)
  const error = useEditor((s) => s.error)
  const hasImage = !!original
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [fit, setFit] = useState({ w: 0, h: 0 })

  useEffect(() => {
    if (!hasImage || !canvas.current) return
    let renderer: Renderer
    try {
      renderer = new Renderer(canvas.current)
    } catch (e) {
      useEditor.setState({ error: e instanceof Error ? e.message : 'WebGL is not available' })
      return
    }
    setActiveRenderer(renderer)
    let frame = 0
    let last = useEditor.getState()
    const draw = () => {
      frame = 0
      const s = useEditor.getState()
      renderer.render(s.comparing ? NEUTRAL : currentParams(s), s.focus, s.comparing ? 'original' : 'edited')
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw)
    }
    renderer.setImage(last.original!, last.edited ?? last.original!)
    renderer.setDepth(last.depth)
    renderer.setGlow(last.glow)
    schedule()
    const stop = useEditor.subscribe((s) => {
      if (s.original && s.original !== last.original) renderer.setImage(s.original, s.edited ?? s.original)
      else if (s.edited && s.edited !== last.edited) renderer.setEdited(s.edited)
      if (s.depth !== last.depth) renderer.setDepth(s.depth)
      if (s.glow !== last.glow) renderer.setGlow(s.glow)
      last = s
      schedule()
    })
    return () => {
      stop()
      cancelAnimationFrame(frame)
      setActiveRenderer(null)
      renderer.dispose()
    }
  }, [hasImage])

  useLayoutEffect(() => {
    const el = box.current
    if (!el || !original) return
    const update = () => {
      const pad = 24
      const w = el.clientWidth - pad * 2
      const h = el.clientHeight - pad * 2
      const scale = Math.min(w / original.width, h / original.height)
      setFit({ w: Math.max(0, Math.floor(original.width * scale)), h: Math.max(0, Math.floor(original.height * scale)) })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [original])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      if (event.key === '\\') useEditor.setState({ comparing: true })
      if (!event.metaKey && !event.ctrlKey) return
      const key = event.key.toLowerCase()
      if (key === 'z' || key === 'y') event.preventDefault()
      if (key === 'z' && !event.shiftKey) undo()
      if ((key === 'z' && event.shiftKey) || key === 'y') redo()
    }
    const up = (event: KeyboardEvent) => {
      if (event.key === '\\') useEditor.setState({ comparing: false })
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  return (
    <section ref={box} className="checker relative flex min-h-[55vh] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-app-line lg:min-h-0">
      {hasImage ? (
        <div className="relative" style={{ width: fit.w, height: fit.h }}>
          <canvas ref={canvas} className="anim-pop block h-full w-full rounded-lg shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)]" />
          <Overlay width={fit.w} height={fit.h} />
        </div>
      ) : (
        <Empty onOpen={onOpen} samples={samples} />
      )}
      {hasImage && <Toolbar />}
      <Status />
      {error && (
        <div className="anim-pop absolute top-3 left-1/2 -translate-x-1/2 rounded-lg border border-app-alert/40 bg-[#1a0d0e]/90 px-3 py-1.5 text-sm text-app-alert">{error}</div>
      )}
    </section>
  )
}

async function openSample({ url, name }: Sample) {
  const blob = await fetch(url).then((r) => r.blob())
  openImage(new File([blob], name, { type: blob.type }))
}

function Empty({ onOpen, samples }: { onOpen: () => void; samples: Sample[] }) {
  return (
    <div className="anim-pop flex flex-col items-center gap-5 px-6 text-center">
      <div className="tile flex size-20 items-center justify-center rounded-3xl">
        <IconCameraSpark size={36} stroke={1.5} className="text-[#f4f4f6]" />
      </div>
      <div>
        <div className="text-lg font-semibold text-app-text">Drop a Roblox screenshot</div>
        <div className="mt-1 text-sm text-app-dim">or paste it with Ctrl+V</div>
      </div>
      <button type="button" onClick={onOpen} className="btn-skeu flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium">
        <IconPhotoUp size={16} />
        Choose image
      </button>
      {samples.length > 0 && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="text-xs text-app-dim">Or try a sample</div>
          <div className="flex max-w-[560px] flex-wrap justify-center gap-2">
            {samples.map((sample) => (
              <button key={sample.url} type="button" onClick={() => openSample(sample)} className="group flex w-28 flex-col gap-1">
                <span className="block h-16 w-full overflow-hidden rounded-lg border border-app-line/70 transition-colors group-hover:border-white/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sample.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                </span>
                <span className="truncate text-[11px] text-app-dim transition-colors group-hover:text-app-text">{sample.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Status() {
  const cleaning = useEditor((s) => s.cleaning)
  const filling = useEditor((s) => s.filling)
  const label = cleaning ? 'Removing Roblox UI' : filling ? 'Erasing' : null
  if (!label) return null
  return (
    <div className="anim-pop absolute top-3 left-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-app-text backdrop-blur">
      <IconLoader2 size={13} className="spin" />
      {label}
    </div>
  )
}

function Toolbar() {
  const tool = useEditor((s) => s.tool)
  const brush = useEditor((s) => s.brush)
  const canUndo = useEditor((s) => s.history.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const comparing = useEditor((s) => s.comparing)
  const compare = (on: boolean) => useEditor.setState({ comparing: on })

  return (
    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-black/60 p-1 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.9)] backdrop-blur">
      <button
        type="button"
        onPointerDown={() => compare(true)}
        onPointerUp={() => compare(false)}
        onPointerLeave={() => compare(false)}
        title="Hold to see the original (\)"
        className={`btn-skeu-dark flex h-8 items-center gap-2 rounded-lg px-3 text-sm ${comparing ? 'text-white' : ''}`}
      >
        <IconEye size={15} />
        Original
      </button>
      {TOOLS.map(({ id, label, icon: Icon, title }) => (
        <button
          key={id}
          type="button"
          aria-pressed={tool === id}
          onClick={() => useEditor.setState({ tool: tool === id ? null : id })}
          title={title}
          className={`flex h-8 items-center gap-2 rounded-lg px-3 text-sm ${tool === id ? 'btn-skeu font-medium' : 'btn-skeu-dark'}`}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
      {tool && (
        <input
          type="range"
          aria-label="Brush size"
          className="range anim-pop mx-2 w-24"
          min={1}
          max={12}
          step={0.5}
          value={brush}
          style={{ '--fill-to': `${((brush - 1) / 11) * 100}%` } as CSSProperties}
          onChange={(event) => useEditor.setState({ brush: Number(event.target.value) })}
        />
      )}
      <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" className="btn-skeu-dark flex size-8 items-center justify-center rounded-lg disabled:opacity-40">
        <IconArrowBackUp size={15} />
      </button>
      <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" className="btn-skeu-dark flex size-8 items-center justify-center rounded-lg disabled:opacity-40">
        <IconArrowForwardUp size={15} />
      </button>
    </div>
  )
}

function trace(ctx: CanvasRenderingContext2D, points: Point[], size: number) {
  ctx.lineWidth = size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y)
  if (points.length > 1) return ctx.stroke()
  ctx.arc(points[0].x, points[0].y, size / 2, 0, Math.PI * 2)
  ctx.fill()
}

function glowLayer(image: ImageData, points: Point[], size: number) {
  const { glow } = useEditor.getState()
  const c = document.createElement('canvas')
  c.width = Math.round(image.width / 2)
  c.height = Math.round(image.height / 2)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  if (glow) ctx.putImageData(glow, 0, 0)
  ctx.scale(0.5, 0.5)
  ctx.filter = `blur(${size * 0.3}px)`
  ctx.strokeStyle = ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
  trace(ctx, points, size)
  return ctx.getImageData(0, 0, c.width, c.height)
}

function Overlay({ width, height }: { width: number; height: number }) {
  const tool = useEditor((s) => s.tool)
  const brush = useEditor((s) => s.brush)
  const focus = useEditor((s) => s.focus)
  const blur = useEditor((s) => currentParams(s).blur)
  const tilt = useEditor((s) => currentParams(s).blurMode === 'tilt')
  const image = useEditor((s) => s.original)
  const depth = useEditor((s) => s.depth)
  const paint = useRef<HTMLCanvasElement>(null)
  const stroke = useRef<Point[] | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [dragging, setDragging] = useState(false)

  if (!image) return null
  const subjects = depth && depth !== 'loading' && !tilt ? depth.subjects : []
  const chosen = chooseTargets(subjects, focus.targets)
  const scale = width / image.width
  const brushPx = (brush / 100) * image.height

  const toImage = (event: ReactPointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: ((event.clientX - rect.left) / rect.width) * image.width, y: ((event.clientY - rect.top) / rect.height) * image.height }
  }

  const drawStroke = () => {
    const c = paint.current
    const points = stroke.current
    if (!c || !points) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(width * dpr)
    c.height = Math.round(height * dpr)
    const ctx = c.getContext('2d')!
    ctx.scale(dpr * scale, dpr * scale)
    ctx.strokeStyle = ctx.fillStyle = tool === 'glow' ? 'rgba(255, 214, 120, 0.45)' : 'rgba(255, 77, 79, 0.55)'
    trace(ctx, points, brushPx)
  }

  const finishStroke = () => {
    const points = stroke.current
    stroke.current = null
    if (paint.current) paint.current.width = paint.current.width
    if (!points?.length) return
    if (tool === 'glow') return paintGlow(glowLayer(image, points, brushPx))
    const r = brushPx / 2
    const x0 = Math.max(0, Math.floor(Math.min(...points.map((p) => p.x)) - r))
    const y0 = Math.max(0, Math.floor(Math.min(...points.map((p) => p.y)) - r))
    const x1 = Math.min(image.width, Math.ceil(Math.max(...points.map((p) => p.x)) + r))
    const y1 = Math.min(image.height, Math.ceil(Math.max(...points.map((p) => p.y)) + r))
    const w = x1 - x0
    const h = y1 - y0
    if (w <= 0 || h <= 0) return
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.translate(-x0, -y0)
    trace(ctx, points, brushPx)
    const alpha = ctx.getImageData(0, 0, w, h).data
    const data = new Uint8Array(w * h)
    for (let i = 0; i < data.length; i++) data[i] = alpha[i * 4 + 3] > 0 ? 1 : 0
    eraseRegion(dilate({ x: x0, y: y0, w, h, data }, 2, image))
  }

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!tool) return
    event.currentTarget.setPointerCapture(event.pointerId)
    stroke.current = [toImage(event)]
    drawStroke()
  }

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const p = toImage(event)
    if (tool) setCursor(p)
    if (dragging) {
      useEditor.setState({ focus: { x: Math.min(1, Math.max(0, p.x / image.width)), y: Math.min(1, Math.max(0, p.y / image.height)) } })
      return
    }
    if (stroke.current) {
      stroke.current.push(p)
      drawStroke()
    }
  }

  const onUp = () => {
    if (dragging) setDragging(false)
    if (stroke.current) finishStroke()
  }

  return (
    <div
      className={`group absolute inset-0 touch-none ${tool ? 'cursor-none' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={() => setCursor(null)}
    >
      <canvas ref={paint} className="pointer-events-none absolute inset-0 h-full w-full" />
      {tool && cursor && (
        <div
          className="pointer-events-none absolute rounded-full border border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
          style={{ left: cursor.x * scale - (brushPx * scale) / 2, top: cursor.y * scale - (brushPx * scale) / 2, width: brushPx * scale, height: brushPx * scale }}
        />
      )}
      {!tool &&
        blur > 0 &&
        subjects.map(({ box, kind }, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${chosen.includes(i) ? 'Blur' : 'Focus on'} this ${kind === 'vehicle' ? 'vehicle' : 'person'}`}
            aria-pressed={chosen.includes(i)}
            onClick={() => toggleTarget(i)}
            className={`absolute rounded-md border transition-opacity ${
              chosen.includes(i) ? 'border-white/80 opacity-0 group-hover:opacity-100' : 'border-dashed border-white/40 opacity-0 group-hover:opacity-100 hover:border-white/80'
            }`}
            style={{ left: box[0] * width, top: box[1] * height, width: (box[2] - box[0]) * width, height: (box[3] - box[1]) * height }}
          />
        ))}
      {!tool && blur > 0 && !chosen.length && (
        <button
          type="button"
          aria-label="Focus point"
          onPointerDown={(event) => {
            event.stopPropagation()
            event.currentTarget.parentElement?.setPointerCapture(event.pointerId)
            setDragging(true)
          }}
          className={`absolute flex size-9 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5),0_4px_14px_rgba(0,0,0,0.5)] transition-opacity active:cursor-grabbing ${
            dragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ left: focus.x * width, top: focus.y * height }}
        >
          <span className={`bg-white ${tilt ? 'h-0.5 w-4 rounded-full' : 'size-1.5 rounded-full'}`} />
        </button>
      )}
    </div>
  )
}
