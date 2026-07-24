/**
 * Procedural anime hair silhouettes for the animal-cosplay avatar pack.
 *
 * Geometry is authored in the same normalized head frame as the animal hoods:
 * front = -Z.  The caller owns the VRM0/VRM1 turn on `parent`; this module never
 * changes that parent's transform.  Every front lock ends above the eye line
 * and every long side lock stays outside the measured face aperture, leaving
 * the donor's eyes, blink shapes and mouth completely unobstructed.
 */
import * as THREE from 'three'
import { egg, taperedTube, teardrop, unitSphereLo } from '../geo'
import { addOutline, toonMat } from '../materials'
import type { AnimalBuildContext } from './types'

export const HAIR_STYLES = [
  'wavyBob',
  'highPony',
  'bluntBob',
  'twinTails',
  'sidePony',
  'doubleBuns',
  'pixieBob',
  'wolfCut',
  'curlyShag',
  'asymPixie',
  'longSideBob',
  'braidedPony',
  'braidedCrown',
  'braidedHighPony',
  'lowPony',
  'bubblePony',
] as const

export type HairStyle = (typeof HAIR_STYLES)[number]

export interface HairSpec {
  style: HairStyle
  base: number
  shade: number
  accent: number
}

export interface HairRig {
  root: THREE.Group
  /** Ponytails, braids and long locks that a caller may give secondary motion. */
  secondary: THREE.Group[]
}

interface HairKit {
  H: number
  sideX: number
  frontZ: number
  root: THREE.Group
  secondary: THREE.Group[]
  hair: THREE.Material
  accent: THREE.Material
  outline: number
  hitMeshes: THREE.Mesh[]
}

function addMesh(
  kit: HairKit,
  parent: THREE.Object3D,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material = kit.hair,
  outline = kit.outline,
  hit = false,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  if (outline > 0) addOutline(mesh, outline, 0x241631)
  parent.add(mesh)
  if (hit) kit.hitMeshes.push(mesh)
  return mesh
}

function addRearCap(
  kit: HairKit,
  width = 0.72,
  height = 0.78,
  depth = 0.62,
  y = 0.34,
): THREE.Mesh {
  // phi 0..PI is the +Z (rear) hemisphere, so the face-facing half is open.
  const cap = addMesh(
    kit,
    kit.root,
    'HairRearCap',
    new THREE.SphereGeometry(1, 44, 28, 0, Math.PI, 0, Math.PI),
    kit.hair,
    0,
    true,
  )
  cap.scale.set(kit.H * width, kit.H * height, kit.H * depth)
  cap.position.set(0, kit.H * y, kit.H * 0.06)
  addOutline(cap, kit.outline, 0x241631)
  return cap
}

function addCrown(
  kit: HairKit,
  width = 0.69,
  height = 0.32,
  depth = 0.30,
  x = 0,
  y = 0.72,
): THREE.Mesh {
  const crown = addMesh(kit, kit.root, 'HairCrown', egg(1, 1, 1, -0.10), kit.hair, 0, true)
  crown.scale.set(kit.H * width, kit.H * height, kit.H * depth)
  crown.position.set(kit.H * x, kit.H * y, kit.frontZ + kit.H * 0.22)
  addOutline(crown, kit.outline, 0x241631)
  return crown
}

function addDrop(
  kit: HairKit,
  parent: THREE.Object3D,
  name: string,
  x: number,
  y: number,
  z: number,
  length: number,
  width: number,
  rotation = 0,
  material: THREE.Material = kit.hair,
  hit = false,
): THREE.Mesh {
  const lock = addMesh(
    kit,
    parent,
    name,
    teardrop(kit.H * length, kit.H * width, 0.52),
    material,
    kit.outline * 0.82,
    hit,
  )
  lock.position.set(kit.H * x, kit.H * y, z)
  lock.rotation.z = Math.PI + rotation
  return lock
}

function addCurve(
  kit: HairKit,
  parent: THREE.Object3D,
  name: string,
  points: Array<[number, number, number]>,
  radii: number[],
  material: THREE.Material = kit.hair,
  hit = false,
): THREE.Mesh {
  const curve = addMesh(
    kit,
    parent,
    name,
    taperedTube(
      points.map(([x, y, z]) => new THREE.Vector3(kit.H * x, kit.H * y, z)),
      radii.map((r) => kit.H * r),
      { seg: 30, radial: 12 },
    ),
    material,
    kit.outline * 0.76,
    hit,
  )
  return curve
}

function addBang(
  kit: HairKit,
  x: number,
  y: number,
  length: number,
  width: number,
  rotation = 0,
  material: THREE.Material = kit.hair,
): THREE.Mesh {
  // Lowest possible tip is y - length; keep it above 0.28H (roughly brow line).
  const safeLength = Math.min(length, y - 0.30)
  return addDrop(
    kit,
    kit.root,
    'HairBang',
    x,
    y,
    kit.frontZ - kit.H * 0.055,
    safeLength,
    width,
    rotation,
    material,
  )
}

function addTie(
  kit: HairKit,
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  scale = 1,
): THREE.Group {
  const tie = new THREE.Group()
  tie.name = 'HairTie'
  tie.position.set(kit.H * x, kit.H * y, z)
  parent.add(tie)

  const knot = addMesh(kit, tie, 'HairTieKnot', unitSphereLo(), kit.accent, 0)
  knot.scale.setScalar(kit.H * 0.075 * scale)
  addOutline(knot, kit.outline * 0.55, 0x241631)
  for (const side of [-1, 1] as const) {
    const bow = addDrop(
      kit,
      tie,
      'HairTieBow',
      side * 0.05 * scale,
      0,
      0,
      0.18 * scale,
      0.12 * scale,
      side * 0.72,
      kit.accent,
    )
    bow.rotation.x = Math.PI / 2
  }
  return tie
}

/**
 * A small enamel barrette.  It sits above/outside the brow-safe aperture and
 * gives short cuts a readable styling cue without placing geometry over the
 * tracked eyes.
 */
function addBarrette(
  kit: HairKit,
  x: number,
  y: number,
  rotation = 0,
  width = 0.20,
): THREE.Mesh {
  const clip = addMesh(
    kit,
    kit.root,
    'HairBarrette',
    new THREE.CapsuleGeometry(kit.H * 0.018, kit.H * width, 4, 10),
    kit.accent,
    kit.outline * 0.34,
  )
  clip.position.set(kit.H * x, kit.H * y, kit.frontZ - kit.H * 0.080)
  clip.rotation.z = Math.PI / 2 + rotation
  return clip
}

/**
 * Thin coloured under-lock used sparingly as an anime highlight.  The strand
 * follows the outer silhouette rather than crossing the face aperture.
 */
function addAccentStrand(
  kit: HairKit,
  parent: THREE.Object3D,
  name: string,
  points: Array<[number, number, number]>,
  radii: number[],
): THREE.Mesh {
  return addCurve(kit, parent, name, points, radii, kit.accent)
}

function addSideLocks(
  kit: HairKit,
  length: number,
  width: number,
  wave = 0,
  asymmetry = 0,
): void {
  for (const side of [-1, 1] as const) {
    const x = (kit.sideX / kit.H + 0.055) * side
    if (wave === 0) {
      addDrop(
        kit,
        kit.root,
        side < 0 ? 'HairSideLockL' : 'HairSideLockR',
        x,
        0.62 + (side < 0 ? asymmetry : -asymmetry),
        kit.frontZ + kit.H * 0.03,
        length + (side < 0 ? asymmetry : -asymmetry),
        width,
        side * 0.03,
        kit.hair,
        true,
      )
    } else {
      const z = kit.frontZ + kit.H * 0.05
      addCurve(
        kit,
        kit.root,
        side < 0 ? 'HairWavySideL' : 'HairWavySideR',
        [
          [x, 0.68, z],
          [x + side * wave, 0.38, z - kit.H * 0.015],
          [x - side * wave * 0.55, 0.12, z],
          [x + side * wave * 0.35, 0.68 - length, z + kit.H * 0.025],
        ],
        [width * 0.42, width * 0.48, width * 0.34, 0.018],
        kit.hair,
        true,
      )
    }
  }
}

function addBobEnds(kit: HairKit, y: number, count: number, spread: number, irregular = 0): void {
  for (let i = 0; i < count; i++) {
    const u = count === 1 ? 0 : i / (count - 1)
    const x = THREE.MathUtils.lerp(-spread, spread, u)
    const edge = Math.abs(x / spread)
    addDrop(
      kit,
      kit.root,
      'HairBobEnd',
      x,
      y + irregular * Math.sin(i * 2.17),
      kit.frontZ + kit.H * (0.20 + edge * 0.12),
      0.25 + edge * 0.08,
      0.19,
      (x / spread) * 0.15,
    )
  }
}

function buildWavyBob(kit: HairKit): void {
  addRearCap(kit, 0.76, 0.78, 0.62, 0.32)
  addCrown(kit, 0.71, 0.29, 0.31, -0.02)

  // Rounded shoulder bob: keep all volume outside the cheeks.  The previous
  // row of centre-facing drops read as a beard at face distance.
  for (const side of [-1, 1] as const) {
    const x = side * 0.60
    addCurve(
      kit,
      kit.root,
      side < 0 ? 'WavyBobOuterL' : 'WavyBobOuterR',
      [
        [x, 0.70, kit.frontZ + kit.H * 0.05],
        [x + side * 0.12, 0.43, kit.frontZ + kit.H * 0.03],
        [x - side * 0.08, 0.15, kit.frontZ + kit.H * 0.07],
        [x + side * 0.12, -0.18, kit.frontZ + kit.H * 0.13],
        [x - side * 0.03, -0.43, kit.frontZ + kit.H * 0.18],
      ],
      [0.15, 0.18, 0.16, 0.13, 0.018],
      kit.hair,
      true,
    )
    addAccentStrand(
      kit,
      kit.root,
      side < 0 ? 'WavyBobHighlightL' : 'WavyBobHighlightR',
      [
        [x + side * 0.04, 0.58, kit.frontZ - kit.H * 0.02],
        [x + side * 0.10, 0.34, kit.frontZ],
        [x - side * 0.02, 0.09, kit.frontZ + kit.H * 0.05],
        [x + side * 0.07, -0.22, kit.frontZ + kit.H * 0.11],
      ],
      [0.026, 0.032, 0.026, 0.009],
    )
  }

  // Soft centre-parted curtain fringe, deliberately asymmetric.
  addBang(kit, -0.30, 0.80, 0.34, 0.25, -0.30)
  addBang(kit, -0.08, 0.82, 0.29, 0.18, -0.10)
  addBang(kit, 0.14, 0.81, 0.27, 0.17, 0.13)
  addBang(kit, 0.31, 0.78, 0.31, 0.20, 0.28)
  addBarrette(kit, 0.43, 0.57, -0.20, 0.16)
}

function buildHighPony(kit: HairKit): void {
  addRearCap(kit, 0.67, 0.73, 0.55, 0.37)
  addCrown(kit, 0.64, 0.26, 0.27, 0, 0.75)
  addSideLocks(kit, 0.40, 0.13, 0)
  // Clean swept fringe instead of the same three-lock fringe used elsewhere.
  addBang(kit, -0.31, 0.81, 0.30, 0.25, -0.34)
  addBang(kit, -0.07, 0.82, 0.27, 0.20, -0.15)
  addBang(kit, 0.16, 0.80, 0.23, 0.16, 0.16)

  const pony = new THREE.Group()
  pony.name = 'HighPonySecondary'
  // The root clears even the ported monkey hood (top ~= 1.14H).  Only the
  // plume is exposed; its base still visually exits through the rear port.
  pony.position.set(-kit.H * 0.08, kit.H * 1.19, kit.H * 0.27)
  pony.rotation.z = 0.10
  kit.root.add(pony)
  kit.secondary.push(pony)
  addTie(kit, pony, 0, 0, 0, 1.05)
  for (const [x, lean] of [
    [-0.18, -0.16],
    [0, 0.02],
    [0.18, 0.18],
  ] as const) {
    addCurve(
      kit,
      pony,
      'HighPonyLock',
      [
        [x * 0.22, 0.01, kit.H * 0.01],
        [lean + x * 0.45, 0.24, kit.H * 0.05],
        [lean * 1.5 + x, 0.10, kit.H * 0.12],
        [lean * 1.8 + x * 1.35, -0.30, kit.H * 0.19],
        [lean * 1.3 + x, -0.74, kit.H * 0.24],
      ],
      [0.12, 0.16, 0.14, 0.10, 0.018],
      kit.hair,
      x === 0,
    )
  }
  addAccentStrand(
    kit,
    pony,
    'HighPonyRibbon',
    [
      [0.02, 0.05, -kit.H * 0.03],
      [0.15, 0.22, kit.H * 0.01],
      [0.26, -0.14, kit.H * 0.12],
      [0.18, -0.61, kit.H * 0.21],
    ],
    [0.026, 0.032, 0.022, 0.008],
  )
}

function buildBluntBob(kit: HairKit): void {
  addRearCap(kit, 0.72, 0.72, 0.56, 0.35)
  addCrown(kit, 0.68, 0.25, 0.29, 0, 0.73)
  for (const side of [-1, 1] as const) {
    // Slim jaw panels create a geometric pageboy cut.  They intentionally stay
    // narrow: broad capsules read as black ear-pads against the turtle cowl.
    addDrop(
      kit,
      kit.root,
      side < 0 ? 'BluntBobOuterL' : 'BluntBobOuterR',
      side * (kit.sideX / kit.H + 0.035),
      0.62,
      kit.frontZ + kit.H * 0.02,
      0.57,
      0.145,
      side * 0.025,
      kit.hair,
      true,
    )
    addDrop(
      kit,
      kit.root,
      side < 0 ? 'BluntBobInnerL' : 'BluntBobInnerR',
      side * (kit.sideX / kit.H - 0.005),
      0.57,
      kit.frontZ - kit.H * 0.025,
      0.48,
      0.105,
      side * -0.015,
      side < 0 ? kit.hair : kit.accent,
    )
  }
  // Short, level micro-fringe: unlike the pointed curtain bangs elsewhere.
  for (const x of [-0.36, -0.18, 0, 0.18, 0.36]) {
    addBang(kit, x, 0.73, 0.28 + Math.abs(x) * 0.04, 0.19, x * 0.04)
  }
  addBarrette(kit, -0.43, 0.55, 0.04, 0.13)
}

function buildTwinTails(kit: HairKit): void {
  addRearCap(kit, 0.69, 0.73, 0.54, 0.36)
  addCrown(kit, 0.65, 0.25, 0.28, 0, 0.75)
  // Airy hime-inspired fringe with a visible centre notch.
  addBang(kit, -0.33, 0.78, 0.28, 0.19, -0.24)
  addBang(kit, -0.12, 0.81, 0.34, 0.20, -0.08)
  addBang(kit, 0.12, 0.81, 0.34, 0.20, 0.08)
  addBang(kit, 0.33, 0.78, 0.28, 0.19, 0.24)
  for (const side of [-1, 1] as const) {
    const tail = new THREE.Group()
    tail.name = side < 0 ? 'TwinTailSecondaryL' : 'TwinTailSecondaryR'
    // Rabbit has an open crown band, so the tied roots can sit fully outside
    // the skull silhouette and read instantly at full-body scale.
    tail.position.set(side * kit.H * 0.70, kit.H * 0.75, kit.H * 0.10)
    tail.rotation.z = side * -0.12
    kit.root.add(tail)
    kit.secondary.push(tail)
    addTie(kit, tail, 0, 0, 0, 1.12)
    addCurve(
      kit,
      tail,
      'TwinTailOuter',
      [
        [0, 0.02, 0],
        [side * 0.23, -0.10, kit.H * 0.03],
        [side * 0.29, -0.50, kit.H * 0.07],
        [side * 0.18, -1.08, kit.H * 0.12],
        [side * 0.02, -1.38, kit.H * 0.16],
      ],
      [0.16, 0.21, 0.15, 0.09, 0.018],
      kit.hair,
      true,
    )
    addCurve(
      kit,
      tail,
      'TwinTailInner',
      [
        [0, -0.01, 0],
        [-side * 0.10, -0.24, kit.H * 0.02],
        [-side * 0.05, -0.68, kit.H * 0.08],
        [side * 0.04, -1.18, kit.H * 0.14],
      ],
      [0.11, 0.14, 0.09, 0.015],
    )
    addAccentStrand(
      kit,
      tail,
      side < 0 ? 'TwinTailRibbonL' : 'TwinTailRibbonR',
      [
        [-side * 0.02, -0.05, -kit.H * 0.025],
        [side * 0.12, -0.32, 0],
        [side * 0.13, -0.78, kit.H * 0.08],
        [side * 0.02, -1.17, kit.H * 0.13],
      ],
      [0.024, 0.030, 0.021, 0.008],
    )
  }
}

function buildSidePony(kit: HairKit): void {
  addRearCap(kit, 0.70, 0.73, 0.56, 0.35)
  addCrown(kit, 0.68, 0.27, 0.29, -0.05, 0.75)
  // Deep diagonal sweep points toward the tied side, with only one short
  // opposite-side face wisp.
  addBang(kit, -0.34, 0.82, 0.32, 0.24, -0.33)
  addBang(kit, -0.10, 0.82, 0.29, 0.23, -0.20)
  addBang(kit, 0.12, 0.80, 0.24, 0.18, 0.07)
  addDrop(
    kit,
    kit.root,
    'SidePonyFaceWisp',
    -(kit.sideX / kit.H + 0.035),
    0.57,
    kit.frontZ,
    0.56,
    0.13,
    -0.04,
  )

  const pony = new THREE.Group()
  pony.name = 'SidePonySecondary'
  // Clear the ported fox hood laterally.  This root sits beyond its ~0.72H
  // shell radius, making the pony visible without painting over the hood.
  pony.position.set(kit.H * 0.84, kit.H * 0.68, kit.H * 0.10)
  pony.rotation.z = -0.18
  kit.root.add(pony)
  kit.secondary.push(pony)
  addTie(kit, pony, 0, 0, 0, 1.08)
  addCurve(
    kit,
    pony,
    'SidePonyMain',
    [
      [0, 0, 0],
      [0.22, -0.04, kit.H * 0.03],
      [0.30, -0.42, kit.H * 0.08],
      [0.16, -0.92, kit.H * 0.14],
      [-0.05, -1.24, kit.H * 0.18],
    ],
    [0.18, 0.23, 0.17, 0.10, 0.018],
    kit.hair,
    true,
  )
  addCurve(
    kit,
    pony,
    'SidePonyInner',
    [
      [-0.02, -0.02, -kit.H * 0.02],
      [-0.10, -0.30, kit.H * 0.02],
      [-0.02, -0.73, kit.H * 0.10],
      [0.08, -1.10, kit.H * 0.16],
    ],
    [0.12, 0.15, 0.09, 0.014],
  )
  addAccentStrand(
    kit,
    pony,
    'SidePonyHighlight',
    [
      [0.02, -0.05, -kit.H * 0.04],
      [0.15, -0.36, kit.H * 0.01],
      [0.13, -0.74, kit.H * 0.09],
      [0.01, -1.08, kit.H * 0.14],
    ],
    [0.027, 0.032, 0.022, 0.008],
  )
}

function buildDoubleBuns(kit: HairKit): void {
  addRearCap(kit, 0.68, 0.70, 0.54, 0.37)
  addCrown(kit, 0.64, 0.24, 0.27, 0, 0.74)
  addSideLocks(kit, 0.38, 0.12)
  // Rounded split fringe echoes the odango circles.
  addBang(kit, -0.30, 0.77, 0.27, 0.22, -0.24)
  addBang(kit, -0.09, 0.80, 0.32, 0.19, -0.05)
  addBang(kit, 0.12, 0.80, 0.31, 0.19, 0.08)
  addBang(kit, 0.31, 0.76, 0.26, 0.20, 0.24)
  for (const side of [-1, 1] as const) {
    const bunRoot = new THREE.Group()
    bunRoot.name = side < 0 ? 'HairBunL' : 'HairBunR'
    // Panda's ported hood is broad at the crown.  Low side-odango avoid its
    // animal ears and remain visibly separate from them.
    bunRoot.position.set(side * kit.H * 0.83, kit.H * 0.78, kit.H * 0.02)
    kit.root.add(bunRoot)
    kit.secondary.push(bunRoot)
    const bun = addMesh(kit, bunRoot, 'HairCoiledBun', unitSphereLo(), kit.hair, 0, true)
    bun.scale.set(kit.H * 0.30, kit.H * 0.28, kit.H * 0.24)
    addOutline(bun, kit.outline, 0x241631)
    const coil = addMesh(
      kit,
      bunRoot,
      'HairBunCoil',
      new THREE.TorusGeometry(kit.H * 0.19, kit.H * 0.026, 8, 32),
      kit.accent,
      kit.outline * 0.45,
    )
    coil.rotation.y = Math.PI
    coil.position.z = -kit.H * 0.22
    const ribbon = new THREE.Group()
    ribbon.name = side < 0 ? 'OdangoRibbonL' : 'OdangoRibbonR'
    bunRoot.add(ribbon)
    addDrop(
      kit,
      ribbon,
      'OdangoRibbonDrop',
      side * 0.06,
      -0.14,
      -kit.H * 0.03,
      0.50,
      0.12,
      side * 0.12,
      kit.accent,
    )
  }
}

function buildPixieBob(kit: HairKit): void {
  addRearCap(kit, 0.66, 0.64, 0.51, 0.42)
  addCrown(kit, 0.64, 0.23, 0.27, -0.05, 0.75)
  // Short, sharply separated pieces make a compact feathered silhouette. The
  // alternating tips are intentionally unlike every tied or long-haired cut.
  const pieces = [
    [-0.59, 0.58, 0.32, 0.14, -0.42],
    [-0.54, 0.39, 0.28, 0.13, -0.30],
    [-0.36, 0.75, 0.29, 0.20, -0.30],
    [-0.15, 0.80, 0.34, 0.20, -0.12],
    [0.08, 0.81, 0.32, 0.18, 0.06],
    [0.28, 0.76, 0.25, 0.16, 0.25],
    [0.52, 0.58, 0.27, 0.13, 0.42],
  ] as const
  for (const [x, y, l, w, r] of pieces) {
    const front = Math.abs(x) < 0.4
    if (front) addBang(kit, x, y, l, w, r)
    else addDrop(kit, kit.root, 'PixieFeather', x, y, kit.frontZ + kit.H * 0.06, l, w, r)
  }
  // Two exposed nape feathers peek below the penguin hood, but remain outside
  // the face and neck tracking silhouette.
  for (const side of [-1, 1] as const) {
    addDrop(
      kit,
      kit.root,
      side < 0 ? 'PixieNapeL' : 'PixieNapeR',
      side * 0.62,
      0.21,
      kit.frontZ + kit.H * 0.26,
      0.40,
      0.13,
      side * 0.42,
      side < 0 ? kit.hair : kit.accent,
      true,
    )
  }
  addBarrette(kit, 0.40, 0.53, -0.28, 0.18)
}

function buildWolfCut(kit: HairKit): void {
  addRearCap(kit, 0.72, 0.77, 0.57, 0.34)
  addCrown(kit, 0.69, 0.27, 0.30, -0.02, 0.76)
  // Broken razor fringe with uneven lengths.
  addBang(kit, -0.36, 0.80, 0.30, 0.20, -0.31)
  addBang(kit, -0.15, 0.83, 0.38, 0.19, -0.13)
  addBang(kit, 0.06, 0.82, 0.32, 0.17, 0.05)
  addBang(kit, 0.24, 0.80, 0.26, 0.15, 0.21)
  addBang(kit, 0.39, 0.76, 0.23, 0.13, 0.34)
  // Distinct long nape and outward flicks.
  for (const [x, r, l] of [
    [-0.47, -0.28, 0.78],
    [-0.23, -0.14, 0.94],
    [0, 0, 1.02],
    [0.24, 0.15, 0.92],
    [0.48, 0.29, 0.76],
  ] as const) {
    addDrop(kit, kit.root, 'WolfCutNape', x, 0.29, kit.H * 0.34, l, 0.16, r, kit.hair, x === 0)
  }
  // Outer shoulder layers remain visible beyond the broad owl hood.
  for (const side of [-1, 1] as const) {
    addCurve(
      kit,
      kit.root,
      side < 0 ? 'WolfCutOuterL' : 'WolfCutOuterR',
      [
        [side * 0.77, 0.55, kit.H * 0.04],
        [side * 0.86, 0.24, kit.H * 0.08],
        [side * 0.78, -0.12, kit.H * 0.14],
        [side * 0.94, -0.45, kit.H * 0.19],
      ],
      [0.12, 0.15, 0.10, 0.016],
      kit.hair,
      true,
    )
    addAccentStrand(
      kit,
      kit.root,
      side < 0 ? 'WolfCutStreakL' : 'WolfCutStreakR',
      [
        [side * 0.72, 0.47, kit.H * 0.00],
        [side * 0.80, 0.18, kit.H * 0.06],
        [side * 0.75, -0.16, kit.H * 0.13],
      ],
      [0.020, 0.028, 0.008],
    )
  }
}

function buildCurlyShag(kit: HairKit): void {
  addRearCap(kit, 0.79, 0.79, 0.62, 0.34)
  addCrown(kit, 0.74, 0.30, 0.32, 0, 0.75)
  const zFront = kit.frontZ + kit.H * 0.02
  const curls = [
    [-0.70, 0.68, -1],
    [-0.80, 0.38, 1],
    [-0.76, 0.08, -1],
    [-0.61, -0.18, 1],
    [0.70, 0.68, 1],
    [0.80, 0.38, -1],
    [0.76, 0.08, 1],
    [0.61, -0.18, -1],
  ] as const
  for (const [x, y, dir] of curls) {
    addCurve(
      kit,
      kit.root,
      'CurlyShagRinglet',
      [
        [x, y, zFront],
        [x + dir * 0.12, y - 0.12, zFront - kit.H * 0.01],
        [x - dir * 0.08, y - 0.27, zFront],
        [x + dir * 0.07, y - 0.42, zFront + kit.H * 0.02],
      ],
      [0.11, 0.13, 0.09, 0.018],
      kit.hair,
      y === 0.38,
    )
  }
  // Compact curly fringe (shorter than the shag's shoulder ringlets).
  addBang(kit, -0.31, 0.79, 0.26, 0.23, -0.26)
  addBang(kit, -0.09, 0.82, 0.31, 0.22, -0.07)
  addBang(kit, 0.13, 0.81, 0.29, 0.22, 0.10)
  addBang(kit, 0.34, 0.77, 0.24, 0.21, 0.27)
  addBarrette(kit, -0.48, 0.61, 0.22, 0.14)
}

function buildAsymPixie(kit: HairKit): void {
  addRearCap(kit, 0.65, 0.66, 0.51, 0.41)
  addCrown(kit, 0.66, 0.24, 0.27, -0.09, 0.76)
  // Long blade-like left sweep, cropped right temple.  The lowest tips still
  // stop at the safe brow line enforced by addBang.
  addBang(kit, -0.39, 0.84, 0.50, 0.28, -0.38)
  addBang(kit, -0.15, 0.84, 0.43, 0.24, -0.22)
  addBang(kit, 0.08, 0.81, 0.30, 0.17, 0.05)
  addBang(kit, 0.27, 0.76, 0.20, 0.12, 0.33)

  // A single long razor tail exits the tiger's rear port at the left edge.
  const razor = new THREE.Group()
  razor.name = 'AsymRazorSecondary'
  razor.position.set(-kit.H * 0.78, kit.H * 0.73, kit.H * 0.06)
  razor.rotation.z = 0.18
  kit.root.add(razor)
  kit.secondary.push(razor)
  addCurve(
    kit,
    razor,
    'AsymLongRazor',
    [
      [0, 0, 0],
      [-0.12, -0.28, kit.H * 0.03],
      [-0.07, -0.68, kit.H * 0.09],
      [0.08, -1.12, kit.H * 0.15],
    ],
    [0.14, 0.16, 0.10, 0.014],
    kit.hair,
    true,
  )
  addAccentStrand(
    kit,
    razor,
    'AsymRazorStripe',
    [
      [-0.02, -0.06, -kit.H * 0.02],
      [-0.07, -0.34, kit.H * 0.02],
      [-0.03, -0.70, kit.H * 0.08],
      [0.05, -1.01, kit.H * 0.13],
    ],
    [0.025, 0.030, 0.020, 0.007],
  )

  for (const y of [0.48, 0.58, 0.68]) {
    const line = addMesh(
      kit,
      kit.root,
      'AsymShavedLine',
      new THREE.CapsuleGeometry(kit.H * 0.012, kit.H * 0.18, 4, 10),
      kit.accent,
      0,
    )
    line.position.set(kit.H * 0.51, kit.H * y, kit.frontZ - kit.H * 0.025)
    line.rotation.z = Math.PI / 2 - 0.30
  }
}

function buildLongSideBob(kit: HairKit): void {
  addRearCap(kit, 0.73, 0.77, 0.59, 0.33)
  addCrown(kit, 0.69, 0.27, 0.30, 0.04, 0.75)
  // Sleek side part with a short tucked side and a dramatically long side.
  addBang(kit, -0.32, 0.82, 0.31, 0.21, -0.28)
  addBang(kit, -0.09, 0.83, 0.28, 0.20, -0.13)
  addBang(kit, 0.13, 0.80, 0.22, 0.15, 0.11)
  addDrop(
    kit,
    kit.root,
    'LongBobShortSide',
    -(kit.sideX / kit.H + 0.05),
    0.63,
    kit.frontZ + kit.H * 0.03,
    0.69,
    0.16,
    -0.04,
    kit.hair,
    true,
  )
  // The long side clears the elephant hood laterally instead of disappearing
  // beneath it, and ends around the collarbone.
  addCurve(
    kit,
    kit.root,
    'LongSideSweep',
    [
      [0.79, 0.72, kit.H * 0.02],
      [0.91, 0.39, kit.H * 0.05],
      [0.87, -0.05, kit.H * 0.10],
      [0.77, -0.58, kit.H * 0.16],
      [0.61, -0.92, kit.H * 0.20],
    ],
    [0.13, 0.17, 0.15, 0.10, 0.016],
    kit.hair,
    true,
  )
  addCurve(
    kit,
    kit.root,
    'LongSideUnderLock',
    [
      [0.66, 0.64, kit.H * 0.00],
      [0.75, 0.28, kit.H * 0.05],
      [0.73, -0.20, kit.H * 0.12],
      [0.60, -0.70, kit.H * 0.18],
    ],
    [0.10, 0.13, 0.09, 0.014],
  )
  addAccentStrand(
    kit,
    kit.root,
    'LongBobAccent',
    [
      [0.76, 0.61, -kit.H * 0.03],
      [0.84, 0.29, kit.H * 0.01],
      [0.80, -0.10, kit.H * 0.08],
      [0.70, -0.52, kit.H * 0.14],
    ],
    [0.025, 0.032, 0.022, 0.008],
  )
  addBarrette(kit, -0.43, 0.58, 0.18, 0.16)
}

function buildBraidedPony(kit: HairKit): void {
  addRearCap(kit, 0.68, 0.73, 0.55, 0.36)
  addCrown(kit, 0.65, 0.25, 0.28, 0, 0.75)
  // Fine centre-parted fringe; two crown braids visibly lead toward the pony.
  addBang(kit, -0.30, 0.79, 0.27, 0.20, -0.24)
  addBang(kit, -0.10, 0.81, 0.31, 0.19, -0.08)
  addBang(kit, 0.11, 0.81, 0.31, 0.19, 0.08)
  addBang(kit, 0.30, 0.78, 0.26, 0.18, 0.23)
  for (const side of [-1, 1] as const) {
    addCurve(
      kit,
      kit.root,
      side < 0 ? 'CrownBraidL' : 'CrownBraidR',
      [
        [side * 0.15, 0.82, kit.frontZ - kit.H * 0.04],
        [side * 0.34, 0.76, kit.frontZ - kit.H * 0.02],
        [side * 0.52, 0.62, kit.frontZ + kit.H * 0.03],
        [side * 0.66, 0.52, kit.frontZ + kit.H * 0.09],
      ],
      [0.055, 0.065, 0.052, 0.012],
      side < 0 ? kit.hair : kit.accent,
    )
  }

  const braid = new THREE.Group()
  braid.name = 'BraidedPonySecondary'
  // Giraffe uses an open crown band: route the braid outside the right edge,
  // fully visible from the front instead of hiding it behind the skull.
  braid.position.set(kit.H * 0.76, kit.H * 0.71, kit.H * 0.06)
  braid.rotation.z = -0.10
  kit.root.add(braid)
  kit.secondary.push(braid)
  addTie(kit, braid, 0, 0, 0, 0.95)
  for (let i = 0; i < 9; i++) {
    const lobe = addMesh(kit, braid, 'BraidLobe', unitSphereLo(), kit.hair, 0, i === 2)
    const k = 1 - i * 0.062
    lobe.scale.set(kit.H * 0.17 * k, kit.H * 0.14 * k, kit.H * 0.12 * k)
    lobe.position.set((i % 2 === 0 ? -1 : 1) * kit.H * 0.060, -kit.H * (0.13 + i * 0.18), kit.H * i * 0.016)
    lobe.rotation.z = (i % 2 === 0 ? -1 : 1) * 0.28
    addOutline(lobe, kit.outline * 0.72, 0x241631)
  }
  addTie(kit, braid, 0, -1.66, kit.H * 0.13, 0.67)
  addDrop(kit, braid, 'BraidTip', 0, -1.60, kit.H * 0.13, 0.38, 0.16, 0)
}

/**
 * Owl: a braided coronet feeding into one low side braid.  The coronet stays
 * above the brows; the hanging braid is placed outside the full hood shell.
 */
function buildBraidedCrown(kit: HairKit): void {
  addRearCap(kit, 0.70, 0.74, 0.56, 0.36)
  addCrown(kit, 0.67, 0.25, 0.28, 0, 0.75)
  addBang(kit, -0.34, 0.78, 0.25, 0.20, -0.25)
  addBang(kit, -0.12, 0.81, 0.31, 0.20, -0.08)
  addBang(kit, 0.11, 0.81, 0.30, 0.19, 0.08)
  addBang(kit, 0.33, 0.77, 0.24, 0.19, 0.24)

  // Two interlocking rows form a proper crown instead of a torus/headband.
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 5; i++) {
      const u = i / 4
      const lobe = addMesh(
        kit,
        kit.root,
        side < 0 ? 'BraidedCrownLobeL' : 'BraidedCrownLobeR',
        unitSphereLo(),
        i % 2 === 0 ? kit.hair : kit.accent,
        0,
        i === 2,
      )
      lobe.scale.set(kit.H * 0.095, kit.H * 0.070, kit.H * 0.060)
      lobe.position.set(
        side * kit.H * THREE.MathUtils.lerp(0.10, 0.59, u),
        kit.H * (0.85 - 0.12 * u * u),
        kit.frontZ - kit.H * (0.045 - 0.015 * u),
      )
      lobe.rotation.z = side * (-0.20 + u * 0.42)
      addOutline(lobe, kit.outline * 0.62, 0x241631)
    }
  }

  const braid = new THREE.Group()
  braid.name = 'BraidedCrownLowSecondary'
  braid.position.set(-kit.H * 0.84, kit.H * 0.49, kit.H * 0.04)
  braid.rotation.z = 0.10
  kit.root.add(braid)
  kit.secondary.push(braid)
  addTie(kit, braid, 0, 0, 0, 0.78)
  for (let i = 0; i < 7; i++) {
    const lobe = addMesh(kit, braid, 'BraidedCrownLowLobe', unitSphereLo(), kit.hair, 0, i === 2)
    const k = 1 - i * 0.072
    lobe.scale.set(kit.H * 0.145 * k, kit.H * 0.120 * k, kit.H * 0.105 * k)
    lobe.position.set(
      (i % 2 === 0 ? -1 : 1) * kit.H * 0.050,
      -kit.H * (0.12 + i * 0.18),
      kit.H * i * 0.014,
    )
    lobe.rotation.z = (i % 2 === 0 ? -1 : 1) * 0.26
    addOutline(lobe, kit.outline * 0.68, 0x241631)
  }
  addTie(kit, braid, 0, -1.30, kit.H * 0.10, 0.58)
  addDrop(kit, braid, 'BraidedCrownLowTip', 0, -1.25, kit.H * 0.10, 0.32, 0.14)
}

/**
 * Tiger: a high braided pony exits through the crown port, then arcs outside
 * the right hood edge.  Alternating lobes keep it unmistakably braided.
 */
function buildBraidedHighPony(kit: HairKit): void {
  addRearCap(kit, 0.67, 0.71, 0.54, 0.38)
  addCrown(kit, 0.65, 0.24, 0.27, -0.04, 0.76)
  addBang(kit, -0.38, 0.83, 0.36, 0.26, -0.36)
  addBang(kit, -0.13, 0.83, 0.31, 0.22, -0.17)
  addBang(kit, 0.10, 0.80, 0.24, 0.16, 0.08)
  addBang(kit, 0.30, 0.76, 0.19, 0.13, 0.30)
  addBarrette(kit, 0.43, 0.55, -0.26, 0.15)

  const braid = new THREE.Group()
  braid.name = 'BraidedHighPonySecondary'
  braid.position.set(kit.H * 0.28, kit.H * 1.18, kit.H * 0.22)
  braid.rotation.z = -0.13
  kit.root.add(braid)
  kit.secondary.push(braid)
  addTie(kit, braid, 0, 0, 0, 0.98)
  for (let i = 0; i < 9; i++) {
    const lobe = addMesh(kit, braid, 'BraidedHighPonyLobe', unitSphereLo(), kit.hair, 0, i === 2)
    const k = 1 - i * 0.060
    const parity = i % 2 === 0 ? -1 : 1
    lobe.scale.set(kit.H * 0.165 * k, kit.H * 0.135 * k, kit.H * 0.115 * k)
    lobe.position.set(
      kit.H * (i * 0.072 + parity * 0.050),
      -kit.H * (0.13 + i * 0.18),
      kit.H * (0.02 + i * 0.017),
    )
    lobe.rotation.z = parity * 0.29
    addOutline(lobe, kit.outline * 0.70, 0x241631)
  }
  addTie(kit, braid, 0.61, -1.66, kit.H * 0.15, 0.62)
  addDrop(kit, braid, 'BraidedHighPonyTip', 0.61, -1.61, kit.H * 0.15, 0.36, 0.15, -0.08)
}

/**
 * Elephant: polished side-parted crop gathered into a low pony.  The root is
 * outside the broad hood, while the front remains intentionally minimal.
 */
function buildLowPony(kit: HairKit): void {
  addRearCap(kit, 0.70, 0.73, 0.57, 0.36)
  addCrown(kit, 0.68, 0.25, 0.29, 0.05, 0.75)
  addBang(kit, -0.32, 0.79, 0.24, 0.18, -0.22)
  addBang(kit, -0.10, 0.82, 0.29, 0.21, -0.11)
  addBang(kit, 0.15, 0.81, 0.34, 0.24, 0.20)
  addBang(kit, 0.38, 0.77, 0.26, 0.18, 0.31)
  addDrop(
    kit,
    kit.root,
    'LowPonyTuckedTemple',
    kit.sideX / kit.H + 0.025,
    0.58,
    kit.frontZ + kit.H * 0.01,
    0.52,
    0.12,
    0.025,
  )
  addBarrette(kit, 0.45, 0.57, -0.16, 0.14)

  const pony = new THREE.Group()
  pony.name = 'LowPonySecondary'
  pony.position.set(-kit.H * 0.94, kit.H * 0.27, kit.H * 0.08)
  pony.rotation.z = 0.10
  kit.root.add(pony)
  kit.secondary.push(pony)
  addTie(kit, pony, 0, 0, 0, 0.88)
  addCurve(
    kit,
    pony,
    'LowPonyMain',
    [
      [0, 0, 0],
      [-0.10, -0.22, kit.H * 0.03],
      [-0.04, -0.58, kit.H * 0.08],
      [0.12, -0.94, kit.H * 0.13],
      [0.04, -1.24, kit.H * 0.17],
    ],
    [0.16, 0.19, 0.15, 0.09, 0.015],
    kit.hair,
    true,
  )
  addAccentStrand(
    kit,
    pony,
    'LowPonyHighlight',
    [
      [0.02, -0.05, -kit.H * 0.025],
      [-0.03, -0.32, kit.H * 0.01],
      [0.03, -0.67, kit.H * 0.07],
      [0.08, -1.03, kit.H * 0.13],
    ],
    [0.024, 0.030, 0.021, 0.007],
  )
}

/**
 * Giraffe: high bubble pony with visible elastic breaks.  This produces a
 * graphic beaded silhouette that cannot be confused with a conventional braid.
 */
function buildBubblePony(kit: HairKit): void {
  addRearCap(kit, 0.68, 0.72, 0.55, 0.36)
  addCrown(kit, 0.65, 0.24, 0.28, 0, 0.75)
  addBang(kit, -0.31, 0.79, 0.25, 0.19, -0.23)
  addBang(kit, -0.10, 0.82, 0.31, 0.20, -0.08)
  addBang(kit, 0.12, 0.81, 0.30, 0.20, 0.09)
  addBang(kit, 0.33, 0.77, 0.24, 0.18, 0.25)

  const pony = new THREE.Group()
  pony.name = 'BubblePonySecondary'
  pony.position.set(kit.H * 0.72, kit.H * 0.96, kit.H * 0.05)
  pony.rotation.z = -0.12
  kit.root.add(pony)
  kit.secondary.push(pony)
  addTie(kit, pony, 0, 0, 0, 1.0)
  for (let i = 0; i < 6; i++) {
    const bubble = addMesh(kit, pony, 'BubblePonySegment', egg(1, 1, 1, -0.08), kit.hair, 0, i === 2)
    const k = 1 - i * 0.065
    bubble.scale.set(kit.H * 0.205 * k, kit.H * 0.190 * k, kit.H * 0.155 * k)
    bubble.position.set(
      kit.H * (0.025 * Math.sin(i * 0.85)),
      -kit.H * (0.18 + i * 0.34),
      kit.H * (0.02 + i * 0.018),
    )
    addOutline(bubble, kit.outline * 0.72, 0x241631)
    if (i < 5) {
      const elastic = addMesh(
        kit,
        pony,
        'BubblePonyElastic',
        new THREE.TorusGeometry(kit.H * 0.095 * k, kit.H * 0.018, 7, 24),
        kit.accent,
        kit.outline * 0.30,
      )
      elastic.rotation.x = Math.PI / 2
      elastic.position.set(
        0,
        -kit.H * (0.35 + i * 0.34),
        kit.H * (0.02 + i * 0.018),
      )
    }
  }
  addTie(kit, pony, 0, -2.02, kit.H * 0.13, 0.62)
  addDrop(kit, pony, 'BubblePonyTip', 0, -1.97, kit.H * 0.13, 0.34, 0.14)
}

const BUILDERS: Readonly<Record<HairStyle, (kit: HairKit) => void>> = {
  wavyBob: buildWavyBob,
  highPony: buildHighPony,
  bluntBob: buildBluntBob,
  twinTails: buildTwinTails,
  sidePony: buildSidePony,
  doubleBuns: buildDoubleBuns,
  pixieBob: buildPixieBob,
  wolfCut: buildWolfCut,
  curlyShag: buildCurlyShag,
  asymPixie: buildAsymPixie,
  longSideBob: buildLongSideBob,
  braidedPony: buildBraidedPony,
  braidedCrown: buildBraidedCrown,
  braidedHighPony: buildBraidedHighPony,
  lowPony: buildLowPony,
  bubblePony: buildBubblePony,
}

/**
 * Attach one complete hair silhouette to a head-owned group.
 *
 * `parent` is expected to already use the animal head orientation convention;
 * no transform is applied to it.  Returned secondary groups are optional
 * spring-animation anchors, never bones, so animating them cannot disturb face
 * tracking.
 */
export function buildHairStyle(
  parent: THREE.Group,
  ctx: AnimalBuildContext,
  spec: HairSpec,
  hitMeshes: THREE.Mesh[],
): HairRig {
  const H = ctx.crownH
  const measuredFaceW = ctx.face?.halfW ?? ctx.halfW
  const sideX = Math.max(measuredFaceW + H * 0.075, H * 0.50)
  const frontZ = (ctx.face?.frontZ ?? -H * 0.50) - H * 0.015
  const root = new THREE.Group()
  root.name = `Hair_${spec.style}`
  parent.add(root)

  const kit: HairKit = {
    H,
    sideX,
    frontZ,
    root,
    secondary: [],
    hair: toonMat(spec.base, spec.shade),
    accent: toonMat(spec.accent, spec.shade),
    outline: H * 0.018,
    hitMeshes,
  }
  BUILDERS[spec.style](kit)
  return { root, secondary: kit.secondary }
}
