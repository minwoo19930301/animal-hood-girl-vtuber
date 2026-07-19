/**
 * 프로시저럴 트랙재킷 액세서리 — refs/target-human.png 참조.
 * (화이트 트랙탑 + 코랄 트림 + 네이비 카라의 3D 디테일)
 *
 * - 손목밴드 2개: 정규화 hand 본에 어태치한 낮은 실린더 (화이트 + 네이비/코랄 스트라이프).
 *   축은 lowerArm→hand 본 방향을 hand 로컬로 변환해 자동 정렬 — worldToLocal이
 *   VRM0의 씬 π 회전까지 흡수하므로 VRM0/1 공통, 하드코딩 좌표 없음.
 * - 후드 드로스트링 2가닥: 정규화 chest(upperChest) 본에 어태치, 쇄골 근처 앵커에서
 *   드리우는 코랄 끈(taperedTube) + 끝에 골드 링/네이비 팁. hood.ts와 같은 빌드
 *   프레임(정면 -Z, 캐릭터-왼쪽 -X)으로 만들고 VRM1(S=-1)이면 루트를 y π 뒤집는다
 *   (hood.pivot과 동일 규약). 가벼운 Follower 스프링으로 고개/호흡을 지연 추종해 살랑임.
 *
 * 치수는 전부 본 실측(팔뚝 길이 · 어깨 반폭 · 목 높이) 비례 자동 산출.
 */
import * as THREE from 'three'
import { PALETTE } from '../palette'
import { toonMat, addOutline } from './materials'
import { taperedTube } from './geo'
import { Follower } from './springs'

type Node3 = THREE.Object3D | null

/** 액세서리 전용 색 (target-human.png 트랙재킷 샘플) — HOOD_COL과 같은 방식 유지 */
export const ACC_COL = {
  white: 0xf4f5fa, whiteShade: 0xd6d3e8,   // 재킷 화이트 → 셰이드는 라벤더 쪽 hue-shift
  navy: 0x2c3053, navyShade: 0x1f2240,     // 카라 네이비
  coral: 0xf47d89, coralShade: 0xd95f74,   // 트림 코랄
  gold: PALETTE.scarfGold, goldShade: PALETTE.scarfGoldShade,
} as const

/** index.ts가 rig에서 넘기는 본 참조 — 전부 정규화 본 노드 (없으면 해당 파트 스킵) */
export interface AccessoryBones {
  chest: Node3
  neck: Node3
  upperArmL: Node3
  upperArmR: Node3
  lowerArmL: Node3
  lowerArmR: Node3
  handL: Node3
  handR: Node3
}

export interface AccessoryRig {
  /**
   * 드로스트링 2차 모션 갱신 — index.ts apply()의 후드 2차 모션과 같은 자리에서 호출.
   * pitchS = S·pitch (hood와 동일 부호 규약), breathAmp = sin(breath·2π).
   */
  sway(pitchS: number, yaw: number, breathAmp: number, dt: number): void
}

interface StringRig {
  pivot: THREE.Group
  fp: Follower
  fy: Follower
}

/**
 * 손목밴드: 팔뚝 축 정렬 낮은 실린더 3겹(화이트 베이스 + 네이비 스트라이프 + 코랄 라인).
 * 손목 관절(= hand 본 원점)을 걸치도록 팔꿈치 쪽으로 살짝 오프셋.
 */
function buildWristband(hand: THREE.Object3D, lowerArm: THREE.Object3D): void {
  const handW = hand.getWorldPosition(new THREE.Vector3())
  const elbowW = lowerArm.getWorldPosition(new THREE.Vector3())
  const flen = handW.distanceTo(elbowW) // 팔뚝 길이 — 유일한 스케일 기준
  if (flen < 1e-4) return
  // 팔꿈치→손목 축을 hand 로컬로 (rest T포즈, 정규화 본 항등 회전 전제)
  const axis = hand.worldToLocal(elbowW.clone()).normalize().negate()

  const band = new THREE.Group()
  band.name = 'wristband'
  band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)
  band.position.copy(axis).multiplyScalar(-flen * 0.045) // 관절 위에 걸치게 팔꿈치 쪽으로

  const r = flen * 0.175  // 손목보다 넉넉한 밴드 반경
  const h = flen * 0.17   // 낮은 실린더 높이
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 0.94, h, 20),
    toonMat(ACC_COL.white, ACC_COL.whiteShade),
  )
  addOutline(base, flen * 0.018, PALETTE.nightPurple)
  // 스트라이프: 손 쪽 상단에 네이비 밴드, 그 중앙을 지나는 코랄 핀라인 (반경 겹침 방지 계단)
  const navy = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 1.05, r * 1.05, h * 0.34, 20),
    toonMat(ACC_COL.navy, ACC_COL.navyShade),
  )
  navy.position.y = h * 0.20
  const coral = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 1.10, r * 1.10, h * 0.11, 20),
    toonMat(ACC_COL.coral, ACC_COL.coralShade),
  )
  coral.position.y = h * 0.20
  band.add(base, navy, coral)
  hand.add(band)
}

/**
 * 드로스트링 한 가닥: 앵커 피벗(스프링 회전 대상) 아래로 드리우는 코랄 튜브 +
 * 끝에 골드 링·네이비 팁. 좌표는 전부 피벗 로컬(빌드 프레임: 정면 -Z).
 */
function buildString(side: -1 | 1, hw: number): StringRig {
  const pivot = new THREE.Group()
  pivot.name = side < 0 ? 'drawstringL' : 'drawstringR'
  const L = hw * 1.12       // 끈 길이 (카라 기부→가슴 중단)
  const r = hw * 0.045      // 끈 반지름 — 가는 코드 (서스펜더처럼 읽히지 않게)

  // 거의 수직으로 드리우며 끝이 살짝 안으로 — 카라에서 늘어진 얇은 끈
  const pts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(side * hw * 0.045, -L * 0.48, -hw * 0.05),
    new THREE.Vector3(side * hw * 0.015, -L, -hw * 0.01),
  ]
  const cord = new THREE.Mesh(
    taperedTube(pts, [r, r, r * 0.92], { seg: 20, radial: 10 }),
    toonMat(ACC_COL.coral, ACC_COL.coralShade),
  )
  addOutline(cord, r * 0.16, PALETTE.nightPurple)
  pivot.add(cord)

  // 팁: 네이비 aglet만 (골드 링 제거 — 옐로는 텍스처의 작은 탭 하나로만 표현)
  const tan = pts[2].clone().sub(pts[1]).normalize()
  const tipQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), tan)
  const navyTip = new THREE.Mesh(
    new THREE.CapsuleGeometry(r * 1.12, r * 1.7, 4, 10),
    toonMat(ACC_COL.navy, ACC_COL.navyShade),
  )
  navyTip.quaternion.copy(tipQ)
  navyTip.position.copy(pts[2]).addScaledVector(tan, r * 1.6) // 코드 끝과 오버랩해 심 은폐
  addOutline(navyTip, r * 0.16, PALETTE.nightPurple)
  pivot.add(navyTip)

  // 좌우가 완전히 동기화되지 않도록 스프링 상수를 미세하게 비대칭 (결정적)
  return {
    pivot,
    fp: new Follower(side < 0 ? 68 : 74, 5.6, 0.45),
    fy: new Follower(side < 0 ? 58 : 64, 5.2, 0.45),
  }
}

/**
 * 액세서리 빌드 + 본 어태치. rest 포즈(updateMatrixWorld 완료) 상태에서 호출할 것.
 * S: index.ts와 동일 부호 (VRM0=+1, VRM1=-1) — 드로스트링 루트 π 플립용.
 */
export function buildAccessories(bones: AccessoryBones, S: number): AccessoryRig {
  // ---- 손목밴드 2개 (hand 로컬 계산이라 S 불필요) ----
  if (bones.handL && bones.lowerArmL) buildWristband(bones.handL, bones.lowerArmL)
  if (bones.handR && bones.lowerArmR) buildWristband(bones.handR, bones.lowerArmR)

  // ---- 드로스트링 2가닥 (chest 어태치, 쇄골 근처 앵커 자동 산출) ----
  const strings: StringRig[] = []
  const { chest, neck, upperArmL, upperArmR } = bones
  if (chest && neck && upperArmL && upperArmR) {
    const Cw = chest.getWorldPosition(new THREE.Vector3())
    const Nw = neck.getWorldPosition(new THREE.Vector3())
    const hw = upperArmL.getWorldPosition(new THREE.Vector3())
      .distanceTo(upperArmR.getWorldPosition(new THREE.Vector3())) / 2 // 어깨 반폭
    if (hw > 1e-4) {
      // 월드(rotateVRM0 이후 정면 +Z) → 빌드 프레임(정면 -Z): x,z 부호 반전
      // (hood.ts faceBounds의 frontZ = -(maxZ - headZ)와 동일 규약)
      const neckB = new THREE.Vector3(-(Nw.x - Cw.x), Nw.y - Cw.y, -(Nw.z - Cw.z))
      const root = new THREE.Group()
      root.name = 'hoodStrings'
      if (S === -1) root.rotation.y = Math.PI // VRM1: hood.pivot과 동일 플립
      for (const side of [-1, 1] as const) {
        const st = buildString(side, hw)
        // 본 어깨 반폭(hw)은 스타일라이즈 모델에서 몸통 깊이보다 훨씬 작다 —
        // 앞뒤(z)는 hw 대비 큰 계수로 가슴 겉옷 표면 앞까지 밀어낸다
        st.pivot.position.set(
          side * hw * 0.42,          // 지퍼 라인 바로 양옆 (카라 앞트임 폭)
          neckB.y - hw * 0.12,       // 카라 기부 — 끈이 카라에서 나오는 것처럼
          neckB.z - hw * 1.42,       // 가슴 표면 앞 (빌드 프레임 앞 = -Z)
        )
        root.add(st.pivot)
        strings.push(st)
      }
      chest.add(root)
    }
  }

  return {
    sway(pitchS, yaw, breathAmp, dt) {
      for (const st of strings) {
        const p = st.fp.step(pitchS, dt)
        const y = st.fy.step(yaw, dt)
        // 드리운 끈은 몸 회전을 지연 진자 스윙으로 되받는다 + 호흡 미세 흔들림
        st.pivot.rotation.x = p * 0.55 + breathAmp * 0.02
        st.pivot.rotation.z = -y * 0.45
      }
    },
  }
}
