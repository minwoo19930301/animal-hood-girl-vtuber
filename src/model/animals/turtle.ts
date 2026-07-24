/**
 * turtle — 거북이 후드 (Pack v3: 셸+안감 + 등껍질 장식 + 액세서리).
 *
 * DESIGN-PACK-V3.md 장식 계약 (전부 개구부 밖 셸 면 위):
 * - 셸/안감: 모스그린/크림
 * - 장식: 셸 위 다크그린 육각 플레이트 디스크들(납작 디스크 7개, 후상부 중심),
 *   뒤통수 하단 작은 꼬리 놉. 전부 azimuth ≈ π(후면) 근방 — SHELL_AP 콘(정면
 *   반각 ax 0.98/ayUp 0.52) 반대편이라 개구부 침범 없음.
 * - 액세서리: 손목밴드+드로스트링 (bandBase 크림 / stripe·cord 틸 / tip 다크그린)
 */
import * as THREE from 'three'
import { PALETTE } from '../../palette'
import type { AnimalBuildContext, AnimalCostumeRig } from './types'
import {
  buildHoodBase, muzzleAnchor, surfacePoint, toonMat, addOutline, taperedTube,
  type HoodColors,
} from './hoodKit'
import { buildAccessories, type AccessoryColors } from '../accessories'

/** 셸/안감 색 — 카탈로그 팔레트 계승 (turtle.palette primary/shade + secondary) */
const COL: HoodColors = {
  shell: 0x7fb069, shellShade: 0x4f7c48,
  lining: 0xdcebc4, liningShade: 0xafc590,
}

/** 육각 플레이트 다크그린 — 모스그린 셸 위에서 등껍질 패턴으로 읽히는 딥 리프 그린 */
const PLATE = { base: 0x4c7038, shade: 0x30491f } as const

/** 액세서리 색 (과제 색표) — 셰이드는 명도 -18~22%p + hue 미세 회전 */
const ACC: AccessoryColors = {
  bandBase: 0xdcebc4, bandBaseShade: 0xafc590,
  bandStripe: 0x2e7d74, bandStripeShade: 0x1f554f,
  bandLine: 0x2e8c81, bandLineShade: 0x20625a,
  cord: 0x2e8c81, cordShade: 0x20625a,
  tip: 0x31431f, tipShade: 0x202c14,
}

/**
 * 등껍질 육각 플레이트 배치 (azimuth: 정면 -Z 기준, 후면 = π / elevation: 상향 rad).
 * 중심판 1 + 둘레 6 로제트 — 후상부(뒤통수 위쪽) 중심, 전부 개구부 콘 반대편.
 * roll: 육각형 자체 회전(결정적 고정값) — 타일이 기계적으로 정렬돼 보이지 않게.
 * s: 판 크기 계수 (중심판이 가장 크다 — 실제 배갑 패턴).
 */
const PLATES: ReadonlyArray<{ az: number; el: number; roll: number; s: number }> = [
  { az: Math.PI, el: 0.50, roll: 0.00, s: 1.00 },        // 중심판
  { az: Math.PI, el: 1.05, roll: 0.32, s: 0.84 },        // 정수리 쪽
  { az: Math.PI, el: -0.06, roll: 0.18, s: 0.94 },       // 하단(목덜미 위)
  { az: Math.PI - 0.75, el: 0.80, roll: 0.45, s: 0.82 }, // 상부 좌우
  { az: Math.PI + 0.75, el: 0.80, roll: 0.12, s: 0.82 },
  { az: Math.PI - 0.72, el: 0.18, roll: 0.28, s: 0.92 }, // 하부 좌우
  { az: Math.PI + 0.72, el: 0.18, roll: 0.52, s: 0.92 },
]

export function buildTurtle(ctx: AnimalBuildContext): AnimalCostumeRig {
  const base = buildHoodBase(ctx.crownH, ctx.halfW, ctx.face, COL)
  base.pivot.name = 'turtleHood'
  // VRM1 대응: 후드는 -Z 정면(VRM0 원공간)으로 저작 — index.ts fx 패턴과 동일
  if (ctx.S === -1) base.pivot.rotation.y = Math.PI
  const L = ctx.crownH

  // ---- 등껍질 육각 플레이트 (납작 6각 실린더 디스크, 셸 면 위 타일) ----
  const plateMat = toonMat(PLATE.base, PLATE.shade)
  for (const p of PLATES) {
    const anchor = surfacePoint(base, p.az, p.el, 1.0)
    const r = L * 0.26 * p.s
    const h = L * 0.05
    // 윗면이 살짝 좁은 테이퍼(베벨 느낌). 회전 순서(XYZ): Ry(roll) 먼저 → 육각 자전,
    // 그다음 Rx(π/2) → 실린더 축(+Y)을 앵커 +Z(바깥 방사 방향)로.
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r, h, 6), plateMat)
    plate.rotation.set(Math.PI / 2, p.roll, 0)
    plate.position.z = h * 0.15 // 반쯤 돌출 — 곡면이라 가장자리는 표면에 잠긴다
    addOutline(plate, L * 0.018, PALETTE.nightPurple)
    anchor.add(plate)
  }

  // ---- 꼬리 놉 (뒤통수 하단, 뒤·아래로 살짝 처지는 뭉툭한 테이퍼 튜브) ----
  const tailAnchor = surfacePoint(base, Math.PI, -0.48, 0.97)
  const tail = new THREE.Mesh(
    taperedTube(
      [
        new THREE.Vector3(0, 0.02 * L, -0.08 * L), // 셸 안쪽 밑동 (심 은폐)
        new THREE.Vector3(0, -0.03 * L, 0.12 * L),
        new THREE.Vector3(0, -0.09 * L, 0.20 * L), // 끝: 바깥(+Z)·아래로 훅
      ],
      [0.11 * L, 0.075 * L, 0.026 * L],
    ),
    toonMat(COL.shell, COL.shellShade),
  )
  addOutline(tail, L * 0.016, PALETTE.nightPurple)
  tailAnchor.add(tail)

  // ---- 액세서리 (손목밴드+드로스트링) — flamingo.ts와 동일 배선, 색만 오버라이드 ----
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

  // muzzleFollow: 상단 림 중앙 앵커 — 거북이는 주둥이 장식 없음(빈 앵커 유지,
  // index.ts 스프링이 rotation을 덮어써도 자식이 없어 무해)
  const muzzleFollow = muzzleAnchor(base)
  return {
    headRoot: base.pivot,
    headFollow: base.shellPivot,
    muzzleFollow,
    hitMeshes: base.hitMeshes,
    update: (pitchS, yaw, breath, dt) => acc.sway(pitchS, yaw, breath, dt),
  }
}
