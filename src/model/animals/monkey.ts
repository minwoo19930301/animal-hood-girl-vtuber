import * as THREE from 'three'
import { unitSphereLo } from '../geo'
import { addOutline, toonMat, unlitMat } from '../materials'
import type { AnimalBuildContext, AnimalCostumeRig } from './types'

const COL = {
  cocoa: 0x8f5b3f,
  cocoaShade: 0x674035,
  cocoaDark: 0x3b2525,
  tan: 0xf0b67d,
  tanShade: 0xd58b5f,
  peach: 0xf7c69d,
  mustard: 0xe4aa2e,
  mustardShade: 0xba7628,
  mustardLight: 0xf4c64d,
  burgundy: 0x75283f,
  burgundyShade: 0x4c1b31,
  outline: 0x2c1b24,
  shine: 0xfff1d7,
} as const

function addOrb(
  parent: THREE.Object3D,
  name: string,
  material: THREE.Material,
  scale: [number, number, number],
  position: [number, number, number],
  outlineWidth = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(unitSphereLo(), material)
  mesh.name = name
  mesh.scale.set(...scale)
  mesh.position.set(...position)
  if (outlineWidth > 0) addOutline(mesh, outlineWidth, COL.outline)
  parent.add(mesh)
  return mesh
}

function curvedTube(points: THREE.Vector3[], radius: number, segments = 22): THREE.TubeGeometry {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points, false, 'centripetal'),
    segments,
    radius,
    8,
    false,
  )
}

/**
 * 오픈 페이스 원숭이 후드 + 봄버 재킷.
 *
 * 모든 머리 지오메트리는 normalized head 본의 -Z를 정면으로 보고 만든다.
 * VRM1에서는 headRoot 하나만 뒤집어 귀/얼굴 장식의 좌우 관계를 그대로 보존한다.
 */
export function buildMonkey(context: AnimalBuildContext): AnimalCostumeRig {
  const { crownH: L, halfW, face, bones, S } = context
  const hitMeshes: THREE.Mesh[] = []

  const headRoot = new THREE.Group()
  headRoot.name = 'MonkeyCostumeHead'
  if (S === -1) headRoot.rotation.y = Math.PI

  const headFollow = new THREE.Group()
  headFollow.name = 'MonkeyHoodFollow'
  headRoot.add(headFollow)

  const muzzleFollow = new THREE.Group()
  muzzleFollow.name = 'MonkeyMuzzleFollow'
  headFollow.add(muzzleFollow)

  const cocoa = toonMat(COL.cocoa, COL.cocoaShade)
  const cocoaDark = unlitMat(COL.cocoaDark)
  const tan = toonMat(COL.tan, COL.tanShade)
  const peach = toonMat(COL.peach, COL.tanShade)
  const mustard = toonMat(COL.mustard, COL.mustardShade)
  const burgundy = toonMat(COL.burgundy, COL.burgundyShade)

  const measuredFaceW = face?.halfW ?? halfW
  const faceHalfW = THREE.MathUtils.clamp(
    Math.max(measuredFaceW, halfW * 0.9),
    L * 0.42,
    L * 0.82,
  )
  const faceZ = face?.frontZ ?? -L * 0.5
  const hoodRx = Math.max(faceHalfW + L * 0.12, halfW * 1.38, L * 0.63)
  const hoodRy = L * 0.82
  const hoodRz = Math.max(L * 0.78, Math.abs(faceZ) + L * 0.34)
  const capY = L * 0.3
  const capZ = faceZ + L * 0.13

  // 뒷머리 반구와 앞쪽 타원 림을 나눠 얼굴 중앙을 실제로 비운다.
  const rearCap = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 32, 0, Math.PI, 0.025 * Math.PI, 0.95 * Math.PI),
    cocoa,
  )
  rearCap.name = 'MonkeyCocoaHood'
  rearCap.scale.set(hoodRx, hoodRy, hoodRz)
  rearCap.position.set(0, capY, capZ)
  addOutline(rearCap, L * 0.025, COL.outline)
  headFollow.add(rearCap)
  hitMeshes.push(rearCap)

  const faceRim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.18, 14, 64), cocoa)
  faceRim.name = 'MonkeyFaceOpening'
  faceRim.scale.set(hoodRx / 1.18, (L * 0.73) / 1.18, L * 0.3)
  faceRim.position.set(0, L * 0.2, capZ - L * 0.008)
  addOutline(faceRim, L * 0.022, COL.outline)
  headFollow.add(faceRim)
  hitMeshes.push(faceRim)

  // 큰 원형 귀. 안쪽 패드는 외피보다 정면(-Z)으로 나와 읽히게 한다.
  const earGroups: Array<{ side: -1 | 1; group: THREE.Group }> = []
  for (const side of [-1, 1] as const) {
    const ear = new THREE.Group()
    ear.name = side < 0 ? 'MonkeyEarL' : 'MonkeyEarR'
    ear.position.set(side * (hoodRx + L * 0.15), L * 0.38, capZ + L * 0.04)
    ear.rotation.set(0, side * 0.1, side * 0.055)
    headFollow.add(ear)

    const outer = addOrb(
      ear,
      'MonkeyEarOuter',
      cocoa,
      [L * 0.29, L * 0.32, L * 0.115],
      [0, 0, 0],
      L * 0.022,
    )
    addOrb(
      ear,
      'MonkeyEarInner',
      peach,
      [L * 0.17, L * 0.205, L * 0.045],
      [0, -L * 0.008, -L * 0.112],
    )
    hitMeshes.push(outer)
    earGroups.push({ side, group: ear })
  }

  // 탄색 볼 패드는 눈 바깥쪽에만 둬 VRM 눈꺼풀과 시선을 가리지 않는다.
  for (const side of [-1, 1] as const) {
    const pad = addOrb(
      headFollow,
      side < 0 ? 'MonkeyFacePadL' : 'MonkeyFacePadR',
      tan,
      [L * 0.16, L * 0.20, L * 0.050],
      [side * L * 0.39, L * 0.08, faceZ + L * 0.074],
      L * 0.013,
    )
    hitMeshes.push(pad)

    // 비대칭으로 살짝 치켜뜬 굵은 눈썹.
    const browZ = faceZ - L * 0.042
    const brow = new THREE.Mesh(
      curvedTube(
        [
          new THREE.Vector3(side * L * 0.46, L * 0.365, browZ),
          new THREE.Vector3(side * L * 0.31, L * (side < 0 ? 0.435 : 0.42), browZ - L * 0.006),
          new THREE.Vector3(side * L * 0.115, L * 0.37, browZ),
        ],
        L * 0.027,
        18,
      ),
      cocoaDark,
    )
    brow.name = side < 0 ? 'MonkeyBrowL' : 'MonkeyBrowR'
    headFollow.add(brow)
  }

  // 볼록한 복숭아빛 주둥이. 별도 follow 그룹이라 고개 움직임에 미세한 지연을 줄 수 있다.
  const muzzleBaseY = -L * 0.105
  muzzleFollow.position.set(0, muzzleBaseY, faceZ - L * 0.072)

  const muzzle = addOrb(
    muzzleFollow,
    'MonkeyMuzzle',
    peach,
    [L * 0.25, L * 0.13, L * 0.085],
    [0, 0, 0],
    L * 0.018,
  )
  addOrb(
    muzzleFollow,
    'MonkeyMuzzleLobeL',
    tan,
    [L * 0.12, L * 0.095, L * 0.070],
    [-L * 0.12, L * 0.045, -L * 0.04],
  )
  addOrb(
    muzzleFollow,
    'MonkeyMuzzleLobeR',
    tan,
    [L * 0.12, L * 0.095, L * 0.070],
    [L * 0.12, L * 0.045, -L * 0.04],
  )
  hitMeshes.push(muzzle)

  for (const side of [-1, 1] as const) {
    addOrb(
      muzzleFollow,
      side < 0 ? 'MonkeyNostrilL' : 'MonkeyNostrilR',
      cocoaDark,
      [L * 0.047, L * 0.027, L * 0.016],
      [side * L * 0.092, L * 0.063, -L * 0.145],
    )
  }

  // 입 중앙은 비워 VRM mouth/viseme가 그대로 보인다.

  // 작은 S자 컬. 림보다 한 겹 앞에 두어 측면에서도 실루엣이 끊기지 않는다.
  const curlZ = capZ - L * 0.075
  const forelock = new THREE.Mesh(
    curvedTube(
      [
        new THREE.Vector3(-L * 0.085, L * 0.81, curlZ),
        new THREE.Vector3(0, L * 0.9, curlZ - L * 0.01),
        new THREE.Vector3(L * 0.11, L * 0.86, curlZ - L * 0.015),
        new THREE.Vector3(L * 0.115, L * 0.755, curlZ - L * 0.02),
        new THREE.Vector3(L * 0.035, L * 0.72, curlZ - L * 0.025),
        new THREE.Vector3(-L * 0.018, L * 0.765, curlZ - L * 0.026),
      ],
      L * 0.033,
      30,
    ),
    cocoaDark,
  )
  forelock.name = 'MonkeyCurledForelock'
  headFollow.add(forelock)

  // 재킷 몸판: upperChest/chest 본에, 세부는 모두 -Z 앞면에 배치한다.
  const jacketRoot = new THREE.Group()
  jacketRoot.name = 'MonkeyMustardBomber'
  if (S === -1) jacketRoot.rotation.y = Math.PI

  const jacketBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.72, 8, 24), mustard)
  jacketBody.name = 'MonkeyBomberBody'
  const bodyScale = new THREE.Vector3(L * 1.38, L, L * 0.76)
  jacketBody.scale.copy(bodyScale)
  jacketBody.position.set(0, -L * 0.35, 0)
  addOutline(jacketBody, L * 0.023, COL.outline)
  jacketRoot.add(jacketBody)

  // 앞 중심 지퍼와 두 갈래 립 칼라.
  const zipper = new THREE.Mesh(
    new THREE.BoxGeometry(L * 0.048, L * 1.18, L * 0.038),
    unlitMat(COL.burgundy),
  )
  zipper.name = 'MonkeyBomberZipper'
  zipper.position.set(0, -L * 0.36, -L * 0.395)
  jacketRoot.add(zipper)

  for (const side of [-1, 1] as const) {
    const collar = new THREE.Mesh(new THREE.CapsuleGeometry(L * 0.055, L * 0.24, 5, 12), burgundy)
    collar.name = side < 0 ? 'MonkeyCollarL' : 'MonkeyCollarR'
    collar.position.set(side * L * 0.135, L * 0.39, -L * 0.365)
    collar.rotation.z = side * 0.56
    addOutline(collar, L * 0.013, COL.outline)
    jacketRoot.add(collar)

    const pocket = new THREE.Mesh(
      new THREE.CapsuleGeometry(L * 0.023, L * 0.25, 4, 8),
      unlitMat(COL.burgundy),
    )
    pocket.name = side < 0 ? 'MonkeyPocketL' : 'MonkeyPocketR'
    pocket.position.set(side * L * 0.36, -L * 0.55, -L * 0.397)
    pocket.rotation.z = side * 0.66
    jacketRoot.add(pocket)
  }

  const zipperPull = new THREE.Mesh(
    new THREE.TorusGeometry(L * 0.04, L * 0.009, 6, 18),
    unlitMat(COL.shine),
  )
  zipperPull.name = 'MonkeyZipperPull'
  zipperPull.position.set(L * 0.018, L * 0.02, -L * 0.425)
  jacketRoot.add(zipperPull)

  const waist = new THREE.Mesh(
    new THREE.CapsuleGeometry(L * 0.1, L * 1.06, 5, 18),
    burgundy,
  )
  waist.name = 'MonkeyBomberWaistband'
  waist.rotation.z = Math.PI / 2
  waist.position.set(0, -L * 1.18, 0)
  waist.scale.z = 3.15
  addOutline(waist, L * 0.018, COL.outline)
  jacketRoot.add(waist)

  // 작은 금색 스냅이 단색 몸판을 나눠 봄버 재킷 느낌을 강화한다.
  for (const y of [-0.18, -0.52, -0.86]) {
    addOrb(
      jacketRoot,
      'MonkeyBomberSnap',
      unlitMat(COL.mustardLight),
      [L * 0.025, L * 0.025, L * 0.012],
      [L * 0.065, L * y, -L * 0.425],
    )
  }

  if (bones.chest) {
    bones.chest.add(jacketRoot)
    hitMeshes.push(jacketBody)
  }

  // 상완 본마다 소매와 버건디 커프를 직접 붙여 손/팔 FK를 그대로 따라간다.
  for (const [side, bone] of [
    [-1, bones.upperArmL],
    [1, bones.upperArmR],
  ] as const) {
    if (!bone) continue

    const sleeveRoot = new THREE.Group()
    sleeveRoot.name = side < 0 ? 'MonkeyBomberSleeveL' : 'MonkeyBomberSleeveR'
    bone.add(sleeveRoot)

    const sleeve = new THREE.Mesh(
      new THREE.CapsuleGeometry(L * 0.215, L * 0.62, 7, 18),
      mustard,
    )
    sleeve.name = 'MonkeyBomberSleeve'
    sleeve.rotation.z = -side * Math.PI / 2
    sleeve.position.set(side * L * 0.5, 0, 0)
    sleeve.scale.z = 1.12
    addOutline(sleeve, L * 0.021, COL.outline)
    sleeveRoot.add(sleeve)

    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(L * 0.235, L * 0.215, L * 0.17, 24),
      burgundy,
    )
    cuff.name = 'MonkeyBomberCuff'
    cuff.rotation.z = -side * Math.PI / 2
    cuff.position.set(side * L * 1.02, 0, 0)
    addOutline(cuff, L * 0.016, COL.outline)
    sleeveRoot.add(cuff)

    hitMeshes.push(sleeve, cuff)
  }

  let elapsed = 0
  const update = (pitchS: number, yaw: number, breath: number, dt: number) => {
    elapsed += THREE.MathUtils.clamp(dt, 0, 0.05)
    const idle = Math.sin(elapsed * 2.7) * 0.012
    const b = THREE.MathUtils.clamp(breath, -1, 1)
    const y = THREE.MathUtils.clamp(yaw, -0.8, 0.8)

    for (const { side, group } of earGroups) {
      group.rotation.z = side * (0.055 + b * 0.018 + idle) - y * 0.035
    }
    forelock.rotation.z = -y * 0.055 + Math.sin(elapsed * 3.6) * 0.018
    muzzleFollow.position.y =
      muzzleBaseY + THREE.MathUtils.clamp(-pitchS, -0.5, 0.5) * L * 0.012
    jacketBody.scale.z = bodyScale.z * (1 + b * 0.009)
  }

  return { headRoot, headFollow, muzzleFollow, hitMeshes, update }
}
