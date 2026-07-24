/**
 * owl — 부엉이 후드 (Pack v3).
 *
 * DESIGN-PACK-V3.md 장식 계약 (전부 개구부 밖 셸 면 위):
 * - 셸/안감: 브라운/크림
 * - 장식: 셸 눈 2개(앰버 링+검정 동공+흰 하이라이트 대·소 — 플라밍고 눈판 기법,
 *   부엉이답게 크고 동그랗게), 눈 위 귀깃 터프트×2(작은 콘),
 *   두 눈 사이 앰버 미니 부리(muzzleFollow 앵커 자식, 아래 향한 작은 콘)
 * - 액세서리: 손목밴드+드로스트링 (bandBase 크림 / stripe 다크브라운 / line·cord 앰버)
 * 앵커는 hoodKit.surfacePoint(base, azimuth, elevation)/muzzleAnchor(base) 사용
 * (플라밍고 눈 검증값 azimuth ±0.54, elevation 0.30 — SHELL_AP 콘 밖 유지).
 */
import * as THREE from 'three'
import { PALETTE } from '../../palette'
import type { AnimalBuildContext, AnimalCostumeRig } from './types'
import {
  buildHoodBase,
  muzzleAnchor,
  surfacePoint,
  toonMat,
  unlitMat,
  addOutline,
  unitSphereLo,
  type HoodColors,
} from './hoodKit'
import { buildAccessories, type AccessoryColors } from '../accessories'

/** 셸/안감 색 — 카탈로그 팔레트 계승 (owl.palette primary/shade + secondary) */
const COL: HoodColors = {
  shell: 0x8c6849, shellShade: 0x65482f,
  lining: 0xe8d5b8, liningShade: 0xc0a980,
}

/** 장식 색 (base↔shade는 명도 -15~20%p + hue 살짝 회전 — HOOD_COL 패턴) */
const DECOR = {
  ring: 0xf0b429, ringShade: 0xc98c14,   // 눈판 앰버 링 (팔레트 accent)
  pupil: 0x221a29,                        // 검정 동공 (플라밍고 pupil 계승)
  tuft: 0x74543a, tuftShade: 0x523a26,   // 귀깃 터프트 (셸보다 다크한 브라운)
  beak: 0xf0b429, beakShade: 0xc98c14,   // 미니 부리 앰버
} as const

/** 액세서리 색 — 과제 색표: 크림 베이스 / 다크브라운 스트라이프 / 앰버 라인·코드 */
const ACC: AccessoryColors = {
  bandBase: 0xe8d5b8, bandBaseShade: 0xc0a980,
  bandStripe: 0x74543a, bandStripeShade: 0x523a26,
  bandLine: 0xf0b429, bandLineShade: 0xc98c14,
  cord: 0xf0b429, cordShade: 0xc98c14,
  tip: 0x33261b, tipShade: 0x1f1610,
}

export function buildOwl(ctx: AnimalBuildContext): AnimalCostumeRig {
  const base = buildHoodBase(ctx.crownH, ctx.halfW, ctx.face, COL)
  base.pivot.name = 'owlHood'
  // VRM1 대응: 후드는 -Z 정면(VRM0 원공간)으로 저작 — index.ts fx 패턴과 동일
  if (ctx.S === -1) base.pivot.rotation.y = Math.PI
  const H = ctx.crownH

  // ---- 셸 눈 2개 — 플라밍고 눈판 기법, 부엉이답게 크고 동그랗게 ----
  // 앰버 링(뒤판) + 검정 동공 + 흰 하이라이트 대·소. 좌표는 검증값 ±0.54/0.30.
  // radial 0.955 인셋 (판정 P2: 기본 0.99에선 orbit에서 눈판이 셸 실루엣 밖으로
  // 떠 보였다 — 표면 오프셋을 절반 이하로 줄여 셸에 심긴 디스크로)
  const Re = H * 0.15
  for (const side of [-1, 1] as const) {
    const g = surfacePoint(base, side * 0.54, 0.30, 0.955)
    // 앰버 링 (동공 둘레로 넓게 피핑 → 부엉이 눈의 링)
    const ring = new THREE.Mesh(unitSphereLo(), toonMat(DECOR.ring, DECOR.ringShade))
    ring.scale.set(Re * 1.5, Re * 1.5, Re * 0.24)
    addOutline(ring, H * 0.022, PALETTE.nightPurple)
    g.add(ring)
    // 검정 동공 (원형 — 플라밍고보다 세로 비율 없이 동그랗게)
    const pupil = new THREE.Mesh(unitSphereLo(), unlitMat(DECOR.pupil))
    pupil.scale.set(Re * 1.02, Re * 1.02, Re * 0.30)
    pupil.position.z = Re * 0.05
    g.add(pupil)
    // 흰 하이라이트: 상단 대형 + 하단 보조 소형 (플라밍고 고정 배치 계승)
    const hiBig = new THREE.Mesh(unitSphereLo(), unlitMat(0xffffff))
    hiBig.scale.set(Re * 0.36, Re * 0.32, Re * 0.08)
    hiBig.position.set(Re * 0.26, Re * 0.38, Re * 0.34)
    const hiSmall = new THREE.Mesh(unitSphereLo(), unlitMat(0xffffff))
    hiSmall.scale.set(Re * 0.15, Re * 0.14, Re * 0.06)
    hiSmall.position.set(-Re * 0.22, -Re * 0.16, Re * 0.35)
    g.add(hiBig, hiSmall)
  }

  // ---- 귀깃 터프트×2 — 눈 위, 셸 상부에서 위-바깥으로 뻗는 작은 콘 ----
  for (const side of [-1, 1] as const) {
    const anchor = surfacePoint(base, side * 0.62, 1.02, 0.97)
    const tuft = new THREE.Mesh(
      new THREE.ConeGeometry(H * 0.15, H * 0.40, 10),
      toonMat(DECOR.tuft, DECOR.tuftShade),
    )
    // 콘 축(+Y)을 바깥(+Z) 쪽으로 눕히고 좌우 바깥으로 살짝 벌림
    tuft.rotation.set(0.9, 0, -side * 0.15)
    tuft.scale.set(1, 1, 0.7)
    tuft.position.set(0, H * 0.05, H * 0.02)
    addOutline(tuft, H * 0.022, PALETTE.nightPurple)
    anchor.add(tuft)
    base.hitMeshes.push(tuft)
  }

  // ---- 미니 부리 — 두 눈 사이, 림 위에서 아래로 향한 앰버 콘 ----
  // muzzleFollow 앵커의 rotation은 index.ts 스프링이 덮어쓴다 — 자식으로만 add,
  // 앵커는 position만 눈 사이 높이로 내린다 (elephant 패턴).
  const muzzleFollow = muzzleAnchor(base)
  muzzleFollow.position.set(0, base.C.y + base.ry * 0.37, base.C.z - base.rz * 0.90)
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(H * 0.105, H * 0.30, 12),
    toonMat(DECOR.beak, DECOR.beakShade),
  )
  beak.rotation.set(0.45, 0, Math.PI) // 꼭지 아래 + 앞으로 살짝 기울임
  beak.scale.set(1, 1, 0.75)
  beak.position.set(0, -H * 0.055, -H * 0.05)
  addOutline(beak, H * 0.018, PALETTE.nightPurple)
  muzzleFollow.add(beak)

  // ---- 액세서리 (손목밴드+드로스트링) — flamingo.ts 배선과 동일, 색만 owl ----
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
