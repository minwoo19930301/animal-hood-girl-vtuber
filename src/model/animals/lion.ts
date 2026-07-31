/**
 * lion — 사자 후드 (Pack v3).
 *
 * DESIGN-PACK-V3.md 장식 계약 (전부 개구부 밖 셸 면 위):
 * - 셸/안감: 골든/앰버
 * - 장식: 셸 둘레 갈기 페탈 링 2겹(안쪽 허니/바깥 앰버 — 개구부 림을 감싸는
 *   통통한 로브, 얼굴 개구부 침범 금지), 작은 둥근 귀×2(페탈 사이 위쪽),
 *   정수리 주둥이 위치(muzzleFollow)에 갈색 코
 * - 액세서리: 손목밴드+드로스트링 (bandBase 크림골드 / stripe 네이비 / line·cord 골드)
 *
 * 갈기 배치: cutShellGeo의 개구부 림 각(rimTheta(φ)) + 마진 바깥에 페탈 밑동을
 * 두고, 페탈 축은 개구부에서 멀어지는 접선 방향 + 바깥 들림(lift) — 얼굴 쪽으로는
 * 절대 자라지 않는 구조라 개구부 침범이 원천 차단된다.
 */
import * as THREE from 'three'
import { PALETTE } from '../../palette'
import type { AnimalBuildContext, AnimalCostumeRig } from './types'
import {
  buildHoodBase,
  muzzleAnchor,
  toonMat,
  addOutline,
  unitSphereLo,
  mergeShapes,
  TILT,
  SHELL_AP,
  type HoodColors,
  type HoodBase,
} from './hoodKit'
import { featherLobe, type MergeItem } from '../geo'
import { buildTail } from '../bodyParts'
import { buildAccessories, type AccessoryColors } from '../accessories'

/** 셸/안감 색 — 카탈로그 팔레트 계승 (lion.palette primary/shade + accent(앰버)) */
const COL: HoodColors = {
  shell: 0xebb755, shellShade: 0xc8872e,
  lining: 0xb5722e, liningShade: 0x8a5520,
}

/** 장식 색 (base↔shade는 명도 -15~20%p + hue 살짝 회전 — HOOD_COL 패턴) */
const DECOR = {
  honey: 0xf7d180, honeyShade: 0xd9a54a,  // 갈기 안쪽 겹 (셸보다 밝은 허니)
  amber: 0xc8872e, amberShade: 0x9c6220,  // 갈기 바깥 겹 (셸보다 다크한 앰버)
  // 귀 이너: 페탈 허니/앰버와 톤이 겹쳐 묻혔다(판정 P2) — 다크브라운으로 대비 확보
  earIn: 0x8a5520, earInShade: 0x663d15,
  nose: 0x6b4423, noseShade: 0x4a2f16,    // 갈색 코
} as const

/** 액세서리 색 — 과제 색표: 크림골드 베이스 / 네이비 스트라이프 / 골드 라인·코드 */
const ACC: AccessoryColors = {
  bandBase: 0xffe9bc, bandBaseShade: 0xe8c48a,
  bandStripe: 0x22304e, bandStripeShade: 0x161f36,
  bandLine: 0xebb755, bandLineShade: 0xc8872e,
  cord: 0xebb755, cordShade: 0xc8872e,
  tip: 0x4a331c, tipShade: 0x2f1f10,
}

/** cutShellGeo와 동일한 개구부 림 각 (φ: 림 자오선 각, U=+x 기준 V(아래)쪽 양수) */
function rimTheta(phi: number): number {
  const ay = Math.sin(phi) > 0 ? SHELL_AP.ayDown : SHELL_AP.ayUp
  const cb = ay * Math.cos(phi)
  const sb = SHELL_AP.ax * Math.sin(phi)
  return (SHELL_AP.ax * ay) / Math.sqrt(cb * cb + sb * sb)
}

interface PetalLayer {
  count: number
  /** 림 둘레 팬 반각 (rad, δ=0이 림 상단) — 아래(턱)는 비운다 */
  deltaMax: number
  /** 림 각 + 마진 = 페탈 밑동의 개구부 축 이격 (개구부 침범 방지 여유) */
  margin: number
  /** 페탈 축을 셸 접선에서 바깥(방사)으로 들어올리는 각 */
  lift: number
  len: number
  width: number
  /** δ 위상 오프셋 (겹 사이 지그재그 스태거) */
  stagger: number
  /** 인덱스 기반 lift 변주 진폭 (rad) — 페탈이 서로 다른 각도로 들려 층 두께 형성 */
  liftVar?: number
  /** 짝/홀 페탈 방사 스태거 (radial 계수 가감) — 측면 프로필에 앞뒤 겹 깊이 부여 */
  zStagger?: number
}

/** 갈기 한 겹: 페탈 전부를 1지오메트리로 병합 → 드로우콜 1 + 아웃라인 1 */
function buildManeLayer(base: HoodBase, layer: PetalLayer): THREE.BufferGeometry {
  const P = new THREE.Vector3(0, -Math.sin(TILT), -Math.cos(TILT)) // 개구부 축
  const U = new THREE.Vector3(1, 0, 0)
  const V = new THREE.Vector3().crossVectors(P, U) // ≈ 아래
  const lobe = featherLobe(layer.len, layer.width, 0.55, -0.15)
  const items: MergeItem[] = []
  const e = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const tan = new THREE.Vector3()
  const X_AXIS = new THREE.Vector3(1, 0, 0)
  const qLift = new THREE.Quaternion()
  for (let i = 0; i < layer.count; i++) {
    const delta = -layer.deltaMax + (2 * layer.deltaMax * i) / (layer.count - 1) + layer.stagger
    const phi = -Math.PI / 2 + delta // δ=0 → 림 상단
    e.copy(U).multiplyScalar(Math.cos(phi)).addScaledVector(V, Math.sin(phi))
    const theta = rimTheta(phi) + layer.margin
    dir.copy(P).multiplyScalar(Math.cos(theta)).addScaledVector(e, Math.sin(theta))
    // 접선(개구부에서 멀어지는 방향) = ∂dir/∂θ — 페탈은 항상 얼굴 반대쪽으로 자란다
    tan.copy(e).multiplyScalar(Math.cos(theta)).addScaledVector(P, -Math.sin(theta))
    const Zb = dir.clone()
    const Yb = tan.clone()
    const Xb = Yb.clone().cross(Zb)
    // lift 인덱스 변주 (결정적 코사인) — 페탈마다 들림각이 달라 측면 프로필에서
    // 갈기가 단일 평면 부채가 아니라 두께 있는 층으로 읽힌다 (판정 P2 반영).
    // 변주는 항상 접선→방사 사이 (liftVar < lift ≤ π/2-여유) — 얼굴 쪽 금지 불변.
    const lift = layer.lift + (layer.liftVar ?? 0) * Math.cos(i * 2.1 + 0.6)
    qLift.setFromAxisAngle(X_AXIS, lift)
    const q = new THREE.Quaternion()
      .setFromRotationMatrix(new THREE.Matrix4().makeBasis(Xb, Yb, Zb))
      .multiply(qLift)
    const eul = new THREE.Euler().setFromQuaternion(q)
    // 크기 미세 변주 (결정적 — 인덱스 기반 코사인, Math.random 금지)
    const k = 1 + 0.10 * Math.cos(i * 2.4)
    // 짝/홀 방사 스태거 — 밑동 반경을 번갈아 가감해 앞뒤 겹(셸에 가까운 겹/뜬 겹) 형성
    const rad = 0.98 + (layer.zStagger ?? 0) * (i % 2 === 0 ? 1 : -0.55)
    items.push({
      g: lobe,
      p: [
        base.C.x + dir.x * base.rx * rad,
        base.C.y + dir.y * base.ry * rad,
        base.C.z + dir.z * base.rz * rad,
      ],
      r: [eul.x, eul.y, eul.z],
      s: [k, k * (1 + 0.06 * Math.sin(i * 1.7)), k],
    })
  }
  const merged = mergeShapes(items)
  lobe.dispose()
  return merged
}

/**
 * 갈기와 같은 림 프레임의 셸 앵커 — δ(림 상단 기준 둘레각)·margin(림 이격)으로
 * 지정해 페탈 사이 정확한 위치에 놓는다. 로컬 +Z=방사 바깥, 롤 없는 베이시스.
 */
function rimAnchor(base: HoodBase, delta: number, margin: number): THREE.Group {
  const P = new THREE.Vector3(0, -Math.sin(TILT), -Math.cos(TILT))
  const U = new THREE.Vector3(1, 0, 0)
  const V = new THREE.Vector3().crossVectors(P, U)
  const phi = -Math.PI / 2 + delta
  const e = U.clone().multiplyScalar(Math.cos(phi)).addScaledVector(V, Math.sin(phi))
  const theta = rimTheta(phi) + margin
  const dir = P.clone().multiplyScalar(Math.cos(theta)).addScaledVector(e, Math.sin(theta))
  const g = new THREE.Group()
  g.position.set(
    base.C.x + dir.x * base.rx * 0.98,
    base.C.y + dir.y * base.ry * 0.98,
    base.C.z + dir.z * base.rz * 0.98,
  )
  const Zb = dir.clone().normalize()
  const Xb = new THREE.Vector3(0, 1, 0).cross(Zb)
  if (Xb.lengthSq() < 1e-8) Xb.set(1, 0, 0)
  else Xb.normalize()
  const Yb = Zb.clone().cross(Xb)
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(Xb, Yb, Zb))
  base.shellPivot.add(g)
  return g
}

export function buildLion(ctx: AnimalBuildContext): AnimalCostumeRig {
  const base = buildHoodBase(ctx.crownH, ctx.halfW, ctx.face, COL)
  base.pivot.name = 'lionHood'
  // VRM1 대응: 후드는 -Z 정면(VRM0 원공간)으로 저작 — index.ts fx 패턴과 동일
  if (ctx.S === -1) base.pivot.rotation.y = Math.PI
  const H = ctx.crownH

  // ---- 갈기 페탈 링 2겹 — 안쪽 허니(림 가까이, 들림 큼) / 바깥 앰버(뒤로 볼륨) ----
  // 재판정 P2: liftVar/zStagger — 바깥 겹 페탈이 전부 같은 들림·같은 반경이라
  // 측면 갈기가 얇은 부채로 읽혔다. 들림각 ±0.15 변주 + 짝/홀 방사 스태거로
  // 프로필에 층 두께 부여 (변주 하한 0.20 > 0 — 접선 아래(얼굴 쪽)로는 불가)
  const outerGeo = buildManeLayer(base, {
    count: 11, deltaMax: 2.05, margin: 0.34, lift: 0.35,
    len: H * 0.55, width: H * 0.30, stagger: 0,
    liftVar: 0.15, zStagger: 0.030,
  })
  const outer = new THREE.Mesh(outerGeo, toonMat(DECOR.amber, DECOR.amberShade))
  addOutline(outer, H * 0.026, PALETTE.nightPurple)
  base.shellPivot.add(outer)
  base.hitMeshes.push(outer)

  const innerGeo = buildManeLayer(base, {
    count: 10, deltaMax: 1.85, margin: 0.14, lift: 0.60,
    len: H * 0.36, width: H * 0.24, stagger: 0.10,
  })
  const inner = new THREE.Mesh(innerGeo, toonMat(DECOR.honey, DECOR.honeyShade))
  addOutline(inner, H * 0.024, PALETTE.nightPurple)
  base.shellPivot.add(inner)
  base.hitMeshes.push(inner)

  // ---- 작은 둥근 귀×2 — 갈기와 같은 림 프레임: 안겹(δ0.72/0.93)과 바깥겹 사이
  //      틈(δ≈±0.82)에 놓고 방사 바깥으로 띄워 페탈 사이에서 정면으로 읽히게 ----
  for (const side of [-1, 1] as const) {
    const anchor = rimAnchor(base, side * 0.82, 0.30)
    anchor.rotation.x += 0.35 // 디스크 면을 앞쪽으로 살짝만 — 돔 볼륨 유지
    const R = H * 0.26
    const lift = H * 0.20 // 갈기 페탈 층 사이로 밀어 올림 (판정 반영: 0.16→0.20 상향)
    const dome = new THREE.Mesh(unitSphereLo(), toonMat(COL.shell, COL.shellShade))
    dome.scale.set(R, R * 0.95, R * 0.62)
    dome.position.z = lift
    addOutline(dome, H * 0.022, PALETTE.nightPurple)
    anchor.add(dome)
    // 이너 반경 축소(0.55→0.42) + 다크브라운 — 골든 돔 안 대비 디스크 (판정 P2)
    const innerDisc = new THREE.Mesh(unitSphereLo(), toonMat(DECOR.earIn, DECOR.earInShade))
    innerDisc.scale.set(R * 0.42, R * 0.40, R * 0.16)
    innerDisc.position.z = lift + R * 0.54
    anchor.add(innerDisc)
    base.hitMeshes.push(dome)
  }

  // ---- 정수리 주둥이 — muzzleFollow 앵커 자식 (rotation은 스프링 소유) ----
  const muzzleFollow = muzzleAnchor(base)
  // 허니색 주둥이 마운드 — 셸과 톤 분리해 '주둥이'로 읽히게
  const mound = new THREE.Mesh(unitSphereLo(), toonMat(DECOR.honey, DECOR.honeyShade))
  mound.scale.set(H * 0.24, H * 0.17, H * 0.18)
  mound.position.set(0, -H * 0.03, -H * 0.03)
  addOutline(mound, H * 0.020, PALETTE.nightPurple)
  muzzleFollow.add(mound)
  // 갈색 코: 아래로 향한 라운드 삼각 (납작 3면 콘)
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(H * 0.12, H * 0.15, 3),
    toonMat(DECOR.nose, DECOR.noseShade),
  )
  nose.rotation.set(0.35, 0, Math.PI) // 꼭지 아래 + 앞으로 기울임
  nose.scale.set(1, 1, 0.55)
  nose.position.set(0, -H * 0.055, -H * 0.20)
  addOutline(nose, H * 0.016, PALETTE.nightPurple)
  muzzleFollow.add(nose)

  // ---- 액세서리 (손목밴드+드로스트링) — flamingo.ts 배선과 동일, 색만 lion ----
  // ---- 꼬리 (뒤 → 옆 → 앞으로 감겨 정면에서도 보인다) ----
  buildTail(ctx.bones.hips ?? null, ctx.crownH, ctx.S, {
    base: COL.shell, baseShade: COL.shellShade, tip: 0x6b4526, tipShade: 0x472c17, girth: 0.62, length: 1.2, tuft: true,
  })

  const acc = buildAccessories(
    {
      chest: ctx.bones.chest ?? null,
      neck: ctx.bones.neck ?? null,
      upperArmL: ctx.bones.upperArmL ?? null,
      upperArmR: ctx.bones.upperArmR ?? null,
      lowerArmL: ctx.bones.lowerArmL ?? null,
      lowerArmR: ctx.bones.lowerArmR ?? null,
      handL: ctx.bones.handL ?? null,
      handR: ctx.bones.handR ?? null,
    },
    ctx.S,
    ACC,
  )

  return {
    headRoot: base.pivot,
    headFollow: base.shellPivot,
    muzzleFollow,
    hitMeshes: base.hitMeshes,
    update: (pitchS, yaw, breath, dt) => acc.sway(pitchS, yaw, breath, dt),
  }
}
