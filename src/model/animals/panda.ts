/**
 * panda — 판다 후드 (Pack v3 장식 완성).
 *
 * DESIGN-PACK-V3.md 계약 (전부 개구부 밖 셸 면 위):
 * - 셸/안감: 화이트/블랙 림
 * - 장식: 검정 반구 귀×2 (상측방), 셸 위 검정 눈물방울 아이패치×2
 *   (플라밍고 눈 검증 좌표 az ±0.54/el 0.30 — SHELL_AP 콘 밖) + 흰 눈동자 점
 * - 액세서리: 손목밴드+드로스트링 (bandBase #F7F4EF / stripe #2E2B2C /
 *   line·cord #C63838(레드) / tip #2E2B2C, 셰이드 -20%p)
 * 아이패치는 눈물방울 팁이 위-바깥을 향한다 — 아래-안쪽은 개구부 방향이라
 * 어떤 장식도 드리우면 P0 (필수 함정 1).
 */
import * as THREE from 'three'
import { PALETTE } from '../../palette'
import { teardrop } from '../geo'
import { buildAccessories, type AccessoryColors } from '../accessories'
import type { AnimalBuildContext, AnimalCostumeRig } from './types'
import {
  buildHoodBase, muzzleAnchor, surfacePoint,
  toonMat, unlitMat, addOutline, unitSphereLo,
  type HoodColors,
} from './hoodKit'

/** 셸/안감 색 — 카탈로그 팔레트 계승 (panda.palette primary/shade + accent(블랙)) */
const COL: HoodColors = {
  shell: 0xf7f4ef, shellShade: 0xd6d1cb,
  lining: 0x2e2b2c, liningShade: 0x1b191a,
}

/** 잉크 블랙 페어 (귀·아이패치 공용 — 안감과 동일해 톤 통일) */
const INK = 0x2e2b2c
const INK_SHADE = 0x1b191a

/** 액세서리 색 (과제 색표) — 레드 코드가 시그니처 포인트 */
const ACC: AccessoryColors = {
  bandBase: 0xf7f4ef, bandBaseShade: 0xd6d1cb,
  bandStripe: 0x2e2b2c, bandStripeShade: 0x1b191a,
  bandLine: 0xc63838, bandLineShade: 0x9d2a2a,
  cord: 0xc63838, cordShade: 0x9d2a2a,
  tip: 0x2e2b2c, tipShade: 0x1b191a,
}

export function buildPanda(ctx: AnimalBuildContext): AnimalCostumeRig {
  const base = buildHoodBase(ctx.crownH, ctx.halfW, ctx.face, COL)
  base.pivot.name = 'pandaHood'
  // VRM1 대응: 후드는 -Z 정면(VRM0 원공간)으로 저작 — index.ts fx 패턴과 동일
  if (ctx.S === -1) base.pivot.rotation.y = Math.PI
  const L = ctx.crownH

  // ---- 검정 반구 귀 ×2 (상측방, 화이트 셸 위 아이코닉 실루엣) ----
  for (const side of [-1, 1] as const) {
    const anchor = surfacePoint(base, side * 0.66, 0.92, 0.97)
    const R = 0.28 * L
    const ear = new THREE.Mesh(unitSphereLo(), toonMat(INK, INK_SHADE))
    ear.scale.set(R, R, R * 0.62)
    ear.position.z = R * 0.15
    ear.rotation.x = 0.30 // 방사(+Z)에서 정면 쪽으로 살짝 젖혀 정면 실루엣 확보
    addOutline(ear, L * 0.026, PALETTE.nightPurple)
    anchor.add(ear)
    base.hitMeshes.push(ear)
  }

  // ---- 검정 눈물방울 아이패치 ×2 + 흰 눈동자 점 (개구부 콘 밖 셸 면) ----
  for (const side of [-1, 1] as const) {
    const anchor = surfacePoint(base, side * 0.54, 0.34, 0.985)
    // teardrop: 밑동(통통) y=0, 팁 y=len — 팁이 위-바깥을 향하게 z-틸트.
    // 아래-안쪽은 개구부라 팁을 그쪽으로 내리면 얼굴 위로 드리운다 (P0 금지).
    // 앵커 로컬 +X는 월드 캐릭터-왼쪽 고정(makeBasis) — 바깥 = -side·X̂ 이므로
    // (0,1)·R(δ)의 x성분 -sinδ = -side·k 가 되려면 δ = +side·틸트.
    const patch = new THREE.Mesh(teardrop(0.30 * L, 0.19 * L, 0.30), toonMat(INK, INK_SHADE))
    patch.rotation.z = side * 0.45
    patch.position.y = -0.05 * L // 통통한 몸통 중심이 검증 눈좌표 근처에 오도록
    anchor.add(patch)
    // 흰 눈동자 점 — 패치 통통한 부분 위 (unlit 플랫, 플라밍고 하이라이트 패턴)
    const pupil = new THREE.Mesh(unitSphereLo(), unlitMat(0xffffff))
    pupil.scale.set(0.050 * L, 0.058 * L, 0.020 * L)
    pupil.position.set(-side * 0.035 * L, 0.035 * L, 0.055 * L)
    anchor.add(pupil)
  }

  // muzzleFollow: 판다는 주둥이 장식 없음 — 빈 앵커 유지 (계약 준수)
  const muzzleFollow = muzzleAnchor(base)

  // ---- 액세서리 (손목밴드+드로스트링) — flamingo.ts 배선과 동일 ----
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
