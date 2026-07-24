/**
 * elephant — 코끼리 후드 (Pack v3: 셸+안감 + 장식 + 액세서리).
 *
 * DESIGN-PACK-V3.md 장식 계약 (전부 개구부 밖 셸 면 위):
 * - 셸/안감: 슬레이트/핑크
 * - 장식: 큰 부채 귀(납작 대형 디스크 + 핑크 이너 디스크)×2 — 측면 낮게, 존재감 있게.
 *   가벼운 Follower로 귀 플랩 2차 모션.
 * - 코: muzzleAnchor 자식으로 분절 tapered 튜브(크리스 링 3개) — 림 위에서
 *   아래로 드리움. **길이는 눈썹 위까지만** (팁 y −0.28·crownH — 플라밍고 부리 팁
 *   함정: 더 길면 pitch-down 출렁임 때 콧등까지 내려와 눈 사이를 가린다).
 *   muzzleFollow rotation은 index.ts 스프링이 매 프레임 덮어쓴다 — 코는 반드시
 *   앵커의 **자식으로 add**, rotation 직접 세팅 금지.
 * 앵커는 hoodKit.surfacePoint(base, azimuth, elevation)/muzzleAnchor(base) 사용
 * (플라밍고 눈 검증값 azimuth ±0.54, elevation 0.30 — SHELL_AP 콘 밖 유지).
 */
import * as THREE from 'three'
import { PALETTE } from '../../palette'
import { egg } from '../geo'
import { Follower } from '../springs'
import { buildAccessories, type AccessoryColors } from '../accessories'
import type { AnimalBuildContext, AnimalCostumeRig } from './types'
import {
  buildHoodBase, muzzleAnchor, surfacePoint,
  toonMat, addOutline, taperedTube, unitSphereLo,
  type HoodBase, type HoodColors,
} from './hoodKit'

/** 셸/안감 색 — 카탈로그 팔레트 계승 (elephant.palette primary/shade + accent(핑크)) */
const COL: HoodColors = {
  shell: 0x9ba8bc, shellShade: 0x6f7b91,
  lining: 0xf0a7b4, liningShade: 0xcc8492,
}

/** 코 분절 크리스 링 — 셸보다 살짝 어두운 슬레이트 (주름으로 읽히게) */
const RING = { base: 0x8794a9, shade: 0x5c6880 } as const

/** 액세서리 색 (과제 색표) — 셰이드는 명도 -18~22%p (다크 색은 코드베이스 관례 소폭) */
const ACC: AccessoryColors = {
  bandBase: 0xe9eef5, bandBaseShade: 0xc6cede,   // 밝은 회청 (라벤더 쪽 셰이드)
  bandStripe: 0x6f7b91, bandStripeShade: 0x525c6e, // 슬레이트 트림
  bandLine: 0xf0a7b4, bandLineShade: 0xcc8492,   // 핑크 핀라인 (안감 페어 재사용)
  cord: 0xf0a7b4, cordShade: 0xcc8492,           // 핑크 드로스트링
  tip: 0x3d4350, tipShade: 0x2b303b,             // 다크 슬레이트 팁
}

/**
 * 큰 부채 귀 1개: egg(위가 넓은 부채꼴) 슬레이트 디스크 + 핑크 이너.
 * 측면 낮게 (azimuth ±1.42, elevation 0.04 — SHELL_AP 콘 경계에서 충분히 밖).
 * anchor > twist(정적 3/4 각) > flap(동적 Follower 회전) > 메시 — 정적 트위스트와
 * 스프링 회전이 서로 덮어쓰지 않도록 계층 분리.
 */
function buildEar(base: HoodBase, crownH: number, side: -1 | 1): THREE.Group {
  const s = crownH
  const R = 0.36 * s // 존재감 있게 대형
  const anchor = surfacePoint(base, side * 1.42, 0.04, 0.97)
  const twist = new THREE.Group()
  twist.rotation.y = side * 0.50 // 디스크 노멀을 정면 쪽으로 (3/4 각)
  anchor.add(twist)
  const flap = new THREE.Group()
  twist.add(flap)
  const outer = new THREE.Mesh(
    egg(R, R * 1.22, R * 0.30, 0.22), // bias>0 → 위가 넓은 부채形
    toonMat(COL.shell, COL.shellShade),
  )
  outer.position.z = R * 0.04
  addOutline(outer, s * 0.028, PALETTE.nightPurple) // egg는 크기 베이크 — scale 1
  const inner = new THREE.Mesh(
    egg(R * 0.60, R * 0.80, R * 0.16, 0.22),
    toonMat(COL.lining, COL.liningShade),
  )
  inner.position.z = R * 0.26 // 부채 앞면 위 핑크 이너
  flap.add(outer, inner)
  base.hitMeshes.push(outer) // 대형 장식 클릭 히트
  return flap
}

/**
 * 코: 분절 tapered 튜브 — 림 위에서 아래로 드리움. 반지름 교대(굵-가늘)로
 * 볼록 마디 + 다크 슬레이트 크리스 링 3개로 분절감. 팁은 라운드 구 + 핑크 코끝.
 * 전부 muzzle(앵커) 자식 — index.ts muzzleP/muzzleY 스프링이 자동 출렁임을 준다.
 */
function buildTrunk(muzzle: THREE.Group, crownH: number, hit: THREE.Mesh[]): void {
  const s = crownH
  const pts = [
    new THREE.Vector3(0, 0.08 * s, 0.14 * s),    // 셸 안쪽 밑동 (이음새 은폐)
    new THREE.Vector3(0, 0.02 * s, -0.12 * s),   // 림 위 통과 — 아치를 낮춰 정면 가독
    new THREE.Vector3(0, -0.085 * s, -0.27 * s), // 림 앞으로 확실히 분리
    new THREE.Vector3(0, -0.19 * s, -0.325 * s),
    new THREE.Vector3(0, -0.315 * s, -0.345 * s), // 팁 — 눈썹 위까지만 (플라밍고 −0.33/−0.365 안쪽)
  ]
  const radii = [0.150 * s, 0.128 * s, 0.118 * s, 0.094 * s, 0.062 * s]
  const trunk = new THREE.Mesh(taperedTube(pts, radii, { seg: 28 }), toonMat(COL.shell, COL.shellShade))
  addOutline(trunk, s * 0.022, PALETTE.nightPurple)
  muzzle.add(trunk)
  hit.push(trunk)

  // 분절 크리스 링 3개 — 컨트롤 포인트 위 (CatmullRom은 컨트롤 포인트를 통과),
  // 축은 이웃 포인트 차분 탄젠트로 정렬 (torus 기본 축 +Z)
  const ringAt = (i: number, r: number) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.020 * s, 8, 24),
      toonMat(RING.base, RING.shade),
    )
    const tanDir = pts[i + 1].clone().sub(pts[i - 1]).normalize()
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tanDir)
    ring.position.copy(pts[i])
    muzzle.add(ring)
  }
  ringAt(1, 0.128 * s)
  ringAt(2, 0.118 * s)
  ringAt(3, 0.094 * s)

  // 라운드 팁 + 핑크 코끝 (플러시 토이 룩)
  const tip = new THREE.Mesh(unitSphereLo(), toonMat(COL.shell, COL.shellShade))
  tip.scale.set(0.066 * s, 0.060 * s, 0.066 * s)
  tip.position.copy(pts[4])
  addOutline(tip, s * 0.016, PALETTE.nightPurple) // scale 확정 후 호출
  // 핑크 코끝: muzzle 직속 (비균일 스케일 부모 아래 두면 좌표가 왜곡된다)
  const nose = new THREE.Mesh(unitSphereLo(), toonMat(COL.lining, COL.liningShade))
  nose.scale.set(0.034 * s, 0.030 * s, 0.026 * s)
  nose.position.copy(pts[4]).add(new THREE.Vector3(0, -0.050 * s, -0.030 * s)) // 팁 표면 아래-앞
  muzzle.add(tip, nose)
}

export function buildElephant(ctx: AnimalBuildContext): AnimalCostumeRig {
  const base = buildHoodBase(ctx.crownH, ctx.halfW, ctx.face, COL)
  base.pivot.name = 'elephantHood'
  // VRM1 대응: 후드는 -Z 정면(VRM0 원공간)으로 저작 — index.ts fx 패턴과 동일
  if (ctx.S === -1) base.pivot.rotation.y = Math.PI

  const flapL = buildEar(base, ctx.crownH, -1)
  const flapR = buildEar(base, ctx.crownH, 1)

  // muzzleFollow 앵커: index.ts 스프링이 rotation을 덮어쓰는 자리 —
  // 코는 자식으로만 단다 (rotation 직접 세팅 금지)
  const muzzleFollow = muzzleAnchor(base)
  buildTrunk(muzzleFollow, ctx.crownH, base.hitMeshes)

  // 손목밴드 + 드로스트링 (flamingo.ts 배선과 동일, 색만 오버라이드)
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

  // 귀 플랩 2차 모션 — 가벼운 Follower (좌우 스프링 상수 미세 비대칭, 결정적)
  const fpL = new Follower(50, 5.2, 0.30)
  const fpR = new Follower(54, 5.4, 0.30)
  const fy = new Follower(44, 4.8, 0.30)

  return {
    headRoot: base.pivot,
    headFollow: base.shellPivot,
    muzzleFollow,
    hitMeshes: base.hitMeshes,
    update: (pitchS, yaw, breath, dt) => {
      const yv = fy.step(yaw, dt)
      flapL.rotation.set(fpL.step(pitchS, dt) * 0.22, yv * 0.18, breath * 0.02)
      flapR.rotation.set(fpR.step(pitchS, dt) * 0.22, yv * 0.18, -breath * 0.02)
      acc.sway(pitchS, yaw, breath, dt)
    },
  }
}
