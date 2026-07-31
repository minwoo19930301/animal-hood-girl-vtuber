/**
 * monkey — 원숭이 후드 (Pack v3: 셸+안감 + 장식 + 액세서리).
 *
 * DESIGN-PACK-V3.md 장식 계약 (전부 개구부 밖 셸 면 위):
 * - 셸/안감: 브라운/탠
 * - 장식: 둥근 귀(탠 이너 디스크)×2 — 원숭이답게 큼직하게, 측면 낮은 위치.
 *   림 위 탠 이마 패치(하트형 실루엣) — 로브 디스크 2개 + 뒤집은 teardrop 꼭지.
 *   패치는 **개구부 림 위 셸 면에만** (surfacePoint elevation 0.60 — 림 상단
 *   elevation ≈ ayUp−TILT = 0.30 위로 충분한 마진, 얼굴 침범 금지가 P0).
 * 앵커는 hoodKit.surfacePoint(base, azimuth, elevation)/muzzleAnchor(base) 사용
 * (플라밍고 눈 검증값 azimuth ±0.54, elevation 0.30 — SHELL_AP 콘 밖 유지).
 */
import * as THREE from 'three'
import { PALETTE } from '../../palette'
import { teardrop } from '../geo'
import { buildShorts, buildTail } from '../bodyParts'
import { buildAccessories, type AccessoryColors } from '../accessories'
import type { AnimalBuildContext, AnimalCostumeRig } from './types'
import {
  buildHoodBase, muzzleAnchor, surfacePoint,
  toonMat, addOutline, unitSphereLo,
  type HoodBase, type HoodColors,
} from './hoodKit'

/** 셸/안감 색 — 카탈로그 팔레트 계승 (monkey.palette primary/shade + secondary) */
const COL: HoodColors = {
  shell: 0xa9764c, shellShade: 0x7a4a2e,
  lining: 0xf1d9be, liningShade: 0xc9a87e,
}

/** 액세서리 색 (과제 색표) — 셰이드는 명도 -18~22%p (다크 색은 코드베이스 관례 소폭) */
const ACC: AccessoryColors = {
  bandBase: 0xf1d9be, bandBaseShade: 0xc9a87e,   // 탠 (안감 페어 재사용)
  bandStripe: 0x8a5a34, bandStripeShade: 0x5e3a1f, // 브라운 트림
  bandLine: 0x6d2338, bandLineShade: 0x4a1626,   // 버건디 핀라인
  cord: 0x6d2338, cordShade: 0x4a1626,           // 버건디 드로스트링
  tip: 0x3b2a1c, tipShade: 0x241811,             // 다크 브라운 팁
}

/**
 * 둥근 귀 1개: 셸색 디스크(납작 구) + 탠 이너 디스크. 측면 낮은 위치
 * (azimuth ±1.34, elevation 0.12 — SHELL_AP 콘 경계 ~0.98에서 충분히 밖).
 * 디스크 면은 정면 쪽으로 살짝 틀어(3/4 각) 정면·측면 모두에서 원으로 읽힌다.
 * 뒷반구가 셸에 파묻혀 이음새가 없다 (앵커 = 표면 살짝 안쪽).
 */
function buildEar(base: HoodBase, crownH: number, side: -1 | 1): void {
  const s = crownH
  const R = 0.285 * s // 원숭이답게 큼직하게
  const anchor = surfacePoint(base, side * 1.34, 0.12, 0.97)
  const pivot = new THREE.Group()
  // 앵커 로컬 +Z=바깥 — side 부호로 디스크 노멀을 정면 쪽으로 트위스트
  pivot.rotation.y = side * 0.62
  anchor.add(pivot)
  const outer = new THREE.Mesh(unitSphereLo(), toonMat(COL.shell, COL.shellShade))
  outer.scale.set(R, R * 1.04, R * 0.34)
  outer.position.z = R * 0.06
  addOutline(outer, s * 0.026, PALETTE.nightPurple) // scale 확정 후 호출
  const inner = new THREE.Mesh(unitSphereLo(), toonMat(COL.lining, COL.liningShade))
  inner.scale.set(R * 0.60, R * 0.64, R * 0.20)
  inner.position.z = R * 0.28 // 디스크 앞면 위 탠 이너
  pivot.add(outer, inner)
  base.hitMeshes.push(outer) // 대형 장식 클릭 히트
}

/**
 * 이마 하트 패치 (탠): 로브 납작 디스크 2개 + 뒤집은 teardrop 꼭지 조합으로
 * 하트 실루엣. 전부 셸 면을 감싸는 돔형 — 곡률 새김(sagitta ≈ 0.011s)보다
 * 두꺼워 표면 위로 확실히 드러난다. 최하단(꼭지 끝) elevation ≈ 0.47로
 * 림 상단(0.30) 위 마진 유지 — 얼굴 개구부 침범 0.
 */
function buildHeartPatch(base: HoodBase, crownH: number): void {
  const s = crownH
  const anchor = surfacePoint(base, 0, 0.60)
  const tan = toonMat(COL.lining, COL.liningShade)
  for (const k of [-1, 1] as const) {
    const lobe = new THREE.Mesh(unitSphereLo(), tan)
    lobe.scale.set(0.118 * s, 0.112 * s, 0.042 * s)
    lobe.position.set(k * 0.066 * s, 0.054 * s, 0.014 * s)
    anchor.add(lobe)
  }
  const apex = new THREE.Mesh(teardrop(0.19 * s, 0.17 * s, 0.28), tan)
  apex.rotation.z = Math.PI // 꼭지 아래로
  apex.position.set(0, 0.058 * s, 0.018 * s)
  anchor.add(apex)
}

export function buildMonkey(ctx: AnimalBuildContext): AnimalCostumeRig {
  const base = buildHoodBase(ctx.crownH, ctx.halfW, ctx.face, COL)
  base.pivot.name = 'monkeyHood'
  // VRM1 대응: 후드는 -Z 정면(VRM0 원공간)으로 저작 — index.ts fx 패턴과 동일
  if (ctx.S === -1) base.pivot.rotation.y = Math.PI

  buildEar(base, ctx.crownH, -1)
  buildEar(base, ctx.crownH, 1)
  buildHeartPatch(base, ctx.crownH)

  // muzzleFollow: 상단 림 중앙 앵커 (플라밍고 beakPivot 좌표) — 원숭이는 주둥이
  // 장식 없음, 빈 Group 유지 (index.ts 스프링이 rotation을 덮어써도 무해)
  const muzzleFollow = muzzleAnchor(base)

  // 손목밴드 + 드로스트링 (flamingo.ts 배선과 동일, 색만 오버라이드)
  // ---- 꼬리 (원숭이는 길고 얇게 — 사용자 디렉션) ----
  const tail = buildTail(ctx.bones.hips ?? null, ctx.crownH, ctx.S, {
    base: COL.shell, baseShade: COL.shellShade, girth: 0.50, length: 1.15, amp: 1.35, curl: 0.10, tipCurl: 3.40,
  })

  // ---- 반바지 (도너 스커트를 hiddenMaterials로 숨기고 대체 — 하의 실루엣 분화) ----
  buildShorts(
    ctx.bones.hips ?? null,
    ctx.bones.upperLegL, ctx.bones.upperLegR,
    ctx.bones.lowerLegL, ctx.bones.lowerLegR,
    ctx.crownH, ctx.S, {
    base: 0x6D2338, baseShade: 0x4A1524, thighFraction: 0.74, girth: 1.0,
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
    },
  }
}
