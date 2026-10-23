export const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const HEAD = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
float luma(vec3 c) { return dot(c, LUMA); }
vec3 shoulder(vec3 x, float white) {
  if (white <= 1.0) return min(x, vec3(1.0));
  float k = 0.8;
  float peak = (white - k) / (1.0 - k);
  vec3 u = max(x - k, 0.0) / (1.0 - k);
  vec3 f = u * (1.0 + u / (peak * peak)) / (1.0 + u);
  return min(min(x, vec3(k)) + (1.0 - k) * f, vec3(1.0));
}
`

const FOCUS = `uniform sampler2D uField;
uniform float uFieldOn;

float focusMask(vec2 st) {
  if (uFieldOn > 0.5) return texture(uField, st).r;
  if (uTilt > 0.5) {
    float r = mix(0.03, 0.42, uFocusSize);
    return smoothstep(r, r + 0.3, abs(st.y - uFocus.y));
  }
  float r = mix(0.05, 0.55, uFocusSize);
  float d = length((st - uFocus) * vec2(1.0, 1.35));
  return smoothstep(r, r + 0.22 + r * 0.5, d);
}`

export const BASE = `${HEAD}
uniform sampler2D uSrc;
uniform vec3 uBalance;
uniform float uExposure;
uniform float uFringe;
uniform float uAspect;

vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }

void main() {
  vec2 dir = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 shift = dir * dot(dir, dir) * uFringe * 0.012 / vec2(uAspect, 1.0);
  vec3 c = vec3(
    texture(uSrc, vUv - shift).r,
    texture(uSrc, vUv).g,
    texture(uSrc, vUv + shift).b
  );
  vec3 lin = toLinear(c) * uBalance * exp2(uExposure);
  outColor = vec4(pow(lin, vec3(1.0 / 2.2)), 1.0);
}
`

export const DOWN = `${HEAD}
uniform sampler2D uSrc;
uniform vec2 uTexel;
void main() {
  vec2 h = uTexel * 0.5;
  vec3 sum = texture(uSrc, vUv).rgb * 4.0;
  sum += texture(uSrc, vUv - h).rgb;
  sum += texture(uSrc, vUv + h).rgb;
  sum += texture(uSrc, vUv + vec2(h.x, -h.y)).rgb;
  sum += texture(uSrc, vUv - vec2(h.x, -h.y)).rgb;
  outColor = vec4(sum / 8.0, 1.0);
}
`

export const UP = `${HEAD}
uniform sampler2D uSrc;
uniform sampler2D uAdd;
uniform float uFalloff;
uniform vec2 uTexel;
void main() {
  vec2 h = uTexel * 0.5;
  vec3 sum = texture(uSrc, vUv + vec2(-h.x * 2.0, 0.0)).rgb;
  sum += texture(uSrc, vUv + vec2(-h.x, h.y)).rgb * 2.0;
  sum += texture(uSrc, vUv + vec2(0.0, h.y * 2.0)).rgb;
  sum += texture(uSrc, vUv + vec2(h.x, h.y)).rgb * 2.0;
  sum += texture(uSrc, vUv + vec2(h.x * 2.0, 0.0)).rgb;
  sum += texture(uSrc, vUv + vec2(h.x, -h.y)).rgb * 2.0;
  sum += texture(uSrc, vUv + vec2(0.0, -h.y * 2.0)).rgb;
  sum += texture(uSrc, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
  vec3 c = sum / 12.0;
  if (uFalloff > 0.0) c = c * uFalloff + texture(uAdd, vUv).rgb;
  outColor = vec4(c, 1.0);
}
`

export const PREFILTER = `${HEAD}
uniform sampler2D uSrc;
uniform sampler2D uWide;
uniform sampler2D uPaint;
uniform float uPainted;
uniform float uAmount;
uniform vec2 uTexel;
uniform float uThreshold;
void main() {
  vec2 h = uTexel * 0.5;
  vec3 c = (texture(uSrc, vUv - h).rgb + texture(uSrc, vUv + h).rgb + texture(uSrc, vUv + vec2(h.x, -h.y)).rgb + texture(uSrc, vUv - vec2(h.x, -h.y)).rgb) * 0.25;
  vec3 lin = pow(c, vec3(2.2));
  float peak = max(lin.r, max(lin.g, lin.b));
  float bright = peak * smoothstep(0.03, 0.2, luma(c) - luma(texture(uWide, vUv).rgb));
  float knee = uThreshold * 0.5;
  float soft = clamp(bright - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float weight = max(soft, bright - uThreshold) / max(bright, 1e-4);
  float paint = uPainted * texture(uPaint, vUv).a;
  outColor = vec4(lin * weight * uAmount + paint * lin * (1.0 + 8.0 * peak), 1.0);
}
`

export const LENS = `${HEAD}
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uFocusSize;
uniform float uTilt;
uniform vec2 uFocus;

${FOCUS}

void main() {
  float coc = focusMask(vUv) * uRadius;
  if (coc < 0.5) {
    outColor = vec4(texture(uSrc, vUv).rgb, 1.0);
    return;
  }
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 80; i++) {
    float t = (float(i) + 0.5) / 80.0;
    float r = sqrt(t) * coc;
    float a = float(i) * 2.39996323;
    vec2 at = vUv + vec2(cos(a), sin(a)) * r * uTexel;
    vec3 s = texture(uSrc, at).rgb;
    float l = luma(s);
    float w = (1.0 + 12.0 * pow(l, 6.0)) * smoothstep(r - 1.0, r + 0.5, focusMask(at) * uRadius);
    sum += s * w;
    total += w;
  }
  outColor = vec4(sum / max(total, 1e-4), 1.0);
}
`

export const TONE = `${HEAD}
uniform sampler2D uBase;
uniform sampler2D uWide;
uniform float uContrast;
uniform float uHighlights;
uniform float uShadows;
uniform float uWhites;
uniform float uBlacks;
uniform float uVibrance;
uniform float uSaturation;
uniform float uClarity;
uniform float uDehaze;
uniform vec3 uShadowColor;
uniform vec3 uHighlightColor;
uniform float uFade;
uniform float uWhite;

vec3 curve(vec3 x, float g) {
  vec3 a = pow(x, vec3(g));
  vec3 b = pow(1.0 - x, vec3(g));
  return a / max(a + b, 1e-5);
}

void main() {
  vec3 c = texture(uBase, vUv).rgb;
  vec3 wide = texture(uWide, vUv).rgb;
  float baseLuma = luma(c);
  float wideLuma = luma(wide);

  c += (baseLuma - wideLuma) * uDehaze * 0.45;
  float haze = 0.06 * uDehaze;
  float hazy = max(luma(c), 1e-4);
  c = mix(c * max(hazy - haze, 0.0) / hazy, c - haze, 0.35) / (1.0 - haze);

  float local = mix(max(luma(c), 0.0), wideLuma, 0.65);
  float shadowMask = 1.0 - smoothstep(0.0, 0.6, local);
  float highlightMask = smoothstep(0.35, 1.0, local);
  if (uHighlights < 0.0) highlightMask *= 1.0 - 0.75 * smoothstep(0.8, 0.98, wideLuma);
  c *= exp2(uShadows * 1.3 * shadowMask * shadowMask);
  c *= exp2(uHighlights * 1.1 * highlightMask);

  float black = -0.16 * uBlacks;
  float white = 1.0 - 0.2 * uWhites;
  float range = max(white - black, 1e-3);
  float before = max(luma(c), 1e-4);
  float after = max((before - black) / range, 0.0);
  vec3 leveled = after < before ? c * (after / before) : c + (after - before);
  c = mix(leveled, (c - black) / range, 0.25);
  c = clamp(shoulder(max(c, 0.0), uWhite), 0.0, 1.0);

  c = curve(c, exp(uContrast * 0.95));

  float l = luma(c);
  float midtones = 1.0 - pow(abs(2.0 * l - 1.0), 2.0);
  c += (baseLuma - wideLuma) * uClarity * 1.6 * (0.35 + 0.65 * midtones);
  c = max(c, 0.0);

  l = luma(c);
  float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float vibrance = uVibrance * (1.0 - clamp(chroma, 0.0, 1.0));
  float boost = uSaturation + uDehaze * 0.2 + vibrance;
  float cool = clamp((c.b - c.r) * 3.0, 0.0, 1.0);
  float sky = cool * smoothstep(0.35, 0.7, l);
  if (boost > 0.0) boost *= 1.0 - max(0.6 * sky, 0.45 * cool);
  c = mix(vec3(l), c, 1.0 + boost);
  c = max(c, 0.0);

  l = clamp(luma(c), 0.0, 1.0);
  float shadowWeight = pow(1.0 - l, 2.0);
  float highlightWeight = l * l * (1.0 - 0.75 * smoothstep(0.82, 1.0, l));
  c += (uShadowColor - luma(uShadowColor)) * shadowWeight * 0.45;
  c += (uHighlightColor - luma(uHighlightColor)) * highlightWeight * 0.4;

  c = mix(c, vec3(0.16) + c * 0.8, uFade);

  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`


export const FINAL = `${HEAD}
uniform sampler2D uDev;
uniform sampler2D uLens;
uniform sampler2D uBloom;
uniform vec2 uTexel;
uniform float uSharpen;
uniform float uRadius;
uniform float uFocusSize;
uniform float uTilt;
uniform vec2 uFocus;
uniform float uGlow;
uniform vec3 uBloomTint;
uniform float uVignette;
uniform float uGrain;
uniform float uGrainSize;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

${FOCUS}

void main() {
  vec2 st = vec2(vUv.x, 1.0 - vUv.y);
  vec3 dev = texture(uDev, st).rgb;
  if (uSharpen > 0.0) {
    vec3 around = texture(uDev, st + vec2(uTexel.x, 0.0)).rgb + texture(uDev, st - vec2(uTexel.x, 0.0)).rgb
      + texture(uDev, st + vec2(0.0, uTexel.y)).rgb + texture(uDev, st - vec2(0.0, uTexel.y)).rgb;
    dev += (dev - around * 0.25) * uSharpen * 1.6;
  }

  vec3 c = dev;
  if (uRadius > 0.0) {
    float coc = focusMask(st) * uRadius;
    c = mix(dev, texture(uLens, st).rgb, smoothstep(0.0, 1.5, coc));
  }

  if (uGlow > 0.0) {
    vec3 lin = pow(clamp(c, 0.0, 1.0), vec3(2.2));
    lin += texture(uBloom, st).rgb * uBloomTint * uGlow;
    lin = min(lin, 0.9) + 0.1 * (1.0 - exp(-max(lin - 0.9, 0.0) * 10.0));
    c = pow(lin, vec3(1.0 / 2.2));
  }

  if (uVignette > 0.0) {
    float v = length((st - 0.5) * vec2(1.0, 0.85)) * 1.55;
    c *= 1.0 - uVignette * 0.9 * smoothstep(0.25, 1.1, v);
  }

  if (uGrain > 0.0) {
    float l = luma(c);
    vec2 cell = floor(gl_FragCoord.xy / uGrainSize);
    float n = hash(cell) + hash(cell + 17.0) - 1.0;
    c += n * uGrain * 0.09 * (0.4 + 0.6 * (1.0 - pow(abs(2.0 * l - 1.0), 2.0)));
  }

  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`
