import type { Focus, Params } from './params'
import { BASE, DOWN, FINAL, LENS, PREFILTER, TONE, UP, VERTEX } from './shaders'

type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }

type ProgramName = 'base' | 'down' | 'up' | 'prefilter' | 'lens' | 'tone' | 'final'

type Program = { program: WebGLProgram; uniforms: Map<string, WebGLUniformLocation | null> }

type Chains = {
  base: Target
  dev: Target
  wideDown: Target[]
  wideUp: Target[]
  half: Target
  lens: Target
  bloomDown: Target[]
  bloomUp: Target[]
}

export const MAX_SIZE = 6144

const BLOOM_FALLOFF = 0.65
const BLOOM_THRESHOLD = 0.55
const BLOOM_STRENGTH = 2.2
const LENS_RADIUS = 0.035

function hueColor(hue: number): [number, number, number] {
  const h = (((hue % 360) + 360) % 360) / 60
  const x = 1 - Math.abs((h % 2) - 1)
  const table: [number, number, number][] = [
    [1, x, 0],
    [x, 1, 0],
    [0, 1, x],
    [0, x, 1],
    [x, 0, 1],
    [1, 0, x],
  ]
  return table[Math.floor(h) % 6]
}

function balance(temperature: number, tint: number): [number, number, number] {
  const t = temperature / 100
  const u = tint / 100
  const r = (1 + 0.32 * t) * (1 + 0.08 * u)
  const g = 1 - 0.22 * u
  const b = (1 - 0.32 * t) * (1 + 0.08 * u)
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return [r / l, g / l, b / l]
}

export class Renderer {
  readonly canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private programs: Record<ProgramName, Program>
  private sources: { edited: WebGLTexture | null; original: WebGLTexture | null } = { edited: null, original: null }
  private chains: Chains | null = null
  private format: { internal: number; type: number }
  width = 0
  height = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false, alpha: false })
    if (!gl) throw new Error('WebGL2 is not available in this browser')
    this.gl = gl
    const float = gl.getExtension('EXT_color_buffer_float')
    this.format = float ? { internal: gl.RGBA16F, type: gl.HALF_FLOAT } : { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE }

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)

    this.programs = {
      base: this.compile(BASE),
      down: this.compile(DOWN),
      up: this.compile(UP),
      prefilter: this.compile(PREFILTER),
      lens: this.compile(LENS),
      tone: this.compile(TONE),
      final: this.compile(FINAL),
    }
  }

  private compile(fragment: string): Program {
    const gl = this.gl
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, source)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
      return s
    }
    const program = gl.createProgram()!
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment))
    gl.bindAttribLocation(program, 0, 'aPos')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'program')
    return { program, uniforms: new Map() }
  }

  private texture(w: number, h: number, pixels: ImageData | null = null) {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    if (pixels) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    else gl.texImage2D(gl.TEXTURE_2D, 0, this.format.internal, w, h, 0, gl.RGBA, this.format.type, null)
    return tex
  }

  private target(w: number, h: number): Target {
    const gl = this.gl
    const tex = this.texture(w, h)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    return { tex, fbo, w, h }
  }

  private release() {
    if (!this.chains) return
    for (const t of Object.values(this.chains).flat() as Target[]) {
      this.gl.deleteTexture(t.tex)
      this.gl.deleteFramebuffer(t.fbo)
    }
    this.chains = null
  }

  private levels(base: number) {
    const scale = Math.log2(Math.max(this.height, 1) / 1080)
    const limit = Math.max(1, Math.floor(Math.log2(Math.min(this.width, this.height))) - 2)
    return Math.min(limit, Math.max(1, Math.round(base + scale)))
  }

  private chain(count: number) {
    const out: Target[] = []
    let w = this.width
    let h = this.height
    for (let i = 0; i < count; i++) {
      w = Math.max(1, Math.ceil(w / 2))
      h = Math.max(1, Math.ceil(h / 2))
      out.push(this.target(w, h))
    }
    return out
  }

  setImage(original: ImageData, edited: ImageData = original) {
    const gl = this.gl
    if (this.sources.original) gl.deleteTexture(this.sources.original)
    if (this.sources.edited && this.sources.edited !== this.sources.original) gl.deleteTexture(this.sources.edited)
    this.release()
    this.width = original.width
    this.height = original.height
    this.canvas.width = this.width
    this.canvas.height = this.height
    this.sources.original = this.texture(this.width, this.height, original)
    this.sources.edited = edited === original ? this.sources.original : this.texture(this.width, this.height, edited)

    const wide = this.levels(5)
    const bloom = this.levels(7)
    const [half] = this.chain(1)
    const [lens] = this.chain(1)
    this.chains = {
      base: this.target(this.width, this.height),
      dev: this.target(this.width, this.height),
      wideDown: this.chain(wide),
      wideUp: this.chain(wide),
      half,
      lens,
      bloomDown: this.chain(bloom),
      bloomUp: this.chain(bloom),
    }
  }

  setEdited(edited: ImageData) {
    const gl = this.gl
    if (this.sources.edited && this.sources.edited !== this.sources.original) gl.deleteTexture(this.sources.edited)
    this.sources.edited = this.texture(this.width, this.height, edited)
  }

  private use(name: ProgramName, target: Target | null) {
    const gl = this.gl
    const p = this.programs[name]
    gl.useProgram(p.program)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null)
    gl.viewport(0, 0, target ? target.w : this.width, target ? target.h : this.height)
    let unit = 0
    const loc = (key: string) => {
      if (!p.uniforms.has(key)) p.uniforms.set(key, gl.getUniformLocation(p.program, key))
      return p.uniforms.get(key)!
    }
    const set = {
      tex: (key: string, tex: WebGLTexture) => {
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.uniform1i(loc(key), unit++)
        return set
      },
      f: (key: string, ...v: number[]) => {
        if (v.length === 1) gl.uniform1f(loc(key), v[0])
        else if (v.length === 2) gl.uniform2f(loc(key), v[0], v[1])
        else gl.uniform3f(loc(key), v[0], v[1], v[2])
        return set
      },
      draw: () => {
        gl.enableVertexAttribArray(0)
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      },
    }
    return set
  }

  private down(src: Target, chain: Target[]) {
    let prev = src
    for (const next of chain) {
      this.use('down', next).tex('uSrc', prev.tex).f('uTexel', 1 / prev.w, 1 / prev.h).draw()
      prev = next
    }
  }

  private up(down: Target[], up: Target[], falloff = 0) {
    let prev = down[down.length - 1]
    for (let i = down.length - 2; i >= 0; i--) {
      this.use('up', up[i])
        .tex('uSrc', prev.tex)
        .tex('uAdd', down[i].tex)
        .f('uFalloff', falloff)
        .f('uTexel', 1 / prev.w, 1 / prev.h)
        .draw()
      prev = up[i]
    }
    return prev
  }

  render(p: Params, focus: Focus, view: 'edited' | 'original' = 'edited') {
    const c = this.chains
    const src = view === 'original' ? this.sources.original : this.sources.edited
    if (!c || !src) return
    const aspect = this.width / this.height

    this.use('base', c.base)
      .tex('uSrc', src)
      .f('uBalance', ...balance(p.temperature, p.tint))
      .f('uExposure', p.exposure)
      .f('uFringe', p.fringe / 100)
      .f('uAspect', aspect)
      .draw()

    this.down(c.base, c.wideDown)
    const wide = this.up(c.wideDown, c.wideUp)

    const shadow = hueColor(p.shadowHue).map((v) => 0.5 + (v - 0.5) * (p.shadowTint / 100))
    const highlight = hueColor(p.highlightHue).map((v) => 0.5 + (v - 0.5) * (p.highlightTint / 100))
    const black = -0.16 * (p.blacks / 100)
    const white = 1 - 0.2 * (p.whites / 100)
    const peak = (2 ** (Math.max(p.exposure, 0) / 2.2) * 2 ** (Math.max(p.highlights, 0) / 100) - black) / (white - black)
    this.use('tone', c.dev)
      .tex('uBase', c.base.tex)
      .tex('uWide', wide.tex)
      .f('uContrast', p.contrast / 100)
      .f('uHighlights', p.highlights / 100)
      .f('uShadows', p.shadows / 100)
      .f('uWhites', p.whites / 100)
      .f('uBlacks', p.blacks / 100)
      .f('uVibrance', p.vibrance / 100)
      .f('uSaturation', p.saturation / 100)
      .f('uClarity', p.clarity / 100)
      .f('uDehaze', p.dehaze / 100)
      .f('uShadowColor', shadow[0], shadow[1], shadow[2])
      .f('uHighlightColor', highlight[0], highlight[1], highlight[2])
      .f('uFade', p.fade / 100)
      .f('uWhite', Math.max(1, peak))
      .draw()

    const radius = (p.blur / 100) * LENS_RADIUS * c.half.h
    if (p.blur > 0) {
      this.use('down', c.half).tex('uSrc', c.dev.tex).f('uTexel', 1 / c.dev.w, 1 / c.dev.h).draw()
      this.use('lens', c.lens)
        .tex('uSrc', c.half.tex)
        .f('uTexel', 1 / c.half.w, 1 / c.half.h)
        .f('uRadius', radius)
        .f('uFocusSize', p.focusSize / 100)
        .f('uTilt', p.blurMode === 'tilt' ? 1 : 0)
        .f('uFocus', focus.x, focus.y)
        .draw()
    }

    let bloom = c.dev
    let bloomNorm = 1
    if (p.glow > 0) {
      const [first, ...rest] = c.bloomDown
      this.use('prefilter', first).tex('uSrc', c.dev.tex).f('uTexel', 1 / c.dev.w, 1 / c.dev.h).f('uThreshold', BLOOM_THRESHOLD).draw()
      this.down(first, rest)
      bloom = this.up(c.bloomDown, c.bloomUp, BLOOM_FALLOFF)
      bloomNorm = (1 - BLOOM_FALLOFF ** c.bloomDown.length) / (1 - BLOOM_FALLOFF)
    }

    this.use('final', null)
      .tex('uDev', c.dev.tex)
      .tex('uLens', c.lens.tex)
      .tex('uBloom', bloom.tex)
      .f('uTexel', 1 / this.width, 1 / this.height)
      .f('uSharpen', p.sharpen / 100)
      .f('uRadius', radius)
      .f('uFocusSize', p.focusSize / 100)
      .f('uTilt', p.blurMode === 'tilt' ? 1 : 0)
      .f('uFocus', focus.x, focus.y)
      .f('uGlow', ((p.glow / 100) * BLOOM_STRENGTH) / bloomNorm)
      .f('uVignette', p.vignette / 100)
      .f('uGrain', p.grain / 100)
      .f('uGrainSize', Math.max(1, (this.height / 1080) * 1.4))
      .draw()
  }

  dispose() {
    this.release()
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
