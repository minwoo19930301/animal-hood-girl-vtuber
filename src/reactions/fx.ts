/**
 * 리액션 FX — 하트·반짝이·꽃·색종이·느낌표·눈물/땀방울·분노 마크·먼지·음표를 three.js Sprite 로 띄운다.
 *
 * - 텍스처는 캔버스로 절차적으로 그린다 (외부 파일 없음). 종류당 한 장, Fx 인스턴스가 소유한다 (dispose 가능).
 * - 스프라이트는 풀(POOL)로 미리 만들어 두고 재사용한다. 스프라이트마다 SpriteMaterial 이 따로 있어 불투명도·색을 개별로 준다 (맵만 바꿔 끼운다).
 * - 위치·크기·불투명도는 전부 나이(age)의 닫힌 식이라 같은 (시드, 시각)이면 같은 그림이 나온다 (Math.random() 없음). 프레임 사이에 객체를 만들지 않는다.
 * - 좌표 단위는 "아바타 키(height) = 1" 이다. fxRoot 가 키만큼 스케일되고 발밑이 y=0, 머리 위가 y≈1 이다 (+x 화면 오른쪽 = 캐릭터 왼쪽).
 * - 입자는 앵커(몸·머리·눈·손·발)에 붙어서 태어난다. follow 0..1 은 태어난 뒤 앵커가 움직인 만큼 따라가는 비율이다.
 * - FX 는 화면 위에 얹는 평면 그래픽이다 (depthTest 끔, 항상 캐릭터 앞에 그림).
 */
import * as THREE from 'three'
import { TAU, easeOutBack, ss } from './util'

export const FxKind = {
  heart: 0,
  sparkle: 1,
  flowerA: 2,
  flowerB: 3,
  flowerC: 4,
  confetti: 5,
  exclaim: 6,
  drop: 7,
  anger: 8,
  puff: 9,
  noteA: 10,
  noteB: 11,
} as const
export type FxKindId = (typeof FxKind)[keyof typeof FxKind]
const KIND_COUNT = 12

/** 입자가 붙는 앵커 (모델 apply 가 월드 좌표로 갱신, 엔진이 키로 나눠 넣는다) */
export const Anchor = {
  body: 0,
  head: 1,
  eyeL: 2,
  eyeR: 3,
  handL: 4,
  handR: 5,
  footL: 6,
  footR: 7,
} as const
export type AnchorId = (typeof Anchor)[keyof typeof Anchor]
const ANCHOR_COUNT = 8

const TEX = 160
const POOL = 128
/** FX 가 놓이는 z (몸 앞, 키 단위). depthTest 가 꺼져 있어 그리기 순서만 renderOrder 가 정한다 */
const FX_Z = 0.12

/** 색종이 팔레트 (선명한 파티 색) */
export const CONFETTI_COLORS: readonly number[] = [0xf2594b, 0x4da3f5, 0x55c45a, 0xa878e0, 0xff8fb8, 0xffa51f, 0x2fc4c9]

/** 풀 하나의 상태. 닫힌 식으로 위치를 계산하므로 속도·감쇠·중력만 들고 있다 */
export class Particle {
  alive = false
  kind = 0
  anchor = 0
  /** 생길 때의 절대 위치(월드, 키 단위)와 그때 앵커 위치 (follow 용) */
  ox = 0
  oy = 0
  oz = 0
  ax0 = 0
  ay0 = 0
  az0 = 0
  /** 초속과 감쇠(1/s), 중력(+는 아래로 가속) */
  vx = 0
  vy = 0
  kx = 2
  ky = 2
  g = 0
  born = 0
  /** 생성 후 이만큼 지나야 보인다 (한 번에 터뜨린 입자를 어긋나게) */
  delay = 0
  life = 1
  size = 0.06
  /** 세로/가로 */
  aspect = 1
  /** 수명 후반에 줄어드는 비율 */
  shrink = 0
  /** 팝 시간(초) */
  pop = 0.18
  rot = 0
  spin = 0
  swayAmp = 0
  swayF = 0
  swayPh = 0
  pulseAmp = 0
  pulseF = 0
  /** 초당 커지는 비율 (먼지·김이 퍼진다) */
  grow = 0
  /** 반짝임(크기가 흔들리는) 비율 */
  twinkle = 0
  /** 색종이가 뒤집히는 정도 0..1 와 속도 */
  flutter = 0
  flutterF = 0
  flutterPh = 0
  /** 앵커를 따라 움직이는 비율 0..1 */
  follow = 0
  color = 0xffffff
  alpha = 1
  /** 페이드 아웃이 시작되는 수명 비율 */
  fadeAt = 0.72
}

export interface FxAnchors {
  x: Float64Array
  y: Float64Array
  z: Float64Array
}

export interface Fx {
  root: THREE.Group
  anchors: FxAnchors
  /** 현재 시각(초). update 가 갱신한다 */
  now: number
  /** 비어 있는 입자 하나를 기본값으로 초기화해 내준다. 풀이 가득 차면 null. 위치는 앵커 기준 오프셋(키 단위) */
  emit(kind: FxKindId, anchor: AnchorId, offX: number, offY: number, offZ?: number): Particle | null
  update(now: number): void
  /** 살아 있는 입자를 빠르게 사라지게 한다 (취소) */
  fadeAll(now: number, sec: number): void
  alive(): number
  dispose(): void
}

type Draw = (c: CanvasRenderingContext2D, S: number) => void

function makeTex(draw: Draw): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = TEX
  cv.height = TEX
  const c = cv.getContext('2d')!
  c.clearRect(0, 0, TEX, TEX)
  c.translate(TEX / 2, TEX / 2)
  draw(c, TEX / 2)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  return t
}

/* ---------------- 텍스처 그리기: 단위는 반지름 S (캔버스 중심이 원점, +y 는 아래) ---------------- */

const heartPath = (c: CanvasRenderingContext2D, u: number, cy = 0) => {
  c.beginPath()
  c.moveTo(0, cy + u * 0.92)
  c.bezierCurveTo(-u * 1.5, cy + u * 0.05, -u * 1.0, cy - u * 0.95, 0, cy - u * 0.32)
  c.bezierCurveTo(u * 1.0, cy - u * 0.95, u * 1.5, cy + u * 0.05, 0, cy + u * 0.92)
  c.closePath()
}

const drawHeart: Draw = (c, S) => {
  const u = S * 0.62
  heartPath(c, u)
  const g = c.createLinearGradient(-u, -u, u * 0.8, u)
  g.addColorStop(0, '#FF8AA8')
  g.addColorStop(0.55, '#FF5E8C')
  g.addColorStop(1, '#E83F74')
  c.fillStyle = g
  c.fill()
  // 위쪽 왼쪽 광택
  c.fillStyle = 'rgba(255,255,255,0.55)'
  c.beginPath()
  c.ellipse(-u * 0.55, -u * 0.35, u * 0.2, u * 0.12, -0.7, 0, TAU)
  c.fill()
}

const drawSparkle: Draw = (c, S) => {
  // 부드러운 빛번짐
  const gl = c.createRadialGradient(0, 0, 0, 0, 0, S)
  gl.addColorStop(0, 'rgba(255,236,120,0.85)')
  gl.addColorStop(0.35, 'rgba(255,224,70,0.35)')
  gl.addColorStop(1, 'rgba(255,224,70,0)')
  c.fillStyle = gl
  c.fillRect(-S, -S, 2 * S, 2 * S)
  // 오목한 네 꼭짓점 별
  const R = S * 0.92
  const k = S * 0.11
  c.beginPath()
  c.moveTo(0, -R)
  c.quadraticCurveTo(k, -k, R * 0.72, 0)
  c.quadraticCurveTo(k, k, 0, R)
  c.quadraticCurveTo(-k, k, -R * 0.72, 0)
  c.quadraticCurveTo(-k, -k, 0, -R)
  c.closePath()
  const g = c.createRadialGradient(0, 0, 0, 0, 0, R)
  g.addColorStop(0, '#FFFFFF')
  g.addColorStop(0.3, '#FFF59A')
  g.addColorStop(1, '#FFD62B')
  c.fillStyle = g
  c.fill()
}

const flowerDraw = (petal: string, petalLight: string, center: string): Draw => (c, S) => {
  const pr = S * 0.34
  const ring = S * 0.46
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (TAU * i) / 5
    const px = Math.cos(a) * ring
    const py = Math.sin(a) * ring
    const g = c.createRadialGradient(px - pr * 0.3, py - pr * 0.3, 0, px, py, pr)
    g.addColorStop(0, petalLight)
    g.addColorStop(1, petal)
    c.fillStyle = g
    c.beginPath()
    c.arc(px, py, pr, 0, TAU)
    c.fill()
  }
  c.fillStyle = center
  c.beginPath()
  c.arc(0, 0, S * 0.26, 0, TAU)
  c.fill()
  c.fillStyle = 'rgba(255,255,255,0.45)'
  c.beginPath()
  c.arc(-S * 0.07, -S * 0.08, S * 0.08, 0, TAU)
  c.fill()
}

/** 색종이: 모서리가 아주 둥근 도톰한 알약 모양 (가는 막대로 보이면 잡음 같아서). 가로세로비는 입자의 aspect 가 정한다 */
const drawConfetti: Draw = (c, S) => {
  c.fillStyle = '#FFFFFF'
  c.beginPath()
  c.roundRect(-S * 0.7, -S * 0.5, S * 1.4, S * 1.0, S * 0.5)
  c.fill()
}

const drawExclaim: Draw = (c, S) => {
  const bar = () => {
    c.beginPath()
    c.moveTo(-S * 0.27, -S * 0.82)
    c.quadraticCurveTo(0, -S * 0.98, S * 0.27, -S * 0.82)
    c.lineTo(S * 0.12, S * 0.22)
    c.quadraticCurveTo(0, S * 0.3, -S * 0.12, S * 0.22)
    c.closePath()
  }
  // 흰 테두리 → 빨강 본체 (어떤 배경 위에서도 읽히게)
  c.lineJoin = 'round'
  c.lineWidth = S * 0.2
  c.strokeStyle = '#FFFFFF'
  bar()
  c.stroke()
  c.beginPath()
  c.arc(0, S * 0.62, S * 0.17, 0, TAU)
  c.stroke()
  c.fillStyle = '#F2503C'
  bar()
  c.fill()
  c.beginPath()
  c.arc(0, S * 0.62, S * 0.17, 0, TAU)
  c.fill()
}

/** 눈물·땀방울: 연파랑 물방울 + 진한 윤곽 + 하이라이트 */
const drawDrop: Draw = (c, S) => {
  const u = S * 0.5
  c.beginPath()
  c.moveTo(0, -u * 1.45)
  c.bezierCurveTo(u * 0.15, -u * 0.7, u * 0.95, -u * 0.3, u * 0.95, u * 0.35)
  c.bezierCurveTo(u * 0.95, u * 1.15, -u * 0.95, u * 1.15, -u * 0.95, u * 0.35)
  c.bezierCurveTo(-u * 0.95, -u * 0.3, -u * 0.15, -u * 0.7, 0, -u * 1.45)
  c.closePath()
  const g = c.createLinearGradient(0, -u, 0, u)
  g.addColorStop(0, '#C6EBFF')
  g.addColorStop(1, '#6DB8EE')
  c.fillStyle = g
  c.fill()
  c.lineWidth = S * 0.06
  c.strokeStyle = '#3F8FD0'
  c.stroke()
  c.fillStyle = 'rgba(255,255,255,0.9)'
  c.beginPath()
  c.ellipse(-u * 0.4, u * 0.25, u * 0.14, u * 0.28, 0.3, 0, TAU)
  c.fill()
}

const drawAnger: Draw = (c, S) => {
  // 💢: 네 개의 굽은 괄호가 가운데를 향한다
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.strokeStyle = '#E4463A'
  c.lineWidth = S * 0.2
  for (let q = 0; q < 4; q++) {
    const sx = q % 2 === 0 ? -1 : 1
    const sy = q < 2 ? -1 : 1
    c.beginPath()
    c.moveTo(sx * S * 0.8, sy * S * 0.2)
    c.quadraticCurveTo(sx * S * 0.2, sy * S * 0.2, sx * S * 0.2, sy * S * 0.8)
    c.stroke()
  }
}

const drawPuff: Draw = (c, S) => {
  const g = c.createRadialGradient(0, 0, 0, 0, 0, S)
  g.addColorStop(0, 'rgba(250,250,252,0.95)')
  g.addColorStop(0.55, 'rgba(236,238,244,0.75)')
  g.addColorStop(1, 'rgba(222,226,236,0)')
  c.fillStyle = g
  c.beginPath()
  c.arc(0, 0, S, 0, TAU)
  c.fill()
}

/** ♪ — 흰 테두리 + 보라 본체 (파란 배경·밝은 배경 모두에서 읽힘) */
const noteDraw = (double: boolean): Draw => (c, S) => {
  const head = (x: number, y: number) => {
    c.beginPath()
    c.ellipse(x, y, S * 0.27, S * 0.2, -0.4, 0, TAU)
  }
  const stems = (): void => {
    c.beginPath()
    if (double) {
      c.moveTo(-S * 0.33, S * 0.5); c.lineTo(-S * 0.33, -S * 0.62)
      c.lineTo(S * 0.47, -S * 0.8); c.lineTo(S * 0.47, S * 0.34)
    } else {
      c.moveTo(-S * 0.05, S * 0.5); c.lineTo(-S * 0.05, -S * 0.78)
      c.quadraticCurveTo(S * 0.05, -S * 0.5, S * 0.5, -S * 0.42)
    }
  }
  const paint = (): void => {
    stems(); c.stroke()
    head(double ? -S * 0.52 : -S * 0.28, S * 0.52)
    c.fill(); c.stroke()
    if (double) { head(S * 0.28, S * 0.36); c.fill(); c.stroke() }
  }
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.lineWidth = S * 0.3
  c.strokeStyle = '#FFFFFF'
  c.fillStyle = '#FFFFFF'
  paint()
  c.lineWidth = S * 0.12
  c.strokeStyle = '#7A4DE0'
  c.fillStyle = '#7A4DE0'
  paint()
}

const DRAWS: readonly Draw[] = [
  drawHeart,
  drawSparkle,
  flowerDraw('#F78FB3', '#FFC2D6', '#FFE066'),
  flowerDraw('#B79CFF', '#DCCBFF', '#FFF3B0'),
  flowerDraw('#FFB35C', '#FFD9A3', '#FFF3B0'),
  drawConfetti,
  drawExclaim,
  drawDrop,
  drawAnger,
  drawPuff,
  noteDraw(false),
  noteDraw(true),
]

export function createFx(): Fx {
  const root = new THREE.Group()
  root.name = 'reactionFx'
  const textures: THREE.CanvasTexture[] = []
  for (let k = 0; k < KIND_COUNT; k++) textures.push(makeTex(DRAWS[k]))

  const parts: Particle[] = []
  const sprites: THREE.Sprite[] = []
  for (let i = 0; i < POOL; i++) {
    const mat = new THREE.SpriteMaterial({ map: textures[0], transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
    const sp = new THREE.Sprite(mat)
    sp.visible = false
    sp.renderOrder = 20
    sp.position.z = FX_Z
    root.add(sp)
    sprites.push(sp)
    parts.push(new Particle())
  }

  const anchors: FxAnchors = {
    x: new Float64Array(ANCHOR_COUNT),
    y: new Float64Array(ANCHOR_COUNT),
    z: new Float64Array(ANCHOR_COUNT),
  }

  let nAlive = 0
  let nextSlot = 0

  const fx: Fx = {
    root,
    anchors,
    now: 0,
    emit(kind, anchor, offX, offY, offZ = 0) {
      // 빈 슬롯 찾기 (마지막 위치부터 순환)
      for (let n = 0; n < POOL; n++) {
        const i = (nextSlot + n) % POOL
        const p = parts[i]
        if (p.alive) continue
        nextSlot = (i + 1) % POOL
        p.alive = true
        p.kind = kind
        p.anchor = anchor
        p.ax0 = anchors.x[anchor]
        p.ay0 = anchors.y[anchor]
        p.az0 = anchors.z[anchor]
        p.ox = p.ax0 + offX
        p.oy = p.ay0 + offY
        p.oz = p.az0 + offZ
        p.vx = 0; p.vy = 0; p.kx = 2; p.ky = 2; p.g = 0
        p.born = fx.now
        p.delay = 0
        p.life = 1.5
        p.size = 0.06
        p.aspect = 1
        p.shrink = 0
        p.pop = 0.18
        p.rot = 0; p.spin = 0
        p.swayAmp = 0; p.swayF = 0; p.swayPh = 0
        p.pulseAmp = 0; p.pulseF = 0
        p.grow = 0
        p.twinkle = 0
        p.flutter = 0; p.flutterF = 0; p.flutterPh = 0
        p.follow = 0
        p.color = 0xffffff
        p.alpha = 1
        p.fadeAt = 0.72
        sprites[i].material.map = textures[kind]
        nAlive++
        return p
      }
      return null
    },
    update(now) {
      fx.now = now
      if (nAlive === 0) return
      for (let i = 0; i < POOL; i++) {
        const p = parts[i]
        if (!p.alive) continue
        const sp = sprites[i]
        const age = now - p.born - p.delay
        if (age >= p.life) {
          p.alive = false
          sp.visible = false
          nAlive--
          continue
        }
        if (age < 0) {
          sp.visible = false
          continue
        }
        const ex = p.kx > 1e-4 ? (1 - Math.exp(-p.kx * age)) / p.kx : age
        const ey = p.ky > 1e-4 ? (1 - Math.exp(-p.ky * age)) / p.ky : age
        let x = p.ox + p.vx * ex
        let y = p.oy + p.vy * ey - 0.5 * p.g * age * age
        let z = p.oz
        if (p.swayAmp !== 0) x += p.swayAmp * Math.sin(TAU * p.swayF * age + p.swayPh)
        if (p.follow !== 0) {
          x += p.follow * (anchors.x[p.anchor] - p.ax0)
          y += p.follow * (anchors.y[p.anchor] - p.ay0)
          z += p.follow * (anchors.z[p.anchor] - p.az0)
        }
        const u = age / p.life
        let s = p.size * (p.pop > 0 ? easeOutBack(age / p.pop) : 1)
        if (p.shrink > 0) s *= 1 - p.shrink * ss(0.4, 1, u)
        if (p.grow !== 0) s *= 1 + p.grow * age
        if (p.pulseAmp !== 0) s *= 1 + p.pulseAmp * Math.sin(TAU * p.pulseF * age)
        if (p.twinkle !== 0) s *= 1 - p.twinkle * (0.5 - 0.5 * Math.cos(TAU * 1.7 * age + p.swayPh))
        let sy = s * p.aspect
        if (p.flutter !== 0) sy *= 1 - p.flutter * (1 - Math.abs(Math.cos(p.flutterF * age + p.flutterPh)))
        sp.position.set(x, y, z + FX_Z)
        sp.scale.set(s, sy, 1)
        const m = sp.material
        m.rotation = p.rot + p.spin * age
        m.opacity = p.alpha * (1 - ss(p.fadeAt, 1, u))
        m.color.setHex(p.color)
        sp.visible = true
      }
    },
    fadeAll(now, sec) {
      for (let i = 0; i < POOL; i++) {
        const p = parts[i]
        if (!p.alive) continue
        const age = now - p.born - p.delay
        if (age < 0) {
          p.alive = false
          sprites[i].visible = false
          nAlive--
          continue
        }
        // 남은 수명을 sec 로 줄이고 페이드 시작점을 바로 앞으로 당긴다
        const newLife = Math.min(p.life, age + sec)
        p.fadeAt = Math.max(0, Math.min(p.fadeAt, age / newLife))
        p.life = newLife
      }
    },
    alive: () => nAlive,
    dispose() {
      for (const sp of sprites) sp.material.dispose()
      for (const t of textures) t.dispose()
      root.clear()
    },
  }
  return fx
}
