/**
 * dog — 강아지(시바) 후드.
 *
 * 사용자 추가 요청 (v3.4). 고양이와 구분되는 실루엣을 위해:
 *  - 귀: 삼각이지만 앞으로 접힌 형태(끝이 아래로 꺾인 2단 원뿔) — 고양이의 곧은 삼각과 대비
 *  - 주둥이: 고양이보다 길고 굵으며 크림 머즐 + 검은 코
 *  - 눈 위 탄 포인트(시바 특유의 '눈썹' 마킹) 2개
 *  - 꼬리: 굵고 짧으며 강하게 말린다(curl/twist 최대 — 시바 말린 꼬리)
 * 색: 시바 레드 셸 + 크림 안감·머즐.
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

/** 셸/안감 — 시바 레드 + 크림 */
const COL: HoodColors = {
  shell: 0xc9793a, shellShade: 0x9a5526,
  lining: 0xf4e7d3, liningShade: 0xd0bfa4,
}

const DECOR = {
  cream: 0xf4e7d3, creamShade: 0xd0bfa4,
  tan: 0xe6b478, tanShade: 0xbd8a4f,
  nose: 0x27221f, noseShade: 0x14100f,
} as const

const ACC: AccessoryColors = {
  bandBase: 0xf4e7d3, bandBaseShade: 0xd0bfa4,
  bandStripe: 0xc9793a, bandStripeShade: 0x9a5526,
  bandLine: 0x8a5a34, bandLineShade: 0x5f3d22,
  cord: 0x8a5a34, cordShade: 0x5f3d22,
  tip: 0x27221f, tipShade: 0x14100f,
}

/** 귀 정지 자세 */
const EAR_TILT = 0.30

interface EarSway { sw: THREE.Group; fp: Follower; fy: Follower; side: -1 | 1 }

export function buildDog(ctx: AnimalBuildContext): AnimalCostumeRig {
  const base = buildHoodBase(ctx.crownH, ctx.halfW, ctx.face, COL)
  base.pivot.name = 'dogHood'
  if (ctx.S === -1) base.pivot.rotation.y = Math.PI
  const L = ctx.crownH

  // ---- 접힌 삼각 귀 ×2 (밑동 원뿔 + 앞으로 꺾인 끝) ----
  const ears: EarSway[] = []
  for (const side of [-1, 1] as const) {
    const anchor = surfacePoint(base, side * 0.86, 0.72, 0.97)
    const sw = new THREE.Group()
    sw.rotation.x = EAR_TILT
    anchor.add(sw)
    const R = 0.21 * L
    const root = new THREE.Mesh(
      new THREE.ConeGeometry(R * 0.95, R * 1.35, 12),
      toonMat(COL.shell, COL.shellShade),
    )
    root.position.y = R * 0.60
    addOutline(root, L * 0.026, PALETTE.nightPurple)
    // 접힌 끝 — 앞·아래로 꺾어 강아지 특유의 처진 귀끝
    const foldPivot = new THREE.Group()
    foldPivot.position.y = R * 1.12
    foldPivot.rotation.x = -0.95
    const foldTip = new THREE.Mesh(
      new THREE.ConeGeometry(R * 0.72, R * 1.05, 12),
      toonMat(COL.shell, COL.shellShade),
    )
    foldTip.position.y = R * 0.42
    addOutline(foldTip, L * 0.024, PALETTE.nightPurple)
    const inner = new THREE.Mesh(
      new THREE.ConeGeometry(R * 0.48, R * 0.85, 10),
      toonMat(DECOR.tan, DECOR.tanShade),
    )
    inner.position.set(0, R * 0.45, R * 0.26)
    foldPivot.add(foldTip)
    sw.add(root, inner, foldPivot)
    base.hitMeshes.push(root)
    ears.push({
      sw,
      fp: new Follower(side < 0 ? 60 : 66, 5.2, 0.35),
      fy: new Follower(side < 0 ? 54 : 58, 4.8, 0.35),
      side,
    })
  }

  // ---- 눈 위 탄 포인트 ×2 (시바 마킹) ----
  for (const side of [-1, 1] as const) {
    const anchor = surfacePoint(base, side * 0.42, 0.30, 0.99)
    const spot = new THREE.Mesh(
      egg(0.085 * L, 0.062 * L, 0.03 * L, 0),
      toonMat(DECOR.tan, DECOR.tanShade),
    )
    addOutline(spot, L * 0.012, PALETTE.nightPurple)
    anchor.add(spot)
  }

  // ---- 주둥이 (고양이보다 길고 굵은 크림 머즐) + 검은 코 ----
  const muzzleFollow = muzzleAnchor(base)
  const bump = new THREE.Mesh(
    egg(0.185 * L, 0.150 * L, 0.31 * L, -0.10),
    toonMat(DECOR.cream, DECOR.creamShade),
  )
  bump.position.set(0, -0.015 * L, -0.16 * L)
  bump.rotation.x = -0.28
  addOutline(bump, L * 0.024, PALETTE.nightPurple)
  muzzleFollow.add(bump)
  base.hitMeshes.push(bump)
  const nose = new THREE.Mesh(
    egg(0.078 * L, 0.058 * L, 0.052 * L, 0),
    toonMat(DECOR.nose, DECOR.noseShade),
  )
  nose.position.set(0, -0.012 * L, -0.405 * L)
  nose.rotation.x = -0.28
  addOutline(nose, L * 0.016, PALETTE.nightPurple)
  muzzleFollow.add(nose)

  // ---- 꼬리 (시바: 굵고 짧으며 강하게 말린다) ----
  const tail = buildTail(ctx.bones.hips ?? null, ctx.crownH, ctx.S, {
    base: DECOR.cream, baseShade: DECOR.creamShade,
    tip: COL.shell, tipShade: COL.shellShade,
    girth: 0.95, length: 1.05, amp: 1.0, curl: 0.40,
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
