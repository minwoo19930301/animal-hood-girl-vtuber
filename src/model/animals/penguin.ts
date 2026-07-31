/**
 * penguin — 펭귄 후드 (Pack v3: 셸+안감 + 프론트 밴드/부리 장식 + 액세서리).
 *
 * DESIGN-PACK-V3.md 장식 계약 (전부 개구부 밖 셸 면 위):
 * - 셸/안감: 블랙(다크네이비)/화이트
 * - 장식: 림 둘레 화이트 프론트 밴드(펭귄 배 — 개구부 림을 감싸는 흰 링/판,
 *   LINING_AP보다 살짝 넓은 콘에서 시작해 셸 면 바깥쪽으로 두른다),
 *   림 위 중앙 오렌지 미니 부리(taperedTube, 아래로 살짝 — 플라밍고 부리 소형판,
 *   muzzleFollow 자식이라 index.ts 스프링으로 출렁인다).
 * - 액세서리: 손목밴드+드로스트링 (bandBase 화이트 / stripe 네이비 / cord 옐로 / tip 잉크)
 */
import * as THREE from 'three'
import { PALETTE } from '../../palette'
import type { AnimalBuildContext, AnimalCostumeRig } from './types'
import {
  buildHoodBase, muzzleAnchor, toonMat, addOutline, taperedTube, TILT,
  type HoodBase, type HoodColors,
} from './hoodKit'
import { buildShorts } from '../bodyParts'
import { buildAccessories, type AccessoryColors } from '../accessories'

/** 셸/안감 색 — 카탈로그 팔레트 계승 (penguin.palette primary/shade + secondary) */
const COL: HoodColors = {
  shell: 0x31394a, shellShade: 0x1e2532,
  lining: 0xf6f8fa, liningShade: 0xd2d8de,
}

/** 미니 부리 오렌지 — 셰이드는 명도 -20%p에 hue를 레드 쪽으로 살짝 */
const BEAK = { base: 0xf4952e, shade: 0xc76f15 } as const

/** 액세서리 색 (과제 색표) — 셰이드는 명도 -18~22%p + hue 미세 회전 */
const ACC: AccessoryColors = {
  bandBase: 0xf6f8fa, bandBaseShade: 0xd2d8de,
  bandStripe: 0x26324a, bandStripeShade: 0x171f2e,
  bandLine: 0xf5b940, bandLineShade: 0xcc9020,
  cord: 0xf5b940, cordShade: 0xcc9020,
  tip: 0x20242e, tipShade: 0x12141b,
}

/**
 * 프론트 밴드 지오메트리 — 개구부 림을 감싸는 흰 판(펭귄 배).
 * cutShellGeo와 동일한 개구부 콘 공식(축 P = 정면 -Z에서 TILT만큼 하향)으로
 * 안쪽 가장자리 콘각 θi(φ)를 구하고, 거기서 바깥으로 폭 w(φ)만큼 펼친 스트립을
 * 셸 타원체 반경 × radial(>1, 표면 살짝 위)에 파라메트릭 생성한다.
 * 안쪽 콘은 LINING_AP(0.90/0.46)보다 살짝 넓은 {0.94/0.485} — 흰 안감 림과
 * 이어져 연속된 화이트 서라운드로 읽힌다. 아래쪽(턱 밑)은 셸 바닥 컷 밖으로
 * 밴드가 떠 버리므로 정하방 ±GAP 섹터는 비운다 (양끝은 폭 테이퍼로 마감).
 */
function frontBandGeo(base: HoodBase, radial: number): THREE.BufferGeometry {
  const P = new THREE.Vector3(0, -Math.sin(TILT), -Math.cos(TILT)) // 개구부 축
  const U = new THREE.Vector3(1, 0, 0)
  const V = new THREE.Vector3().crossVectors(P, U) // ≈ 아래
  const IN = { ax: 0.94, ayUp: 0.485, ayDown: 1.06 } // LINING_AP보다 살짝 넓게
  const N = 80 // 아크 분할
  const M = 6  // 폭 분할
  const GAP = 0.62 // 정하방(φ=π/2) 양쪽 비우는 반각
  const start = Math.PI / 2 + GAP
  const span = Math.PI * 2 - GAP * 2
  const positions: number[] = []
  const indices: number[] = []
  const dir = new THREE.Vector3()
  for (let i = 0; i <= N; i++) {
    const s = i / N
    const phi = start + s * span
    const sp = Math.sin(phi) // >0 = 아래쪽 반원
    const ay = sp > 0 ? IN.ayDown : IN.ayUp
    const cb = ay * Math.cos(phi)
    const sb = IN.ax * Math.sin(phi)
    const thI = (IN.ax * ay) / Math.sqrt(cb * cb + sb * sb) // 안쪽 가장자리 콘각
    // 볼~턱 쪽(아래)이 더 넓은 배 판때기 + 양끝 폭 테이퍼 마감
    const taper = 0.55 + 0.45 * Math.min(1, Math.min(s, 1 - s) / 0.14)
    const w = (0.27 + 0.09 * Math.max(0, sp)) * taper
    for (let j = 0; j <= M; j++) {
      const th = thI + (j / M) * w
      dir.copy(P).multiplyScalar(Math.cos(th))
        .addScaledVector(U, Math.cos(phi) * Math.sin(th))
        .addScaledVector(V, Math.sin(phi) * Math.sin(th))
      positions.push(
        base.C.x + dir.x * base.rx * radial,
        base.C.y + dir.y * base.ry * radial,
        base.C.z + dir.z * base.rz * radial,
      )
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j
      const b = a + M + 1
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setIndex(indices)
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.computeVertexNormals()
  return g
}

export function buildPenguin(ctx: AnimalBuildContext): AnimalCostumeRig {
  const base = buildHoodBase(ctx.crownH, ctx.halfW, ctx.face, COL)
  base.pivot.name = 'penguinHood'
  // VRM1 대응: 후드는 -Z 정면(VRM0 원공간)으로 저작 — index.ts fx 패턴과 동일
  if (ctx.S === -1) base.pivot.rotation.y = Math.PI
  const L = ctx.crownH

  // ---- 화이트 프론트 밴드 (개구부 림 서라운드 — 안감과 같은 화이트 페어) ----
  // 열린 스트립이라 inverted-hull 아웃라인이 성립하지 않는다 — 블랙 셸과의
  // 대비가 커서 무윤곽으로 충분. doubleSide: 뒤집힌 와인딩/틈새 각도 안전망.
  const band = new THREE.Mesh(
    frontBandGeo(base, 1.006),
    toonMat(COL.lining, COL.liningShade, { doubleSide: true }),
  )
  base.shellPivot.add(band)

  // ---- 오렌지 미니 부리 (림 위 중앙, 아래로 살짝 — 플라밍고 부리 ~0.55x) ----
  // muzzleFollow 앵커의 자식으로만 부착 — 앵커 rotation은 index.ts 스프링이
  // 매 프레임 덮어쓰므로 직접 세팅 금지 (부리는 통째로 출렁인다).
  const muzzleFollow = muzzleAnchor(base)
  // 앵커는 셸 표면보다 ~0.09rz 안쪽 — 부리가 림 밖으로 확실히 나오려면 전방(-Z)
  // 돌출을 그만큼 크게 잡아야 한다 (1차 시도 0.17L은 셸에 파묻혀 단추처럼 보였다.
  // 2차 0.24L도 정면에서 폼폼 볼로 읽혀 0.28L + 훅 강화. 재판정 P2: 팁 y
  // -0.16L도 밑동 하단(-0.125L)과 3px 차라 볼로 읽힘 → -0.21L로 추가 하강 —
  // 정면 실루엣에서 끝단이 밑동 하단보다 확실히 아래로 내려와 '부리'로 판독된다)
  const beak = new THREE.Mesh(
    taperedTube(
      [
        new THREE.Vector3(0, 0.02 * L, 0.12 * L), // 셸 안쪽 밑동 (심 은폐)
        new THREE.Vector3(0, -0.035 * L, -0.17 * L),
        new THREE.Vector3(0, -0.21 * L, -0.285 * L), // 끝: 앞(-Z)·아래로 강한 훅 (눈썹 위 한참 위)
      ],
      [0.17 * L, 0.125 * L, 0.045 * L],
      { scaleY: 0.85 },
    ),
    toonMat(BEAK.base, BEAK.shade),
  )
  // 앵커보다 살짝 아래·앞 — 부리가 블랙 셸이 아니라 림 위 화이트 밴드에 걸치도록
  // (앵커 rotation은 스프링 소유라 건드리지 않고 메시 position만 오프셋)
  beak.position.set(0, -0.07 * L, -0.05 * L)
  addOutline(beak, L * 0.018, PALETTE.nightPurple)
  muzzleFollow.add(beak)
  base.hitMeshes.push(beak)

  // ---- 액세서리 (손목밴드+드로스트링) — flamingo.ts와 동일 배선, 색만 오버라이드 ----
  // ---- 긴바지 (도너 스커트를 hiddenMaterials로 숨기고 대체) ----
  buildShorts(
    ctx.bones.hips ?? null,
    ctx.bones.upperLegL, ctx.bones.upperLegR,
    ctx.bones.lowerLegL, ctx.bones.lowerLegR,
    ctx.crownH, ctx.S, {
      base: 0x22304E, baseShade: 0x141F33, thighFraction: 1.02, shinFraction: 1.05, girth: 1.0,
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
    update: (pitchS, yaw, breath, dt) => acc.sway(pitchS, yaw, breath, dt),
  }
}
