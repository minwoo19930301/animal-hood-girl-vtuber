/**
 * rabbit — 토끼 후드 (Pack v3).
 *
 * DESIGN-PACK-V3.md 장식 계약 (전부 개구부 밖 셸 면 위):
 * - 셸/안감: 아이보리/핑크
 * - 장식: 긴 직립 귀(핑크 이너 패널)×2, 끝 살짝 굽음 — Follower 스프링 출렁임
 *   (고개 pitch/yaw 지연 추종, rig.update에서 step)
 * - 액세서리: 손목밴드+드로스트링 (bandBase 아이보리 / stripe 로즈 / line·cord 핑크 / tip 다크)
 *
 * 귀는 beakPivot 패턴(shellPivot 좌표 직접 배치)으로 단다 — 셸 상단 전면
 * (azimuth ±0.34, elevation ≈1.0)은 SHELL_AP 콘(θB≈0.54)에서 θP≈1.25로 충분히 밖.
 */
import * as THREE from 'three'
import { PALETTE } from '../../palette'
import { buildAccessories, type AccessoryColors } from '../accessories'
import { Follower } from '../springs'
import type { AnimalBuildContext, AnimalCostumeRig } from './types'
import {
  buildHoodBase, muzzleAnchor, taperedTube, toonMat, addOutline,
  type HoodBase, type HoodColors,
} from './hoodKit'

/** 셸/안감 색 — 카탈로그 팔레트 계승 (rabbit.palette primary/shade + accent) */
const COL: HoodColors = {
  shell: 0xf5f0ea, shellShade: 0xd8cec3,
  lining: 0xf5a9b8, liningShade: 0xd08595,
}

/** 액세서리 색 — bandBase 아이보리/스트라이프 로즈/라인·코드 핑크/팁 다크 (셰이드 -20%p 계열) */
const ACC: AccessoryColors = {
  bandBase: 0xf5f0ea, bandBaseShade: 0xcfc2b4,
  bandStripe: 0xe4849e, bandStripeShade: 0xc0647e,
  bandLine: 0xf5a9b8, bandLineShade: 0xc97e8f,
  cord: 0xf5a9b8, cordShade: 0xc97e8f,
  tip: 0x3a3335, tipShade: 0x241f21,
}

interface EarRig {
  pivot: THREE.Group
  restX: number
  restZ: number
  fp: Follower
  fy: Follower
}

/**
 * 긴 직립 귀 한 짝: 겉 아이보리 taperedTube + 앞면 핑크 이너 튜브(겉보다 가늘고
 * 앞으로 오프셋 → 앞면에서만 핑크 패널로 보임). 끝은 바깥+뒤로 살짝 굽는다.
 * 커브는 대체로 yz-평면 (taperedTube right=+x 고정 프레임 안정 조건).
 */
function buildEar(base: HoodBase, side: -1 | 1, crownH: number): EarRig {
  const L = crownH
  const pivot = new THREE.Group()
  pivot.name = side < 0 ? 'rabbitEarL' : 'rabbitEarR'
  // 셸 상단 전면 앵커 (shellPivot 로컬, 표면 살짝 안쪽) — 루트가 셸에 파묻혀 봉제감
  const a = side * 0.34
  const e = 1.0
  pivot.position.set(
    base.C.x + Math.sin(a) * Math.cos(e) * base.rx * 0.95,
    base.C.y + Math.sin(e) * base.ry * 0.95,
    base.C.z - Math.cos(a) * Math.cos(e) * base.rz * 0.95,
  )
  // 미세 비대칭 직립 (좌우 스프링 상수 비대칭과 함께 굳은 대칭 인상 제거)
  const restX = side < 0 ? 0.03 : 0.08
  const restZ = -side * (side < 0 ? 0.08 : 0.13)
  pivot.rotation.set(restX, 0, restZ)

  // 겉감 (아이보리) — 위로 길게, 끝이 바깥+뒤로 살짝 굽음
  const outer = new THREE.Mesh(
    taperedTube(
      [
        new THREE.Vector3(0, -0.10 * L, 0.03 * L), // 셸 속 밑동
        new THREE.Vector3(side * 0.045 * L, 0.38 * L, 0.05 * L),
        new THREE.Vector3(side * 0.09 * L, 0.78 * L, 0.015 * L),
        new THREE.Vector3(side * 0.155 * L, 1.06 * L, 0.10 * L), // 굽는 끝
      ],
      [0.115 * L, 0.15 * L, 0.12 * L, 0.035 * L],
      { scaleY: 0.5 }, // 단면 앞뒤 납작 (수직 커브에서 scaleY 축 ≈ z)
    ),
    toonMat(COL.shell, COL.shellShade),
  )
  addOutline(outer, crownH * 0.022, PALETTE.nightPurple)
  pivot.add(outer)
  base.hitMeshes.push(outer)

  // 이너 패널 (핑크) — 같은 커브를 앞(-z)으로 밀고 가늘게 → 앞면 핑크 스트립
  const inner = new THREE.Mesh(
    taperedTube(
      [
        new THREE.Vector3(0, 0.10 * L, -0.032 * L),
        new THREE.Vector3(side * 0.045 * L, 0.42 * L, -0.016 * L),
        new THREE.Vector3(side * 0.09 * L, 0.76 * L, -0.045 * L),
        new THREE.Vector3(side * 0.135 * L, 0.97 * L, 0.015 * L),
      ],
      [0.055 * L, 0.082 * L, 0.062 * L, 0.018 * L],
      { scaleY: 0.5 },
    ),
    toonMat(COL.lining, COL.liningShade),
  )
  pivot.add(inner)

  return {
    pivot,
    restX,
    restZ,
    // 길고 무른 귀 — 낮은 k로 크게 출렁, 좌우 미세 비대칭 (결정적)
    fp: new Follower(side < 0 ? 46 : 52, 4.6, 0.5),
    fy: new Follower(side < 0 ? 40 : 45, 4.3, 0.5),
  }
}

export function buildRabbit(ctx: AnimalBuildContext): AnimalCostumeRig {
  const base = buildHoodBase(ctx.crownH, ctx.halfW, ctx.face, COL)
  base.pivot.name = 'rabbitHood'
  // VRM1 대응: 후드는 -Z 정면(VRM0 원공간)으로 저작 — index.ts fx 패턴과 동일
  if (ctx.S === -1) base.pivot.rotation.y = Math.PI

  // ---- 긴 직립 귀 ×2 (스프링 출렁임) ----
  const ears = ([-1, 1] as const).map((side) => {
    const ear = buildEar(base, side, ctx.crownH)
    base.shellPivot.add(ear.pivot)
    return ear
  })

  // muzzleFollow: 상단 림 중앙 앵커 — 토끼는 주둥이 장식 없음 (빈 Group 유지)
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
    update: (pitchS, yaw, breath, dt) => {
      // 귀 2차 모션: 고개 pitch/yaw를 지연 추종하는 진자 출렁임 + 호흡 미세 흔들림
      for (const ear of ears) {
        const p = ear.fp.step(pitchS, dt)
        const y = ear.fy.step(yaw, dt)
        ear.pivot.rotation.x = ear.restX + p * 0.85 + breath * 0.025
        ear.pivot.rotation.z = ear.restZ - y * 0.6
      }
      acc.sway(pitchS, yaw, breath, dt)
    },
  }
}
