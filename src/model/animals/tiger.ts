/**
 * tiger — 호랑이 후드 (Pack v3: 셸+안감+장식 완성).
 *
 * DESIGN-PACK-V3.md 장식 계약 (전부 개구부 밖 셸 면 위):
 * - 셸/안감: 오렌지/화이트(웜)
 * - 장식: 셸 위 검정 곡선 스트라이프 좌우 대칭 4쌍+정수리 1개, 둥근 귀(화이트 이너)×2,
 *   림 위 핑크 코(muzzleFollow 자식 — rotation은 index.ts 스프링 소유, 여기선 add만)
 * - 액세서리: 손목밴드+드로스트링 (bandBase 크림 / bandStripe 웜블랙 / line·cord 오렌지)
 *
 * 스트라이프 밀착 기법: 앵커 탄젠트 평면에 직선을 놓으면 끝이 구 표면 위로 뜬다
 * (탄젠트 현 vs 호). taperedTube 폴리라인을 yz-평면 호 y=ρ·sinφ, z=ρ(cosφ−1)로
 * 안쪽으로 구부려 셸 곡률을 따라가게 하고, scaleY로 단면을 방사 방향 납작하게,
 * radial 0.985로 표면 밀착시킨다 (ρ는 평균 반경 ×0.92 — 뜨느니 살짝 잠기게).
 * 판정 라운드 반영: 재질은 unlitMat 플랫 웜블랙(토온 림 하이라이트가 각진
 * 회색 스페큘러로 읽혔음), 끝은 라운드 테이퍼(단검/발톱 금지), 단면 납작(0.30)
 * + radial 인셋으로 pitch 0.4 실루엣 돌출 방지. 아웃라인 없음(마킹은 프린트 룩).
 * 배치 각은 전부 SHELL_AP 콘 검증: 개구부 축과의 각 − 장식 각반경 > 콘 경계
 * (상측 대각 경계 ≈0.65, 수평 측면 0.98 — 플라밍고 눈 검증값 ±0.54/0.30 참조).
 */
import * as THREE from 'three'
import { PALETTE } from '../../palette'
import type { AnimalBuildContext, AnimalCostumeRig } from './types'
import {
  buildHoodBase, muzzleAnchor, surfacePoint, toonMat, unlitMat, addOutline,
  taperedTube, unitSphereLo, type HoodBase, type HoodColors,
} from './hoodKit'
import { egg } from '../geo'
import { buildTail } from '../bodyParts'
import { buildAccessories, type AccessoryColors } from '../accessories'

/** 셸/안감 색 — 카탈로그 팔레트 계승 (tiger.palette primary/shade + secondary) */
const COL: HoodColors = {
  shell: 0xee8a3c, shellShade: 0xc65f26,
  lining: 0xfff1dc, liningShade: 0xdcc4a4,
}
/** 스트라이프: 카탈로그 dark(웜 블랙) — unlit 플랫 (셰이드/림 없음, 프린트 마킹 룩) */
const STRIPE = 0x2e2620
/** 귀 이너 화이트 = 안감 페어 재사용 */
const INNER = 0xfff1dc
const INNER_SH = 0xdcc4a4
/** 핑크 코 — hood.ts HOOD_COL.beak 검증 페어 계승 (팩 전체 핑크 톤 일치) */
const NOSE = 0xf78fa7
const NOSE_SH = 0xdb6a8e

/** 액세서리 색 (과제 색표: base #FFF1DC / stripe #2E2620 / line·cord #EE8A3C / tip #2E2620) */
const ACC: AccessoryColors = {
  bandBase: 0xfff1dc, bandBaseShade: 0xdcc4a4,
  bandStripe: 0x2e2620, bandStripeShade: 0x1c1712,
  bandLine: 0xee8a3c, bandLineShade: 0xc65f26,
  cord: 0xee8a3c, cordShade: 0xc65f26,
  tip: 0x2e2620, tipShade: 0x1c1712,
}

/**
 * 곡선 스트라이프 1개 — 셸 곡률을 따라 휜 납작 튜브 (끝은 뾰족하게 테이퍼).
 * curve: 탄젠트 평면 내 C-커브 가로 휨 (양 끝이 +x 쪽으로 훅) — 좌우 쌍은 부호 반전.
 */
function addStripe(
  base: HoodBase, _L: number, az: number, el: number, rotZ: number,
  len: number, wid: number, curve: number, rho: number,
): void {
  const anchor = surfacePoint(base, az, el, 0.985) // 인셋 — 실루엣 돌출 방지
  const N = 9
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < N; i++) {
    const k = (i / (N - 1)) * 2 - 1 // -1..1
    const phi = (k * len * 0.5) / rho
    pts.push(new THREE.Vector3(curve * k * k, rho * Math.sin(phi), rho * (Math.cos(phi) - 1)))
  }
  // 끝 라운드 테이퍼(로젠지 단면) — 뾰족 단검/발톱 실루엣 금지 (판정 P1 반영)
  const m = new THREE.Mesh(
    taperedTube(pts, [wid * 0.55, wid * 0.95, wid, wid * 0.95, wid * 0.55],
      { seg: 28, radial: 12, scaleY: 0.30 }),
    unlitMat(STRIPE), // 플랫 웜블랙 — 토온 림의 회색 스페큘러 제거
  )
  m.rotation.z = rotZ // 탄젠트 평면 내 방향 (0 = 세로, π/2 = 가로)
  anchor.add(m) // 아웃라인 없음 — 셸 위 프린트 마킹으로 읽히게
}

/** 둥근 귀: 방사→정면 블렌드로 기울인 디스크 (오렌지 겉 + 화이트 이너) */
function addEar(base: HoodBase, L: number, side: -1 | 1): THREE.Mesh {
  const anchor = surfacePoint(base, side * 1.0, 0.66, 0.92) // 상측 대각 — 콘 경계 밖
  const g = new THREE.Group()
  g.rotation.y = side * 0.55 // 디스크 법선을 바깥 방사에서 정면 쪽으로 틀어 정면 가독 확보
  anchor.add(g)
  const R = 0.30 * L
  const outer = new THREE.Mesh(unitSphereLo(), toonMat(COL.shell, COL.shellShade))
  outer.scale.set(R, R, R * 0.55)
  outer.position.z = R * 0.38
  addOutline(outer, L * 0.026, PALETTE.nightPurple)
  const inner = new THREE.Mesh(unitSphereLo(), toonMat(INNER, INNER_SH))
  inner.scale.set(R * 0.60, R * 0.60, R * 0.30)
  inner.position.z = R * 0.78
  g.add(outer, inner)
  return outer
}

export function buildTiger(ctx: AnimalBuildContext): AnimalCostumeRig {
  const base = buildHoodBase(ctx.crownH, ctx.halfW, ctx.face, COL)
  base.pivot.name = 'tigerHood'
  // VRM1 대응: 후드는 -Z 정면(VRM0 원공간)으로 저작 — index.ts fx 패턴과 동일
  if (ctx.S === -1) base.pivot.rotation.y = Math.PI
  const L = ctx.crownH
  const rho = ((base.rx + base.ry + base.rz) / 3) * 0.92

  // ---- 스트라이프: 좌우 대칭 4쌍 (az/el/기울기/길이/폭/휨 — 전부 콘 경계 밖 검증) ----
  // 정면 정체성: P1(이마 밴드, 코 좌우)·P2(볼 옆) 두 쌍이 정면 샷에서 바로 보인다.
  // 재판정 P2 "화이트 림 위 검정 삼각 얼룩" 근본 원인: P4(뒤통수) — 스트라이프는
  // radial 0.985 + 아크 끝 딥(ρ 0.92)이라 튜브 안쪽 면이 안감(0.985R)을 관통하고,
  // P4 팁의 관통부가 정면 개구부 너머 후방 안감 밴드 위에 비쳤다 (ablation으로
  // P1/P2/P3 배제, P4 확정). P4를 el 0.42→0.55/az 2.35→2.48로 올려 머리 뒤
  // 가림 영역으로 이동 + len 0.50→0.46. P2도 el 0.30→0.32 (같은 계열 그레이즈 여유).
  const LAYOUT: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    [0.45, 0.86, 0.28, 0.44, 0.068, 0.04],  // P1 이마 밴드 八자 (림 오버행 위, 코 좌우)
    [1.30, 0.32, 0.25, 0.42, 0.066, 0.05],  // P2 볼 옆 세로 (측면 림 바깥)
    [1.62, 0.72, -0.15, 0.55, 0.070, 0.06], // P3 상측면
    [2.48, 0.55, 0.10, 0.46, 0.062, 0.05],  // P4 뒤통수 (안감 관통 가시 영역 밖)
  ]
  for (const [az, el, rz, len, wid, curve] of LAYOUT) {
    for (const side of [-1, 1] as const) {
      addStripe(base, L, side * az, el, side * rz, len * L, wid * L, side * curve * L, rho)
    }
  }
  // 정수리 1개 — 코 위 이마 중앙에서 정수리로 넘어가는 세로 자오선 스트라이프 (센터 마킹).
  // 하단 팁 el≈0.59 > 콘 상단 경계 0.52 검증 — 코 바로 위에서 시작해 콧등 라인으로 읽힌다
  addStripe(base, L, 0, 0.92, 0, 0.52 * L, 0.075 * L, 0, rho)

  // ---- 둥근 귀 ×2 (대형 파츠 → 히트메시) ----
  for (const side of [-1, 1] as const) base.hitMeshes.push(addEar(base, L, side))

  // ---- 림 위 핑크 코: muzzleFollow 자식 (앵커 rotation은 index.ts 스프링 소유) ----
  const muzzleFollow = muzzleAnchor(base)
  const nose = new THREE.Mesh(egg(0.105 * L, 0.080 * L, 0.055 * L, 0.55), toonMat(NOSE, NOSE_SH))
  nose.position.set(0, 0.01 * L, -0.10 * L) // 상단 림 중앙에서 살짝 앞 — 개구부 위 셸 면
  nose.rotation.x = 0.5 // 윗면이 셸 곡률을 따라 뒤로 눕게
  addOutline(nose, L * 0.020, PALETTE.nightPurple)
  muzzleFollow.add(nose)

  // ---- 액세서리 (손목밴드+드로스트링) — flamingo.ts 배선 패턴 ----
  // ---- 꼬리 (뒤 → 옆 → 앞으로 감겨 정면에서도 보인다) ----
  const tail = buildTail(ctx.bones.hips ?? null, ctx.crownH, ctx.S, {
    base: COL.shell, baseShade: COL.shellShade, tip: 0x241f22, tipShade: 0x14100f, girth: 0.55, length: 1.25, amp: 1.25,
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
