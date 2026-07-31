/**
 * bodyParts — 몸통에 붙는 종별 파츠 (꼬리 / 등껍질).
 *
 * 후드·귀는 head 본에 붙지만 꼬리와 등껍질은 hips·chest 본에 붙는다. 좌표 규약은
 * accessories.ts와 동일하다: VRM 루트가 Y축 π 회전되어 있으므로 월드 델타를 본 로컬로
 * 옮길 때 x·z 부호를 반전한다(월드 정면 +Z → 로컬 -Z). 따라서 로컬 +Z가 '캐릭터 뒤'다.
 *
 * 꼬리 구현 이력 (실측 기반):
 *  - v1: 힙 뒤 0.42·unit에서 아래로 늘어뜨림 → A/B 렌더 차이 0px. 등 표면(≈0.6·unit)
 *    안쪽이라 몸통에 완전히 파묻혔다.
 *  - v2: 위로 치켜올리고 뒤로 0.8·unit, 측면 1.3·unit → 정면 4854px 가시.
 *  - v3(현재): 단일 튜브 루트 회전은 막대가 통째로 도는 '뻣뻣한' 움직임이었다.
 *    strands.ts 분절 체인으로 바꿔 밑동→끝으로 파동이 전파되게 했다(머리카락 느낌).
 *    꼬리 굵기도 얇게 유지한다.
 */
import * as THREE from 'three'
import { PALETTE } from '../palette'
import { taperedTube, unitSphereLo } from './geo'
import { toonMat, addOutline } from './animals/hoodKit'
import { buildStrand, type StrandRig } from './strands'

export interface TailRig {
  root: THREE.Group
  /** 매 프레임 호출 — 살랑거림 + 고개 반응 지연 */
  sway(pitchS: number, yaw: number, breath: number, dt: number): void
}

export interface TailSpec {
  /** 메인 색 / 셰이드 */
  base: number
  baseShade: number
  /** 끝단 색 (여우 흰 끝, 호랑이 검은 끝). null이면 메인색 유지 */
  tip?: number | null
  tipShade?: number | null
  /** 굵기 배율 (1 = 여우 기본 볼륨) */
  girth?: number
  /** 길이 배율 (1 ≈ 어깨 높이까지, 원숭이는 1.8 등 길게) */
  length?: number
  /** 끝에 둥근 뭉치를 달지 여부 (사자) */
  tuft?: boolean
  /** 감기는 방향: +1 = 캐릭터 왼쪽, -1 = 오른쪽 */
  side?: 1 | -1
  /** 흔들림 진폭 배율 */
  amp?: number
  /** 분절 색 교대 [색, 셰이드] — 라쿤 링무늬 꼬리 */
  rings?: [number, number] | null
  /** 꼬불거림 (rad/분절 누적) */
  curl?: number
  /** 끝단 집중 컬 (rad/분절, t^3 가중) — 끄트머리만 둥글게 말린다 */
  tipCurl?: number
  /** 코일 비틀림 (rad/분절) */
  twist?: number
}

/**
 * 꼬리를 만들어 hips 본에 붙인다.
 *
 * @param hips hips 본 (없으면 아무것도 하지 않는다)
 * @param unit 치수 척도(월드 단위) — ctx.crownH(머리 높이)를 넘긴다
 * @param S    VRM0 = 1, VRM1 = -1
 */
export function buildTail(
  hips: THREE.Object3D | null,
  unit: number,
  S: number,
  spec: TailSpec,
): TailRig | null {
  if (!hips || !(unit > 1e-4)) return null
  const side = spec.side ?? 1
  const girth = spec.girth ?? 1
  const len = spec.length ?? 1

  const root = new THREE.Group()
  root.name = 'tail'
  if (S === -1) root.rotation.y = Math.PI

  // 밑동 앵커: 등 표면 밖(로컬 +Z = 뒤), 힙보다 살짝 위.
  const anchor = new THREE.Group()
  // 옆으로 확실히 빼서 정면 실루엣에 걸리게 한다 (이전 x 0.10은 등 뒤에 가려졌다).
  anchor.position.set(side * 0.62 * unit, 0.10 * unit, 0.66 * unit)
  // 가닥은 -Y로 자라므로, 위로 치켜세우려면 밑동을 뒤로 크게 젖힌다(≈150°).
  anchor.rotation.x = -2.62
  anchor.rotation.z = -side * 0.72
  root.add(anchor)

  const strand = buildStrand({
    segments: 7,
    length: unit * 2.35 * len,
    radius: unit * 0.155 * girth,
    taper: 0.34,
    base: spec.base,
    baseShade: spec.baseShade,
    tip: spec.tip ?? null,
    tipShade: spec.tipShade ?? null,
    restBend: 0.10 * side,
    amp: 0.13 * (spec.amp ?? 1),
    freq: 1.9,
    phase: side > 0 ? 0.4 : 2.1,
    tuft: spec.tuft,
    rings: spec.rings ?? null,
    curl: spec.curl ?? 0,
    tipCurl: spec.tipCurl ?? 0,
    twist: spec.twist ?? 0,
    outline: unit * 0.05,
  })
  anchor.add(strand.root)

  hips.add(root)
  return {
    root,
    sway(pitchS, yaw, breath, dt) {
      strand.sway(pitchS, yaw, breath, dt)
    },
  }
}

export interface ShellSpec {
  base: number
  baseShade: number
  rim: number
  rimShade: number
  /** 플레이트 개수 (0 = 매끈한 등껍질) */
  plates?: number
}

/**
 * 등껍질(거북이)을 만들어 chest 본에 붙인다. 로컬 +Z(뒤)로 밀어 등에 얹는다.
 *
 * @param unit 치수 척도(월드 단위) — ctx.crownH를 넘긴다
 */
export function buildBackShell(
  chest: THREE.Object3D | null,
  unit: number,
  S: number,
  spec: ShellSpec,
): THREE.Group | null {
  if (!chest || !(unit > 1e-4)) return null
  const hw = unit * 0.78

  const root = new THREE.Group()
  root.name = 'backShell'
  if (S === -1) root.rotation.y = Math.PI
  root.position.set(0, -hw * 0.22, hw * 0.38)

  const dome = new THREE.Mesh(unitSphereLo(), toonMat(spec.base, spec.baseShade))
  dome.scale.set(hw * 1.02, hw * 0.92, hw * 0.52)
  addOutline(dome, hw * 0.05, PALETTE.nightPurple)
  root.add(dome)

  const rim = new THREE.Mesh(unitSphereLo(), toonMat(spec.rim, spec.rimShade))
  rim.scale.set(hw * 1.08, hw * 0.97, hw * 0.36)
  rim.position.z = -hw * 0.10
  addOutline(rim, hw * 0.045, PALETTE.nightPurple)
  root.add(rim)
  rim.renderOrder = -1

  const plates = spec.plates ?? 5
  for (let i = 0; i < plates; i++) {
    const angle = (i / plates) * Math.PI * 2 + 0.4
    const radius = hw * 0.55
    const plate = new THREE.Mesh(unitSphereLo(), toonMat(spec.rim, spec.rimShade))
    plate.scale.set(hw * 0.30, hw * 0.30, hw * 0.10)
    plate.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.9, hw * 0.52)
    addOutline(plate, hw * 0.03, PALETTE.nightPurple)
    root.add(plate)
  }
  const centre = new THREE.Mesh(unitSphereLo(), toonMat(spec.rim, spec.rimShade))
  centre.scale.set(hw * 0.34, hw * 0.34, hw * 0.12)
  centre.position.z = hw * 0.56
  addOutline(centre, hw * 0.03, PALETTE.nightPurple)
  root.add(centre)

  chest.add(root)
  return root
}

export type { StrandRig }
