import * as THREE from 'three'
import { egg, ellipseArcTube, unitSphereLo } from '../geo'
import { addOutline, toonMat, unlitMat } from '../materials'
import type { AnimalBuilder, AnimalCostumeRig } from './types'

const TURTLE = {
  cowl: 0x279b83,
  cowlShade: 0x176856,
  cowlDark: 0x164e45,
  frame: 0xdaf3cc,
  frameShade: 0xa7d39e,
  mint: 0x78dcb6,
  mintShade: 0x43a989,
  mintLight: 0xbcefd2,
  orange: 0xff8558,
  orangeDark: 0xd95a3f,
  shell: 0x215f49,
  shellShade: 0x123f34,
  scute: 0x367d59,
  scuteAlt: 0x448d62,
  ink: 0x153d3a,
  highlight: 0xf6ffe9,
} as const

/**
 * Unit cowl authored toward -Z. Vertices inside an elliptical cone around the
 * face are collapsed to its rim, then fully internal faces are removed.
 * The result is a real opening rather than a dark plate in front of the VRM.
 */
function openCowlGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 48, 36)
  const position = geometry.attributes.position
  const inside = new Array<boolean>(position.count).fill(false)
  const ax = 0.88
  const ayTop = 0.68
  const ayBottom = 0.96

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const theta = Math.acos(THREE.MathUtils.clamp(-z, -1, 1))
    const phi = Math.atan2(y, x)
    const ay = Math.sin(phi) >= 0 ? ayTop : ayBottom
    const c = ay * Math.cos(phi)
    const s = ax * Math.sin(phi)
    const boundary = (ax * ay) / Math.sqrt(c * c + s * s)

    if (theta >= boundary) continue
    inside[i] = true
    const sinBoundary = Math.sin(boundary)
    position.setXYZ(
      i,
      Math.cos(phi) * sinBoundary,
      Math.sin(phi) * sinBoundary,
      -Math.cos(boundary),
    )
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
  geometry.computeVertexNormals()
  return geometry
}

function ellipseLoop(
  rx: number,
  ry: number,
  radius: number,
): THREE.BufferGeometry {
  const points: THREE.Vector3[] = []
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    points.push(new THREE.Vector3(Math.cos(a) * rx, Math.sin(a) * ry, 0))
  }
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points, true, 'centripetal'),
    64,
    radius,
    8,
    true,
  )
}

function outlined(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  width: number,
  hitMeshes: THREE.Mesh[],
  hit = false,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material)
  addOutline(mesh, width, TURTLE.ink)
  if (hit) hitMeshes.push(mesh)
  return mesh
}

function upperArmDirection(bone: THREE.Object3D, fallbackX: number): THREE.Vector3 {
  let best: THREE.Object3D | null = null
  let bestDistance = 0
  for (const child of bone.children) {
    const distance = child.position.length()
    if (distance > bestDistance) {
      best = child
      bestDistance = distance
    }
  }
  if (best && bestDistance > 1e-5) return best.position.clone().normalize()
  return new THREE.Vector3(fallbackX, 0, 0)
}

function addUpperSleeve(
  bone: THREE.Object3D | null,
  fallbackX: number,
  L: number,
  hitMeshes: THREE.Mesh[],
): void {
  if (!bone) return
  const direction = upperArmDirection(bone, fallbackX)
  const childLength = Math.max(
    ...bone.children.map((child) => child.position.length()),
    L * 0.92,
  )
  const coveredLength = Math.min(childLength * 0.88, L * 1.15)
  const radius = Math.min(L * 0.32, coveredLength * 0.38)
  const cylinderLength = Math.max(L * 0.10, coveredLength - radius * 2)

  const sleeve = outlined(
    new THREE.CapsuleGeometry(radius, cylinderLength, 8, 20),
    toonMat(TURTLE.mint, TURTLE.mintShade),
    L * 0.020,
    hitMeshes,
    true,
  )
  sleeve.name = fallbackX < 0 ? 'TurtleSleeveL' : 'TurtleSleeveR'
  sleeve.position.copy(direction).multiplyScalar(coveredLength * 0.47)
  sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
  bone.add(sleeve)

  // A raised orange cuff seam remains readable while the tracked arm rotates.
  const cuff = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.035, L * 0.035, 8, 24),
    unlitMat(TURTLE.orange),
  )
  cuff.name = 'TurtleSleevePiping'
  cuff.position.copy(direction).multiplyScalar(coveredLength * 0.78)
  cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction)
  bone.add(cuff)
}

function addBackpackShell(
  chest: THREE.Object3D,
  L: number,
  facingSign: number,
  hitMeshes: THREE.Mesh[],
): THREE.Group {
  const shellRoot = new THREE.Group()
  shellRoot.name = 'TurtleShellBackpack'
  chest.add(shellRoot)

  const backZ = facingSign * L * 0.37
  const shell = outlined(
    egg(L * 0.80, L * 1.03, L * 0.25, -0.10),
    toonMat(TURTLE.shell, TURTLE.shellShade),
    L * 0.032,
    hitMeshes,
    true,
  )
  shell.position.set(0, -L * 0.59, backZ)
  shellRoot.add(shell)

  // Raised scutes make the backpack read as a shell from rear and 3/4 views.
  const scutes = [
    [0, 0.23, 0.31, 0.34, 0],
    [0, -0.27, 0.34, 0.38, 1],
    [0, -0.73, 0.30, 0.31, 0],
    [-0.43, 0.04, 0.29, 0.31, 1],
    [0.43, 0.04, 0.29, 0.31, 1],
    [-0.43, -0.50, 0.27, 0.31, 0],
    [0.43, -0.50, 0.27, 0.31, 0],
  ] as const
  for (const [x, y, sx, sy, alternate] of scutes) {
    const scute = new THREE.Mesh(
      unitSphereLo(),
      toonMat(
        alternate ? TURTLE.scuteAlt : TURTLE.scute,
        alternate ? TURTLE.shell : TURTLE.shellShade,
      ),
    )
    scute.scale.set(L * sx, L * sy, L * 0.052)
    scute.position.set(
      L * x,
      L * (y - 0.33),
      backZ + facingSign * L * 0.245,
    )
    addOutline(scute, L * 0.014, TURTLE.ink)
    shellRoot.add(scute)
  }

  return shellRoot
}

function addHoodie(
  chest: THREE.Object3D,
  L: number,
  facingSign: number,
  hitMeshes: THREE.Mesh[],
): void {
  const hoodie = new THREE.Group()
  hoodie.name = 'TurtleMintHoodie'
  chest.add(hoodie)

  const body = outlined(
    new THREE.CapsuleGeometry(L * 0.58, L * 0.78, 10, 24),
    toonMat(TURTLE.mint, TURTLE.mintShade),
    L * 0.026,
    hitMeshes,
    true,
  )
  body.scale.z = 0.74
  body.position.set(0, -L * 0.62, -facingSign * L * 0.065)
  hoodie.add(body)

  const frontZ = -facingSign * L * 0.485
  const chestPanel = new THREE.Mesh(unitSphereLo(), toonMat(TURTLE.mintLight, TURTLE.mintShade))
  chestPanel.scale.set(L * 0.50, L * 0.59, L * 0.045)
  chestPanel.position.set(0, -L * 0.62, frontZ)
  hoodie.add(chestPanel)

  // High-contrast piping follows the zipper and both raglan shoulder seams.
  const zipper = new THREE.Mesh(
    new THREE.CapsuleGeometry(L * 0.022, L * 0.92, 5, 12),
    unlitMat(TURTLE.orange),
  )
  zipper.position.set(0, -L * 0.51, frontZ - facingSign * L * 0.052)
  hoodie.add(zipper)

  for (const side of [-1, 1] as const) {
    const seam = new THREE.Mesh(
      new THREE.CapsuleGeometry(L * 0.021, L * 0.43, 5, 12),
      unlitMat(TURTLE.orange),
    )
    seam.position.set(side * L * 0.42, -L * 0.23, frontZ - facingSign * L * 0.025)
    seam.rotation.z = side * -0.58
    hoodie.add(seam)

    // Dark backpack straps visually connect the hidden shell to the shoulders.
    const strap = new THREE.Mesh(
      new THREE.CapsuleGeometry(L * 0.052, L * 0.78, 6, 14),
      toonMat(TURTLE.cowlDark, TURTLE.shellShade),
    )
    strap.position.set(side * L * 0.39, -L * 0.49, frontZ + facingSign * L * 0.018)
    strap.rotation.z = side * 0.10
    hoodie.add(strap)
  }

  const pocket = outlined(
    egg(L * 0.40, L * 0.23, L * 0.055, -0.20),
    toonMat(TURTLE.mintLight, TURTLE.mintShade),
    L * 0.012,
    hitMeshes,
  )
  pocket.position.set(0, -L * 1.05, frontZ - facingSign * L * 0.045)
  hoodie.add(pocket)

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(L * 0.25, L * 0.045, 10, 32),
    toonMat(TURTLE.cowlDark, TURTLE.shellShade),
  )
  collar.scale.y = 0.46
  collar.position.set(0, L * 0.02, frontZ + facingSign * L * 0.03)
  hoodie.add(collar)
}

export const buildTurtleCostume: AnimalBuilder = ({
  crownH,
  halfW,
  face,
  bones,
  S,
}): AnimalCostumeRig => {
  const L = crownH
  const hitMeshes: THREE.Mesh[] = []
  const headRoot = new THREE.Group()
  headRoot.name = 'TurtleCostumeHead'
  if (S === -1) headRoot.rotation.y = Math.PI

  const headFollow = new THREE.Group()
  headFollow.name = 'TurtleCowlFollow'
  headRoot.add(headFollow)

  const muzzleFollow = new THREE.Group()
  muzzleFollow.name = 'TurtleMuzzleFollow'
  headFollow.add(muzzleFollow)

  const faceZ = face?.frontZ ?? -L * 0.50
  const cowlRx = Math.max(halfW * 1.30, L * 0.74)
  const cowlRy = L * 0.91
  const cowlRz = Math.max(L * 0.68, Math.abs(faceZ) * 1.12)
  const cowlCenter = new THREE.Vector3(0, L * 0.26, L * 0.09)

  const cowl = new THREE.Mesh(
    openCowlGeometry(),
    toonMat(TURTLE.cowl, TURTLE.cowlShade),
  )
  cowl.position.copy(cowlCenter)
  cowl.scale.set(cowlRx, cowlRy, cowlRz)
  addOutline(cowl, L * 0.030, TURTLE.ink)
  hitMeshes.push(cowl)
  headFollow.add(cowl)

  const frameRx = Math.max(halfW * 1.06, L * 0.58)
  const frameRy = L * 0.64
  const frameZ = Math.min(faceZ - L * 0.045, -L * 0.48)
  const frame = outlined(
    ellipseLoop(frameRx, frameRy, L * 0.074),
    toonMat(TURTLE.frame, TURTLE.frameShade),
    L * 0.018,
    hitMeshes,
  )
  frame.name = 'TurtlePaleFaceFrame'
  frame.position.set(0, L * 0.07, frameZ)
  headFollow.add(frame)

  // Turtle eye pads live outside the human eye line, preserving expression capture.
  for (const side of [-1, 1] as const) {
    const eyeX = side * (frameRx + L * 0.105)
    const eyeY = L * 0.31
    const eyePad = outlined(
      egg(L * 0.16, L * 0.135, L * 0.050, 0),
      toonMat(TURTLE.frame, TURTLE.frameShade),
      L * 0.014,
      hitMeshes,
    )
    eyePad.position.set(eyeX, eyeY, frameZ - L * 0.024)
    eyePad.rotation.z = side * -0.10
    headFollow.add(eyePad)

    const pupil = new THREE.Mesh(unitSphereLo(), unlitMat(TURTLE.ink))
    pupil.scale.set(L * 0.066, L * 0.078, L * 0.020)
    pupil.position.set(eyeX - side * L * 0.015, eyeY, frameZ - L * 0.080)
    headFollow.add(pupil)

    const glint = new THREE.Mesh(unitSphereLo(), unlitMat(TURTLE.highlight))
    glint.scale.setScalar(L * 0.019)
    glint.position.set(
      eyeX - side * L * 0.034,
      eyeY + L * 0.031,
      frameZ - L * 0.102,
    )
    headFollow.add(glint)

    const brow = new THREE.Mesh(
      ellipseArcTube(L * 0.18, L * 0.075, 0, 28, 152, L * 0.025, true),
      unlitMat(TURTLE.cowlDark),
    )
    brow.position.set(eyeX, eyeY + L * 0.112, frameZ - L * 0.094)
    brow.rotation.z = side * -0.10
    headFollow.add(brow)

    // Two quiet temple scales add species texture without cluttering the face.
    for (let i = 0; i < 2; i++) {
      const scaleDot = new THREE.Mesh(unitSphereLo(), unlitMat(TURTLE.frameShade))
      scaleDot.scale.set(L * 0.032, L * 0.023, L * 0.012)
      scaleDot.position.set(
        side * (frameRx + L * (0.055 + i * 0.055)),
        L * (0.03 - i * 0.055),
        frameZ - L * 0.064,
      )
      headFollow.add(scaleDot)
    }
  }

  // Small two-lobed muzzle and nostrils make the cowl recognizably turtle-like
  // while leaving the donor avatar's mouth visible below it.
  for (const side of [-1, 1] as const) {
    const muzzle = new THREE.Mesh(
      egg(L * 0.145, L * 0.095, L * 0.050, -0.08),
      toonMat(TURTLE.frame, TURTLE.frameShade),
    )
    muzzle.position.set(side * L * 0.092, -L * 0.105, frameZ - L * 0.072)
    muzzle.rotation.z = side * 0.10
    muzzleFollow.add(muzzle)

    const nostril = new THREE.Mesh(unitSphereLo(), unlitMat(TURTLE.ink))
    nostril.scale.set(L * 0.022, L * 0.014, L * 0.010)
    nostril.position.set(side * L * 0.075, -L * 0.098, frameZ - L * 0.126)
    nostril.rotation.z = side * 0.22
    muzzleFollow.add(nostril)
  }

  // A tiny orange neck tab ties the face design back to the hoodie piping.
  const chinTab = new THREE.Mesh(
    new THREE.CapsuleGeometry(L * 0.032, L * 0.13, 5, 10),
    unlitMat(TURTLE.orangeDark),
  )
  chinTab.position.set(0, -L * 0.59, frameZ + L * 0.045)
  headFollow.add(chinTab)

  const bodyFacing = S >= 0 ? 1 : -1
  if (bones.chest) {
    addBackpackShell(bones.chest, L, bodyFacing, hitMeshes)
    addHoodie(bones.chest, L, bodyFacing, hitMeshes)
  }
  addUpperSleeve(bones.upperArmL, -1, L, hitMeshes)
  addUpperSleeve(bones.upperArmR, 1, L, hitMeshes)

  return { headRoot, headFollow, muzzleFollow, hitMeshes }
}

/** Short alias used by the avatar registry. */
export const buildTurtle = buildTurtleCostume

export default buildTurtleCostume
