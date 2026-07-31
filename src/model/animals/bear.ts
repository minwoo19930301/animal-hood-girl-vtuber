/**
 * bear — 곰 후드 (Pack v3 장식 완성).
 *
 * DESIGN-PACK-V3.md 계약 (전부 개구부 밖 셸 면 위):
 * - 셸/안감: 코코아/크림
 * - 장식: 둥근 귀(크림 이너 디스크)×2 상측방, 정수리~림 위 주둥이 범프(크림)+갈색 코
 * - 액세서리: 손목밴드+드로스트링 (bandBase #D9B896 / stripe #2F5D45 /
 *   line·cord #8D6142 / tip #33221A, 셰이드 -20%p)
 * - 2차 모션: 귀 = Follower 출렁임(anchor 안 sway 그룹 회전 — anchor 베이시스 보존),
 *   주둥이 = muzzleFollow 자식이라 index.ts 스프링이 공짜로 건다.
 * 앵커 좌표 검증: 귀 az ±0.62/el 0.88 (SHELL_AP 콘에서 θ≈1.23rad — 여유 큼),
 * 주둥이는 muzzleAnchor(상단 림 중앙, 플라밍고 beakPivot 좌표).
 */
import * as THREE from 'three'
import { PALETTE } from '../../palette'
import { egg } from '../geo'
import { Follower } from '../springs'
import { buildAccessories, type AccessoryColors } from '../accessories'
import type { AnimalBuildContext, AnimalCostumeRig } from './types'
import {
  buildHoodBase, muzzleAnchor, surfacePoint,
  toonMat, addOutline, unitSphereLo,
  type HoodColors,
} from './hoodKit'

/** 셸/안감 색 — 카탈로그 팔레트 계승 (bear.palette primary/shade + secondary) */
const COL: HoodColors = {
  shell: 0x8d6142, shellShade: 0x65402d,
  lining: 0xd9b896, liningShade: 0xb08d68,
}

/** 장식 색 — 크림은 안감과 동일 페어(통일감), 코는 딥 브라운 (#6B4830 계열) */
const DECOR = {
  cream: 0xd9b896, creamShade: 0xb08d68,
  nose: 0x6b4830, noseShade: 0x4a2f1e,
} as const

/** 액세서리 색 (과제 색표) — 셰이드는 명도 -20%p + 미세 hue-shift */
const ACC: AccessoryColors = {
  bandBase: 0xd9b896, bandBaseShade: 0xb08d68,
  bandStripe: 0x2f5d45, bandStripeShade: 0x1e4230,
  bandLine: 0x8d6142, bandLineShade: 0x65402d,
  cord: 0x8d6142, cordShade: 0x65402d,
  tip: 0x33221a, tipShade: 0x1f1410,
}

/** 귀 정지 자세: 방사(+Z)에서 정면 쪽으로 젖히는 틸트 — 정면에서 원판으로 읽힘 */
const EAR_TILT = 0.38

interface EarSway { sw: THREE.Group; fp: Follower; fy: Follower; side: -1 | 1 }

export function buildBear(ctx: AnimalBuildContext): AnimalCostumeRig {
  const base = buildHoodBase(ctx.crownH, ctx.halfW, ctx.face, COL)
  base.pivot.name = 'bearHood'
  // VRM1 대응: 후드는 -Z 정면(VRM0 원공간)으로 저작 — index.ts fx 패턴과 동일
  if (ctx.S === -1) base.pivot.rotation.y = Math.PI
  const L = ctx.crownH

  // ---- 둥근 귀 ×2 (상측방, 크림 이너 디스크) ----
  const ears: EarSway[] = []
  for (const side of [-1, 1] as const) {
    const anchor = surfacePoint(base, side * 0.80, 0.78, 0.97)
    // 출렁임은 anchor가 아니라 내부 sway 그룹 회전으로 — anchor 베이시스 보존
    const sw = new THREE.Group()
    sw.rotation.x = EAR_TILT
    anchor.add(sw)
    const R = 0.26 * L
    const outer = new THREE.Mesh(unitSphereLo(), toonMat(COL.shell, COL.shellShade))
    outer.scale.set(R, R, R * 0.55)
    outer.position.z = R * 0.18
    addOutline(outer, L * 0.026, PALETTE.nightPurple)
    const inner = new THREE.Mesh(unitSphereLo(), toonMat(DECOR.cream, DECOR.creamShade))
    inner.scale.set(R * 0.52, R * 0.52, R * 0.14)
    inner.position.z = R * 0.18 + R * 0.48
    sw.add(outer, inner)
    base.hitMeshes.push(outer)
    // 좌우 스프링 상수 미세 비대칭 (드로스트링 패턴) — 결정적, Math.random 금지
    ears.push({
      sw,
      fp: new Follower(side < 0 ? 64 : 70, 5.4, 0.35),
      fy: new Follower(side < 0 ? 56 : 60, 5.0, 0.35),
      side,
    })
  }

  // ---- 주둥이 범프 (정수리~림 위, 크림) + 갈색 코 — muzzleFollow 자식 ----
  // index.ts 스프링이 muzzleFollow.rotation을 매 프레임 덮어쓴다 — 자식 add만, 회전 세팅 금지
  const muzzleFollow = muzzleAnchor(base)
  // v3.2: 이전 치수(0.26 x 0.20 x 0.22, z -0.08)는 정면에서 이마에 얹힌 크림 '원판'으로
  // 읽혔다(사용자 지적). 좌우·상하를 줄이고 앞으로 길게 뽑아 측면 프로필에서 스누트로,
  // 정면에서는 작게 보이게 한다.
  const bump = new THREE.Mesh(
    egg(0.175 * L, 0.135 * L, 0.30 * L, -0.10),
    toonMat(DECOR.cream, DECOR.creamShade),
  )
  bump.position.set(0, -0.01 * L, -0.16 * L)
  bump.rotation.x = -0.30 // 긴 축을 셸 경사면에 눕혀 앞으로 뻗는 스누트
  addOutline(bump, L * 0.024, PALETTE.nightPurple)
  muzzleFollow.add(bump)
  base.hitMeshes.push(bump)
  const nose = new THREE.Mesh(
    egg(0.072 * L, 0.055 * L, 0.05 * L, 0),
    toonMat(DECOR.nose, DECOR.noseShade),
  )
  nose.position.set(0, -0.012 * L, -0.395 * L) // 길어진 스누트 팁 (얼굴 개구부 위)
  nose.rotation.x = -0.35 // 스누트 경사면과 정렬
  addOutline(nose, L * 0.016, PALETTE.nightPurple)
  muzzleFollow.add(nose)

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
    update: (pitchS, yaw, breath, dt) => {
      acc.sway(pitchS, yaw, breath, dt)
      for (const e of ears) {
        const p = e.fp.step(pitchS, dt)
        const y = e.fy.step(yaw, dt)
        e.sw.rotation.x = EAR_TILT + p * 0.45 + e.side * y * 0.18
      }
    },
  }
}
