/**
 * 툰 셰이딩 머티리얼 — 씬 라이트 무시, TOON.lightDir 고정.
 * 그림자는 어둡게가 아니라 hue-shift 페어(base↔shade). 스페큘러 없음.
 * 아웃라인은 inverted-hull(BackSide + 노멀 확장).
 */
import * as THREE from 'three'
import { TOON } from '../palette'

const TOON_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`

const TOON_FRAG = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uShade;
uniform vec3 uLight;
uniform float uEdge;
uniform float uWidth;
uniform float uRim;
uniform float uAlpha;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 l = normalize((viewMatrix * vec4(uLight, 0.0)).xyz);
  float ramp = smoothstep(uEdge - uWidth, uEdge + uWidth, dot(n, l));
  vec3 col = mix(uShade, uBase, ramp);
  // 림은 연속 pow 그라데이션 금지(에어브러시 룩의 주범) — 실루엣 근처 좁은 셀 밴드로 스텝
  float vf = 1.0 - clamp(dot(n, normalize(vV)), 0.0, 1.0);
  float rim = uRim * smoothstep(0.62, 0.68, vf);
  gl_FragColor = vec4(col + vec3(rim), uAlpha);
  #include <colorspace_fragment>
}`

const toonCache = new Map<string, THREE.ShaderMaterial>()

export interface ToonOpts {
  alpha?: number
  rim?: number
  doubleSide?: boolean
}

/** hue-shift 2단 램프 툰 머티리얼 (색 페어별 캐시 공유) */
export function toonMat(base: number, shade: number, opts: ToonOpts = {}): THREE.ShaderMaterial {
  const alpha = opts.alpha ?? 1
  const rim = opts.rim ?? TOON.rim
  const key = `${base}:${shade}:${alpha}:${rim}:${opts.doubleSide ? 1 : 0}`
  let m = toonCache.get(key)
  if (!m) {
    m = new THREE.ShaderMaterial({
      vertexShader: TOON_VERT,
      fragmentShader: TOON_FRAG,
      uniforms: {
        uBase: { value: new THREE.Color(base) },
        uShade: { value: new THREE.Color(shade) },
        uLight: { value: new THREE.Vector3(...TOON.lightDir) },
        uEdge: { value: TOON.shadeEdge },
        uWidth: { value: TOON.shadeWidth },
        uRim: { value: rim },
        uAlpha: { value: alpha },
      },
      transparent: alpha < 1,
      depthWrite: alpha >= 1,
      side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    })
    toonCache.set(key, m)
  }
  return m
}

const unlitCache = new Map<string, THREE.MeshBasicMaterial>()

/** 셰이딩 없는 플랫 컬러 (하이라이트/블러시/래시 등) */
export function unlitMat(color: number, alpha = 1): THREE.MeshBasicMaterial {
  const key = `${color}:${alpha}`
  let m = unlitCache.get(key)
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: alpha < 1,
      opacity: alpha,
      depthWrite: alpha >= 1,
    })
    unlitCache.set(key, m)
  }
  return m
}

const IRIS_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
varying vec3 vP;
void main() {
  float k = clamp(vP.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uBottom, uTop, smoothstep(0.08, 0.92, k));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

const IRIS_VERT = /* glsl */ `
varying vec3 vP;
void main() {
  vP = position; // 단위구 기준 -1..1
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

/** 홍채: 로컬 y 기준 수직 그라데이션 (단위구 지오메트리 전용) */
export function irisMat(top: number, bottom: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: IRIS_VERT,
    fragmentShader: IRIS_FRAG,
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uBottom: { value: new THREE.Color(bottom) },
    },
  })
}

const OUTLINE_VERT = /* glsl */ `
uniform float uW;
void main() {
  vec3 p = position + normal * uW;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`

const OUTLINE_FRAG = /* glsl */ `
uniform vec3 uC;
void main() {
  gl_FragColor = vec4(uC, 1.0);
  #include <colorspace_fragment>
}`

const outlineCache = new Map<string, THREE.ShaderMaterial>()

function outlineMat(color: number, w: number): THREE.ShaderMaterial {
  const key = `${color}:${w.toFixed(5)}`
  let m = outlineCache.get(key)
  if (!m) {
    m = new THREE.ShaderMaterial({
      vertexShader: OUTLINE_VERT,
      fragmentShader: OUTLINE_FRAG,
      uniforms: { uW: { value: w }, uC: { value: new THREE.Color(color) } },
      side: THREE.BackSide,
    })
    outlineCache.set(key, m)
  }
  return m
}

/**
 * inverted-hull 아웃라인을 mesh 자식으로 추가.
 * width는 "월드 단위" 목표 두께 — mesh.scale 평균으로 나눠 보정하므로
 * 반드시 mesh.scale 설정 후에 호출할 것.
 */
export function addOutline(mesh: THREE.Mesh, width: number, color: number): THREE.Mesh {
  const s = mesh.scale
  const avg = (Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.z)) / 3 || 1
  const o = new THREE.Mesh(mesh.geometry, outlineMat(color, width / avg))
  o.raycast = () => {} // 히트테스트 제외
  mesh.add(o)
  return o
}
