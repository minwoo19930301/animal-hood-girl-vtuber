/**
 * Bone-attached procedural wardrobes for the 12-character animal-cosplay pack.
 *
 * Each garment is split across chest/hips/limb bones.  Sleeves, trouser legs,
 * wrist accents and shoes therefore follow the existing FK and finger rig
 * without adding, reparenting or rotating any humanoid bone.  The caller is
 * responsible for hiding the donor VRM school outfit before/after building.
 */
import * as THREE from 'three'
import { egg, unitSphereLo } from '../geo'
import { addOutline, toonMat, unlitMat } from '../materials'
import type { AnimalBuildContext } from './types'

export const WARDROBE_STYLES = [
  'varsitySkort',
  'bomberCargo',
  'techUtility',
  'cardiganSkort',
  'motoLeggings',
  'pandaCulottes',
  'sailorCulottes',
  'scholarTrousers',
  'royalWideLeg',
  'racerLayered',
  'utilityCoat',
  'safariShorts',
] as const

export type WardrobeStyle = (typeof WARDROBE_STYLES)[number]

export interface WardrobePalette {
  primary: number
  primaryShade: number
  secondary: number
  secondaryShade: number
  accent: number
  dark: number
  light: number
}

export interface WardrobeSpec {
  style: WardrobeStyle
  palette: WardrobePalette
}

export interface WardrobeRig {
  /** Every root attached to a humanoid bone, useful for visibility toggles. */
  roots: THREE.Group[]
  torsoRoot: THREE.Group | null
  hipRoot: THREE.Group | null
  sleeveRoots: THREE.Group[]
  legRoots: THREE.Group[]
  shoeRoots: THREE.Group[]
  handRoots: THREE.Group[]
}

interface Mats {
  primary: THREE.Material
  secondary: THREE.Material
  accent: THREE.Material
  dark: THREE.Material
  light: THREE.Material
}

interface WardrobeKit {
  ctx: AnimalBuildContext
  H: number
  front: number
  mats: Mats
  hitMeshes: THREE.Mesh[]
  roots: THREE.Group[]
  torsoRoot: THREE.Group | null
  hipRoot: THREE.Group | null
  sleeveRoots: THREE.Group[]
  legRoots: THREE.Group[]
  shoeRoots: THREE.Group[]
  handRoots: THREE.Group[]
  waistCovered: boolean
}

type Side = -1 | 1

function attachRoot(kit: WardrobeKit, bone: THREE.Object3D | null | undefined, name: string, turn = false): THREE.Group | null {
  if (!bone) return null
  const root = new THREE.Group()
  root.name = name
  if (turn && kit.ctx.S === -1) root.rotation.y = Math.PI
  bone.add(root)
  kit.roots.push(root)
  return root
}

function mesh(
  kit: WardrobeKit,
  parent: THREE.Object3D,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  outline = kit.H * 0.015,
  hit = false,
): THREE.Mesh {
  const part = new THREE.Mesh(geometry, material)
  part.name = name
  if (outline > 0) addOutline(part, outline, 0x241631)
  parent.add(part)
  if (hit) kit.hitMeshes.push(part)
  return part
}

function torso(
  kit: WardrobeKit,
  name: string,
  material = kit.mats.primary,
  width = 0.69,
  length = 1.02,
  depth = 0.42,
  y = -0.61,
): THREE.Mesh | null {
  const root = kit.torsoRoot
  if (!root) return null
  const body = mesh(
    kit,
    root,
    name,
    new THREE.CapsuleGeometry(kit.H * width * 0.50, kit.H * Math.max(0.08, length - width), 10, 28),
    material,
    0,
    true,
  )
  body.scale.set(1.18, 1, depth / (width * 0.50))
  body.position.set(0, kit.H * y, -kit.front * kit.H * 0.06)
  addOutline(body, kit.H * 0.022, 0x241631)
  return body
}

function panel(
  kit: WardrobeKit,
  parent: THREE.Object3D | null,
  name: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  rz = 0,
  outline = 0,
): THREE.Mesh | null {
  if (!parent) return null
  const part = mesh(
    kit,
    parent,
    name,
    new THREE.BoxGeometry(kit.H * w, kit.H * h, kit.H * d),
    material,
    outline,
  )
  part.position.set(kit.H * x, kit.H * y, kit.H * z)
  part.rotation.z = rz
  return part
}

function orb(
  kit: WardrobeKit,
  parent: THREE.Object3D | null,
  name: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  material: THREE.Material,
  outline = 0,
): THREE.Mesh | null {
  if (!parent) return null
  const part = mesh(kit, parent, name, unitSphereLo(), material, 0)
  part.position.set(kit.H * x, kit.H * y, kit.H * z)
  part.scale.set(kit.H * sx, kit.H * sy, kit.H * sz)
  if (outline > 0) addOutline(part, outline, 0x241631)
  return part
}

function childDirection(bone: THREE.Object3D, fallback: THREE.Vector3): { direction: THREE.Vector3; length: number } {
  let best: THREE.Object3D | null = null
  let length = 0
  for (const child of bone.children) {
    const d = child.position.length()
    if (d > length) {
      best = child
      length = d
    }
  }
  return {
    direction: best && length > 1e-5 ? best.position.clone().normalize() : fallback.clone().normalize(),
    length,
  }
}

function limbCover(
  kit: WardrobeKit,
  bone: THREE.Object3D | null | undefined,
  name: string,
  fallback: THREE.Vector3,
  material: THREE.Material,
  targetLength: number,
  radius: number,
  taper = 1,
): { root: THREE.Group; mesh: THREE.Mesh; direction: THREE.Vector3; length: number } | null {
  const root = attachRoot(kit, bone, `${name}Root`)
  if (!root || !bone) return null
  const measured = childDirection(bone, fallback)
  const length = Math.max(kit.H * targetLength, Math.min(measured.length * 0.92, kit.H * targetLength * 1.25))
  const r = kit.H * radius
  const part = mesh(
    kit,
    root,
    name,
    new THREE.CapsuleGeometry(r * taper, Math.max(kit.H * 0.05, length - r * 2), 8, 20),
    material,
    kit.H * 0.016,
    true,
  )
  part.position.copy(measured.direction).multiplyScalar(length * 0.48)
  part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), measured.direction)
  return { root, mesh: part, direction: measured.direction, length }
}

function addSleeves(
  kit: WardrobeKit,
  material: THREE.Material,
  length = 0.92,
  radius = 0.22,
  cuffMaterial = kit.mats.accent,
  short = false,
): void {
  for (const [side, bone] of [
    [-1, kit.ctx.bones.upperArmL],
    [1, kit.ctx.bones.upperArmR],
  ] as const) {
    const sleeve = limbCover(
      kit,
      bone,
      side < 0 ? 'WardrobeSleeveL' : 'WardrobeSleeveR',
      new THREE.Vector3(side, 0, 0),
      material,
      short ? length * 0.54 : length,
      radius,
    )
    if (!sleeve) continue
    kit.sleeveRoots.push(sleeve.root)
    const cuff = mesh(
      kit,
      sleeve.root,
      'WardrobeSleeveCuff',
      new THREE.TorusGeometry(kit.H * radius * 1.02, kit.H * 0.033, 8, 24),
      cuffMaterial,
      0,
    )
    cuff.position.copy(sleeve.direction).multiplyScalar(sleeve.length * 0.78)
    cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), sleeve.direction)
  }
}

function addWristAccents(kit: WardrobeKit, material = kit.mats.accent, chunky = false): void {
  for (const [side, hand] of [
    [-1, kit.ctx.bones.handL],
    [1, kit.ctx.bones.handR],
  ] as const) {
    const root = attachRoot(kit, hand, side < 0 ? 'WardrobeHandAccentL' : 'WardrobeHandAccentR')
    if (!root) continue
    kit.handRoots.push(root)
    const cuff = mesh(
      kit,
      root,
      'WardrobeWristBand',
      new THREE.CylinderGeometry(
        kit.H * (chunky ? 0.16 : 0.125),
        kit.H * (chunky ? 0.15 : 0.118),
        kit.H * (chunky ? 0.16 : 0.09),
        20,
      ),
      material,
      kit.H * 0.010,
    )
    cuff.rotation.z = Math.PI / 2
    cuff.position.x = side * kit.H * 0.035
  }
}

/**
 * The donor body has a small grey underwear mesh which cannot be recoloured
 * safely per avatar.  Limb-attached shorts/trousers start at the upper-leg
 * bones, so they cannot cover the pelvis by themselves.  This tapered yoke is
 * attached to the hips and deliberately overlaps both the torso hem and the
 * upper-leg garments.  It therefore removes the underwear/midriff seam while
 * preserving completely independent leg motion.
 */
function addWaistYoke(
  kit: WardrobeKit,
  material: THREE.Material,
  opts: {
    name?: string
    rise?: number
    drop?: number
    top?: number
    bottom?: number
    depth?: number
    waistband?: THREE.Material | null
  } = {},
): THREE.Mesh | null {
  if (!kit.hipRoot) return null
  // Image 15 is now skin-matched during the deterministic VRM build, so this
  // piece only needs to bridge the real waist/leg seam. Earlier hard minimums
  // made it more than a head-height tall and it rendered as a large rectangle
  // over every outfit.
  const rise = THREE.MathUtils.clamp((opts.rise ?? 0.22) * 0.36, 0.18, 0.28)
  // Extend only downward to meet the thigh pieces; the small rise keeps the
  // torso artwork visible while the overlap removes ragged skin wedges.
  const drop = THREE.MathUtils.clamp((opts.drop ?? 0.34) * 1.55, 0.40, 0.58)
  const top = THREE.MathUtils.clamp(opts.top ?? 0.50, 0.44, 0.54)
  const bottom = THREE.MathUtils.clamp(opts.bottom ?? 0.60, 0.52, 0.68)
  // Sit outside the donor skin without becoming a deep barrel around the hips.
  const depth = THREE.MathUtils.clamp(opts.depth ?? 0.64, 0.58, 0.72)
  const height = rise + drop
  const yoke = mesh(
    kit,
    kit.hipRoot,
    opts.name ?? 'WardrobeWaistYoke',
    new THREE.CylinderGeometry(kit.H * bottom, kit.H * top, kit.H * height, 32, 1, false),
    material,
    0,
    true,
  )
  yoke.scale.z = depth
  yoke.position.set(0, kit.H * ((rise - drop) * 0.5), -kit.front * kit.H * 0.13)
  addOutline(yoke, kit.H * 0.020, 0x241631)
  kit.waistCovered = true

  if (opts.waistband) {
    const band = mesh(
      kit,
      kit.hipRoot,
      'WardrobeWaistband',
      new THREE.CylinderGeometry(kit.H * (top + 0.018), kit.H * (top + 0.028), kit.H * 0.11, 32),
      opts.waistband,
      kit.H * 0.008,
    )
    band.scale.z = depth + 0.02
    band.position.set(0, kit.H * (rise - 0.055), -kit.front * kit.H * 0.022)
  }
  return yoke
}

function addHemBand(
  kit: WardrobeKit,
  material: THREE.Material,
  y = -1.18,
  width = 0.74,
  height = 0.11,
): void {
  if (!kit.torsoRoot) return
  const band = mesh(
    kit,
    kit.torsoRoot,
    'WardrobeTorsoHemBand',
    new THREE.CylinderGeometry(kit.H * width * 0.50, kit.H * width * 0.52, kit.H * height, 30),
    material,
    kit.H * 0.008,
  )
  band.scale.set(1.18, 1, 1.30)
  band.position.set(0, kit.H * y, -kit.front * kit.H * 0.06)
}

function addCrewNeck(
  kit: WardrobeKit,
  material: THREE.Material,
  opts: { y?: number; width?: number; height?: number; open?: boolean } = {},
): void {
  if (!kit.torsoRoot) return
  const y = opts.y ?? 0.28
  const width = opts.width ?? 0.31
  const height = opts.height ?? 0.19
  const neck = mesh(
    kit,
    kit.torsoRoot,
    opts.open ? 'WardrobeOpenCrewNeck' : 'WardrobeCrewNeck',
    new THREE.TorusGeometry(kit.H * width, kit.H * 0.045, 8, opts.open ? 28 : 36, opts.open ? Math.PI * 1.55 : Math.PI * 2),
    material,
    kit.H * 0.008,
  )
  neck.scale.y = height / width
  neck.position.set(0, kit.H * y, -kit.front * kit.H * 0.45)
  if (opts.open) neck.rotation.z = Math.PI * 0.225
}

function addBow(
  kit: WardrobeKit,
  material: THREE.Material,
  y: number,
  size = 0.16,
): void {
  for (const side of [-1, 1] as const) {
    const wing = orb(
      kit,
      kit.torsoRoot,
      'WardrobeBowWing',
      side * size * 0.72,
      y,
      -kit.front * 0.51,
      size,
      size * 0.72,
      0.038,
      material,
      kit.H * 0.008,
    )
    if (wing) wing.rotation.z = side * 0.28
  }
  orb(kit, kit.torsoRoot, 'WardrobeBowKnot', 0, y, -kit.front * 0.55, size * 0.48, size * 0.48, 0.045, kit.mats.light)
}

function addCalfCovers(
  kit: WardrobeKit,
  material: THREE.Material,
  opts: { length?: number; radius?: number; accent?: THREE.Material | null; flared?: boolean } = {},
): void {
  for (const [side, lower] of [
    [-1, kit.ctx.bones.lowerLegL],
    [1, kit.ctx.bones.lowerLegR],
  ] as const) {
    const cover = limbCover(
      kit,
      lower,
      side < 0 ? 'WardrobeCalfCoverL' : 'WardrobeCalfCoverR',
      new THREE.Vector3(0, -1, 0),
      material,
      opts.length ?? 0.82,
      opts.radius ?? 0.17,
      opts.flared ? 1.16 : 0.96,
    )
    if (!cover) continue
    kit.legRoots.push(cover.root)
    if (opts.accent) {
      const band = mesh(
        kit,
        cover.root,
        'WardrobeCalfBand',
        new THREE.TorusGeometry(kit.H * ((opts.radius ?? 0.17) + 0.012), kit.H * 0.026, 8, 24),
        opts.accent,
        0,
      )
      band.position.copy(cover.direction).multiplyScalar(cover.length * 0.20)
      band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), cover.direction)
    }
  }
}

function addShoulderPuffs(
  kit: WardrobeKit,
  material: THREE.Material,
  size = 0.27,
  squash = 0.82,
): void {
  for (const [side, upper] of [
    [-1, kit.ctx.bones.upperArmL],
    [1, kit.ctx.bones.upperArmR],
  ] as const) {
    const root = attachRoot(kit, upper, side < 0 ? 'WardrobeShoulderPuffL' : 'WardrobeShoulderPuffR')
    if (!root) continue
    kit.sleeveRoots.push(root)
    const puff = orb(
      kit,
      root,
      'WardrobeShoulderPuff',
      side * 0.035,
      -0.01,
      -kit.front * 0.01,
      size,
      size * squash,
      size * 0.76,
      material,
      kit.H * 0.014,
    )
    if (puff) puff.rotation.z = side * 0.12
  }
}

function addLegSideStripes(
  kit: WardrobeKit,
  material: THREE.Material,
  width = 0.055,
): void {
  for (const [side, upper, lower] of [
    [-1, kit.ctx.bones.upperLegL, kit.ctx.bones.lowerLegL],
    [1, kit.ctx.bones.upperLegR, kit.ctx.bones.lowerLegR],
  ] as const) {
    for (const [segment, bone, fallback, length] of [
      ['Upper', upper, new THREE.Vector3(0, -1, 0), 0.86],
      ['Lower', lower, new THREE.Vector3(0, -1, 0), 0.94],
    ] as const) {
      if (!bone) continue
      const root = attachRoot(kit, bone, `WardrobeStripe${segment}${side < 0 ? 'L' : 'R'}`)
      if (!root) continue
      kit.legRoots.push(root)
      const measured = childDirection(bone, fallback)
      const stripeLength = Math.max(kit.H * length, Math.min(measured.length * 0.86, kit.H * length * 1.18))
      const stripe = panel(
        kit,
        root,
        'WardrobeLegStripe',
        side * 0.17,
        -stripeLength / kit.H * 0.48,
        -kit.front * 0.17,
        width,
        stripeLength / kit.H,
        0.035,
        material,
      )
      if (stripe) stripe.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), measured.direction)
    }
  }
}

function addSkirt(
  kit: WardrobeKit,
  material: THREE.Material,
  y = -0.12,
  length = 0.68,
  top = 0.51,
  bottom = 0.73,
  pleats = 6,
): void {
  if (!kit.hipRoot) return
  if (!kit.waistCovered) {
    addWaistYoke(kit, material, {
      name: 'WardrobeSkirtHighWaist',
      rise: 0.69,
      drop: 0.24,
      top: 0.47,
      bottom: Math.max(0.53, top),
      waistband: kit.mats.accent,
    })
  }
  const skirt = mesh(
    kit,
    kit.hipRoot,
    'WardrobeSkirt',
    new THREE.CylinderGeometry(kit.H * bottom, kit.H * top, kit.H * length, 32, 1, false),
    material,
    0,
    true,
  )
  skirt.scale.z = 0.62
  skirt.position.set(0, kit.H * (y - length * 0.5 + 0.08), -kit.front * kit.H * 0.03)
  addOutline(skirt, kit.H * 0.022, 0x241631)
  for (let i = 0; i < pleats; i++) {
    const x = THREE.MathUtils.lerp(-bottom * 0.72, bottom * 0.72, pleats === 1 ? 0.5 : i / (pleats - 1))
    panel(
      kit,
      kit.hipRoot,
      'WardrobeSkirtPleat',
      x,
      y - length * 0.51,
      -kit.front * 0.41,
      0.026,
      length * 0.84,
      0.025,
      kit.mats.dark,
      x * 0.05,
    )
  }
}

function addHipBelt(kit: WardrobeKit, material = kit.mats.accent, y = -0.03, buckle = true): void {
  if (!kit.hipRoot) return
  const belt = mesh(
    kit,
    kit.hipRoot,
    'WardrobeBelt',
    new THREE.CylinderGeometry(kit.H * 0.55, kit.H * 0.55, kit.H * 0.105, 30),
    material,
    kit.H * 0.010,
  )
  belt.scale.z = 0.65
  belt.position.y = kit.H * y
  if (buckle) {
    panel(kit, kit.hipRoot, 'WardrobeBuckle', 0, y, -kit.front * 0.38, 0.16, 0.13, 0.055, kit.mats.light, 0, kit.H * 0.008)
  }
}

function addLegs(
  kit: WardrobeKit,
  upperMaterial: THREE.Material,
  lowerMaterial = upperMaterial,
  opts: {
    upperRadius?: number
    lowerRadius?: number
    upperLength?: number
    lowerLength?: number
    wide?: boolean
    shorts?: boolean
    kneeAccent?: boolean
  } = {},
): void {
  // All radii intentionally clear the donor skin; smaller values looked like
  // painted-on patches and exposed the grey briefs/skin through z-fighting.
  const upperRadius = Math.max(opts.upperRadius ?? 0, opts.wide ? 0.34 : opts.shorts ? 0.30 : 0.27)
  const lowerRadius = Math.max(opts.lowerRadius ?? 0, opts.wide ? 0.31 : 0.205)
  if (!kit.waistCovered) {
    addWaistYoke(kit, upperMaterial, {
      name: opts.shorts ? 'WardrobeShortsYoke' : opts.wide ? 'WardrobeWideTrouserYoke' : 'WardrobeTrouserYoke',
      rise: opts.shorts ? 0.64 : 0.68,
      drop: opts.shorts ? 0.34 : 0.31,
      top: opts.wide ? 0.50 : 0.47,
      bottom: opts.wide ? 0.62 : Math.max(0.54, upperRadius * 2.3),
      depth: opts.wide ? 0.66 : 0.62,
      waistband: kit.mats.accent,
    })
  }
  for (const [side, upper, lower] of [
    [-1, kit.ctx.bones.upperLegL, kit.ctx.bones.lowerLegL],
    [1, kit.ctx.bones.upperLegR, kit.ctx.bones.lowerLegR],
  ] as const) {
    const upperPiece = limbCover(
      kit,
      upper,
      side < 0 ? 'WardrobeUpperLegL' : 'WardrobeUpperLegR',
      new THREE.Vector3(0, -1, 0),
      upperMaterial,
      opts.upperLength ?? (opts.shorts ? 0.58 : 1.10),
      upperRadius,
      opts.wide ? 1.08 : 1,
    )
    if (upperPiece) kit.legRoots.push(upperPiece.root)
    if (opts.shorts || !lower) continue
    const lowerPiece = limbCover(
      kit,
      lower,
      side < 0 ? 'WardrobeLowerLegL' : 'WardrobeLowerLegR',
      new THREE.Vector3(0, -1, 0),
      lowerMaterial,
      opts.lowerLength ?? 1.12,
      lowerRadius,
      opts.wide ? 1.10 : 0.96,
    )
    if (!lowerPiece) continue
    kit.legRoots.push(lowerPiece.root)
    if (opts.kneeAccent) {
      const guard = orb(
        kit,
        lowerPiece.root,
        'WardrobeKneeGuard',
        0,
        0.02,
        -kit.front * 0.18,
        0.22,
        0.16,
        0.075,
        kit.mats.accent,
        kit.H * 0.010,
      )
      if (guard) guard.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), lowerPiece.direction)
    }
  }
}

function addShoes(kit: WardrobeKit, material = kit.mats.dark, accent = kit.mats.accent, boots = false): void {
  for (const [side, foot] of [
    [-1, kit.ctx.bones.footL],
    [1, kit.ctx.bones.footR],
  ] as const) {
    const root = attachRoot(kit, foot, side < 0 ? 'WardrobeShoeL' : 'WardrobeShoeR', true)
    if (!root) continue
    kit.shoeRoots.push(root)
    const shoe = mesh(
      kit,
      root,
      'WardrobeShoe',
      new THREE.CapsuleGeometry(kit.H * (boots ? 0.20 : 0.17), kit.H * (boots ? 0.26 : 0.20), 8, 20),
      material,
      0,
      true,
    )
    shoe.rotation.x = Math.PI / 2
    shoe.scale.set(0.88, boots ? 1.25 : 1.05, 0.72)
    shoe.position.set(0, -kit.H * (boots ? 0.12 : 0.06), -kit.front * kit.H * 0.18)
    addOutline(shoe, kit.H * 0.015, 0x241631)
    panel(kit, root, 'WardrobeShoeAccent', 0, -0.08, -kit.front * 0.39, 0.23, 0.05, 0.04, accent)
  }
}

function addCollar(
  kit: WardrobeKit,
  material = kit.mats.secondary,
  wide = false,
  y = 0.21,
): void {
  for (const side of [-1, 1] as const) {
    const lapel = panel(
      kit,
      kit.torsoRoot,
      'WardrobeCollar',
      side * (wide ? 0.18 : 0.13),
      y,
      -kit.front * 0.39,
      wide ? 0.24 : 0.16,
      wide ? 0.46 : 0.34,
      0.045,
      material,
      side * (wide ? -0.57 : -0.48),
      kit.H * 0.010,
    )
    if (lapel) lapel.rotation.x = -kit.front * 0.05
  }
}

function addZipper(kit: WardrobeKit, material = kit.mats.accent, y = -0.49, h = 1.20, x = 0, angle = 0): void {
  panel(kit, kit.torsoRoot, 'WardrobeZipper', x, y, -kit.front * 0.445, 0.045, h, 0.035, material, angle)
}

function addButtons(kit: WardrobeKit, count: number, y0: number, gap: number, x = 0, material = kit.mats.accent): void {
  for (let i = 0; i < count; i++) {
    orb(kit, kit.torsoRoot, 'WardrobeButton', x, y0 - i * gap, -kit.front * 0.46, 0.045, 0.045, 0.025, material)
  }
}

function addPocket(kit: WardrobeKit, parent: THREE.Object3D | null, side: Side, y: number, material = kit.mats.secondary, large = false): void {
  const pocket = panel(
    kit,
    parent,
    'WardrobePocket',
    side * (large ? 0.39 : 0.34),
    y,
    -kit.front * 0.45,
    large ? 0.36 : 0.27,
    large ? 0.30 : 0.22,
    0.055,
    material,
    side * -0.03,
    kit.H * 0.009,
  )
  if (pocket) {
    panel(kit, pocket, 'WardrobePocketFlap', 0, 0.12, -kit.front * 0.04, large ? 0.34 : 0.25, 0.06, 0.035, kit.mats.accent)
  }
}

function varsitySkort(kit: WardrobeKit): void {
  torso(kit, 'VarsityJacket', kit.mats.primary, 0.74, 1.42, 0.44, -0.77)
  addSleeves(kit, kit.mats.secondary, 0.94, 0.23, kit.mats.accent)
  addCollar(kit, kit.mats.light, false, 0.23)
  addZipper(kit, kit.mats.accent, -0.63, 1.43)
  addHemBand(kit, kit.mats.secondary, -1.39, 0.75, 0.13)
  addPocket(kit, kit.torsoRoot, -1, -0.91, kit.mats.secondary)
  addPocket(kit, kit.torsoRoot, 1, -0.91, kit.mats.secondary)
  orb(kit, kit.torsoRoot, 'VarsityLetterPatch', -0.31, -0.22, -kit.front * 0.47, 0.14, 0.18, 0.035, kit.mats.accent, kit.H * 0.010)
  addWaistYoke(kit, kit.mats.dark, {
    name: 'VarsitySkortHighWaist',
    rise: 0.68,
    drop: 0.28,
    top: 0.46,
    bottom: 0.56,
    waistband: kit.mats.accent,
  })
  addSkirt(kit, kit.mats.dark, 0.02, 0.68, 0.52, 0.75, 7)
  addHipBelt(kit, kit.mats.accent, 0)
  addLegs(kit, kit.mats.secondary, kit.mats.secondary, { shorts: true, upperLength: 0.42, upperRadius: 0.19 })
  addCalfCovers(kit, kit.mats.dark, { length: 0.78, radius: 0.16, accent: kit.mats.accent })
  addShoes(kit, kit.mats.light, kit.mats.accent)
  addWristAccents(kit, kit.mats.accent)
}

function bomberCargo(kit: WardrobeKit): void {
  torso(kit, 'BomberJacket', kit.mats.primary, 0.80, 1.38, 0.48, -0.74)
  addSleeves(kit, kit.mats.primary, 0.99, 0.27, kit.mats.dark)
  addCrewNeck(kit, kit.mats.dark, { y: 0.27, width: 0.30, height: 0.15 })
  addZipper(kit, kit.mats.accent, -0.61, 1.40)
  addHemBand(kit, kit.mats.dark, -1.34, 0.80, 0.16)
  addPocket(kit, kit.torsoRoot, -1, -0.87, kit.mats.secondary, true)
  addPocket(kit, kit.torsoRoot, 1, -0.87, kit.mats.secondary, true)
  addWaistYoke(kit, kit.mats.secondary, {
    name: 'CargoHighWaist',
    rise: 0.66,
    drop: 0.32,
    top: 0.48,
    bottom: 0.58,
    waistband: kit.mats.dark,
  })
  addHipBelt(kit, kit.mats.dark, -0.02, false)
  addLegs(kit, kit.mats.secondary, kit.mats.secondary, { upperRadius: 0.25, lowerRadius: 0.22, kneeAccent: true })
  for (const side of [-1, 1] as const) addPocket(kit, kit.hipRoot, side, -0.35, kit.mats.primary, true)
  addLegSideStripes(kit, kit.mats.accent, 0.04)
  addShoes(kit, kit.mats.dark, kit.mats.accent, true)
  addWristAccents(kit, kit.mats.dark, true)
}

function techUtility(kit: WardrobeKit): void {
  torso(kit, 'TechUtilityTop', kit.mats.dark, 0.67, 1.44, 0.40, -0.79)
  addSleeves(kit, kit.mats.primary, 0.77, 0.19, kit.mats.accent)
  addCrewNeck(kit, kit.mats.accent, { y: 0.29, width: 0.25, height: 0.13 })
  panel(kit, kit.torsoRoot, 'TechAsymPanel', -0.22, -0.58, -kit.front * 0.445, 0.44, 1.16, 0.045, kit.mats.primary, -0.12, kit.H * 0.012)
  panel(kit, kit.torsoRoot, 'TechHarnessDiagonal', 0.03, -0.38, -kit.front * 0.49, 0.075, 1.42, 0.04, kit.mats.accent, -0.43)
  panel(kit, kit.torsoRoot, 'TechChestBadge', 0.31, -0.27, -kit.front * 0.50, 0.22, 0.11, 0.045, kit.mats.light, 0, kit.H * 0.008)
  addWaistYoke(kit, kit.mats.dark, {
    name: 'TechBodysuitWaist',
    rise: 0.72,
    drop: 0.30,
    top: 0.45,
    bottom: 0.52,
    waistband: kit.mats.accent,
  })
  addHipBelt(kit, kit.mats.accent, -0.01)
  addLegs(kit, kit.mats.dark, kit.mats.dark, { upperRadius: 0.21, lowerRadius: 0.17, kneeAccent: true })
  addLegSideStripes(kit, kit.mats.primary, 0.048)
  addShoes(kit, kit.mats.dark, kit.mats.accent, true)
  addWristAccents(kit, kit.mats.accent, true)
}

function cardiganSkort(kit: WardrobeKit): void {
  torso(kit, 'SoftCardigan', kit.mats.primary, 0.70, 1.47, 0.41, -0.80)
  addShoulderPuffs(kit, kit.mats.primary, 0.25, 0.90)
  addSleeves(kit, kit.mats.primary, 0.90, 0.205, kit.mats.secondary)
  // Light inset blouse and a deep V formed by two cardigan edges.
  panel(kit, kit.torsoRoot, 'CardiganBlouseInset', 0, -0.38, -kit.front * 0.43, 0.42, 0.88, 0.05, kit.mats.light)
  addCrewNeck(kit, kit.mats.secondary, { y: 0.26, width: 0.32, height: 0.19, open: true })
  addBow(kit, kit.mats.accent, 0.02, 0.14)
  for (const side of [-1, 1] as const) {
    panel(kit, kit.torsoRoot, 'CardiganVEdge', side * 0.14, -0.10, -kit.front * 0.48, 0.045, 0.84, 0.025, kit.mats.secondary, side * -0.42)
  }
  addButtons(kit, 5, -0.43, 0.20, 0, kit.mats.accent)
  addWaistYoke(kit, kit.mats.secondary, {
    name: 'CardiganSkortHighWaist',
    rise: 0.68,
    drop: 0.26,
    top: 0.46,
    bottom: 0.55,
    waistband: kit.mats.light,
  })
  addSkirt(kit, kit.mats.secondary, 0.02, 0.67, 0.50, 0.72, 9)
  addLegs(kit, kit.mats.dark, kit.mats.dark, { shorts: true, upperLength: 0.38, upperRadius: 0.18 })
  addCalfCovers(kit, kit.mats.light, { length: 0.54, radius: 0.145, accent: kit.mats.secondary })
  addShoes(kit, kit.mats.dark, kit.mats.accent)
  addWristAccents(kit, kit.mats.secondary)
}

function motoLeggings(kit: WardrobeKit): void {
  torso(kit, 'MotoJacket', kit.mats.primary, 0.71, 1.33, 0.43, -0.71)
  addSleeves(kit, kit.mats.primary, 0.92, 0.21, kit.mats.accent)
  addCollar(kit, kit.mats.secondary, true, 0.20)
  addZipper(kit, kit.mats.accent, -0.58, 1.36, 0.07, -0.16)
  for (const side of [-1, 1] as const) {
    panel(kit, kit.torsoRoot, 'MotoShoulderQuilt', side * 0.38, -0.02, -kit.front * 0.40, 0.24, 0.18, 0.06, kit.mats.secondary, side * 0.06, kit.H * 0.010)
  }
  addWaistYoke(kit, kit.mats.dark, {
    name: 'MotoLeggingHighWaist',
    rise: 0.72,
    drop: 0.29,
    top: 0.44,
    bottom: 0.51,
    waistband: kit.mats.accent,
  })
  addHipBelt(kit, kit.mats.accent, 0)
  addLegs(kit, kit.mats.dark, kit.mats.dark, { upperRadius: 0.18, lowerRadius: 0.15, kneeAccent: true })
  addLegSideStripes(kit, kit.mats.accent, 0.042)
  addShoes(kit, kit.mats.primary, kit.mats.accent, true)
  addWristAccents(kit, kit.mats.accent, true)
}

function pandaCulottes(kit: WardrobeKit): void {
  // Slim cami under an open, crossed cardigan — intentionally unlike the
  // bulky hoodies used elsewhere in the pack.
  torso(kit, 'PandaCami', kit.mats.light, 0.66, 1.42, 0.40, -0.77)
  addShoulderPuffs(kit, kit.mats.dark, 0.25, 0.84)
  addSleeves(kit, kit.mats.dark, 0.93, 0.22, kit.mats.light)
  addCrewNeck(kit, kit.mats.accent, { y: 0.27, width: 0.25, height: 0.18, open: true })
  for (const side of [-1, 1] as const) {
    panel(
      kit,
      kit.torsoRoot,
      'PandaWrapCardiganFront',
      side * 0.20,
      -0.55,
      -kit.front * 0.47,
      0.38,
      1.28,
      0.055,
      side < 0 ? kit.mats.dark : kit.mats.secondary,
      side * -0.16,
      kit.H * 0.012,
    )
  }
  addBow(kit, kit.mats.accent, -1.08, 0.11)
  orb(kit, kit.torsoRoot, 'PandaCharm', 0, -0.78, -kit.front * 0.55, 0.15, 0.14, 0.035, kit.mats.light, kit.H * 0.009)
  for (const side of [-1, 1] as const) {
    orb(kit, kit.torsoRoot, 'PandaCharmEye', side * 0.055, -0.77, -kit.front * 0.59, 0.032, 0.042, 0.018, kit.mats.dark)
  }
  addWaistYoke(kit, kit.mats.secondary, {
    name: 'PandaCulotteYoke',
    rise: 0.64,
    drop: 0.36,
    top: 0.50,
    bottom: 0.64,
    waistband: kit.mats.accent,
  })
  addHipBelt(kit, kit.mats.dark, -0.02, false)
  addLegs(kit, kit.mats.secondary, kit.mats.secondary, { shorts: true, upperRadius: 0.34, upperLength: 0.78, wide: true })
  addCalfCovers(kit, kit.mats.dark, { length: 0.70, radius: 0.16, accent: kit.mats.light })
  addShoes(kit, kit.mats.light, kit.mats.accent)
  addWristAccents(kit, kit.mats.light, true)
}

function sailorCulottes(kit: WardrobeKit): void {
  // Penguin: cropped expedition anorak and loose board shorts, not another
  // school-uniform sailor silhouette.
  torso(kit, 'PenguinAnorak', kit.mats.primary, 0.77, 1.40, 0.46, -0.76)
  addSleeves(kit, kit.mats.primary, 0.82, 0.235, kit.mats.light)
  addCrewNeck(kit, kit.mats.dark, { y: 0.30, width: 0.31, height: 0.14 })
  panel(kit, kit.torsoRoot, 'AnorakHalfZip', 0, -0.02, -kit.front * 0.51, 0.052, 0.58, 0.035, kit.mats.accent)
  panel(kit, kit.torsoRoot, 'AnorakStormFlap', 0, -0.18, -kit.front * 0.47, 0.56, 0.34, 0.055, kit.mats.light, 0, kit.H * 0.010)
  orb(kit, kit.torsoRoot, 'AnorakKangarooPocket', 0, -0.91, -kit.front * 0.50, 0.43, 0.25, 0.065, kit.mats.light, kit.H * 0.012)
  for (const side of [-1, 1] as const) {
    panel(kit, kit.torsoRoot, 'AnorakDrawcord', side * 0.22, -1.22, -kit.front * 0.53, 0.025, 0.30, 0.025, kit.mats.accent, side * 0.05)
    orb(kit, kit.torsoRoot, 'AnorakToggle', side * 0.22, -1.36, -kit.front * 0.55, 0.045, 0.055, 0.025, kit.mats.accent)
  }
  addWaistYoke(kit, kit.mats.primary, {
    name: 'PenguinBoardShortYoke',
    rise: 0.68,
    drop: 0.34,
    top: 0.48,
    bottom: 0.62,
    waistband: kit.mats.accent,
  })
  addLegs(kit, kit.mats.primary, kit.mats.primary, { shorts: true, upperRadius: 0.34, upperLength: 0.76, wide: true })
  for (const side of [-1, 1] as const) {
    panel(kit, kit.hipRoot, 'BoardShortSidePanel', side * 0.46, -0.43, -kit.front * 0.50, 0.10, 0.78, 0.045, kit.mats.accent, side * -0.04)
  }
  addHipBelt(kit, kit.mats.accent, 0.01, false)
  addCalfCovers(kit, kit.mats.light, { length: 0.34, radius: 0.145, accent: kit.mats.accent })
  addShoes(kit, kit.mats.light, kit.mats.primary)
  addWristAccents(kit, kit.mats.accent)
}

function addDropScarf(kit: WardrobeKit): void {
  orb(kit, kit.torsoRoot, 'SailorScarfKnot', 0, -0.24, -kit.front * 0.52, 0.10, 0.09, 0.035, kit.mats.accent, kit.H * 0.008)
  for (const side of [-1, 1] as const) {
    panel(kit, kit.torsoRoot, 'SailorScarfTail', side * 0.07, -0.49, -kit.front * 0.51, 0.105, 0.44, 0.035, kit.mats.accent, side * 0.13)
  }
}

function scholarTrousers(kit: WardrobeKit): void {
  torso(kit, 'ScholarBlazer', kit.mats.primary, 0.71, 1.54, 0.42, -0.84)
  addSleeves(kit, kit.mats.primary, 0.96, 0.21, kit.mats.secondary)
  panel(kit, kit.torsoRoot, 'ScholarVest', 0, -0.56, -kit.front * 0.44, 0.47, 1.04, 0.05, kit.mats.secondary)
  addCollar(kit, kit.mats.light, true, 0.23)
  panel(kit, kit.torsoRoot, 'ScholarTie', 0, -0.29, -kit.front * 0.51, 0.09, 0.70, 0.035, kit.mats.accent)
  addButtons(kit, 4, -0.50, 0.22, 0.12, kit.mats.accent)
  addWaistYoke(kit, kit.mats.dark, {
    name: 'ScholarTrouserYoke',
    rise: 0.70,
    drop: 0.30,
    top: 0.46,
    bottom: 0.55,
    waistband: kit.mats.light,
  })
  addHipBelt(kit, kit.mats.dark, -0.01)
  addLegs(kit, kit.mats.dark, kit.mats.dark, { upperRadius: 0.22, lowerRadius: 0.19 })
  // Pressed trouser creases make the otherwise tapered leg unmistakable.
  for (const [side, upper] of [
    [-1, kit.ctx.bones.upperLegL],
    [1, kit.ctx.bones.upperLegR],
  ] as const) {
    const root = attachRoot(kit, upper, side < 0 ? 'ScholarCreaseL' : 'ScholarCreaseR')
    if (!root || !upper) continue
    kit.legRoots.push(root)
    const measured = childDirection(upper, new THREE.Vector3(0, -1, 0))
    const length = Math.max(kit.H * 0.90, Math.min(measured.length * 0.86, kit.H * 1.12))
    const crease = panel(kit, root, 'ScholarTrouserCrease', 0, -length / kit.H * 0.46, -kit.front * 0.205, 0.024, length / kit.H, 0.025, kit.mats.secondary)
    if (crease) crease.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), measured.direction)
  }
  addShoes(kit, kit.mats.dark, kit.mats.accent)
  addWristAccents(kit, kit.mats.light)
}

function royalWideLeg(kit: WardrobeKit): void {
  torso(kit, 'RoyalStructuredTop', kit.mats.primary, 0.74, 1.48, 0.45, -0.80)
  addShoulderPuffs(kit, kit.mats.secondary, 0.29, 0.76)
  addSleeves(kit, kit.mats.primary, 0.88, 0.22, kit.mats.accent)
  // Capelet and peplum are separate silhouettes.
  if (kit.torsoRoot) {
    const cape = mesh(
      kit,
      kit.torsoRoot,
      'RoyalCapelet',
      new THREE.CylinderGeometry(kit.H * 0.72, kit.H * 0.48, kit.H * 0.44, 32, 1, true),
      kit.mats.secondary,
      0,
      true,
    )
    cape.scale.z = 0.62
    cape.position.y = kit.H * 0.03
    addOutline(cape, kit.H * 0.018, 0x241631)
  }
  addCollar(kit, kit.mats.accent, true, 0.27)
  addZipper(kit, kit.mats.accent, -0.62, 1.44)
  addWaistYoke(kit, kit.mats.secondary, {
    name: 'RoyalPalazzoYoke',
    rise: 0.72,
    drop: 0.34,
    top: 0.48,
    bottom: 0.64,
    waistband: kit.mats.accent,
  })
  addHipBelt(kit, kit.mats.accent, -0.01)
  addSkirt(kit, kit.mats.primary, 0.02, 0.34, 0.51, 0.74, 0)
  addLegs(kit, kit.mats.secondary, kit.mats.secondary, { upperRadius: 0.32, lowerRadius: 0.31, wide: true })
  addShoes(kit, kit.mats.dark, kit.mats.accent, true)
  addWristAccents(kit, kit.mats.accent, true)
}

function racerLayered(kit: WardrobeKit): void {
  torso(kit, 'RacerJacket', kit.mats.primary, 0.73, 1.38, 0.43, -0.75)
  addSleeves(kit, kit.mats.primary, 0.86, 0.205, kit.mats.accent)
  addCrewNeck(kit, kit.mats.dark, { y: 0.29, width: 0.27, height: 0.12 })
  addZipper(kit, kit.mats.light, -0.61, 1.40)
  for (const side of [-1, 1] as const) {
    panel(kit, kit.torsoRoot, 'RacerStripe', side * 0.28, -0.58, -kit.front * 0.47, 0.09, 1.36, 0.025, kit.mats.accent, side * -0.04)
  }
  panel(kit, kit.torsoRoot, 'RacerNumberPlate', 0, -0.36, -kit.front * 0.52, 0.34, 0.25, 0.04, kit.mats.light, 0, kit.H * 0.009)
  addWaistYoke(kit, kit.mats.dark, {
    name: 'RacerLeggingYoke',
    rise: 0.71,
    drop: 0.29,
    top: 0.45,
    bottom: 0.52,
    waistband: kit.mats.accent,
  })
  addHipBelt(kit, kit.mats.accent, 0)
  // Full fitted base leggings plus separate bone-bound race shorts.
  addLegs(kit, kit.mats.dark, kit.mats.dark, { upperRadius: 0.18, lowerRadius: 0.15, kneeAccent: true })
  addLegs(kit, kit.mats.primary, kit.mats.primary, { shorts: true, upperRadius: 0.25, upperLength: 0.60 })
  addLegSideStripes(kit, kit.mats.accent, 0.052)
  addShoes(kit, kit.mats.light, kit.mats.accent)
  addWristAccents(kit, kit.mats.accent, true)
}

function utilityCoat(kit: WardrobeKit): void {
  torso(kit, 'LongUtilityCoat', kit.mats.primary, 0.76, 1.68, 0.46, -0.90)
  addSleeves(kit, kit.mats.primary, 0.98, 0.23, kit.mats.secondary)
  addCollar(kit, kit.mats.secondary, true, 0.23)
  addZipper(kit, kit.mats.accent, -0.74, 1.74)
  addPocket(kit, kit.torsoRoot, -1, -0.93, kit.mats.secondary, true)
  addPocket(kit, kit.torsoRoot, 1, -0.93, kit.mats.secondary, true)
  addWaistYoke(kit, kit.mats.dark, {
    name: 'UtilityTrouserYoke',
    rise: 0.72,
    drop: 0.30,
    top: 0.46,
    bottom: 0.54,
    waistband: kit.mats.secondary,
  })
  addHipBelt(kit, kit.mats.dark, -0.02)
  if (kit.hipRoot) {
    for (const side of [-1, 1] as const) {
      const tail = panel(kit, kit.hipRoot, 'UtilityCoatTail', side * 0.30, -0.62, kit.front * 0.20, 0.53, 1.18, 0.16, kit.mats.primary, side * -0.05, kit.H * 0.018)
      if (tail) kit.hitMeshes.push(tail)
    }
  }
  // Barrel trousers: rounded through the thigh, sharply tapered below knee.
  addLegs(kit, kit.mats.dark, kit.mats.dark, { upperRadius: 0.35, lowerRadius: 0.225, kneeAccent: true })
  addCalfCovers(kit, kit.mats.secondary, { length: 0.24, radius: 0.22, accent: kit.mats.accent, flared: true })
  addShoes(kit, kit.mats.dark, kit.mats.accent, true)
  addWristAccents(kit, kit.mats.secondary)
}

function safariShorts(kit: WardrobeKit): void {
  torso(kit, 'SafariShirt', kit.mats.light, 0.69, 1.45, 0.41, -0.79)
  addShoulderPuffs(kit, kit.mats.primary, 0.24, 0.72)
  addSleeves(kit, kit.mats.primary, 0.67, 0.22, kit.mats.accent, true)
  addCollar(kit, kit.mats.secondary, true, 0.25)
  addButtons(kit, 6, 0.01, 0.22, 0, kit.mats.accent)
  addPocket(kit, kit.torsoRoot, -1, -0.47, kit.mats.secondary)
  addPocket(kit, kit.torsoRoot, 1, -0.47, kit.mats.secondary)
  for (const side of [-1, 1] as const) {
    panel(kit, kit.torsoRoot, 'SafariEpaulette', side * 0.47, 0.16, -kit.front * 0.16, 0.28, 0.08, 0.25, kit.mats.accent, side * 0.04, kit.H * 0.008)
    // Long open vest panels continue below the shirt hem without joining the
    // legs; their hip attachment keeps the silhouette stable while walking.
    panel(
      kit,
      kit.torsoRoot,
      'SafariLongVestFront',
      side * 0.26,
      -0.62,
      -kit.front * 0.48,
      0.31,
      1.48,
      0.055,
      kit.mats.primary,
      side * -0.035,
      kit.H * 0.012,
    )
  }
  addWaistYoke(kit, kit.mats.secondary, {
    name: 'SafariShortYoke',
    rise: 0.68,
    drop: 0.34,
    top: 0.47,
    bottom: 0.58,
    waistband: kit.mats.dark,
  })
  addHipBelt(kit, kit.mats.dark, -0.01)
  addLegs(kit, kit.mats.secondary, kit.mats.secondary, { shorts: true, upperRadius: 0.26, upperLength: 0.66 })
  if (kit.hipRoot) {
    for (const side of [-1, 1] as const) {
      const tail = panel(
        kit,
        kit.hipRoot,
        'SafariVestTail',
        side * 0.30,
        -0.55,
        kit.front * 0.22,
        0.36,
        0.96,
        0.13,
        kit.mats.primary,
        side * -0.035,
        kit.H * 0.014,
      )
      if (tail) kit.hitMeshes.push(tail)
    }
  }
  // Tall contrast socks remain on lower-leg bones and stop before the feet.
  addCalfCovers(kit, kit.mats.light, { length: 0.66, radius: 0.16, accent: kit.mats.accent })
  addShoes(kit, kit.mats.dark, kit.mats.accent, true)
  addWristAccents(kit, kit.mats.accent)
}

const BUILDERS: Readonly<Record<WardrobeStyle, (kit: WardrobeKit) => void>> = {
  varsitySkort,
  bomberCargo,
  techUtility,
  cardiganSkort,
  motoLeggings,
  pandaCulottes,
  sailorCulottes,
  scholarTrousers,
  royalWideLeg,
  racerLayered,
  utilityCoat,
  safariShorts,
}

/**
 * Build and attach one complete wardrobe without mutating the humanoid rig.
 *
 * Missing optional bones merely omit their pieces; this keeps the module
 * compatible with reduced VRM skeletons.  All large pieces are appended to the
 * caller's hit-mesh list for desktop dragging.
 */
export function buildWardrobe(
  ctx: AnimalBuildContext,
  spec: WardrobeSpec,
  hitMeshes: THREE.Mesh[],
): WardrobeRig {
  const palette = spec.palette
  const kit: WardrobeKit = {
    ctx,
    H: ctx.crownH,
    // build-frame front direction; torso/hip roots are turned for VRM1 below.
    front: 1,
    mats: {
      primary: toonMat(palette.primary, palette.primaryShade),
      secondary: toonMat(palette.secondary, palette.secondaryShade),
      accent: unlitMat(palette.accent),
      dark: toonMat(palette.dark, palette.primaryShade),
      light: toonMat(palette.light, palette.secondaryShade),
    },
    hitMeshes,
    roots: [],
    torsoRoot: null,
    hipRoot: null,
    sleeveRoots: [],
    legRoots: [],
    shoeRoots: [],
    handRoots: [],
    waistCovered: false,
  }

  kit.torsoRoot = attachRoot(kit, ctx.bones.chest, `Wardrobe_${spec.style}_Torso`, true)
  kit.hipRoot = attachRoot(kit, ctx.bones.hips ?? ctx.bones.chest, `Wardrobe_${spec.style}_Hips`, true)
  BUILDERS[spec.style](kit)

  return {
    roots: kit.roots,
    torsoRoot: kit.torsoRoot,
    hipRoot: kit.hipRoot,
    sleeveRoots: kit.sleeveRoots,
    legRoots: kit.legRoots,
    shoeRoots: kit.shoeRoots,
    handRoots: kit.handRoots,
  }
}
