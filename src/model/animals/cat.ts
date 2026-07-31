/**
 * cat — 고양이 후드.
 *
 * 사자 대체 (v3.4): 사자 갈기는 세 방식 모두 실패했다 — 페탈 방사는 해바라기,
 * 겹치는 블롭은 거품, 분절 가닥 다발은 촉수로 읽혔다. 후드 셸 밖으로 뻗는 절차적
 * 파츠로는 '얼굴을 감싼 긴 털 덩어리'를 만들 수 없다고 판단해 동물을 교체했다.
 * 고양이 특징은 검증된 부품 조합으로 만든다: 삼각 귀(원뿔) + 핑크 이너 + 수염 3쌍 +
 * 짧은 스누트 + 얇고 긴 꼬리(끝 살짝 컬).
 */
import * as THREE from 'three'
import { PALETTE } from '../../palette'
import { egg } from '../geo'
import { Follower } from '../springs'
import { buildAccessories, type AccessoryColors } from '../accessories'
import { buildTail } from '../bodyParts'
import type { AnimalBuildContext, AnimalCostumeRig } from './types'
import {
  buildHoodBase, muzzleAnchor, surfacePoint,
  toonMat, addOutline, unitSphereLo,
  type HoodColors,
} from './hoodKit'

/** 셸/안감 — 차콜 그레이 셸 + 크림 안감 (카탈로그 cat 팔레트와 페어) */
const COL: HoodColors = {
  shell: 0x6f7480, shellShade: 0x4a4f59,
  lining: 0xe8e2d5, liningShade: 0xc2bbac,
}

/** 장식 색 — 코는 차콜 블랙, 핑크는 귀 이너, 크림은 안감과 동일 페어 */
const DECOR = {
  cream: 0xe8e2d5, creamShade: 0xc2bbac,
  pink: 0xe9a7ad, pinkShade: 0xc2777f,
  nose: 0x2a2b31, noseShade: 0x14151a,
} as const

const ACC: AccessoryColors = {
  bandBase: 0xe8e2d5, bandBaseShade: 0xc2bbac,
  bandStripe: 0x2a2b31, bandStripeShade: 0x171820,
  bandLine: 0x6f7480, bandLineShade: 0x4a4f59,
  cord: 0x6f7480, cordShade: 0x4a4f59,
  tip: 0x2a2b31, tipShade: 0x14151a,
}

/** 귀 정지 자세: 방사(+Z)에서 정면 쪽으로 젖히는 틸트 */
const EAR_TILT = 0.34

interface EarSway { sw: THREE.Group; fp: Follower; fy: Follower; side: -1 | 1 }

export function buildCat(ctx: AnimalBuildContext): AnimalCostumeRig {
  const base = buildHoodBase(ctx.crownH, ctx.halfW, ctx.face, COL)
  base.pivot.name = 'catHood'
  if (ctx.S === -1) base.pivot.rotation.y = Math.PI
  const L = ctx.crownH

  // ---- 둥근 귀 ×2 (bear 레시피 — 크림 이너 디스크, 고양이은 조금 작고 더 벌어짐) ----
  const ears: EarSway[] = []
  for (const side of [-1, 1] as const) {
    const anchor = surfacePoint(base, side * 0.92, 0.74, 0.97)
    const sw = new THREE.Group()
    sw.rotation.x = EAR_TILT
    anchor.add(sw)
    // 삼각 귀: 원뿔을 셸 바깥으로 세운다 (고양이 실루엣의 핵심)
    const R = 0.20 * L
    const outer = new THREE.Mesh(
      new THREE.ConeGeometry(R * 0.92, R * 2.05, 12),
      toonMat(COL.shell, COL.shellShade),
    )
    outer.position.y = R * 0.85
    addOutline(outer, L * 0.026, PALETTE.nightPurple)
    const inner = new THREE.Mesh(
      new THREE.ConeGeometry(R * 0.55, R * 1.35, 10),
      toonMat(DECOR.pink, DECOR.pinkShade),
    )
    inner.position.set(0, R * 0.70, R * 0.30)
    sw.add(outer, inner)
    base.hitMeshes.push(outer)
    ears.push({
      sw,
      fp: new Follower(side < 0 ? 64 : 70, 5.4, 0.35),
      fy: new Follower(side < 0 ? 56 : 60, 5.0, 0.35),
      side,
    })
  }

  // ---- 수염 ×3쌍 (셸 면 위 얇은 캡슐 — 개구부 밖에서 바깥으로 뻗는다) ----
  for (const side of [-1, 1] as const) {
    const anchor = surfacePoint(base, side * 0.62, 0.06, 0.99)
    for (let k = 0; k < 3; k++) {
      const whisker = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.008 * L, 0.34 * L, 3, 6),
        toonMat(DECOR.cream, DECOR.creamShade),
      )
      whisker.rotation.z = Math.PI / 2 + side * (0.16 - k * 0.16)
      whisker.position.set(side * 0.17 * L, (k - 1) * 0.055 * L, 0.01 * L)
      addOutline(whisker, L * 0.006, PALETTE.nightPurple)
      anchor.add(whisker)
    }
  }

  // ---- 주둥이 (짧고 앞으로 뻗는 스누트) + 검은 코 ----
  const muzzleFollow = muzzleAnchor(base)
  const bump = new THREE.Mesh(
    egg(0.155 * L, 0.125 * L, 0.26 * L, -0.10),
    toonMat(DECOR.cream, DECOR.creamShade),
  )
  bump.position.set(0, -0.01 * L, -0.14 * L)
  bump.rotation.x = -0.30
  addOutline(bump, L * 0.024, PALETTE.nightPurple)
  muzzleFollow.add(bump)
  base.hitMeshes.push(bump)
  const nose = new THREE.Mesh(
    egg(0.068 * L, 0.052 * L, 0.048 * L, 0),
    toonMat(DECOR.nose, DECOR.noseShade),
  )
  nose.position.set(0, -0.012 * L, -0.345 * L)
  nose.rotation.x = -0.30
  addOutline(nose, L * 0.016, PALETTE.nightPurple)
  muzzleFollow.add(nose)

  // ---- 꼬리 (고양이: 얇고 길며 끝이 살짝 말린다) ----
  const tail = buildTail(ctx.bones.hips ?? null, ctx.crownH, ctx.S, {
    base: COL.shell, baseShade: COL.shellShade,
    tip: DECOR.cream, tipShade: DECOR.creamShade,
    girth: 0.52, length: 1.55, amp: 1.2, curl: 0.08,
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
    update: (pitchS, yaw, breath, dt) => {
      acc.sway(pitchS, yaw, breath, dt)
      tail?.sway(pitchS, yaw, breath, dt)
      for (const e of ears) {
        const p = e.fp.step(pitchS, dt)
        const y = e.fy.step(yaw, dt)
        e.sw.rotation.x = EAR_TILT + p * 0.45 + e.side * y * 0.18
      }
    },
  }
}
