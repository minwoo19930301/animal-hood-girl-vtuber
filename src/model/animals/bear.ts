/**
 * Brown-bear kigurumi costume.
 *
 * All geometry is authored in the normalized humanoid frame (front = -Z).
 * The head root, jacket body, and detached sleeve roots are turned around for
 * VRM1 so the costume presents the same way on either donor model.
 */
import * as THREE from 'three'
import { PALETTE } from '../../palette'
import { ellipseArcTube, unitSphere, unitSphereLo } from '../geo'
import { addOutline, toonMat, unlitMat } from '../materials'
import type { AnimalBuildContext, AnimalCostumeRig } from './types'

const BEAR = {
  caramel: 0xb97742,
  caramelShade: 0x875038,
  cocoa: 0x4b2d2a,
  cocoaShade: 0x321d22,
  cream: 0xffe6bd,
  creamShade: 0xe7bd88,
  innerEar: 0xd99a69,
  forest: 0x245d49,
  forestShade: 0x183f3b,
  varsityCream: 0xffedcf,
  varsityCreamShade: 0xd9c49e,
  tan: 0xc98d55,
  tanShade: 0x97613f,
  brass: 0xf3bd63,
} as const

interface Aperture {
  x: number
  up: number
  down: number
}

/**
 * Ellipsoid-ready hood shell with an actual open face.
 *
 * Vertices inside the aperture are first snapped to the elliptical rim, then
 * triangles fully inside it are removed. Snapping the boundary vertices is
 * important: simply dropping triangles leaves a jagged opening and occasional
 * long "web" triangles across the face.
 */
function openHoodGeometry(aperture: Aperture, tilt: number, bias: number): THREE.BufferGeometry {
  // Stop just above the south pole to leave a second, broad neck opening.
  const geometry = new THREE.SphereGeometry(1, 52, 38, 0, Math.PI * 2, 0, Math.PI * 0.91)
  const forward = new THREE.Vector3(0, -Math.sin(tilt), -Math.cos(tilt))
  const right = new THREE.Vector3(1, 0, 0)
  const down = new THREE.Vector3().crossVectors(forward, right)
  const position = geometry.attributes.position
  const inside = new Array<boolean>(position.count).fill(false)
  const direction = new THREE.Vector3()
  const radial = new THREE.Vector3()

  for (let i = 0; i < position.count; i++) {
    direction.set(position.getX(i), position.getY(i), position.getZ(i)).normalize()
    const along = THREE.MathUtils.clamp(direction.dot(forward), -1, 1)
    const theta = Math.acos(along)
    radial.copy(direction).addScaledVector(forward, -along)
    const phi = Math.atan2(radial.dot(down), radial.dot(right))
    const verticalRadius = Math.sin(phi) >= 0 ? aperture.down : aperture.up
    const a = verticalRadius * Math.cos(phi)
    const b = aperture.x * Math.sin(phi)
    const rimTheta = (aperture.x * verticalRadius) / Math.sqrt(a * a + b * b)

    if (theta < rimTheta) {
      inside[i] = true
      direction
        .copy(forward)
        .multiplyScalar(Math.cos(rimTheta))
        .addScaledVector(right, Math.cos(phi) * Math.sin(rimTheta))
        .addScaledVector(down, Math.sin(phi) * Math.sin(rimTheta))
      position.setXYZ(i, direction.x, direction.y, direction.z)
    }
  }

  const index = geometry.getIndex()
  if (index) {
    const kept: number[] = []
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i)
      const b = index.getX(i + 1)
      const c = index.getX(i + 2)
      if (inside[a] && inside[b] && inside[c]) continue
      kept.push(a, b, c)
    }
    geometry.setIndex(kept)
  }

  // A little more volume at the cheeks, less at the crown.
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i)
    const width = 1 + bias * y
    position.setX(i, position.getX(i) * width)
    position.setZ(i, position.getZ(i) * width)
  }
  geometry.computeVertexNormals()
  return geometry
}

function addEar(
  parent: THREE.Object3D,
  side: -1 | 1,
  x: number,
  y: number,
  z: number,
  H: number,
  hitMeshes: THREE.Mesh[],
): THREE.Group {
  const earRoot = new THREE.Group()
  earRoot.name = side < 0 ? 'BearEarL' : 'BearEarR'
  earRoot.position.set(side * x, y, z)
  earRoot.rotation.z = side * -0.13

  const outer = new THREE.Mesh(
    unitSphereLo(),
    toonMat(BEAR.caramel, BEAR.caramelShade),
  )
  outer.scale.set(H * 0.30, H * 0.32, H * 0.13)
  addOutline(outer, H * 0.022, PALETTE.nightPurple)

  const inner = new THREE.Mesh(
    unitSphereLo(),
    toonMat(BEAR.innerEar, BEAR.creamShade),
  )
  inner.position.set(0, H * 0.004, -H * 0.106)
  inner.scale.set(H * 0.178, H * 0.195, H * 0.032)

  earRoot.add(outer, inner)
  parent.add(earRoot)
  hitMeshes.push(outer)
  return earRoot
}

function addVarsityPatch(parent: THREE.Object3D, H: number, frontZ: number): void {
  const patch = new THREE.Group()
  patch.name = 'BearPawVarsityPatch'
  patch.position.set(-H * 0.30, -H * 0.40, frontZ)
  patch.rotation.y = Math.PI

  const disk = new THREE.Mesh(
    new THREE.CylinderGeometry(H * 0.145, H * 0.145, H * 0.025, 24),
    toonMat(BEAR.varsityCream, BEAR.varsityCreamShade),
  )
  disk.rotation.x = Math.PI / 2
  addOutline(disk, H * 0.012, BEAR.cocoa)
  patch.add(disk)

  // Four simple pads read as a paw even at desktop-mascot scale.
  const pad = new THREE.Mesh(unitSphereLo(), unlitMat(BEAR.tan))
  pad.position.set(0, -H * 0.026, -H * 0.025)
  pad.scale.set(H * 0.064, H * 0.052, H * 0.014)
  patch.add(pad)
  for (const x of [-0.065, -0.022, 0.022, 0.065]) {
    const toe = new THREE.Mesh(unitSphereLo(), unlitMat(BEAR.tan))
    toe.position.set(H * x, H * 0.054, -H * 0.026)
    toe.scale.set(H * 0.025, H * 0.032, H * 0.012)
    patch.add(toe)
  }
  parent.add(patch)
}

function addJacket(
  context: AnimalBuildContext,
  H: number,
  hitMeshes: THREE.Mesh[],
): void {
  const { chest, upperArmL, upperArmR } = context.bones
  const turn = context.S === -1 ? Math.PI : 0

  if (chest) {
    const jacket = new THREE.Group()
    jacket.name = 'BearForestVarsityJacket'
    jacket.rotation.y = turn

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(H * 0.65, H * 0.62, 10, 28),
      toonMat(BEAR.forest, BEAR.forestShade),
    )
    body.name = 'BearVarsityBody'
    body.position.set(0, -H * 0.70, -H * 0.105)
    body.scale.z = 0.40
    addOutline(body, H * 0.024, PALETTE.nightPurple)
    jacket.add(body)
    hitMeshes.push(body)

    // Cream ribbed collar: two soft lapels keep the real neck area open.
    for (const side of [-1, 1] as const) {
      const lapel = new THREE.Mesh(
        new THREE.CapsuleGeometry(H * 0.058, H * 0.35, 6, 16),
        toonMat(BEAR.varsityCream, BEAR.varsityCreamShade),
      )
      lapel.position.set(side * H * 0.145, -H * 0.16, -H * 0.385)
      lapel.rotation.z = side * -0.52
      lapel.scale.z = 0.52
      jacket.add(lapel)

      const pocket = new THREE.Mesh(
        new THREE.CapsuleGeometry(H * 0.027, H * 0.25, 5, 12),
        toonMat(BEAR.tan, BEAR.tanShade),
      )
      pocket.position.set(side * H * 0.39, -H * 0.91, -H * 0.382)
      pocket.rotation.z = side * -0.78
      pocket.scale.z = 0.48
      jacket.add(pocket)
    }

    const placket = new THREE.Mesh(
      new THREE.BoxGeometry(H * 0.045, H * 1.12, H * 0.025),
      toonMat(BEAR.tan, BEAR.tanShade),
    )
    placket.position.set(0, -H * 0.74, -H * 0.383)
    jacket.add(placket)

    for (const y of [-0.34, -0.61, -0.88, -1.15]) {
      const snap = new THREE.Mesh(unitSphereLo(), unlitMat(BEAR.brass))
      snap.position.set(0, H * y, -H * 0.410)
      snap.scale.setScalar(H * 0.030)
      jacket.add(snap)
    }

    const waistband = new THREE.Mesh(
      new THREE.CapsuleGeometry(H * 0.052, H * 1.15, 6, 18),
      toonMat(BEAR.tan, BEAR.tanShade),
    )
    waistband.position.set(0, -H * 1.50, -H * 0.145)
    waistband.rotation.z = Math.PI / 2
    waistband.scale.z = 0.70
    jacket.add(waistband)

    addVarsityPatch(jacket, H, -H * 0.404)
    chest.add(jacket)
  }

  for (const [side, bone] of [
    [-1, upperArmL],
    [1, upperArmR],
  ] as const) {
    if (!bone) continue
    const sleeveRoot = new THREE.Group()
    sleeveRoot.name = side < 0 ? 'BearVarsitySleeveL' : 'BearVarsitySleeveR'
    sleeveRoot.rotation.y = turn

    // The PI turn flips X too, so pre-compensate its authored arm direction.
    const armX = side * context.S
    const sleeve = new THREE.Mesh(
      new THREE.CapsuleGeometry(H * 0.285, H * 0.82, 9, 24),
      toonMat(BEAR.varsityCream, BEAR.varsityCreamShade),
    )
    sleeve.position.set(armX * H * 0.62, 0, -H * 0.020)
    sleeve.rotation.z = Math.PI / 2
    sleeve.scale.z = 0.82
    addOutline(sleeve, H * 0.021, PALETTE.nightPurple)
    sleeveRoot.add(sleeve)
    hitMeshes.push(sleeve)

    const shoulderBand = new THREE.Mesh(
      new THREE.CylinderGeometry(H * 0.292, H * 0.292, H * 0.12, 24),
      toonMat(BEAR.forest, BEAR.forestShade),
    )
    shoulderBand.position.set(armX * H * 0.16, 0, -H * 0.020)
    shoulderBand.rotation.z = Math.PI / 2
    shoulderBand.scale.z = 0.84
    sleeveRoot.add(shoulderBand)

    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(H * 0.30, H * 0.27, H * 0.21, 24),
      toonMat(BEAR.tan, BEAR.tanShade),
    )
    cuff.position.set(armX * H * 1.24, 0, -H * 0.020)
    cuff.rotation.z = Math.PI / 2
    cuff.scale.z = 0.85
    addOutline(cuff, H * 0.015, BEAR.cocoa)
    sleeveRoot.add(cuff)
    hitMeshes.push(cuff)

    bone.add(sleeveRoot)
  }
}

export function buildBear(context: AnimalBuildContext): AnimalCostumeRig {
  const H = Math.max(context.crownH, 0.001)
  const faceZ = context.face?.frontZ ?? -H * 0.50
  const faceHalfW = context.face?.halfW ?? Math.max(context.halfW * 0.82, H * 0.42)
  const hitMeshes: THREE.Mesh[] = []

  const headRoot = new THREE.Group()
  headRoot.name = 'BearCostume'
  if (context.S === -1) headRoot.rotation.y = Math.PI

  const headFollow = new THREE.Group()
  headFollow.name = 'BearHoodFollow'
  headRoot.add(headFollow)

  const tilt = 0.20
  const center = new THREE.Vector3(0, H * 0.40, H * 0.085)
  const rx = Math.max(
    H * 0.73,
    context.halfW * 1.52,
    (faceHalfW + H * 0.045) / Math.sin(0.93),
  )
  const ry = H * 0.79
  const rz = Math.max(
    H * 0.68,
    context.halfW * 1.58,
    (center.z - faceZ + H * 0.045) / Math.cos(0.68 - tilt),
  )

  const shell = new THREE.Mesh(
    openHoodGeometry({ x: 0.93, up: 0.68, down: 1.15 }, tilt, -0.075),
    toonMat(BEAR.caramel, BEAR.caramelShade),
  )
  shell.name = 'BearOpenFaceHood'
  shell.position.copy(center)
  shell.scale.set(rx, ry, rz)
  addOutline(shell, H * 0.028, PALETTE.nightPurple)
  headFollow.add(shell)
  hitMeshes.push(shell)

  // A narrow cream lining band traces the hole but retains its true opening.
  const lining = new THREE.Mesh(
    openHoodGeometry({ x: 0.875, up: 0.615, down: 1.09 }, tilt, -0.075),
    toonMat(BEAR.cream, BEAR.creamShade, { doubleSide: true }),
  )
  lining.name = 'BearHoodCreamLining'
  lining.position.copy(center)
  lining.scale.set(rx * 0.982, ry * 0.982, rz * 0.986)
  headFollow.add(lining)

  const earL = addEar(
    headFollow,
    -1,
    rx * 0.80,
    center.y + ry * 0.64,
    center.z - rz * 0.06,
    H,
    hitMeshes,
  )
  const earR = addEar(
    headFollow,
    1,
    rx * 0.80,
    center.y + ry * 0.64,
    center.z - rz * 0.06,
    H,
    hitMeshes,
  )

  // The costume's own bear face sits above the human face aperture.
  const muzzleFollow = new THREE.Group()
  muzzleFollow.name = 'BearMuzzleFollow'
  muzzleFollow.position.set(0, center.y + ry * 0.67, center.z - rz * 0.87)
  headFollow.add(muzzleFollow)

  for (const side of [-1, 1] as const) {
    const muzzleLobe = new THREE.Mesh(
      unitSphere(),
      toonMat(BEAR.cream, BEAR.creamShade),
    )
    muzzleLobe.position.set(side * H * 0.092, -H * 0.055, 0)
    muzzleLobe.scale.set(H * 0.165, H * 0.128, H * 0.070)
    addOutline(muzzleLobe, H * 0.014, BEAR.cocoa)
    muzzleFollow.add(muzzleLobe)
    hitMeshes.push(muzzleLobe)

    const browPatch = new THREE.Mesh(
      unitSphereLo(),
      toonMat(BEAR.cream, BEAR.creamShade),
    )
    browPatch.position.set(side * H * 0.225, H * 0.145, H * 0.010)
    browPatch.scale.set(H * 0.135, H * 0.070, H * 0.032)
    muzzleFollow.add(browPatch)

    const eye = new THREE.Mesh(unitSphereLo(), unlitMat(BEAR.cocoaShade))
    eye.position.set(side * H * 0.205, H * 0.080, -H * 0.035)
    eye.scale.set(H * 0.035, H * 0.046, H * 0.018)
    muzzleFollow.add(eye)

    const brow = new THREE.Mesh(
      new THREE.CapsuleGeometry(H * 0.014, H * 0.105, 5, 10),
      unlitMat(BEAR.cocoa),
    )
    brow.position.set(side * H * 0.222, H * 0.160, -H * 0.027)
    brow.rotation.z = Math.PI / 2 + side * 0.14
    muzzleFollow.add(brow)
  }

  const nose = new THREE.Mesh(
    unitSphereLo(),
    toonMat(BEAR.cocoa, BEAR.cocoaShade),
  )
  nose.position.set(0, H * 0.002, -H * 0.070)
  nose.scale.set(H * 0.120, H * 0.082, H * 0.060)
  addOutline(nose, H * 0.012, PALETTE.nightPurple)
  muzzleFollow.add(nose)
  hitMeshes.push(nose)

  const mouth = new THREE.Mesh(
    ellipseArcTube(H * 0.105, H * 0.062, -H * 0.070, 200, 340, H * 0.010),
    unlitMat(BEAR.cocoa),
  )
  mouth.position.y = -H * 0.105
  muzzleFollow.add(mouth)

  addJacket(context, H, hitMeshes)

  // Deterministic, very restrained ear life; the integration drives the two
  // follow groups for the larger spring motion.
  const earRestL = earL.rotation.z
  const earRestR = earR.rotation.z
  const update = (pitchS: number, yaw: number, breath: number, _dt: number): void => {
    // The animal integration passes the already-evaluated -1..1 breath wave.
    const inhale = THREE.MathUtils.clamp(breath, -1, 1)
    earL.rotation.z = earRestL - pitchS * 0.025 + yaw * 0.020 - inhale * 0.012
    earR.rotation.z = earRestR + pitchS * 0.025 + yaw * 0.020 + inhale * 0.012
  }

  return { headRoot, headFollow, muzzleFollow, hitMeshes, update }
}
