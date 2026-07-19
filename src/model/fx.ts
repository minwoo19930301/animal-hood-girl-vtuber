/**
 * FX 프로시저럴 빌보드 — head 본 어태치, visible 토글 (계약 FxState).
 * hood.ts와 같은 로컬 프레임(정면 -Z)에서 빌드. 크기는 crownH 비례.
 *  - heart: 하트 2개, 캐릭터 눈앞
 *  - sweat: 관자놀이(캐릭터-왼쪽 = 뷰어 오른쪽) 땀방울
 *  - anger: 이마/후드 (캐릭터-오른쪽 = 뷰어 왼쪽) 십자 힘줄
 */
import * as THREE from 'three'
import { PALETTE } from '../palette'
import { unlitMat, addOutline } from './materials'
import { mergeShapes, teardrop, heartGeo, unitSphereLo } from './geo'

export interface FxRig {
  group: THREE.Group
  hearts: THREE.Group
  heartMeshes: THREE.Mesh[]
  sweat: THREE.Group
  anger: THREE.Group
}

export function buildFx(crownH: number): FxRig {
  const group = new THREE.Group()
  group.name = 'fx'
  const L = crownH

  // ---- 하트 눈앞 2개 (플랫 셰이프는 +Z를 보므로 -Z 정면 프레임에서 y π 회전) ----
  const hearts = new THREE.Group()
  const heartMeshes: THREE.Mesh[] = []
  const hGeo = heartGeo(0.34 * L)
  for (const [i, sx] of ([-1, 1] as const).entries()) {
    const m = new THREE.Mesh(hGeo, unlitMat(PALETTE.deepPinkAccent))
    m.position.set(sx * 0.20 * L, 0.46 * L, -1.02 * L)
    m.rotation.y = Math.PI
    m.userData.baseY = m.position.y
    m.userData.phase = i * 1.7
    hearts.add(m)
    heartMeshes.push(m)
  }
  hearts.visible = false
  group.add(hearts)

  // ---- 땀방울 (관자놀이, 연파랑 채움 + 진한 윤곽 티어드롭 + 글린트) ----
  // 채움을 lagoonBG로 쓰면 라군 배경과 동색이라 흰 윤곽만 남아 안 보인다 —
  // 배경보다 밝은 연파랑 + 두꺼운 다크 아웃라인으로 대비 확보, 크기 +20%
  const SWEAT_BLUE = 0xcdeafd
  const sweat = new THREE.Group()
  sweat.position.set(-0.72 * L, 0.42 * L, -0.78 * L)
  const drop = new THREE.Mesh(teardrop(0.48 * L, 0.30 * L, 0.7), unlitMat(SWEAT_BLUE))
  drop.position.y = -0.15 * L
  addOutline(drop, 0.034 * L, PALETTE.nightPurple)
  sweat.add(drop)
  const glint = new THREE.Mesh(unitSphereLo(), unlitMat(PALETTE.white))
  glint.scale.set(0.038 * L, 0.054 * L, 0.019 * L)
  glint.position.set(-0.042 * L, 0.024 * L, -0.10 * L)
  sweat.add(glint)
  sweat.rotation.z = 0.16
  sweat.visible = false
  group.add(sweat)

  // ---- 분노 마크 (십자 힘줄 4캡슐 병합 1메시) ----
  const anger = new THREE.Group()
  // 후드 셸 GROW(+8%) 이후에도 표면 밖에 오도록 법선 방향으로 밀어냄
  anger.position.set(0.32 * L, 0.88 * L, -0.60 * L)
  // 후드 표면 바깥쪽을 보게 (뷰어-왼쪽 상단 대각)
  anger.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0.42, 0.30, -0.86).normalize(),
  )
  const segGeo = new THREE.CapsuleGeometry(0.024 * L, 0.085 * L, 4, 10)
  const angerGeo = mergeShapes(
    (
      [
        [0, 0.078, Math.PI / 2],
        [0, -0.078, Math.PI / 2],
        [0.078, 0, 0],
        [-0.078, 0, 0],
      ] as Array<[number, number, number]>
    ).map(([px, py, rot]) => ({
      g: segGeo,
      p: [px * L, py * L, 0] as [number, number, number],
      r: [0, 0, rot] as [number, number, number],
    })),
  )
  segGeo.dispose()
  anger.add(new THREE.Mesh(angerGeo, unlitMat(PALETTE.deepPinkAccent)))
  anger.visible = false
  group.add(anger)

  return { group, hearts, heartMeshes, sweat, anger }
}
