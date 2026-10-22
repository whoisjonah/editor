'use client'

import { useEffect, useRef } from 'react'

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uReveal;
uniform float uDpr;
uniform vec2 uPointer;
uniform float uPointerOn;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float silk(vec2 p, float t) {
  vec2 q = p + 0.28 * vec2(sin(p.y * 1.6 + t * 0.5), sin(p.x * 1.2 - t * 0.4));
  float broad = 0.5 + 0.5 * sin(q.x * 1.1 - q.y * 0.7 + t * 0.45 + 0.8 * sin(q.y * 0.9 + t * 0.2));
  float fold = q.x * 1.7 + q.y * 1.05 + 1.3 * sin(q.y * 1.4 - q.x * 0.5 - t * 0.35) + t * 0.25;
  float crease = smoothstep(0.02, 0.55, abs(sin(fold)));
  float sheen = 0.5 + 0.5 * sin(fold * 0.5 + q.y * 2.2 - t * 0.3);
  return mix(0.12, 1.0, broad) * mix(0.08, 1.0, crease) * mix(0.7, 1.0, sheen);
}

void main() {
  float cell = 6.0 * uDpr;
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 id = floor(frag / cell);
  vec2 f = fract(frag / cell) - 0.5;
  vec2 center = (id + 0.5) * cell;
  vec2 fromMid = (center - 0.5 * uRes) / uRes.y;

  float v = silk(center / uRes.y * 1.25, uTime * 0.35);
  v = pow(v, 1.5);
  float vignette = 1.0 - smoothstep(0.55, 1.35, length(fromMid * vec2(0.85, 1.15)));
  v *= mix(0.4, 1.0, vignette);

  float delay = length(fromMid) * 0.9 + hash(id) * 0.3;
  float k = clamp((uReveal * 1.5 - delay) / 0.35, 0.0, 1.0);
  k = k * k * (3.0 - 2.0 * k);

  vec2 toPointer = center - uPointer;
  float radius = 170.0 * uDpr;
  float glow = uPointerOn * 0.25 * exp(-dot(toPointer, toPointer) / (radius * radius));

  float flash = (1.0 - k) * k * 1.2;
  float lum = (0.06 + v * 0.62 + glow + flash) * k;
  float r = mix(0.05, 0.3, k) * (0.82 + 0.18 * v);
  float aa = 1.2 / cell;
  float dotMask = 1.0 - smoothstep(r - aa, r + aa, length(f));

  vec3 bg = vec3(0.035, 0.035, 0.043);
  vec3 shade = vec3(0.42, 0.48, 0.6);
  vec3 light = vec3(1.0, 0.95, 0.88);
  vec3 tint = mix(shade, light, smoothstep(0.1, 0.7, v));
  gl_FragColor = vec4(bg + tint * lum * dotMask, 1.0);
}
`

const REVEAL_SECONDS = 1.8

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader')
  return shader
}

export function DotField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const gl = canvas?.getContext('webgl', { antialias: false, premultipliedAlpha: false })
    if (!canvas || !gl) return

    const program = gl.createProgram()!
    try {
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
      gl.linkProgram(program)
    } catch {
      return
    }
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const u = (name: string) => gl.getUniformLocation(program, name)
    const uRes = u('uRes')
    const uTime = u('uTime')
    const uReveal = u('uReveal')
    const uDpr = u('uDpr')
    const uPointer = u('uPointer')
    const uPointerOn = u('uPointerOn')

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pointer = { x: 0, y: 0, on: 0, target: 0 }
    let dpr = 1
    let frame = 0
    const start = performance.now()

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    const render = (now: number) => {
      const seconds = reduced ? 8 : (now - start) / 1000
      pointer.on += (pointer.target - pointer.on) * 0.08
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, seconds)
      gl.uniform1f(uReveal, reduced ? 2 : Math.min(seconds / REVEAL_SECONDS, 2))
      gl.uniform1f(uDpr, dpr)
      gl.uniform2f(uPointer, pointer.x * dpr, pointer.y * dpr)
      gl.uniform1f(uPointerOn, reduced ? 0 : pointer.on)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (!reduced) frame = requestAnimationFrame(render)
    }

    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.target = 1
    }
    const onLeave = () => {
      pointer.target = 0
    }

    const observer = new ResizeObserver(() => {
      resize()
      if (reduced) render(performance.now())
    })
    observer.observe(canvas)
    window.addEventListener('pointermove', onMove)
    document.addEventListener('pointerleave', onLeave)
    resize()
    frame = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />
}
