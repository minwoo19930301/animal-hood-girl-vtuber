/**
 * 몸 파트: 계란 몸통 + 가슴 fluff + 스카프 + 목 체인 3본 + 날개(2세그+깃털 손가락 3) +
 * 치비 플라밍고 다리/물갈퀴 발 + 꼬리깃.
 * 좌표계: 발밑 원점, 정면 +z. 캐릭터-왼쪽 = +x(뷰어 오른쪽).
 */
import * as THREE from 'three'
import { PALETTE } from '../palette'
import { toonMat, unlitMat, addOutline } from './materials'
import { unitSphere, unitSphereLo, egg, teardrop, featherLobe, mergeShapes } from './geo'

export const NECK_SEG = 0.058

export interface WingRig {
  side: 1 | -1
  shoulder: THREE.Group
  elbow: THREE.Group
  paddle: THREE.Mesh
  fingers: THREE.Group[]
}

export interface BodyRig {
  group: THREE.Group
  torso: THREE.Mesh
  fluff: THREE.Group
  scarfTail: THREE.Group
  tail: THREE.Group
  neck: [THREE.Group, THREE.Group, THREE.Group]
  headSocket: THREE.Group
  wingL: WingRig
  wingR: WingRig
}

function buildWing(side: 1 | -1): WingRig {
  const wingSkin = toonMat(PALETTE.wingTone, PALETTE.plumageShade)
  const shoulder = new THREE.Group()
  shoulder.position.set(side * 0.114, 0.450, 0.050)

  // 어깨 캡: 관절 피벗을 둥근 구로 감싸 회전 시 각진 꺾임(크리스) 없이 부드럽게 벤딩
  const shoulderCap = new THREE.Mesh(unitSphereLo(), wingSkin)
  shoulderCap.scale.setScalar(0.0285)
  addOutline(shoulderCap, 0.0044, PALETTE.outline)
  shoulder.add(shoulderCap)

  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.050, 6, 18), wingSkin)
  upper.position.set(0, -0.038, 0)
  addOutline(upper, 0.0046, PALETTE.outline)
  shoulder.add(upper)

  const elbow = new THREE.Group()
  elbow.position.set(0, -0.078, 0)
  shoulder.add(elbow)

  // 팔꿈치 캡 (패들-상완 이음새 라운딩)
  const elbowCap = new THREE.Mesh(unitSphereLo(), wingSkin)
  elbowCap.scale.setScalar(0.0245)
  addOutline(elbowCap, 0.0042, PALETTE.outline)
  elbow.add(elbowCap)

  const paddle = new THREE.Mesh(egg(0.052, 0.075, 0.024, 0.07), wingSkin)
  paddle.position.set(0, -0.050, 0.012)
  addOutline(paddle, 0.005, PALETTE.outline)
  elbow.add(paddle)

  // 깃털 손가락 3가닥 — 뚜렷한 둥근 로브, 뿌리는 패들 안에 파묻힘 (curl/spread 구동)
  const fingers: THREE.Group[] = []
  for (let i = -1; i <= 1; i++) {
    const pivot = new THREE.Group()
    pivot.position.set(i * 0.027, -0.094, 0.004)
    const f = new THREE.Mesh(featherLobe(0.085, 0.036, 0.6, -0.14), wingSkin)
    f.rotation.z = Math.PI // 끝이 아래로
    addOutline(f, 0.004, PALETTE.outline)
    pivot.add(f)
    elbow.add(pivot)
    fingers.push(pivot)
  }
  return { side, shoulder, elbow, paddle, fingers }
}

function buildLeg(side: 1 | -1): THREE.Group {
  const skin = toonMat(PALETTE.beakSalmon, PALETTE.blush)
  const hip = new THREE.Group()
  // 다리를 약간 짧게 + 허벅지 윗동을 몸통에 더 파묻어 둥근 몸이 실루엣의 주인공이 되게
  hip.position.set(side * 0.056, 0.212, -0.004)

  const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.019, 0.050, 6, 14), skin)
  thigh.position.set(0, -0.046, 0)
  addOutline(thigh, 0.0032, PALETTE.outline)
  hip.add(thigh)

  const knee = new THREE.Group()
  knee.position.set(0, -0.092, 0)
  knee.rotation.x = 0.22 // 무릎 살짝 뒤로
  hip.add(knee)

  // 무릎 캡: 허벅지(r0.019)↔정강이(r0.017) 반지름 차 이음새를 숨기는 라운드 필러
  const kneeCap = new THREE.Mesh(unitSphereLo(), skin)
  kneeCap.scale.setScalar(0.0185)
  addOutline(kneeCap, 0.0030, PALETTE.outline)
  knee.add(kneeCap)

  const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, 0.080, 6, 14), skin)
  shin.position.set(0, -0.050, 0)
  addOutline(shin, 0.0030, PALETTE.outline)
  knee.add(shin)

  const ankle = new THREE.Group()
  ankle.position.set(0, -0.110, 0)
  ankle.rotation.x = -0.22
  ankle.rotation.y = side * 0.16 // 발끝 살짝 바깥
  knee.add(ankle)

  // 발 + 둥근 발가락 스캘럽 3개 — 정적 형제라 1지오메트리로 병합 (드로우콜 2개: 필+아웃라인)
  const footGeo = mergeShapes([
    { g: unitSphere(), p: [0, -0.004, 0.026], s: [0.034, 0.013, 0.044] },
    { g: unitSphereLo(), p: [-0.021, -0.005, 0.056], s: [0.016, 0.011, 0.020] },
    { g: unitSphereLo(), p: [0, -0.005, 0.066], s: [0.017, 0.012, 0.021] },
    { g: unitSphereLo(), p: [0.021, -0.005, 0.056], s: [0.016, 0.011, 0.020] },
  ])
  const foot = new THREE.Mesh(footGeo, skin)
  addOutline(foot, 0.0032, PALETTE.outline)
  ankle.add(foot)
  return hip
}

export function buildBody(): BodyRig {
  const group = new THREE.Group()
  const plume = toonMat(PALETTE.plumageBase, PALETTE.plumageShade)
  const cream = toonMat(PALETTE.chestFluffCream, PALETTE.chestFluffShade)
  const gold = toonMat(PALETTE.scarfGold, PALETTE.scarfGoldShade)

  // 몸통 계란 (아래가 넓음)
  const torso = new THREE.Mesh(egg(0.162, 0.170, 0.146, -0.10), plume)
  torso.position.set(0, 0.35, 0)
  addOutline(torso, 0.0062, PALETTE.outline)
  group.add(torso)

  // 배 패치 (밝은 톤, 2D의 라이트 패널)
  const belly = new THREE.Mesh(unitSphere(), unlitMat(PALETTE.chestFluffShade))
  belly.scale.set(0.104, 0.122, 0.045)
  belly.position.set(0, 0.318, 0.104)
  belly.rotation.x = -0.12
  group.add(belly)

  // 가슴 fluff 러프 (호흡 타깃): 칼라 + 앞쪽 스캘럽 범프 — 정적 형제 병합 (드로우콜 16→2)
  const fluff = new THREE.Group()
  fluff.position.set(0, 0.478, 0.012)
  const nBump = 7
  const fluffParts = [
    { g: unitSphere(), p: [0, 0, 0.006] as [number, number, number], s: [0.132, 0.056, 0.112] as [number, number, number] },
  ]
  for (let i = 0; i < nBump; i++) {
    const x = -0.105 + (0.21 * i) / (nBump - 1)
    const zf = Math.sqrt(Math.max(0.1, 1 - (x / 0.132) ** 2))
    fluffParts.push({
      g: unitSphereLo(),
      p: [x, -0.042 + 0.006 * Math.cos((i / (nBump - 1)) * Math.PI * 2), 0.104 * zf * 0.92],
      s: [0.0235, 0.0235, 0.0235],
    })
  }
  const fluffMesh = new THREE.Mesh(mergeShapes(fluffParts), cream)
  addOutline(fluffMesh, 0.0046, PALETTE.outline)
  fluff.add(fluffMesh)
  group.add(fluff)

  // 스카프 (골드 밴드 + 보우 + 진주참), 테일은 캐릭터 오른쪽(-x)으로
  const bandGeo = new THREE.TorusGeometry(0.0355, 0.0105, 12, 28)
  bandGeo.rotateX(Math.PI / 2)
  const band = new THREE.Mesh(bandGeo, gold)
  band.position.set(0, 0.548, 0.006)
  addOutline(band, 0.004, PALETTE.outline)
  group.add(band)

  const bow = new THREE.Group()
  bow.position.set(0, 0.543, 0.048)
  const knot = new THREE.Mesh(unitSphereLo(), gold)
  knot.scale.setScalar(0.0105)
  addOutline(knot, 0.0032, PALETTE.outline)
  bow.add(knot)
  for (const s of [1, -1] as const) {
    const loop = new THREE.Mesh(unitSphereLo(), gold)
    loop.scale.set(0.0210, 0.0115, 0.0075)
    loop.position.set(s * 0.0215, 0.0035, -0.002)
    loop.rotation.z = s * 0.45
    addOutline(loop, 0.0034, PALETTE.outline)
    bow.add(loop)
  }
  const pearl = new THREE.Mesh(unitSphereLo(), unlitMat(PALETTE.white))
  pearl.scale.setScalar(0.0092)
  pearl.position.set(0, -0.001, 0.009)
  addOutline(pearl, 0.0022, PALETTE.scarfGoldShade)
  bow.add(pearl)
  group.add(bow)

  const scarfTail = new THREE.Group()
  scarfTail.position.set(-0.030, 0.538, 0.085)
  const ribbonGeo = mergeShapes(
    ([[0.095, 0.027, -0.50], [0.075, 0.023, -0.22]] as Array<[number, number, number]>).map(([len, w, rz]) => ({
      g: teardrop(len, w, 0.45),
      r: [0.45, 0, Math.PI + rz] as [number, number, number], // 끝 아래로 + 캐릭터 오른쪽, fluff 경사에 눕힘
    })),
  )
  const ribbons = new THREE.Mesh(ribbonGeo, gold)
  addOutline(ribbons, 0.0036, PALETTE.outline)
  scarfTail.add(ribbons)
  group.add(scarfTail)

  // 꼬리깃 3가닥 (뒤-왼쪽 아래) — 병합
  const tail = new THREE.Group()
  tail.position.set(-0.095, 0.245, -0.052)
  const tailMat = toonMat(PALETTE.plumageShade, PALETTE.browTone)
  const tailGeo = mergeShapes(
    [0, 1, 2].map((i) => ({
      g: teardrop(0.075 - i * 0.011, 0.031 - i * 0.004, 0.55),
      r: [-0.40, 0, Math.PI - 0.55 + i * 0.38] as [number, number, number],
    })),
  )
  const tailMesh = new THREE.Mesh(tailGeo, tailMat)
  addOutline(tailMesh, 0.0040, PALETTE.outline)
  tail.add(tailMesh)
  group.add(tail)

  // 목 체인 3본 + 오버랩 캡슐 (본마다 하나)
  const neckSkin = plume
  const neck1 = new THREE.Group()
  neck1.position.set(0, 0.495, 0.008)
  const neck2 = new THREE.Group()
  neck2.position.set(0, NECK_SEG, 0)
  const neck3 = new THREE.Group()
  neck3.position.set(0, NECK_SEG, 0)
  const headSocket = new THREE.Group()
  headSocket.position.set(0, NECK_SEG, 0)
  neck1.add(neck2)
  neck2.add(neck3)
  neck3.add(headSocket)
  for (const bone of [neck1, neck2, neck3]) {
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.031, 0.05, 6, 18), neckSkin)
    seg.position.set(0, 0.029, 0)
    addOutline(seg, 0.0042, PALETTE.outline)
    bone.add(seg)
  }
  group.add(neck1)

  // 날개 + 다리
  const wingL = buildWing(1)
  const wingR = buildWing(-1)
  group.add(wingL.shoulder, wingR.shoulder)
  group.add(buildLeg(1), buildLeg(-1))

  return { group, torso, fluff, scarfTail, tail, neck: [neck1, neck2, neck3], headSocket, wingL, wingR }
}
