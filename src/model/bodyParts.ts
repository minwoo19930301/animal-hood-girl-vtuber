/**
 * bodyParts — 몸통에 붙는 종별 파츠 (꼬리 / 등껍질).
 *
 * 후드·귀는 head 본에 붙지만 꼬리와 등껍질은 hips·chest 본에 붙는다. 좌표 규약은
 * accessories.ts와 동일하다: VRM 루트가 Y축 π 회전되어 있으므로 월드 델타를 본 로컬로
 * 옮길 때 x·z 부호를 반전한다(월드 정면 +Z → 로컬 -Z). 따라서 로컬 +Z가 '캐릭터 뒤'다.
 *
 * 꼬리는 엉덩이 뒤에서 시작해 옆구리를 타고 내려와 **끝이 앞으로 감긴다** — 정면 샷에서도
 * 꼬리가 보이게 하는 것이 요구사항이다(뒤에만 있으면 방송 화면에서 존재감이 없다).
 * 길이·굵기·색은 종별로 다르게 준다.
 */
import * as THREE from 'three'
import { PALETTE } from '../palette'
import { taperedTube, unitSphereLo } from './geo'
import { toonMat, addOutline } from './animals/hoodKit'

export interface TailSpec {
  /** 메인 색 / 셰이드 */
  base: number
  baseShade: number
  /** 끝단 색 (여우 흰 끝, 사자 갈기 뭉치 등). null이면 메인색 유지 */
  tip?: number | null
  tipShade?: number | null
  /** 굵기 배율 (1 = 여우 기본 볼륨) */
  girth?: number
  /** 길이 배율 */
  length?: number
  /** 끝에 둥근 뭉치를 달지 여부 (사자) */
  tuft?: boolean
  /** 감기는 방향: +1 = 캐릭터 왼쪽, -1 = 오른쪽 */
  side?: 1 | -1
}

/**
 * 꼬리를 만들어 hips 본에 붙인다.
 *
 * @param hips  hips 본 (없으면 아무것도 하지 않는다)
 * @param unit  치수 척도(월드 단위) — ctx.crownH(머리 높이)를 넘긴다
 * @param S     VRM0 = 1, VRM1 = -1
 */
export function buildTail(
  hips: THREE.Object3D | null,
  unit: number,
  S: number,
  spec: TailSpec,
): THREE.Group | null {
  if (!hips || !(unit > 1e-4)) return null
  const hw = unit
  const side = spec.side ?? 1
  const girth = spec.girth ?? 1
  const len = spec.length ?? 1

  const root = new THREE.Group()
  root.name = 'tail'
  if (S === -1) root.rotation.y = Math.PI

  // 로컬 +Z = 캐릭터 뒤. 뒤 → 옆 → 아래 → 앞으로 감기는 곡선.
  const p = (x: number, y: number, z: number) => new THREE.Vector3(x * hw, y * hw * len, z * hw * len)
  const points = [
    p(side * 0.10, -0.05, 0.55),
    p(side * 0.85, -0.60, 0.85),
    p(side * 1.35, -1.25, 0.30),
    p(side * 1.25, -1.70, -0.55),
  ]
  const radii = [0.30, 0.24, 0.17, 0.09].map((r) => r * hw * girth)

  const tail = new THREE.Mesh(taperedTube(points, radii), toonMat(spec.base, spec.baseShade))
  addOutline(tail, hw * 0.05, PALETTE.nightPurple)
  root.add(tail)

  // 끝단 색이 다르면 마지막 구간을 덧씌운다 (여우 흰 꼬리끝 / 호랑이 검은 끝).
  if (spec.tip != null) {
    const tipMesh = new THREE.Mesh(
      taperedTube(points.slice(2), [radii[2] * 0.98, radii[3]]),
      toonMat(spec.tip, spec.tipShade ?? spec.tip),
    )
    addOutline(tipMesh, hw * 0.045, PALETTE.nightPurple)
    root.add(tipMesh)
  }

  // 사자 갈기 뭉치 — 끝에 둥근 볼
  if (spec.tuft) {
    const tuft = new THREE.Mesh(unitSphereLo(), toonMat(spec.tip ?? spec.base, spec.tipShade ?? spec.baseShade))
    tuft.scale.setScalar(hw * 0.30 * girth)
    tuft.position.copy(points[points.length - 1])
    addOutline(tuft, hw * 0.05, PALETTE.nightPurple)
    root.add(tuft)
  }

  hips.add(root)
  return root
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
 * @param chest chest 본
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
  // 등 표면에 얹히도록 뒤(+Z)로 밀고 살짝 아래로.
  root.position.set(0, -hw * 0.22, hw * 0.38)

  const dome = new THREE.Mesh(unitSphereLo(), toonMat(spec.base, spec.baseShade))
  dome.scale.set(hw * 1.02, hw * 0.92, hw * 0.52)
  addOutline(dome, hw * 0.05, PALETTE.nightPurple)
  root.add(dome)

  // 테두리 링 — 껍질 둘레의 밝은 각질대
  const rim = new THREE.Mesh(unitSphereLo(), toonMat(spec.rim, spec.rimShade))
  rim.scale.set(hw * 1.08, hw * 0.97, hw * 0.36)
  rim.position.z = -hw * 0.10
  addOutline(rim, hw * 0.045, PALETTE.nightPurple)
  root.add(rim)
  // 링이 돔보다 뒤에 그려져 둘레만 보이게 (렌더 순서 고정 — 결정적)
  rim.renderOrder = -1

  // 육각 플레이트 — 돔 앞면(뒤쪽 바깥)에 결정적 배치
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

/** hips/upperLeg 본에서 힙 반폭을 실측한다 (하드코딩 치수 금지). */
export function hipHalfWidthOf(
  upperLegL: THREE.Object3D | null | undefined,
  upperLegR: THREE.Object3D | null | undefined,
): number {
  if (!upperLegL || !upperLegR) return 0
  const a = upperLegL.getWorldPosition(new THREE.Vector3())
  const b = upperLegR.getWorldPosition(new THREE.Vector3())
  return a.distanceTo(b) / 2
}

/** chest/upperArm 본에서 어깨 반폭을 실측한다. */
export function shoulderHalfWidthOf(
  upperArmL: THREE.Object3D | null | undefined,
  upperArmR: THREE.Object3D | null | undefined,
): number {
  if (!upperArmL || !upperArmR) return 0
  const a = upperArmL.getWorldPosition(new THREE.Vector3())
  const b = upperArmR.getWorldPosition(new THREE.Vector3())
  return a.distanceTo(b) / 2
}
