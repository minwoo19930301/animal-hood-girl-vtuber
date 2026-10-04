/**
 * 리액션 하네스 — 결정적 모션 검증용 (src/harness.ts 가 reaction= 쿼리일 때 호출).
 *
 *   harness.html?reaction=9&rt=1.2&avatar=fox          9번을 1.2초 시점에 한 컷
 *   harness.html?reaction=9&rts=0.3,0.7,1.1,1.5&cols=4  한 리액션의 시간 스트립
 *   harness.html?reaction=9&strip=8&cols=4             0.15~끝-0.35초를 8등분한 스트립
 *   harness.html?reaction=all&cols=5                   10종을 각자 peak 시각에 한 장으로 (reaction=1,4,9 처럼 골라도 됨, rt= 로 시각 통일)
 *   reaction=0 은 10번(귀여운 춤)이다.
 *
 * 공통: cam=face(상반신 클로즈업) · zoom=2 · look=dx,dy(키 대비 이동) · orbit=rad · settle=초(트리거 전 안정화, 기본 1.5) · labels=0
 * 모든 컷은 같은 모델에서 새 엔진으로 트리거부터 1/60초 스텝으로 돌려 결정적이다. 기준 프레임은 harness.ts 의 buildFrame
 * (yaw=0.3 처럼 트래킹 값을 같이 주면 리액션 아래에서 트래킹이 살아 있는지 볼 수 있다).
 */
import * as THREE from 'three'
import type { MingoModel, RigFrame } from './contract'
import { framing } from './framing'
import { createReactions } from './reactions/index'

export interface ReactionHarnessCtx {
  q: URLSearchParams
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  mingo: MingoModel
  baseFrame: () => RigFrame
  labels: HTMLElement
  W: number
  H: number
}

const DT = 1 / 60

interface Cell { x: number; y: number; w: number; h: number }

export async function runReactionHarness(ctx: ReactionHarnessCtx): Promise<void> {
  const { q, renderer, scene, mingo, baseFrame, labels, W, H } = ctx
  const num = (k: string, d: number): number => {
    const v = q.has(k) ? parseFloat(q.get(k)!) : NaN
    return Number.isFinite(v) ? v : d
  }
  const zoom = Math.max(0.2, num('zoom', 1))
  const look = (q.get('look') ?? '').split(',').map(Number)
  const lookX = Number.isFinite(look[0]) ? look[0] : 0
  const lookDy = Number.isFinite(look[1]) ? look[1] : 0
  const orbit = num('orbit', 0)
  const faceCam = q.get('cam') === 'face'
  const settle = Math.max(0, num('settle', 1.5))
  const showLabels = q.get('labels') !== '0'

  const probe = createReactions()
  const specs = probe.specs
  probe.dispose()
  const idOf = (s: string): number => {
    const n = Number(s)
    return n === 0 ? 10 : n
  }
  const spec = q.get('reaction') ?? 'all'
  const ids = spec === 'all'
    ? specs.map((s) => s.id)
    : spec.split(',').map(idOf).filter((n) => specs.some((s) => s.id === n))
  if (ids.length === 0) throw new Error(`reaction=${spec}: 알 수 없는 번호 (1..9, 0, all)`)

  const camera = new THREE.PerspectiveCamera(17, 1, 0.1, 100)
  const place = (c: Cell, pull: number): void => {
    const hgt = Math.max(0.5, mingo.height)
    let fitH: number
    let lookY: number
    if (faceCam) {
      fitH = hgt * 0.62
      lookY = hgt * 0.72
    } else {
      const f = framing(hgt, 1, pull)
      fitH = f.fitH
      lookY = f.lookY
    }
    fitH /= zoom
    camera.aspect = c.w / c.h
    const dist = fitH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const ty = lookY + lookDy * hgt
    const tx = lookX * hgt
    camera.position.set(tx + Math.sin(orbit) * dist, ty, Math.cos(orbit) * dist)
    camera.lookAt(tx, ty, 0)
    camera.updateProjectionMatrix()
  }

  const tag = (text: string, c: Cell): void => {
    if (!showLabels) return
    const el = document.createElement('div')
    el.className = 'tag'
    el.style.left = `${c.x + 6}px`
    el.style.top = `${c.y + 4}px`
    el.textContent = text
    labels.appendChild(el)
  }

  /** 리액션 하나를 트리거부터 돌리며 times(오름차순) 각 시각에 cells 의 칸에 그린다 */
  const runOne = (id: number, times: number[], cells: Cell[]): void => {
    const rx = createReactions(mingo)
    scene.add(rx.fxRoot)
    // 기준 자세로 스프링(후드·머리카락·팔 present)을 수렴시킨 뒤(음수 시각) 0초에 트리거
    const n = Math.round(settle / DT)
    for (let i = 0; i < n; i++) mingo.apply(baseFrame(), DT, -settle + i * DT)
    rx.trigger(id, 0)
    let step = 0
    for (let k = 0; k < times.length; k++) {
      const target = Math.round(times[k] / DT)
      while (step < target) {
        step++
        const t = step * DT
        mingo.apply(rx.compose(baseFrame(), DT, t), DT, t)
      }
      const c = cells[k]
      place(c, rx.cameraPull())
      renderer.setViewport(c.x, H - c.y - c.h, c.w, c.h)
      renderer.setScissor(c.x, H - c.y - c.h, c.w, c.h)
      renderer.setScissorTest(true)
      renderer.render(scene, camera)
    }
    scene.remove(rx.fxRoot)
    rx.dispose()
  }

  const rtsStr = (q.get('rts') ?? '').split(',').filter((s) => s.trim() !== '').map(Number).filter((n) => Number.isFinite(n) && n >= 0)
  const stripN = Math.round(num('strip', 0))
  const cols = Math.round(num('cols', 0))
  const grid = (count: number, preferCols: number): Cell[] => {
    const c = preferCols || Math.ceil(Math.sqrt(count * (W / H)))
    const rows = Math.ceil(count / c)
    const cw = Math.floor(W / c)
    const ch = Math.floor(H / rows)
    return Array.from({ length: count }, (_, i) => ({ x: (i % c) * cw, y: Math.floor(i / c) * ch, w: cw, h: ch }))
  }

  if (ids.length === 1 && (rtsStr.length > 0 || stripN > 0)) {
    const sp = specs.find((s) => s.id === ids[0])!
    const times = rtsStr.length > 0
      ? [...rtsStr].sort((a, b) => a - b)
      : Array.from({ length: stripN }, (_, i) => 0.15 + ((sp.dur - 0.5) * i) / Math.max(1, stripN - 1))
    const cells = grid(times.length, cols || times.length)
    runOne(sp.id, times, cells)
    times.forEach((tm, i) => tag(`${sp.key} ${sp.name} ${tm.toFixed(2)}s`, cells[i]))
  } else {
    // 여러 리액션을 한 장에: 각자 peak (또는 rt) 시각
    const rt = q.has('rt') ? num('rt', 0) : null
    const cells = grid(ids.length, cols)
    ids.forEach((id, i) => {
      const sp = specs.find((s) => s.id === id)!
      const tm = rt ?? sp.peak
      runOne(sp.id, [tm], [cells[i]])
      tag(`${sp.key} ${sp.name} ${tm.toFixed(2)}s`, cells[i])
    })
  }
  renderer.setScissorTest(false)
}
