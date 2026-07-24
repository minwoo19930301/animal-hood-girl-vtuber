/**
 * 후드 공용 키트 (Pack v3) — src/model/hood.ts(플라밍고, 검증된 원형)에서
 * 재사용 코어를 추출. hood.ts 자체는 무수정 유지(검증본 보존), 코드는 복제.
 *
 * 좌표 규약 (hood.ts와 동일): 정규화 head 본 로컬 프레임 기준으로 빌드,
 * **정면 = -Z, 캐릭터-왼쪽 = -X** (VRM0 원공간). VRM1 모델이면 각 빌더가
 * pivot.rotation.y = π 로 뒤집는다 (ctx.S === -1).
 * 스케일은 전부 crownH(머리 본→정수리 높이)·hw(머리 반폭) 기반 자동 산출.
 *
 * 장식 규칙 (DESIGN-PACK-V3.md): 종별 장식은 **개구부 밖 셸 면 위에만** —
 * surfacePoint()/muzzleAnchor()로 앵커를 얻어 shellPivot 트리에 단다.
 */
import * as THREE from 'three'
import { PALETTE } from '../../palette'
import { toonMat, addOutline } from '../materials'
import type { FaceBounds } from '../hood'

// 장식 단계에서 그대로 쓰는 공용 헬퍼 재export
export { toonMat, unlitMat, addOutline } from '../materials'
export { taperedTube, unitSphereLo, mergeShapes } from '../geo'
export type { FaceBounds } from '../hood'

/** 개구부 축이 정면(-Z)에서 아래로 기운 각 (rad) */
export const TILT = 0.22
/** 셸 개구부 타원 콘 반각 — 얼굴(이마 중간~턱, 양볼)이 여유 있게 전부 보이는 크기 */
export const SHELL_AP = { ax: 0.98, ayUp: 0.52, ayDown: 1.05 } as const
/** 안감 개구부: 셸보다 살짝 좁게 → 림 안쪽 얇은 밴드로만 보임 (얼굴은 절대 안 덮음) */
export const LINING_AP = { ax: 0.90, ayUp: 0.46, ayDown: 1.05 } as const

export interface Aperture { ax: number; ayUp: number; ayDown: number }

/**
 * 얼굴 개구부(타원 포트홀)를 남긴 후드 셸 구.
 * -Z(정면)에서 아래로 TILT만큼 기운 축 둘레의 타원 콘 안쪽 버텍스를
 * 같은 φ 자오선의 림 커브로 이동(collapse)하고, **세 꼭짓점이 전부 콘 안쪽인
 * 삼각형은 인덱스에서 제거**한다 — 제거하지 않으면 축 근처에서 φ가 π 점프해
 * 림 반대편끼리 이어지는 "웹" 페이스가 개구부를 덮는다 (v2에서 얼굴을 가린 원인).
 * 경계에 걸친 삼각형만 남아 셸→림을 봉합하므로 림 에지는 매끈한 타원.
 * 위(ayUp)는 앞머리 위 오버행, 아래(ayDown 크게)는 바닥 컷과 합쳐져 턱 밑이 열린다.
 * y-바이어스 테이퍼로 아래가 살짝 통통한 두건形.
 */
export function cutShellGeo(ap: Aperture, bias: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 48, 36, 0, Math.PI * 2, 0, Math.PI * 0.82)
  const P = new THREE.Vector3(0, -Math.sin(TILT), -Math.cos(TILT)) // 개구부 축
  const U = new THREE.Vector3(1, 0, 0)
  const V = new THREE.Vector3().crossVectors(P, U) // ≈ 아래 방향
  const pos = g.attributes.position
  const inside: boolean[] = new Array(pos.count).fill(false)
  const d = new THREE.Vector3()
  const e = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    d.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize()
    const cosT = THREE.MathUtils.clamp(d.dot(P), -1, 1)
    const thetaP = Math.acos(cosT)
    e.copy(d).addScaledVector(P, -cosT)
    const phiP = Math.atan2(e.dot(V), e.dot(U))
    const ay = Math.sin(phiP) > 0 ? ap.ayDown : ap.ayUp
    const cb = ay * Math.cos(phiP)
    const sb = ap.ax * Math.sin(phiP)
    const thetaB = (ap.ax * ay) / Math.sqrt(cb * cb + sb * sb)
    if (thetaP < thetaB) {
      inside[i] = true
      // 개구부 안 → 같은 φ 자오선의 림으로 이동 (경계 삼각형 봉합용)
      d.copy(P).multiplyScalar(Math.cos(thetaB))
        .addScaledVector(U, Math.cos(phiP) * Math.sin(thetaB))
        .addScaledVector(V, Math.sin(phiP) * Math.sin(thetaB))
      pos.setXYZ(i, d.x, d.y, d.z)
    }
  }
  // 전부-내부 삼각형 드롭 → 개구부가 실제 "구멍"이 된다
  const idx = g.getIndex()!
  const keep: number[] = []
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i)
    const b = idx.getX(i + 1)
    const c = idx.getX(i + 2)
    if (inside[a] && inside[b] && inside[c]) continue
    keep.push(a, b, c)
  }
  g.setIndex(keep)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const w = 1 + bias * y
    pos.setX(i, pos.getX(i) * w)
    pos.setZ(i, pos.getZ(i) * w)
  }
  g.computeVertexNormals()
  return g
}

/** 종별 후드 색 (base↔shade는 hue-shift 페어 — materials.ts toonMat 규약) */
export interface HoodColors {
  shell: number
  shellShade: number
  lining: number
  liningShade: number
}

export interface HoodBase {
  /** head 본에 어태치할 루트 (VRM1이면 빌더가 y π 회전) */
  pivot: THREE.Group
  /** 셸+장식 전체 — 2차 모션(고개 지연 추종) 회전 대상. 장식은 여기(또는 하위 앵커)에 단다 */
  shellPivot: THREE.Group
  /** 셸 타원체 중심 (pivot 로컬) */
  C: THREE.Vector3
  /** 셸 타원체 반지름 (x/y/z) — surfacePoint 좌표 산출과 장식 스케일 기준 */
  rx: number
  ry: number
  rz: number
  /** 겉감 셸 메시 (아웃라인 자식 포함) */
  shellMesh: THREE.Mesh
  /** 드래그 히트테스트 대상 (셸 포함, 빌더가 장식 대형 파츠를 추가) */
  hitMeshes: THREE.Mesh[]
}

/**
 * 공통 후드 베이스: 겉감 셸 + 안감 + 아웃라인 + 자동 치수.
 * hood.ts buildHood의 셸/안감 파트 그대로 — 색만 파라미터화.
 *
 * 치수 규약 (hood.ts 검증값):
 * - 실측 얼굴 평면(face.frontZ)이 없으면 crownH 비례 폴백 (Shino 실측비 ≈ 0.50/0.48)
 * - GROW 1.08: 헤어 메시 관통 방지 마진 — 셸 반경 일괄 +8%
 * - rzDrape: 상단 림이 얼굴 평면보다 앞(-Z)에서 앞머리 위로 드리우는 하한
 * - rx 하한: 측면 림 x = sin(ax)·rx 가 얼굴 반폭 밖에 오도록
 */
export function buildHoodBase(
  crownH: number,
  hw: number,
  face: FaceBounds | undefined,
  colors: HoodColors,
): HoodBase {
  const pivot = new THREE.Group()
  const shellPivot = new THREE.Group()
  pivot.add(shellPivot)
  const hit: THREE.Mesh[] = []

  // ---- 셸 치수: 머리+헤어 볼륨을 감싸되 얼굴은 여는 두건 ----
  const faceZ = face?.frontZ ?? -0.50 * crownH
  const faceHalfW = face?.halfW ?? 0.48 * crownH
  const GROW = 1.08
  const C = new THREE.Vector3(0, crownH * 0.42, crownH * 0.08)
  // rz 하한: 상단 림(개구부 위쪽 가장자리)이 얼굴 평면보다 앞(-Z)에서 앞머리 위로
  // 드리우도록 — 상단 림의 축방향 성분은 cos(ayUp - TILT)
  const rzDrape = (C.z - faceZ + crownH * 0.05) / Math.cos(SHELL_AP.ayUp - TILT)
  const rz = Math.max(hw * 1.85, crownH * 0.60, rzDrape) * GROW
  const rx = Math.max(rz, hw * 1.90 * GROW, (faceHalfW + crownH * 0.06) / Math.sin(SHELL_AP.ax))
  const ry = crownH * 0.80 * GROW

  // ---- 겉감 셸 (타원 개구부: 얼굴 전부 오픈, 위 림만 앞머리 위 오버행) ----
  // 측면 림은 얼굴 평면보다 뒤(+z) — 얼굴이 개구부 밖으로 살짝 나온 느낌
  const shell = new THREE.Mesh(
    cutShellGeo(SHELL_AP, -0.10),
    toonMat(colors.shell, colors.shellShade),
  )
  shell.position.copy(C)
  shell.scale.set(rx, ry, rz)
  addOutline(shell, crownH * 0.030, PALETTE.nightPurple)
  shellPivot.add(shell)
  hit.push(shell)

  // ---- 안감: 셸보다 약간 좁은 개구부 → 림 안쪽 ~0.06rad 밴드로만 보임 ----
  const lining = new THREE.Mesh(
    cutShellGeo(LINING_AP, -0.10),
    toonMat(colors.lining, colors.liningShade, { doubleSide: true }),
  )
  lining.position.copy(C)
  lining.scale.set(rx * 0.985, ry * 0.985, rz * 0.99)
  shellPivot.add(lining)

  return { pivot, shellPivot, C, rx, ry, rz, shellMesh: shell, hitMeshes: hit }
}

/**
 * 셸 표면 장식 앵커 (hood.ts 눈 배치 로직 일반화).
 * azimuth: 정면(-Z)에서 수평으로 벌어진 각 (rad, +x쪽 양수 — 좌우는 부호로),
 * elevation: 상향 각 (rad). radial: 표면 반경 계수 (기본 0.99 = 표면 살짝 안쪽).
 *
 * 반환 Group은 shellPivot 자식으로 추가되며, 로컬 +Z = 바깥(방사 방향),
 * +Y = 수직 유지(롤 없는 베이시스). setFromUnitVectors(z, dir)는 dir.z<0이라
 * ~146° 최단호 대회전이 되어 로컬 Y가 안쪽으로 기울고 배치가 통째로 뒤틀린다 —
 * 반드시 makeBasis 방식 유지 (hood.ts 검증).
 *
 * 개구부 침범 주의: SHELL_AP 콘(정면 -Z 기준 반각 ax≈0.98/ayUp≈0.52) **밖**에만
 * 배치할 것. 플라밍고 눈 검증값: azimuth ±0.54, elevation 0.30.
 */
export function surfacePoint(
  base: HoodBase,
  azimuth: number,
  elevation: number,
  radial = 0.99,
): THREE.Group {
  const dir = new THREE.Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    -Math.cos(azimuth) * Math.cos(elevation),
  )
  const g = new THREE.Group()
  g.position.set(
    base.C.x + dir.x * base.rx * radial,
    base.C.y + dir.y * base.ry * radial,
    base.C.z + dir.z * base.rz * radial,
  )
  const Zb = dir.clone().normalize()
  const Xb = new THREE.Vector3(0, 1, 0).cross(Zb)
  // 천정 특이점(정수리 수직): 월드 up과 평행이면 +X 폴백
  if (Xb.lengthSq() < 1e-8) Xb.set(1, 0, 0)
  else Xb.normalize()
  const Yb = Zb.clone().cross(Xb)
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(Xb, Yb, Zb))
  base.shellPivot.add(g)
  return g
}

/**
 * 주둥이(muzzleFollow) 앵커 — 상단 림 중앙에서 이마 위로 드리우는 위치.
 * 플라밍고 beakPivot 검증 좌표 (0, C.y + ry·0.46, C.z − rz·0.78) 그대로.
 * shellPivot 자식으로 추가 → index.ts의 muzzleP/muzzleY 스프링이 중첩 출렁임을 건다.
 */
export function muzzleAnchor(base: HoodBase): THREE.Group {
  const g = new THREE.Group()
  g.position.set(0, base.C.y + base.ry * 0.46, base.C.z - base.rz * 0.78)
  base.shellPivot.add(g)
  return g
}
