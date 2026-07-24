/**
 * giraffe — 기린 후드 (Pack v3: 셸+안감+장식 완성).
 *
 * DESIGN-PACK-V3.md 장식 계약 (전부 개구부 밖 셸 면 위):
 * - 셸/안감: 크림/탠
 * - 장식: 셸 위 탠 라운드 패치 8개(크기 변화·비대칭 분산), 오시콘×2(정수리 위
 *   짧은 스토크+갈색 볼 팁 — taperedTube+구), 작은 사이드 귀×2(크림 겉+탠 이너)
 * - 액세서리: 손목밴드+드로스트링 (bandBase 크림 / bandStripe 브라운 / line·cord 골드)
 *
 * 패치 밀착 기법: 납작 렌즈(unitSphereLo z-스케일 0.16)를 radial 0.975에 심으면
 * 렌즈 중심이 살짝 잠기고 가장자리가 표면에 얹힌다 (탄젠트 평면 부상 상쇄).
 * 배치 각은 전부 SHELL_AP 콘 검증: 개구부 축과의 각 − 장식 각반경 > 콘 경계
 * (상측 대각 경계 ≈0.65, 수평 측면 0.98 — 플라밍고 눈 검증값 ±0.54/0.30 참조).
 */
import * as THREE from 'three'
import { PALETTE } from '../../palette'
import type { AnimalBuildContext, AnimalCostumeRig } from './types'
import {
  buildHoodBase, muzzleAnchor, surfacePoint, toonMat, addOutline,
  taperedTube, unitSphereLo, type HoodBase, type HoodColors,
} from './hoodKit'
import { buildAccessories, type AccessoryColors } from '../accessories'

/** 셸/안감 색 — 카탈로그 팔레트 계승 (giraffe.palette secondary(크림) + hair accent(탠)) */
const COL: HoodColors = {
  shell: 0xfff3ce, shellShade: 0xdcc794,
  lining: 0xd9a35c, liningShade: 0xb07f3f,
}
/** 패치: 카탈로그 accent(딥 탠) — 크림 셸 위에서 안감 탠보다 한 단 진하게 */
const PATCH = 0xc98a3b
const PATCH_SH = 0x8f5e24
/** 오시콘 스토크·귀 이너 탠 = 안감 페어 재사용 */
const TAN = 0xd9a35c
const TAN_SH = 0xb07f3f
/** 오시콘 볼 팁 갈색 */
const BROWN = 0x8a5a34
const BROWN_SH = 0x63401f

/** 액세서리 색 (과제 색표: base #FFF3CE / stripe #8A5A34 / line·cord #F2C94C / tip #4A371C) */
const ACC: AccessoryColors = {
  bandBase: 0xfff3ce, bandBaseShade: 0xdcc794,
  bandStripe: 0x8a5a34, bandStripeShade: 0x63401f,
  bandLine: 0xf2c94c, bandLineShade: 0xd79f2c,
  cord: 0xf2c94c, cordShade: 0xd79f2c,
  tip: 0x4a371c, tipShade: 0x2e2110,
}

/** 탠 라운드 패치 1개 — 셸 면에 얹힌 납작 렌즈 (sq/rotZ로 유기적 형태 변화) */
function addPatch(
  base: HoodBase, L: number, az: number, el: number, r: number, sq: number, rotZ: number,
): void {
  const anchor = surfacePoint(base, az, el, 0.975)
  const m = new THREE.Mesh(unitSphereLo(), toonMat(PATCH, PATCH_SH))
  m.scale.set(r, r * sq, r * 0.16)
  m.rotation.z = rotZ
  addOutline(m, L * 0.010, PALETTE.nightPurple) // 얇게 — 패치가 떠 보이지 않게
  anchor.add(m)
}

/** 오시콘: 방사(+Z) 방향 짧은 스토크 + 갈색 볼 팁 — 정수리 앞쪽, 약간 앞으로 기움 */
function addOssicone(base: HoodBase, L: number, side: -1 | 1): THREE.Mesh[] {
  const anchor = surfacePoint(base, side * 0.42, 1.08, 0.985)
  const stalk = new THREE.Mesh(
    taperedTube(
      [
        new THREE.Vector3(0, 0, -0.03 * L), // 셸 안쪽 밑동 (심 은폐)
        new THREE.Vector3(0, 0.02 * L, 0.10 * L),
        new THREE.Vector3(0, 0.045 * L, 0.20 * L),
      ],
      [0.042 * L, 0.034 * L, 0.027 * L],
      { seg: 12, radial: 10 },
    ),
    toonMat(TAN, TAN_SH),
  )
  addOutline(stalk, L * 0.016, PALETTE.nightPurple)
  const R = 0.065 * L
  const ball = new THREE.Mesh(unitSphereLo(), toonMat(BROWN, BROWN_SH))
  ball.scale.setScalar(R)
  ball.position.set(0, 0.05 * L, 0.225 * L) // 스토크 끝과 오버랩 (심 은폐)
  addOutline(ball, L * 0.016, PALETTE.nightPurple)
  anchor.add(stalk, ball)
  return [stalk, ball]
}

/** 작은 사이드 귀: 방사→정면 블렌드로 기울인 디스크 (크림 겉 + 탠 이너) */
function addEar(base: HoodBase, L: number, side: -1 | 1): THREE.Mesh {
  const anchor = surfacePoint(base, side * 1.28, 0.30, 0.90) // 수평 측면 — 콘 경계 밖
  const g = new THREE.Group()
  g.rotation.y = side * 0.5 // 디스크 법선을 바깥 방사에서 정면 쪽으로
  anchor.add(g)
  const R = 0.24 * L
  const outer = new THREE.Mesh(unitSphereLo(), toonMat(COL.shell, COL.shellShade))
  outer.scale.set(R, R * 0.82, R * 0.50)
  outer.position.z = R * 0.34
  addOutline(outer, L * 0.022, PALETTE.nightPurple)
  const inner = new THREE.Mesh(unitSphereLo(), toonMat(TAN, TAN_SH))
  inner.scale.set(R * 0.55, R * 0.48, R * 0.26)
  inner.position.z = R * 0.66
  g.add(outer, inner)
  return outer
}

export function buildGiraffe(ctx: AnimalBuildContext): AnimalCostumeRig {
  const base = buildHoodBase(ctx.crownH, ctx.halfW, ctx.face, COL)
  base.pivot.name = 'giraffeHood'
  // VRM1 대응: 후드는 -Z 정면(VRM0 원공간)으로 저작 — index.ts fx 패턴과 동일
  if (ctx.S === -1) base.pivot.rotation.y = Math.PI
  const L = ctx.crownH

  // ---- 탠 라운드 패치 8개 (az/el/반경/세로비/기울기 — 비대칭 유기 분산, 콘 밖) ----
  const PATCHES: ReadonlyArray<readonly [number, number, number, number, number]> = [
    [0.95, 0.75, 0.155, 0.88, 0.5],   // 우상 앞쪽 (림 오버행 위)
    [-1.05, 0.60, 0.185, 0.80, -0.4], // 좌상
    [1.55, 0.32, 0.205, 0.90, 0.2],   // 우측면
    [-1.68, 0.30, 0.170, 0.85, 0.9],  // 좌측면
    [2.20, 0.62, 0.195, 0.82, -0.6],  // 우후측
    [-2.50, 0.52, 0.180, 0.90, 0.3],  // 좌후측
    [3.05, 0.30, 0.190, 0.86, 0.0],   // 뒤통수
    [-2.95, 0.95, 0.150, 0.80, 0.7],  // 뒤통수 상단
  ]
  for (const [az, el, r, sq, rz] of PATCHES) addPatch(base, L, az, el, r * L, sq, rz)

  // ---- 오시콘 ×2 + 사이드 귀 ×2 (돌출 파츠 → 히트메시) ----
  for (const side of [-1, 1] as const) {
    base.hitMeshes.push(...addOssicone(base, L, side))
    base.hitMeshes.push(addEar(base, L, side))
  }

  // muzzleFollow: 상단 림 중앙 앵커 — 기린은 코 장식 없음 (계약: 패치/오시콘/귀만)
  const muzzleFollow = muzzleAnchor(base)

  // ---- 액세서리 (손목밴드+드로스트링) — flamingo.ts 배선 패턴 ----
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
