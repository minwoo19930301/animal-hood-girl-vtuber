/**
 * fox — 여우 후드 (Pack v3).
 *
 * DESIGN-PACK-V3.md 장식 계약 (전부 개구부 밖 셸 면 위):
 * - 셸/안감: 러스트/크림
 * - 장식: 삼각 귀(크림 이너+다크 팁)×2, 눈썹 위 셸 면에 흰 브로우 터프트×2
 * - 액세서리: 손목밴드+드로스트링 (bandBase 크림 / stripe 러스트딥 / line·cord 러스트 / tip 다크)
 *
 * 귀는 beakPivot 패턴(shellPivot 좌표 직접 배치) — 셸 상부 와이드
 * (azimuth ±0.70, elevation 0.80, θP≈1.20 » θB≈0.54 콘 밖).
 * 브로우 터프트는 surfacePoint 앵커 (azimuth ±0.30, elevation 0.58, θP≈0.82 콘 밖).
 */
import * as THREE from 'three'
import { PALETTE } from '../../palette'
import { buildAccessories, type AccessoryColors } from '../accessories'
import type { AnimalBuildContext, AnimalCostumeRig } from './types'
import {
  buildHoodBase, muzzleAnchor, surfacePoint, toonMat, addOutline, mergeShapes,
  type HoodBase, type HoodColors,
} from './hoodKit'
import { teardrop } from '../geo'

/** 셸/안감 색 — 카탈로그 팔레트 계승 (fox.palette accent(러스트) + secondary) */
const COL: HoodColors = {
  shell: 0xc9622b, shellShade: 0x94451e,
  lining: 0xfff4e3, liningShade: 0xdccbb0,
}

/** 귀 팁/터프트 색 (팁은 액세서리 tip과 공유 — fox.palette dark) */
const EAR_TIP = 0x3b2a20
const EAR_TIP_SHADE = 0x251a13
const TUFT = 0xfffdf8
const TUFT_SHADE = 0xe0d7c6

/** 액세서리 색 — bandBase 크림/스트라이프 러스트딥/라인·코드 러스트/팁 다크 (셰이드 -20%p 계열) */
const ACC: AccessoryColors = {
  bandBase: 0xf7ebd3, bandBaseShade: 0xd6c4a4,
  bandStripe: 0xb5502a, bandStripeShade: 0x86381d,
  bandLine: 0xc9622b, bandLineShade: 0x7f3a19,
  cord: 0xc9622b, cordShade: 0x7f3a19,
  tip: EAR_TIP, tipShade: EAR_TIP_SHADE,
}

/**
 * 삼각 귀 한 짝: 납작 콘(러스트) + 앞면 크림 이너 플라크 + 다크 팁 콘.
 * 이너/팁은 메인 콘 표면을 살짝 덮는 오버랩 배치 (심 은폐 — hood.ts beakTip 패턴).
 */
function buildEar(base: HoodBase, side: -1 | 1, crownH: number): void {
  const L = crownH
  const pivot = new THREE.Group()
  pivot.name = side < 0 ? 'foxEarL' : 'foxEarR'
  const a = side * 0.70
  const e = 0.80
  pivot.position.set(
    base.C.x + Math.sin(a) * Math.cos(e) * base.rx * 0.93,
    base.C.y + Math.sin(e) * base.ry * 0.93,
    base.C.z - Math.cos(a) * Math.cos(e) * base.rz * 0.93,
  )
  // 위끝이 바깥으로 벌어지고 살짝 뒤로 젖힌 키구루미 귀
  pivot.rotation.set(0.10, 0, -side * 0.30)

  const earR = 0.30 * L   // 밑변 반폭
  const earH = 0.62 * L   // 높이
  const baseY = -0.10 * L // 밑변을 셸에 살짝 파묻는다

  // 메인 콘 (러스트, 앞뒤 납작)
  const main = new THREE.Mesh(new THREE.ConeGeometry(earR, earH, 24), toonMat(COL.shell, COL.shellShade))
  main.scale.set(1, 1, 0.45)
  main.position.y = baseY + earH * 0.5
  addOutline(main, crownH * 0.022, PALETTE.nightPurple)
  pivot.add(main)
  base.hitMeshes.push(main)

  // 다크 팁: 꼭짓점을 공유하는 살짝 큰 콘 → 상단 42%를 덮는다
  const tipH = earH * 0.42
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(earR * 0.46, tipH, 24),
    toonMat(EAR_TIP, EAR_TIP_SHADE),
  )
  tip.scale.set(1, 1, 0.47)
  tip.position.y = baseY + earH - tipH * 0.5 + 0.01 * L
  pivot.add(tip)

  // 크림 이너: 앞면 경사(slope≈0.218)에 평행하게 기울인 납작 콘 플라크,
  // 메인 콘 전면에서 균일 ~0.017L 돌출. 높이 밴드는 돔 교차선(~0.10L, 이 아래는
  // 콘이 돔에 파묻혀 플라크가 돔 밖으로 새어 보인다 — 디버그로 실측)과
  // 다크 팁 하단(0.26L) 사이로 한정.
  const inner = new THREE.Mesh(
    new THREE.ConeGeometry(earR * 0.52, earH * 0.21, 24),
    toonMat(COL.lining, COL.liningShade),
  )
  inner.scale.set(1, 1, 0.16)
  inner.rotation.x = 0.22
  inner.position.set(0, baseY + earH * 0.47, -0.072 * L)
  pivot.add(inner)

  base.shellPivot.add(pivot)
}

/**
 * 흰 브로우 터프트 한 짝: 눈썹 위쪽 셸 면(개구부 콘 밖)에 작은 털 뭉치 —
 * teardrop 3가닥을 위-바깥 방향 부채꼴로 병합해 1메시.
 */
function buildBrowTuft(base: HoodBase, side: -1 | 1, crownH: number): void {
  const L = crownH
  const anchor = surfacePoint(base, side * 0.36, 0.56, 0.985)
  // surfacePoint 로컬 +X는 항상 월드 -X(캐릭터-왼쪽) — hood.ts 눈물점(-side*x) 선례.
  // 캐릭터-바깥 방향의 로컬 x 부호는 -side.
  const out = -side
  const lobes = ([-1, 0, 1] as const).map((k) =>
    teardrop((0.15 + (1 - Math.abs(k)) * 0.06) * L, 0.085 * L, 0.6))
  const geo = mergeShapes(
    ([-1, 0, 1] as const).map((k, i) => ({
      g: lobes[i],
      // 가닥끼리 겹치게 좁은 간격 → 개별 꽃잎이 아니라 한 덩어리 털 뭉치로 읽힘
      p: [out * k * 0.048 * L, -0.03 * L, k * 0.004 * L] as [number, number, number],
      // 표면에서 살짝만 들리고(x축 0.30) 위-바깥으로 벌어지는 부채꼴
      // (z축 회전: 안쪽 가닥 거의 수직 → 바깥 가닥 크게 눕는다)
      r: [0.30, 0, -out * (0.25 + k * 0.45)] as [number, number, number],
    })),
  )
  lobes.forEach((g) => g.dispose())
  const tuft = new THREE.Mesh(geo, toonMat(TUFT, TUFT_SHADE))
  addOutline(tuft, crownH * 0.014, PALETTE.nightPurple)
  anchor.add(tuft)
}

export function buildFox(ctx: AnimalBuildContext): AnimalCostumeRig {
  const base = buildHoodBase(ctx.crownH, ctx.halfW, ctx.face, COL)
  base.pivot.name = 'foxHood'
  // VRM1 대응: 후드는 -Z 정면(VRM0 원공간)으로 저작 — index.ts fx 패턴과 동일
  if (ctx.S === -1) base.pivot.rotation.y = Math.PI

  // ---- 삼각 귀 ×2 + 브로우 터프트 ×2 ----
  for (const side of [-1, 1] as const) {
    buildEar(base, side, ctx.crownH)
    buildBrowTuft(base, side, ctx.crownH)
  }

  // muzzleFollow: 상단 림 중앙 앵커 — 여우는 주둥이 장식 없음 (빈 Group 유지)
  const muzzleFollow = muzzleAnchor(base)

  // ---- 액세서리: 손목밴드+드로스트링 (flamingo.ts 배선 패턴) ----
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
