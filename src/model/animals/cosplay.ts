/**
 * High-fidelity animal-cosplay headgear shared by the twelve Mingo Mate avatars.
 *
 * The wearer remains visibly human.  Animal traits live on a tailored hood,
 * headband, cape, backpack, or tail; the real VRM eyes and mouth stay inside a
 * true open aperture so blink, gaze, lip sync, and facial expressions remain
 * intact.
 *
 * Geometry is authored in the normalized VRM0 head frame (front = -Z).  VRM1
 * is flipped once at `headRoot`/body accessory roots.
 */
import * as THREE from 'three'
import { egg, featherLobe, taperedTube, teardrop, unitSphereLo } from '../geo'
import { addOutline, toonMat, unlitMat } from '../materials'
import type { AnimalBuildContext, AnimalCostumeRig, AvatarSlug } from './types'

const OUTLINE = 0x2b2230

type EarKind = 'round' | 'long' | 'point' | 'leaf' | 'fan' | 'tuft' | 'none'
type HeadgearMode = 'full' | 'ported' | 'cowl' | 'band' | 'mane'
type MarkKind =
  | 'muzzle'
  | 'curl'
  | 'scutes'
  | 'panda'
  | 'penguin'
  | 'owl'
  | 'mane'
  | 'stripes'
  | 'trunk'
  | 'giraffe'

export interface SpeciesHeadSpec {
  slug: AvatarSlug
  shell: number
  shellShade: number
  lining: number
  secondary: number
  accent: number
  dark: number
  light: number
  ear: EarKind
  mark: MarkKind
  mode: HeadgearMode
}

export const SPECIES_HEADS: Readonly<Record<AvatarSlug, SpeciesHeadSpec>> = {
  bear: {
    slug: 'bear',
    shell: 0x8d6142,
    shellShade: 0x67432f,
    lining: 0xd9b896,
    secondary: 0xffe8ca,
    accent: 0xb97742,
    dark: 0x33221a,
    light: 0xfff4e1,
    ear: 'round',
    mark: 'muzzle',
    mode: 'full',
  },
  monkey: {
    slug: 'monkey',
    shell: 0xa9764c,
    shellShade: 0x70482f,
    lining: 0xf1d9be,
    secondary: 0xffdfc5,
    accent: 0x8a5a34,
    dark: 0x3b2a1c,
    light: 0xfff0de,
    ear: 'round',
    mark: 'curl',
    mode: 'ported',
  },
  turtle: {
    slug: 'turtle',
    shell: 0x279b83,
    shellShade: 0x176856,
    lining: 0xdcebc4,
    secondary: 0xdaf3cc,
    accent: 0xff8558,
    dark: 0x153d3a,
    light: 0xf6ffe9,
    ear: 'none',
    mark: 'scutes',
    mode: 'cowl',
  },
  rabbit: {
    slug: 'rabbit',
    shell: 0xf5f0ea,
    shellShade: 0xd8ced0,
    lining: 0xf5a9b8,
    secondary: 0xffffff,
    accent: 0xe99bb2,
    dark: 0x3a3335,
    light: 0xffffff,
    ear: 'long',
    mark: 'muzzle',
    mode: 'band',
  },
  fox: {
    slug: 'fox',
    shell: 0xe8833a,
    shellShade: 0xb95728,
    lining: 0x3b2a20,
    secondary: 0xfff4e3,
    accent: 0xc9622b,
    dark: 0x2e2422,
    light: 0xffffff,
    ear: 'point',
    mark: 'muzzle',
    mode: 'ported',
  },
  panda: {
    slug: 'panda',
    shell: 0xf7f4ef,
    shellShade: 0xd8d3ce,
    lining: 0x2e2b2c,
    secondary: 0xffffff,
    accent: 0x2e2b2c,
    dark: 0x211f22,
    light: 0xffffff,
    ear: 'round',
    mark: 'panda',
    mode: 'ported',
  },
  penguin: {
    slug: 'penguin',
    shell: 0x31394a,
    shellShade: 0x20242e,
    lining: 0xf6f8fa,
    secondary: 0xf6f8fa,
    accent: 0xf5b940,
    dark: 0x20242e,
    light: 0xffffff,
    ear: 'none',
    mark: 'penguin',
    mode: 'full',
  },
  owl: {
    slug: 'owl',
    shell: 0x8c6849,
    shellShade: 0x5e4431,
    lining: 0xe8d5b8,
    secondary: 0xe8d5b8,
    accent: 0xf0b429,
    dark: 0x33261b,
    light: 0xfff5df,
    ear: 'tuft',
    mark: 'owl',
    mode: 'full',
  },
  lion: {
    slug: 'lion',
    shell: 0xebb755,
    shellShade: 0xb5722e,
    lining: 0xffe9bc,
    secondary: 0xffe9bc,
    accent: 0xb5722e,
    dark: 0x4a331c,
    light: 0xfff2cf,
    ear: 'round',
    mark: 'mane',
    mode: 'mane',
  },
  tiger: {
    slug: 'tiger',
    shell: 0xee8a3c,
    shellShade: 0xb85b27,
    lining: 0xfff1dc,
    secondary: 0xfff1dc,
    accent: 0x2e2620,
    dark: 0x211d1b,
    light: 0xffffff,
    ear: 'round',
    mark: 'stripes',
    mode: 'ported',
  },
  elephant: {
    slug: 'elephant',
    shell: 0x9ba8bc,
    shellShade: 0x68758a,
    lining: 0xc9d3e0,
    secondary: 0xd9e1eb,
    accent: 0xf0a7b4,
    dark: 0x3d4350,
    light: 0xf8fbff,
    ear: 'fan',
    mark: 'trunk',
    mode: 'full',
  },
  giraffe: {
    slug: 'giraffe',
    shell: 0xf2c94c,
    shellShade: 0xc98a3b,
    lining: 0xfff3ce,
    secondary: 0xfff3ce,
    accent: 0xc98a3b,
    dark: 0x4a371c,
    light: 0xfff8df,
    ear: 'leaf',
    mark: 'giraffe',
    mode: 'band',
  },
}

interface AnimatedPart {
  node: THREE.Object3D
  side: -1 | 0 | 1
  baseZ: number
  gain: number
}

interface SecondaryMotion {
  node: THREE.Object3D
  baseX: number
  baseZ: number
  amplitude: number
  frequency: number
  phase: number
  yawGain: number
  breathGain: number
}

/**
 * Unit ellipsoid hood with a real elliptical opening.  Vertices inside the
 * aperture collapse to the boundary and triangles entirely inside are removed.
 */
function openHoodGeometry(
  ax = 0.91,
  ayTop = 0.58,
  ayBottom = 1.02,
  backPort = 0,
  openFrontBottom = false,
): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 56, 40, 0, Math.PI * 2, 0, Math.PI * 0.9)
  const p = g.attributes.position
  const inside = new Array<boolean>(p.count).fill(false)
  const insideBack = new Array<boolean>(p.count).fill(false)
  const insideFrontBottom = new Array<boolean>(p.count).fill(false)

  for (let i = 0; i < p.count; i++) {
    const d = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize()
    // Cropped/ported hoods are open below the cheeks instead of forming the
    // same full astronaut ring as a plush pullover hood. Keep the cut on the
    // front hemisphere only so the rear cap still wraps the hair.
    if (openFrontBottom && d.z < -0.16 && d.y < -0.16) {
      insideFrontBottom[i] = true
    }
    const theta = Math.acos(THREE.MathUtils.clamp(-d.z, -1, 1))
    const phi = Math.atan2(d.y, d.x)
    const ay = Math.sin(phi) >= 0 ? ayTop : ayBottom
    const c = ay * Math.cos(phi)
    const s = ax * Math.sin(phi)
    const boundary = (ax * ay) / Math.sqrt(c * c + s * s)
    if (theta < boundary) {
      inside[i] = true
      const sb = Math.sin(boundary)
      p.setXYZ(i, Math.cos(phi) * sb, Math.sin(phi) * sb, -Math.cos(boundary))
      continue
    }

    // High ponytails/buns need a real rear port. Collapse the +Z cone to its
    // circular boundary before dropping internal triangles, matching the face
    // aperture method so there is no web polygon across the hole.
    if (backPort > 0) {
      const thetaBack = Math.acos(THREE.MathUtils.clamp(d.z, -1, 1))
      if (thetaBack < backPort) {
        insideBack[i] = true
        const phiBack = Math.atan2(d.y, d.x)
        const sb = Math.sin(backPort)
        p.setXYZ(i, Math.cos(phiBack) * sb, Math.sin(phiBack) * sb, Math.cos(backPort))
      }
    }
  }

  const idx = g.getIndex()
  if (idx) {
    const kept: number[] = []
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i)
      const b = idx.getX(i + 1)
      const c = idx.getX(i + 2)
      if (
        (inside[a] && inside[b] && inside[c]) ||
        (insideBack[a] && insideBack[b] && insideBack[c]) ||
        (insideFrontBottom[a] && insideFrontBottom[b] && insideFrontBottom[c])
      ) continue
      kept.push(a, b, c)
    }
    g.setIndex(kept)
  }
  g.computeVertexNormals()
  return g
}

function ellipseLoop(rx: number, ry: number, tube: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * rx, Math.sin(a) * ry, 0))
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 80, tube, 10, true)
}

function apertureBoundary(ax: number, ayTop: number, ayBottom: number, phi: number): number {
  const ay = Math.sin(phi) >= 0 ? ayTop : ayBottom
  const c = ay * Math.cos(phi)
  const s = ax * Math.sin(phi)
  return (ax * ay) / Math.sqrt(c * c + s * s)
}

/** Binding tube sampled from the exact cut-shell boundary, not a floating flat ellipse. */
function apertureRimGeometry(
  center: THREE.Vector3,
  rx: number,
  ry: number,
  rz: number,
  ax: number,
  ayTop: number,
  ayBottom: number,
  tube: number,
  openBottom = false,
): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < 72; i++) {
    // Ported/cowl bindings stop at the lower cheeks. A closed tube around the
    // chin made every species read as the same space helmet.
    const phi = openBottom
      ? -Math.PI * 0.2 + (i / 71) * Math.PI * 1.4
      : (i / 72) * Math.PI * 2
    const theta = apertureBoundary(ax, ayTop, ayBottom, phi)
    const st = Math.sin(theta)
    pts.push(new THREE.Vector3(
      center.x + rx * Math.cos(phi) * st,
      center.y + ry * Math.sin(phi) * st,
      center.z - rz * Math.cos(theta) - tube * 0.28,
    ))
  }
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(pts, !openBottom),
    96,
    tube,
    10,
    !openBottom,
  )
}

function addCrownBand(
  parent: THREE.Group,
  spec: SpeciesHeadSpec,
  L: number,
  faceZ: number,
  hit: THREE.Mesh[],
): void {
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= 32; i++) {
    const a = Math.PI * (0.08 + (i / 32) * 0.84)
    points.push(new THREE.Vector3(
      Math.cos(a) * L * 0.7,
      L * 0.25 + Math.sin(a) * L * 0.67,
      faceZ + L * 0.22,
    ))
  }
  const band = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, L * 0.085, 12),
    toonMat(spec.shell, spec.shellShade),
  )
  band.name = `${spec.slug}OpenCrownBand`
  addOutline(band, L * 0.018, OUTLINE)
  parent.add(band)
  hit.push(band)
  const lining = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, L * 0.038, 10),
    toonMat(spec.lining, spec.shellShade),
  )
  lining.name = `${spec.slug}CrownBandLining`
  lining.position.z = -L * 0.065
  parent.add(lining)
}

function orb(
  parent: THREE.Object3D,
  name: string,
  material: THREE.Material,
  scale: [number, number, number],
  position: [number, number, number],
  outline = 0,
  hit?: THREE.Mesh[],
): THREE.Mesh {
  const m = new THREE.Mesh(unitSphereLo(), material)
  m.name = name
  m.scale.set(...scale)
  m.position.set(...position)
  if (outline > 0) addOutline(m, outline, OUTLINE)
  parent.add(m)
  if (hit) hit.push(m)
  return m
}

function addRoundEars(
  parent: THREE.Group,
  spec: SpeciesHeadSpec,
  L: number,
  z: number,
  animated: AnimatedPart[],
  hit: THREE.Mesh[],
): void {
  for (const side of [-1, 1] as const) {
    const ear = new THREE.Group()
    ear.name = `${spec.slug}RoundEar${side < 0 ? 'L' : 'R'}`
    ear.position.set(side * L * 0.55, L * 0.73, z + L * 0.08)
    parent.add(ear)
    orb(
      ear,
      'earOuter',
      toonMat(spec.shell, spec.shellShade),
      [L * 0.25, L * 0.28, L * 0.12],
      [0, 0, 0],
      L * 0.022,
      hit,
    )
    orb(
      ear,
      'earInner',
      toonMat(spec.lining, spec.shellShade),
      [L * 0.14, L * 0.16, L * 0.035],
      [0, -L * 0.01, -L * 0.105],
    )
    animated.push({ node: ear, side, baseZ: side * 0.06, gain: 0.08 })
  }
}

function addLongEars(
  parent: THREE.Group,
  spec: SpeciesHeadSpec,
  L: number,
  z: number,
  animated: AnimatedPart[],
  hit: THREE.Mesh[],
): void {
  for (const side of [-1, 1] as const) {
    const ear = new THREE.Group()
    ear.name = `rabbitLongEar${side < 0 ? 'L' : 'R'}`
    ear.position.set(side * L * 0.31, L * 0.72, z + L * 0.1)
    // A deliberately asymmetric relaxed pose keeps the ears from reading as
    // two rigid antennae. The tip is a second pivot so it can lag behind the
    // base instead of rotating as one long capsule.
    ear.rotation.z = side < 0 ? -0.08 : 0.16
    parent.add(ear)

    const lower = new THREE.Mesh(
      new THREE.CapsuleGeometry(L * 0.155, L * 0.38, 9, 22),
      toonMat(spec.shell, spec.shellShade),
    )
    lower.name = 'rabbitEarLower'
    lower.position.y = L * 0.27
    lower.rotation.z = -side * 0.07
    lower.scale.z = 0.48
    addOutline(lower, L * 0.024, OUTLINE)
    ear.add(lower)
    hit.push(lower)

    const lowerInner = new THREE.Mesh(
      new THREE.CapsuleGeometry(L * 0.072, L * 0.27, 8, 18),
      toonMat(spec.lining, spec.accent),
    )
    lowerInner.name = 'rabbitEarLowerLining'
    lowerInner.position.set(side * L * 0.008, L * 0.27, -L * 0.075)
    lowerInner.rotation.z = -side * 0.07
    lowerInner.scale.z = 0.36
    ear.add(lowerInner)

    const tip = new THREE.Group()
    tip.name = `rabbitEarTip${side < 0 ? 'L' : 'R'}`
    tip.position.set(-side * L * 0.04, L * 0.56, 0)
    tip.rotation.z = side < 0 ? -0.17 : -0.3
    ear.add(tip)
    const tipOuter = new THREE.Mesh(
      new THREE.CapsuleGeometry(L * 0.135, L * 0.31, 9, 20),
      toonMat(spec.shell, spec.shellShade),
    )
    tipOuter.name = 'rabbitEarTipOuter'
    tipOuter.position.y = L * 0.25
    tipOuter.scale.z = 0.46
    addOutline(tipOuter, L * 0.022, OUTLINE)
    tip.add(tipOuter)
    hit.push(tipOuter)
    const tipInner = new THREE.Mesh(
      new THREE.CapsuleGeometry(L * 0.06, L * 0.22, 8, 16),
      toonMat(spec.lining, spec.accent),
    )
    tipInner.name = 'rabbitEarTipLining'
    tipInner.position.set(0, L * 0.25, -L * 0.068)
    tipInner.scale.z = 0.34
    tip.add(tipInner)

    animated.push({
      node: ear,
      side,
      baseZ: side < 0 ? -0.08 : 0.16,
      gain: 0.16,
    })
    animated.push({
      node: tip,
      side,
      baseZ: side < 0 ? -0.17 : -0.3,
      gain: 0.24,
    })
  }
}

function addPointEars(
  parent: THREE.Group,
  spec: SpeciesHeadSpec,
  L: number,
  z: number,
  animated: AnimatedPart[],
  hit: THREE.Mesh[],
): void {
  for (const side of [-1, 1] as const) {
    const ear = new THREE.Group()
    ear.name = `${spec.slug}PointEar${side < 0 ? 'L' : 'R'}`
    ear.position.set(side * L * 0.52, L * 0.72, z + L * 0.04)
    parent.add(ear)
    const outer = new THREE.Mesh(
      new THREE.ConeGeometry(L * 0.25, L * 0.52, 5),
      toonMat(spec.shell, spec.shellShade),
    )
    outer.rotation.z = -side * 0.22
    addOutline(outer, L * 0.025, OUTLINE)
    ear.add(outer)
    hit.push(outer)
    const inner = new THREE.Mesh(
      new THREE.ConeGeometry(L * 0.13, L * 0.32, 5),
      toonMat(spec.lining, spec.accent),
    )
    inner.position.set(-side * L * 0.018, -L * 0.015, -L * 0.105)
    inner.rotation.z = -side * 0.22
    ear.add(inner)
    animated.push({ node: ear, side, baseZ: side * 0.03, gain: 0.1 })
  }
}

function addFanEars(
  parent: THREE.Group,
  spec: SpeciesHeadSpec,
  L: number,
  z: number,
  animated: AnimatedPart[],
  hit: THREE.Mesh[],
): void {
  for (const side of [-1, 1] as const) {
    const ear = new THREE.Group()
    ear.name = `elephantFanEar${side < 0 ? 'L' : 'R'}`
    ear.position.set(side * L * 0.6, L * 0.33, z + L * 0.2)
    parent.add(ear)
    const outer = new THREE.Mesh(
      egg(L * 0.43, L * 0.53, L * 0.055, -0.18),
      toonMat(spec.shell, spec.shellShade, { doubleSide: true }),
    )
    outer.rotation.z = side * 0.24
    addOutline(outer, L * 0.026, OUTLINE)
    ear.add(outer)
    hit.push(outer)
    const inner = new THREE.Mesh(
      egg(L * 0.29, L * 0.38, L * 0.025, -0.18),
      toonMat(spec.lining, spec.accent, { doubleSide: true }),
    )
    inner.position.z = -L * 0.065
    inner.rotation.z = side * 0.24
    ear.add(inner)
    animated.push({ node: ear, side, baseZ: side * 0.05, gain: 0.07 })
  }
}

function addLeafEars(
  parent: THREE.Group,
  spec: SpeciesHeadSpec,
  L: number,
  z: number,
  animated: AnimatedPart[],
  hit: THREE.Mesh[],
): void {
  for (const side of [-1, 1] as const) {
    const ear = new THREE.Group()
    ear.name = `giraffeLeafEar${side < 0 ? 'L' : 'R'}`
    ear.position.set(side * L * 0.53, L * 0.7, z + L * 0.06)
    parent.add(ear)
    const outer = new THREE.Mesh(
      egg(L * 0.29, L * 0.14, L * 0.055, -0.12),
      toonMat(spec.secondary, spec.shellShade, { doubleSide: true }),
    )
    outer.rotation.z = side * 0.16
    addOutline(outer, L * 0.019, OUTLINE)
    ear.add(outer)
    hit.push(outer)
    const inner = new THREE.Mesh(
      egg(L * 0.18, L * 0.07, L * 0.022, -0.12),
      toonMat(spec.accent, spec.shellShade, { doubleSide: true }),
    )
    inner.position.z = -L * 0.058
    inner.rotation.z = side * 0.16
    ear.add(inner)
    animated.push({ node: ear, side, baseZ: side * 0.025, gain: 0.07 })
  }
}

function addTufts(
  parent: THREE.Group,
  spec: SpeciesHeadSpec,
  L: number,
  z: number,
  animated: AnimatedPart[],
  hit: THREE.Mesh[],
): void {
  for (const side of [-1, 1] as const) {
    const tuft = new THREE.Group()
    tuft.name = `owlTuft${side < 0 ? 'L' : 'R'}`
    tuft.position.set(side * L * 0.43, L * 0.72, z)
    parent.add(tuft)
    for (let i = 0; i < 3; i++) {
      const feather = new THREE.Mesh(
        teardrop(L * (0.36 - i * 0.045), L * 0.15, 0.44),
        toonMat(i === 1 ? spec.accent : spec.shell, spec.shellShade),
      )
      feather.rotation.z = side * (0.34 + i * 0.12)
      feather.position.set(side * L * i * 0.045, i * L * 0.025, -L * i * 0.016)
      addOutline(feather, L * 0.017, OUTLINE)
      tuft.add(feather)
      if (i === 0) hit.push(feather)
    }
    animated.push({ node: tuft, side, baseZ: side * 0.04, gain: 0.09 })
  }
}

/**
 * Species-specific tailoring that changes the outer read of the headgear.
 * These pieces stay outside the measured face aperture: they must never become
 * a second face mask or cross the eyelid/mouth tracking region.
 */
function addHeadSilhouetteDetails(
  parent: THREE.Group,
  spec: SpeciesHeadSpec,
  L: number,
  z: number,
  animated: AnimatedPart[],
  hit: THREE.Mesh[],
): void {
  switch (spec.slug) {
    case 'bear': {
      const seam = new THREE.Mesh(
        taperedTube(
          [
            new THREE.Vector3(0, L * 0.7, z - L * 0.045),
            new THREE.Vector3(-L * 0.025, L * 0.82, z - L * 0.085),
            new THREE.Vector3(0, L * 0.96, z - L * 0.03),
          ],
          [L * 0.018, L * 0.022, L * 0.014],
          { seg: 20, radial: 8 },
        ),
        toonMat(spec.lining, spec.shellShade),
      )
      seam.name = 'bearHoodCenterSeam'
      parent.add(seam)
      break
    }
    case 'monkey': {
      // The loop makes this a cropped, ported bomber hood instead of the
      // bear's closed plush hood when viewed from the side/back.
      const loop = new THREE.Mesh(
        new THREE.TorusGeometry(L * 0.15, L * 0.035, 8, 28, Math.PI * 1.45),
        toonMat(spec.accent, spec.dark),
      )
      loop.name = 'monkeyPonyPortLoop'
      loop.position.set(0, L * 0.62, z + L * 0.71)
      loop.rotation.set(Math.PI / 2, 0, Math.PI * 0.78)
      parent.add(loop)
      break
    }
    case 'turtle': {
      for (const side of [-1, 1] as const) {
        const flap = new THREE.Group()
        flap.name = `turtleCowlTempleTab${side < 0 ? 'L' : 'R'}`
        flap.position.set(side * L * 0.61, L * 0.08, z + L * 0.13)
        flap.rotation.z = side * 0.22
        parent.add(flap)
        const panel = new THREE.Mesh(
          featherLobe(L * 0.2, L * 0.13, 0.3),
          toonMat(spec.shellShade, spec.shell),
        )
        panel.rotation.z = -side * (Math.PI / 2 + 0.08)
        addOutline(panel, L * 0.01, OUTLINE)
        flap.add(panel)
        hit.push(panel)
        animated.push({ node: flap, side, baseZ: side * 0.22, gain: 0.025 })
      }
      break
    }
    case 'rabbit': {
      const knot = new THREE.Group()
      knot.name = 'rabbitHeadbandRibbon'
      knot.position.set(L * 0.56, L * 0.58, z - L * 0.02)
      parent.add(knot)
      for (const side of [-1, 1] as const) {
        const lobe = new THREE.Mesh(
          egg(L * 0.16, L * 0.11, L * 0.035, -0.12),
          toonMat(spec.lining, spec.accent),
        )
        lobe.position.x = side * L * 0.12
        lobe.rotation.z = side * 0.34
        addOutline(lobe, L * 0.012, OUTLINE)
        knot.add(lobe)
      }
      orb(
        knot,
        'rabbitRibbonKnot',
        toonMat(spec.accent, spec.shellShade),
        [L * 0.075, L * 0.075, L * 0.045],
        [0, 0, -L * 0.015],
        L * 0.01,
      )
      break
    }
    case 'fox': {
      for (const side of [-1, 1] as const) {
        const swept = new THREE.Mesh(
          teardrop(L * 0.38, L * 0.2, 0.42),
          toonMat(side < 0 ? spec.shellShade : spec.shell, spec.dark),
        )
        swept.name = `foxMotoHoodSweep${side < 0 ? 'L' : 'R'}`
        swept.position.set(side * L * 0.58, L * 0.24, z + L * 0.44)
        swept.rotation.z = -side * (Math.PI / 2 + 0.26)
        swept.rotation.x = 0.34
        addOutline(swept, L * 0.014, OUTLINE)
        parent.add(swept)
        hit.push(swept)
      }
      break
    }
    case 'panda': {
      // Contrasting cropped-cap tabs separate the hood ears from the black
      // space buns without putting panda patches over the human eyes.
      for (const side of [-1, 1] as const) {
        const tab = new THREE.Mesh(
          new THREE.BoxGeometry(L * 0.24, L * 0.085, L * 0.075),
          toonMat(spec.accent, spec.dark),
        )
        tab.name = `pandaCapHem${side < 0 ? 'L' : 'R'}`
        tab.position.set(side * L * 0.47, L * 0.18, z - L * 0.01)
        tab.rotation.z = -side * 0.2
        addOutline(tab, L * 0.012, OUTLINE)
        parent.add(tab)
      }
      break
    }
    case 'penguin': {
      for (const side of [-1, 1] as const) {
        const wing = new THREE.Group()
        wing.name = `penguinCapeWing${side < 0 ? 'L' : 'R'}`
        wing.position.set(side * L * 0.59, L * 0.18, z + L * 0.2)
        wing.rotation.z = side * 0.48
        parent.add(wing)
        const panel = new THREE.Mesh(
          featherLobe(L * 0.68, L * 0.27, 0.34),
          toonMat(spec.shellShade, spec.dark),
        )
        panel.rotation.z = -side * (Math.PI / 2 + 0.22)
        addOutline(panel, L * 0.02, OUTLINE)
        wing.add(panel)
        hit.push(panel)
        animated.push({ node: wing, side, baseZ: side * 0.48, gain: 0.075 })
      }
      break
    }
    case 'owl': {
      for (const side of [-1, 1] as const) {
        const cheekFan = new THREE.Group()
        cheekFan.name = `owlLayeredHoodFeathers${side < 0 ? 'L' : 'R'}`
        cheekFan.position.set(side * L * 0.61, L * 0.31, z + L * 0.06)
        parent.add(cheekFan)
        for (let i = 0; i < 3; i++) {
          const feather = new THREE.Mesh(
            featherLobe(L * (0.34 + i * 0.06), L * 0.16, 0.3),
            toonMat(i === 1 ? spec.lining : spec.shellShade, spec.dark),
          )
          feather.rotation.z = -side * (Math.PI / 2 + 0.17 + i * 0.1)
          feather.position.y = -L * i * 0.08
          feather.position.z = L * i * 0.018
          addOutline(feather, L * 0.011, OUTLINE)
          cheekFan.add(feather)
          if (i === 2) hit.push(feather)
        }
        animated.push({ node: cheekFan, side, baseZ: 0, gain: 0.04 })
      }
      break
    }
    case 'tiger': {
      const cuff = new THREE.Mesh(
        new THREE.TorusGeometry(L * 0.105, L * 0.028, 8, 28, Math.PI * 1.55),
        toonMat(0x4f9ee8, 0x173d73),
      )
      cuff.name = 'tigerBlueEyeEarCuff'
      cuff.position.set(L * 0.56, L * 0.71, z - L * 0.1)
      cuff.rotation.z = -0.38
      addOutline(cuff, L * 0.009, OUTLINE)
      parent.add(cuff)
      break
    }
    case 'elephant': {
      const bow = new THREE.Group()
      bow.name = 'elephantPinkEarKnot'
      bow.position.set(L * 0.67, L * 0.16, z - L * 0.015)
      parent.add(bow)
      for (const side of [-1, 1] as const) {
        const lobe = new THREE.Mesh(
          egg(L * 0.17, L * 0.105, L * 0.036, -0.2),
          toonMat(spec.accent, 0xb66e81),
        )
        lobe.position.x = side * L * 0.12
        lobe.rotation.z = side * 0.42
        addOutline(lobe, L * 0.012, OUTLINE)
        bow.add(lobe)
      }
      orb(
        bow,
        'elephantBowKnot',
        toonMat(0xf3bcc7, 0xb66e81),
        [L * 0.07, L * 0.07, L * 0.045],
        [0, 0, -L * 0.012],
        L * 0.01,
      )
      animated.push({ node: bow, side: 1, baseZ: 0, gain: 0.045 })
      break
    }
    case 'lion':
    case 'giraffe':
      break
  }
}

function addHoodEyes(
  parent: THREE.Group,
  spec: SpeciesHeadSpec,
  L: number,
  z: number,
  y = 0.76,
  spread = 0.34,
): void {
  for (const side of [-1, 1] as const) {
    orb(
      parent,
      'hoodEyeRim',
      toonMat(spec.secondary, spec.shellShade),
      [L * 0.15, L * 0.17, L * 0.025],
      [side * L * spread, L * y, z - L * 0.045],
      L * 0.012,
    )
    orb(
      parent,
      'hoodEye',
      unlitMat(spec.dark),
      [L * 0.075, L * 0.095, L * 0.018],
      [side * L * spread, L * y, z - L * 0.074],
    )
    orb(
      parent,
      'hoodEyeGlint',
      unlitMat(spec.light),
      [L * 0.024, L * 0.029, L * 0.009],
      [side * L * spread - side * L * 0.018, L * (y + 0.035), z - L * 0.092],
    )
  }
}

function addMuzzleBadge(parent: THREE.Group, spec: SpeciesHeadSpec, L: number, z: number): void {
  orb(
    parent,
    'hoodMuzzle',
    toonMat(spec.secondary, spec.shellShade),
    [L * 0.25, L * 0.14, L * 0.055],
    [0, L * 0.82, z - L * 0.018],
    L * 0.014,
  )
  orb(
    parent,
    'hoodNose',
    unlitMat(spec.dark),
    [L * 0.075, L * 0.05, L * 0.026],
    [0, L * 0.85, z - L * 0.075],
  )
}

function addMark(
  parent: THREE.Group,
  muzzleFollow: THREE.Group,
  spec: SpeciesHeadSpec,
  L: number,
  z: number,
  hit: THREE.Mesh[],
): void {
  switch (spec.mark) {
    case 'muzzle':
      addMuzzleBadge(parent, spec, L, z)
      break
    case 'curl': {
      addMuzzleBadge(parent, spec, L, z)
      const curl = new THREE.Mesh(
        taperedTube(
          [
            new THREE.Vector3(-L * 0.12, L * 0.83, z - L * 0.03),
            new THREE.Vector3(0, L * 0.94, z - L * 0.05),
            new THREE.Vector3(L * 0.15, L * 0.88, z - L * 0.06),
            new THREE.Vector3(L * 0.08, L * 0.76, z - L * 0.07),
          ],
          [L * 0.035, L * 0.04, L * 0.032, L * 0.012],
        ),
        toonMat(spec.accent, spec.dark),
      )
      addOutline(curl, L * 0.015, OUTLINE)
      parent.add(curl)
      break
    }
    case 'scutes':
      for (const [x, y, s] of [
        [0, 0.79, 0.16],
        [-0.3, 0.68, 0.13],
        [0.3, 0.68, 0.13],
        [-0.48, 0.49, 0.1],
        [0.48, 0.49, 0.1],
      ] as const) {
        orb(
          parent,
          'turtleScute',
          toonMat(spec.secondary, spec.shellShade),
          [L * s, L * s * 0.72, L * 0.025],
          [L * x, L * y, z - L * 0.05],
          L * 0.009,
        )
      }
      break
    case 'panda':
      for (const side of [-1, 1] as const) {
        const patch = orb(
          parent,
          'pandaHoodPatch',
          toonMat(spec.accent, spec.dark),
          [L * 0.18, L * 0.11, L * 0.025],
          [side * L * 0.33, L * 0.76, z - L * 0.035],
          L * 0.01,
        )
        patch.rotation.z = -side * 0.35
      }
      addMuzzleBadge(parent, spec, L, z)
      break
    case 'penguin': {
      addHoodEyes(parent, spec, L, z, 0.76, 0.32)
      for (const side of [-1, 1] as const) {
        orb(
          parent,
          'penguinWhiteBrow',
          toonMat(spec.secondary, 0xdfe4eb),
          [L * 0.31, L * 0.27, L * 0.025],
          [side * L * 0.2, L * 0.62, z - L * 0.026],
        )
      }
      const beak = new THREE.Mesh(
        new THREE.ConeGeometry(L * 0.12, L * 0.25, 5),
        toonMat(spec.accent, 0xd58b27),
      )
      beak.name = 'penguinBeak'
      // A flattened downward wedge is legible from the front; pointing the
      // cone directly at camera reduced it to a yellow dot.
      beak.rotation.z = Math.PI
      beak.scale.z = 0.5
      beak.position.set(0, L * 0.79, z - L * 0.11)
      addOutline(beak, L * 0.015, OUTLINE)
      parent.add(beak)
      hit.push(beak)
      break
    }
    case 'owl':
      addHoodEyes(parent, spec, L, z, 0.75, 0.3)
      for (const side of [-1, 1] as const) {
        const brow = new THREE.Mesh(
          featherLobe(L * 0.32, L * 0.17, 0.35),
          toonMat(spec.accent, spec.dark),
        )
        brow.name = 'owlBrowFeather'
        brow.position.set(side * L * 0.29, L * 0.88, z - L * 0.065)
        brow.rotation.z = side * (Math.PI / 2 + 0.26)
        parent.add(brow)
      }
      {
        const beak = new THREE.Mesh(
          new THREE.ConeGeometry(L * 0.075, L * 0.18, 5),
          toonMat(spec.accent, 0xb97a1d),
        )
        beak.name = 'owlBeak'
        beak.rotation.x = Math.PI
        beak.position.set(0, L * 0.67, z - L * 0.1)
        parent.add(beak)
      }
      break
    case 'mane': {
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2
        const feather = new THREE.Mesh(
          teardrop(L * 0.34, L * 0.17, 0.42),
          toonMat(i % 2 ? spec.accent : spec.shellShade, spec.dark),
        )
        feather.name = 'lionManeLock'
        feather.position.set(Math.cos(a) * L * 0.66, L * 0.18 + Math.sin(a) * L * 0.72, z + L * 0.13)
        feather.rotation.z = a - Math.PI / 2
        feather.rotation.x = Math.PI
        addOutline(feather, L * 0.012, OUTLINE)
        parent.add(feather)
      }
      break
    }
    case 'stripes':
      for (const side of [-1, 1] as const) {
        for (let i = 0; i < 3; i++) {
          const stripe = new THREE.Mesh(
            new THREE.CapsuleGeometry(L * 0.018, L * (0.18 - i * 0.025), 4, 9),
            unlitMat(spec.accent),
          )
          stripe.name = 'tigerHoodStripe'
          stripe.position.set(side * L * (0.18 + i * 0.14), L * (0.9 - i * 0.075), z - L * 0.045)
          stripe.rotation.z = -side * (0.18 + i * 0.08)
          parent.add(stripe)
        }
      }
      break
    case 'trunk': {
      const trunk = new THREE.Mesh(
        taperedTube(
          [
            new THREE.Vector3(0, L * 0.92, z - L * 0.02),
            new THREE.Vector3(-L * 0.02, L * 0.76, z - L * 0.07),
            new THREE.Vector3(L * 0.06, L * 0.62, z - L * 0.1),
            new THREE.Vector3(L * 0.16, L * 0.68, z - L * 0.11),
          ],
          [L * 0.11, L * 0.095, L * 0.06, L * 0.025],
          { seg: 32, radial: 16 },
        ),
        toonMat(spec.shell, spec.shellShade),
      )
      trunk.name = 'elephantDecorativeTrunk'
      addOutline(trunk, L * 0.018, OUTLINE)
      // The decorative trunk stays on the hood brow, never over the wearer's
      // nose, but its downward S-curve reads clearly in a frontal camera.
      // A dedicated follow group gives it a restrained nod without coupling it
      // to lip-sync or allowing cumulative frame-to-frame drift.
      muzzleFollow.add(trunk)
      hit.push(trunk)
      break
    }
    case 'giraffe':
      for (const side of [-1, 1] as const) {
        const horn = new THREE.Group()
        horn.name = `giraffeOssicone${side < 0 ? 'L' : 'R'}`
        horn.position.set(side * L * 0.25, L * 0.78, z + L * 0.06)
        const stem = new THREE.Mesh(
          new THREE.CapsuleGeometry(L * 0.055, L * 0.25, 6, 12),
          toonMat(spec.accent, spec.shellShade),
        )
        stem.position.y = L * 0.16
        horn.add(stem)
        orb(
          horn,
          'ossiconeTip',
          toonMat(spec.dark, spec.shellShade),
          [L * 0.09, L * 0.09, L * 0.09],
          [0, L * 0.34, 0],
          L * 0.012,
        )
        parent.add(horn)
      }
      for (const [x, y, sx, sy] of [
        [-0.49, 0.72, 0.12, 0.075],
        [0.46, 0.76, 0.1, 0.07],
        [-0.27, 0.88, 0.085, 0.06],
        [0.24, 0.96, 0.075, 0.052],
      ] as const) {
        orb(
          parent,
          'giraffeSpot',
          unlitMat(spec.accent),
          [L * sx, L * sy, L * 0.016],
          [L * x, L * y, z - L * 0.07],
        )
      }
      break
  }
}

function attachAccessoryRoot(
  ctx: AnimalBuildContext,
  bone: THREE.Object3D | null | undefined,
  name: string,
  normalizeFacing = true,
): THREE.Group | null {
  if (!bone) return null
  const root = new THREE.Group()
  root.name = name
  if (normalizeFacing && ctx.S === -1) root.rotation.y = Math.PI
  bone.add(root)
  return root
}

function registerSecondary(
  motions: SecondaryMotion[],
  node: THREE.Object3D,
  opts: Partial<Omit<SecondaryMotion, 'node' | 'baseX' | 'baseZ'>> = {},
): void {
  motions.push({
    node,
    baseX: node.rotation.x,
    baseZ: node.rotation.z,
    amplitude: opts.amplitude ?? 0.04,
    frequency: opts.frequency ?? 2,
    phase: opts.phase ?? 0,
    yawGain: opts.yawGain ?? 0.06,
    breathGain: opts.breathGain ?? 0.018,
  })
}

interface TailProfile {
  vectors: ReadonlyArray<readonly [number, number, number]>
  radii: ReadonlyArray<readonly [number, number]>
  bushy?: boolean
  striped?: boolean
  tuft?: boolean
}

const TAIL_PROFILES: Partial<Record<AvatarSlug, TailProfile>> = {
  monkey: {
    vectors: [
      [0.2, -0.34, 0.28],
      [0.22, -0.4, 0.04],
      [-0.02, -0.36, -0.16],
      [-0.25, -0.16, -0.13],
      [-0.19, 0.18, -0.02],
    ],
    radii: [[0.11, 0.105], [0.105, 0.09], [0.09, 0.073], [0.073, 0.055], [0.055, 0.035]],
  },
  fox: {
    vectors: [
      [0.12, -0.25, 0.31],
      [0.18, -0.37, 0.1],
      [0.08, -0.4, -0.08],
      [-0.08, -0.33, -0.13],
    ],
    radii: [[0.2, 0.25], [0.25, 0.24], [0.24, 0.18], [0.18, 0.08]],
    bushy: true,
    tuft: true,
  },
  lion: {
    vectors: [
      [0.08, -0.38, 0.24],
      [0.09, -0.46, 0.04],
      [-0.03, -0.43, -0.07],
      [-0.12, -0.24, -0.06],
    ],
    radii: [[0.085, 0.075], [0.075, 0.06], [0.06, 0.045], [0.045, 0.032]],
    tuft: true,
  },
  tiger: {
    vectors: [
      [0.13, -0.3, 0.28],
      [0.17, -0.4, 0.08],
      [0.03, -0.42, -0.09],
      [-0.12, -0.34, -0.12],
      [-0.09, -0.2, -0.02],
    ],
    radii: [[0.12, 0.112], [0.112, 0.096], [0.096, 0.078], [0.078, 0.06], [0.06, 0.042]],
    striped: true,
    tuft: true,
  },
}

function addTailOrBackpack(
  ctx: AnimalBuildContext,
  spec: SpeciesHeadSpec,
  hit: THREE.Mesh[],
  motions: SecondaryMotion[],
): { root?: THREE.Group } {
  const L = ctx.crownH
  const anchor = ctx.bones.hips ?? ctx.bones.chest
  const root = attachAccessoryRoot(ctx, anchor, `${spec.slug}SignatureBack`)
  if (!root) return {}

  if (spec.slug === 'turtle') {
    const shell = new THREE.Mesh(
      egg(L * 0.82, L * 1.02, L * 0.25, -0.08),
      toonMat(0x215f49, 0x123f34),
    )
    shell.name = 'turtleShellBackpack'
    shell.position.set(0, ctx.bones.hips ? L * 0.88 : -L * 0.55, L * 0.46)
    addOutline(shell, L * 0.032, OUTLINE)
    root.add(shell)
    hit.push(shell)
    for (const [x, y, s] of [
      [0, 0.25, 0.28],
      [0, -0.25, 0.31],
      [-0.39, 0, 0.24],
      [0.39, 0, 0.24],
      [-0.34, -0.48, 0.21],
      [0.34, -0.48, 0.21],
    ] as const) {
      orb(
        shell,
        'shellScute',
        toonMat(0x367d59, 0x215f49),
        [L * s, L * s, L * 0.05],
        [L * x, L * y, L * 0.25],
        L * 0.01,
      )
    }

    const gauge = new THREE.Group()
    gauge.name = 'turtleOxygenGaugeCharm'
    gauge.position.set(L * 0.72, shell.position.y - L * 0.38, L * 0.55)
    root.add(gauge)
    orb(
      gauge,
      'turtleGaugeCase',
      toonMat(0xff8558, 0xb84d2e),
      [L * 0.12, L * 0.12, L * 0.045],
      [0, 0, 0],
      L * 0.012,
    )
    const needle = new THREE.Mesh(
      new THREE.BoxGeometry(L * 0.018, L * 0.09, L * 0.014),
      unlitMat(0x153d3a),
    )
    needle.name = 'turtleGaugeNeedle'
    needle.position.set(0, L * 0.015, -L * 0.058)
    needle.rotation.z = -0.6
    gauge.add(needle)
    registerSecondary(motions, gauge, { amplitude: 0.035, frequency: 2.4, yawGain: 0.045 })
    return { root }
  }

  const profile = TAIL_PROFILES[spec.slug]
  if (!profile) return { root }

  const baseY = ctx.bones.hips ? L * 0.55 : -L * 1.22
  const tail = new THREE.Group()
  tail.name = `${spec.slug}ArticulatedTail`
  tail.position.set(0, baseY, L * 0.33)
  root.add(tail)

  let parent: THREE.Group = tail
  let tipParent: THREE.Group = tail
  profile.vectors.forEach((values, i) => {
    const segment = new THREE.Group()
    segment.name = `${spec.slug}TailSegment${i + 1}`
    parent.add(segment)
    const end = new THREE.Vector3(values[0] * L, values[1] * L, values[2] * L)
    const middle = end.clone().multiplyScalar(0.52)
    middle.x += (i % 2 ? -1 : 1) * L * 0.018
    const colors =
      spec.slug === 'fox' && i === profile.vectors.length - 1
        ? [spec.secondary, spec.shellShade]
        : [spec.shell, spec.shellShade]
    const radius = profile.radii[i] ?? profile.radii.at(-1)!
    const tube = new THREE.Mesh(
      taperedTube(
        [new THREE.Vector3(), middle, end],
        [L * radius[0], L * ((radius[0] + radius[1]) * 0.5), L * radius[1]],
        { seg: profile.bushy ? 18 : 14, radial: profile.bushy ? 16 : 12 },
      ),
      toonMat(colors[0], colors[1]),
    )
    tube.name = `${spec.slug}TailFurSection${i + 1}`
    addOutline(tube, L * (profile.bushy ? 0.022 : 0.015), OUTLINE)
    segment.add(tube)
    hit.push(tube)

    if (profile.striped && i > 0) {
      const direction = end.clone().normalize()
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(L * radius[0] * 1.01, L * 0.025, 8, 20),
        unlitMat(spec.dark),
      )
      band.name = `tigerTailStripe${i}`
      band.position.copy(end).multiplyScalar(0.17)
      band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction)
      segment.add(band)
    }

    const next = new THREE.Group()
    next.position.copy(end)
    segment.add(next)
    registerSecondary(motions, segment, {
      amplitude: 0.018 + i * 0.008,
      frequency: 1.8 + i * 0.08,
      phase: i * 0.72,
      yawGain: 0.03 + i * 0.012,
      breathGain: 0.01,
    })
    parent = next
    tipParent = next
  })

  if (profile.tuft) {
    const tuft = new THREE.Mesh(
      teardrop(
        L * (spec.slug === 'fox' ? 0.46 : 0.34),
        L * (spec.slug === 'fox' ? 0.3 : 0.2),
        0.75,
      ),
      toonMat(
        spec.slug === 'lion' || spec.slug === 'tiger' ? spec.dark : spec.secondary,
        spec.shellShade,
      ),
    )
    tuft.name = `${spec.slug}TailTuft`
    tuft.rotation.z = Math.PI * 0.78
    addOutline(tuft, L * 0.015, OUTLINE)
    tipParent.add(tuft)
    hit.push(tuft)
  }
  return { root }
}

function starPrism(outer: number, inner: number, depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2
    const r = i % 2 === 0 ? outer : inner
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: depth * 0.24,
    bevelThickness: depth * 0.18,
    curveSegments: 2,
  })
  geometry.center()
  return geometry
}

/**
 * Small narrative props from the per-character design contracts. They attach
 * to hips/chest/hands rather than the face, and dangling props receive their
 * own secondary-motion phase so they do not move in lockstep with a tail.
 */
function addBodySignatures(
  ctx: AnimalBuildContext,
  spec: SpeciesHeadSpec,
  hit: THREE.Mesh[],
  motions: SecondaryMotion[],
): void {
  const L = ctx.crownH
  const hipsOrChest = ctx.bones.hips ?? ctx.bones.chest

  switch (spec.slug) {
    case 'bear': {
      const root = attachAccessoryRoot(ctx, hipsOrChest, 'bearTeddyKeyring')
      if (!root) break
      root.position.set(
        L * 0.52,
        ctx.bones.hips ? L * 0.12 : -L * 0.83,
        -L * 0.22,
      )
      root.rotation.z = -0.12
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(L * 0.075, L * 0.018, 8, 22),
        toonMat(0xd9b896, 0x8d6142),
      )
      ring.name = 'bearTeddyKeyringLoop'
      root.add(ring)
      const teddy = new THREE.Group()
      teddy.name = 'bearTeddyCharm'
      teddy.position.y = -L * 0.23
      root.add(teddy)
      orb(
        teddy,
        'bearTeddyBody',
        toonMat(spec.shell, spec.shellShade),
        [L * 0.11, L * 0.14, L * 0.06],
        [0, -L * 0.06, 0],
        L * 0.012,
        hit,
      )
      orb(
        teddy,
        'bearTeddyHead',
        toonMat(spec.shell, spec.shellShade),
        [L * 0.12, L * 0.115, L * 0.065],
        [0, L * 0.1, 0],
        L * 0.012,
      )
      for (const side of [-1, 1] as const) {
        orb(
          teddy,
          'bearTeddyEar',
          toonMat(spec.shellShade, spec.dark),
          [L * 0.045, L * 0.045, L * 0.03],
          [side * L * 0.09, L * 0.17, 0],
        )
      }
      registerSecondary(motions, root, {
        amplitude: 0.065,
        frequency: 2.55,
        phase: 0.8,
        yawGain: 0.08,
      })
      break
    }
    case 'rabbit': {
      const pomRoot = attachAccessoryRoot(ctx, hipsOrChest, 'rabbitPomTail')
      if (pomRoot) {
        const pom = new THREE.Group()
        pom.name = 'rabbitFurPomAssembly'
        pom.position.set(0, ctx.bones.hips ? L * 0.48 : -L * 1.08, L * 0.48)
        pomRoot.add(pom)
        orb(
          pom,
          'rabbitFurPom',
          toonMat(spec.secondary, spec.shellShade),
          [L * 0.2, L * 0.2, L * 0.18],
          [0, 0, 0],
          L * 0.022,
          hit,
        )
        // A ring of small lobes gives a fur read without covering either leg.
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          orb(
            pom,
            'rabbitPomFurLobe',
            toonMat(spec.shell, spec.shellShade),
            [L * 0.045, L * 0.055, L * 0.04],
            [Math.cos(a) * L * 0.15, Math.sin(a) * L * 0.15, 0],
          )
        }
      }

      const onHand = Boolean(ctx.bones.handR)
      const carrotRoot = attachAccessoryRoot(
        ctx,
        ctx.bones.handR ?? hipsOrChest,
        'rabbitCarrotWristPouch',
        !onHand,
      )
      if (carrotRoot) {
        carrotRoot.position.set(
          onHand ? L * 0.08 : -L * 0.52,
          onHand ? -L * 0.12 : L * 0.12,
          onHand ? L * 0.05 : -L * 0.2,
        )
        const strap = new THREE.Mesh(
          new THREE.TorusGeometry(L * 0.1, L * 0.018, 8, 24),
          toonMat(0xf5a9b8, 0xb96f84),
        )
        strap.name = 'rabbitCarrotPouchStrap'
        strap.position.y = L * 0.03
        carrotRoot.add(strap)
        const carrot = new THREE.Mesh(
          new THREE.ConeGeometry(L * 0.1, L * 0.31, 16),
          toonMat(0xf28c45, 0xc95f2c),
        )
        carrot.name = 'rabbitCarrotPouchBody'
        carrot.position.y = -L * 0.2
        carrot.rotation.z = Math.PI
        addOutline(carrot, L * 0.012, OUTLINE)
        carrotRoot.add(carrot)
        hit.push(carrot)
        for (const side of [-1, 0, 1] as const) {
          const leaf = new THREE.Mesh(
            teardrop(L * 0.16, L * 0.07, 0.35),
            toonMat(0x75a86b, 0x3f7048),
          )
          leaf.name = 'rabbitCarrotPouchLeaf'
          leaf.position.set(side * L * 0.045, -L * 0.04, 0)
          leaf.rotation.z = side * 0.36
          carrotRoot.add(leaf)
        }
        registerSecondary(motions, carrotRoot, {
          amplitude: 0.05,
          frequency: 2.7,
          phase: 1.4,
          yawGain: 0.025,
        })
      }
      break
    }
    case 'panda': {
      const root = attachAccessoryRoot(ctx, hipsOrChest, 'pandaBambooFlask')
      if (!root) break
      root.position.set(-L * 0.53, ctx.bones.hips ? L * 0.11 : -L * 0.84, -L * 0.22)
      root.rotation.z = 0.1
      const chain = new THREE.Mesh(
        taperedTube(
          [
            new THREE.Vector3(0, L * 0.08, 0),
            new THREE.Vector3(-L * 0.05, -L * 0.08, 0),
            new THREE.Vector3(0, -L * 0.19, 0),
          ],
          [L * 0.018, L * 0.018, L * 0.015],
          { seg: 12, radial: 7 },
        ),
        toonMat(0xb8a46b, 0x6d5e37),
      )
      chain.name = 'pandaFlaskChain'
      root.add(chain)
      const flask = new THREE.Mesh(
        new THREE.CylinderGeometry(L * 0.09, L * 0.095, L * 0.39, 18),
        toonMat(0x6f9d65, 0x3d6842),
      )
      flask.name = 'pandaBambooThermos'
      flask.position.y = -L * 0.37
      addOutline(flask, L * 0.014, OUTLINE)
      root.add(flask)
      hit.push(flask)
      for (const y of [-0.47, -0.28] as const) {
        const joint = new THREE.Mesh(
          new THREE.TorusGeometry(L * 0.094, L * 0.012, 7, 20),
          toonMat(0xb7ca72, 0x698241),
        )
        joint.name = 'pandaBambooJoint'
        joint.position.y = L * y
        joint.rotation.x = Math.PI / 2
        root.add(joint)
      }
      const jadeRing = new THREE.Mesh(
        new THREE.TorusGeometry(L * 0.065, L * 0.018, 8, 24),
        toonMat(0x6ec9a4, 0x2f7d63),
      )
      jadeRing.name = 'pandaJadeRing'
      jadeRing.position.set(L * 0.12, -L * 0.16, 0)
      root.add(jadeRing)
      registerSecondary(motions, root, {
        amplitude: 0.055,
        frequency: 2.15,
        phase: 2.1,
        yawGain: 0.075,
      })
      break
    }
    case 'penguin': {
      const root = attachAccessoryRoot(ctx, hipsOrChest, 'penguinIceFishKeychain')
      if (!root) break
      root.position.set(-L * 0.52, ctx.bones.hips ? L * 0.12 : -L * 0.84, -L * 0.2)
      root.rotation.z = 0.12
      const carabiner = new THREE.Mesh(
        new THREE.TorusGeometry(L * 0.09, L * 0.025, 8, 26, Math.PI * 1.68),
        toonMat(spec.accent, 0xc7831f),
      )
      carabiner.name = 'penguinYellowCarabiner'
      root.add(carabiner)
      const fish = new THREE.Group()
      fish.name = 'penguinIceFishCharm'
      fish.position.set(0, -L * 0.27, 0)
      fish.rotation.z = -0.16
      root.add(fish)
      const fishBody = new THREE.Mesh(
        egg(L * 0.18, L * 0.09, L * 0.04, -0.08),
        toonMat(0xacecff, 0x5ca8cf, { alpha: 0.82, doubleSide: true }),
      )
      fishBody.name = 'penguinTranslucentFishBody'
      addOutline(fishBody, L * 0.01, 0x244a75)
      fish.add(fishBody)
      hit.push(fishBody)
      const tail = new THREE.Mesh(
        new THREE.ConeGeometry(L * 0.08, L * 0.13, 3),
        toonMat(0x8dd9f2, 0x4f95bd, { alpha: 0.82, doubleSide: true }),
      )
      tail.name = 'penguinIceFishTail'
      tail.position.x = -L * 0.18
      tail.rotation.z = -Math.PI / 2
      tail.scale.z = 0.4
      fish.add(tail)
      registerSecondary(motions, root, {
        amplitude: 0.075,
        frequency: 2.9,
        phase: 0.3,
        yawGain: 0.08,
      })
      break
    }
    case 'owl': {
      const chest = attachAccessoryRoot(ctx, ctx.bones.chest, 'owlMoonPhaseBrooch')
      if (chest) {
        chest.position.set(0, -L * 0.34, -L * 0.43)
        for (const [x, scale, color] of [
          [-0.14, 0.055, 0x6e543c],
          [0, 0.085, 0xf0b429],
          [0.14, 0.055, 0x6e543c],
        ] as const) {
          orb(
            chest,
            'owlMoonPhase',
            toonMat(color, spec.dark),
            [L * scale, L * scale, L * 0.025],
            [L * x, 0, 0],
            L * 0.008,
          )
        }
      }
      const map = attachAccessoryRoot(ctx, hipsOrChest, 'owlFoldedStarMap')
      if (map) {
        map.position.set(L * 0.5, ctx.bones.hips ? L * 0.08 : -L * 0.86, -L * 0.22)
        map.rotation.z = -0.08
        const caseMesh = new THREE.Mesh(
          new THREE.BoxGeometry(L * 0.24, L * 0.31, L * 0.065),
          toonMat(0x5e4431, 0x33261b),
        )
        caseMesh.name = 'owlStarMapCase'
        caseMesh.position.y = -L * 0.18
        addOutline(caseMesh, L * 0.012, OUTLINE)
        map.add(caseMesh)
        hit.push(caseMesh)
        const star = new THREE.Mesh(
          starPrism(L * 0.07, L * 0.032, L * 0.022),
          toonMat(spec.accent, 0xb4781f),
        )
        star.name = 'owlMapCaseStar'
        star.position.set(0, -L * 0.18, -L * 0.045)
        map.add(star)
        registerSecondary(motions, map, {
          amplitude: 0.04,
          frequency: 1.9,
          phase: 2.7,
          yawGain: 0.055,
        })
      }
      break
    }
    case 'lion': {
      const root = attachAccessoryRoot(ctx, ctx.bones.chest, 'lionSunMedal')
      if (!root) break
      root.position.set(L * 0.24, -L * 0.31, -L * 0.43)
      const medal = new THREE.Mesh(
        new THREE.CylinderGeometry(L * 0.09, L * 0.09, L * 0.035, 20),
        toonMat(0xf2c35c, 0xb5722e),
      )
      medal.name = 'lionSunMedallion'
      medal.rotation.x = Math.PI / 2
      root.add(medal)
      for (let i = 0; i < 8; i++) {
        const ray = new THREE.Mesh(
          new THREE.ConeGeometry(L * 0.025, L * 0.1, 3),
          toonMat(spec.accent, spec.dark),
        )
        ray.name = 'lionSunRay'
        const a = (i / 8) * Math.PI * 2
        ray.position.set(Math.cos(a) * L * 0.13, Math.sin(a) * L * 0.13, L * 0.015)
        ray.rotation.z = a - Math.PI / 2
        root.add(ray)
      }
      break
    }
    case 'elephant': {
      const root = attachAccessoryRoot(ctx, hipsOrChest, 'elephantMemoryCapsule')
      if (!root) break
      root.position.set(L * 0.52, ctx.bones.hips ? L * 0.1 : -L * 0.84, -L * 0.22)
      root.rotation.z = -0.1
      const loop = new THREE.Mesh(
        new THREE.TorusGeometry(L * 0.075, L * 0.018, 8, 22),
        toonMat(0xc9d3e0, 0x68758a),
      )
      loop.name = 'elephantCapsuleLoop'
      root.add(loop)
      const capsule = new THREE.Mesh(
        new THREE.CapsuleGeometry(L * 0.085, L * 0.2, 8, 16),
        toonMat(0xd9e1eb, 0x68758a, { alpha: 0.84, doubleSide: true }),
      )
      capsule.name = 'elephantSilverMemoryCapsule'
      capsule.position.y = -L * 0.25
      addOutline(capsule, L * 0.012, OUTLINE)
      root.add(capsule)
      hit.push(capsule)
      const star = new THREE.Mesh(
        starPrism(L * 0.055, L * 0.025, L * 0.016),
        toonMat(0xf0a7b4, 0xa65f79),
      )
      star.name = 'elephantFloatingStarGlass'
      star.position.set(0, -L * 0.25, -L * 0.09)
      root.add(star)
      registerSecondary(motions, root, {
        amplitude: 0.05,
        frequency: 2.05,
        phase: 1.7,
        yawGain: 0.07,
      })
      break
    }
    case 'giraffe': {
      const pendant = attachAccessoryRoot(ctx, ctx.bones.chest, 'giraffeBinocularPendant')
      if (pendant) {
        pendant.position.set(0, -L * 0.48, -L * 0.44)
        for (const side of [-1, 1] as const) {
          const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(L * 0.075, L * 0.09, L * 0.24, 16),
            toonMat(0x4a371c, 0x241b10),
          )
          barrel.name = `giraffeBinocularBarrel${side < 0 ? 'L' : 'R'}`
          barrel.position.x = side * L * 0.09
          addOutline(barrel, L * 0.01, OUTLINE)
          pendant.add(barrel)
          hit.push(barrel)
        }
        const bridge = new THREE.Mesh(
          new THREE.BoxGeometry(L * 0.11, L * 0.055, L * 0.055),
          toonMat(spec.accent, spec.dark),
        )
        bridge.name = 'giraffeBinocularBridge'
        pendant.add(bridge)
        const strap = new THREE.Mesh(
          new THREE.TorusGeometry(L * 0.25, L * 0.015, 7, 30, Math.PI * 1.15),
          toonMat(spec.dark, spec.shellShade),
        )
        strap.name = 'giraffeBinocularStrap'
        strap.position.y = L * 0.15
        strap.rotation.z = Math.PI * 0.92
        pendant.add(strap)
        registerSecondary(motions, pendant, {
          amplitude: 0.035,
          frequency: 1.65,
          phase: 0.5,
          yawGain: 0.045,
        })
      }
      const map = attachAccessoryRoot(ctx, hipsOrChest, 'giraffeFoldedMapCase')
      if (map) {
        map.position.set(-L * 0.5, ctx.bones.hips ? L * 0.08 : -L * 0.87, -L * 0.2)
        map.rotation.z = 0.1
        const mapCase = new THREE.Mesh(
          new THREE.BoxGeometry(L * 0.24, L * 0.33, L * 0.07),
          toonMat(0xc98a3b, 0x7e5227),
        )
        mapCase.name = 'giraffeMapCaseBody'
        mapCase.position.y = -L * 0.18
        addOutline(mapCase, L * 0.012, OUTLINE)
        map.add(mapCase)
        hit.push(mapCase)
        const fold = new THREE.Mesh(
          new THREE.BoxGeometry(L * 0.19, L * 0.018, L * 0.018),
          unlitMat(0xfff3ce),
        )
        fold.name = 'giraffeMapCaseFold'
        fold.position.set(0, -L * 0.18, -L * 0.045)
        fold.rotation.z = -0.5
        map.add(fold)
        registerSecondary(motions, map, {
          amplitude: 0.04,
          frequency: 2.25,
          phase: 2.4,
          yawGain: 0.05,
        })
      }
      break
    }
    case 'monkey':
    case 'turtle':
    case 'fox':
    case 'tiger':
      break
  }
}

interface HoodProfile {
  ax: number
  ayTop: number
  ayBottom: number
  centerY: number
  centerZ: number
  rxMin: number
  ry: number
  rzMin: number
  backPort: number
}

/**
 * The shell is not a shared one-size hoodie. Deep plush, cropped bomber,
 * low technical cowl, cape hood and broad elephant hood have intentionally
 * different depth/height/opening silhouettes.
 */
const HOOD_PROFILES: Readonly<Record<AvatarSlug, HoodProfile>> = {
  bear: {
    ax: 0.91, ayTop: 0.58, ayBottom: 1.03,
    centerY: 0.27, centerZ: 0.1, rxMin: 0.79, ry: 0.96, rzMin: 0.73, backPort: 0,
  },
  monkey: {
    ax: 0.96, ayTop: 0.52, ayBottom: 0.9,
    centerY: 0.34, centerZ: 0.12, rxMin: 0.74, ry: 0.8, rzMin: 0.69, backPort: 0.54,
  },
  turtle: {
    ax: 0.94, ayTop: 0.65, ayBottom: 0.93,
    centerY: 0.12, centerZ: 0.11, rxMin: 0.71, ry: 0.72, rzMin: 0.68, backPort: 0,
  },
  rabbit: {
    ax: 0.94, ayTop: 0.6, ayBottom: 1.02,
    centerY: 0.3, centerZ: 0.08, rxMin: 0.76, ry: 0.9, rzMin: 0.7, backPort: 0,
  },
  fox: {
    ax: 0.97, ayTop: 0.51, ayBottom: 0.88,
    centerY: 0.36, centerZ: 0.11, rxMin: 0.72, ry: 0.78, rzMin: 0.68, backPort: 0.56,
  },
  panda: {
    ax: 0.98, ayTop: 0.49, ayBottom: 0.84,
    centerY: 0.37, centerZ: 0.1, rxMin: 0.73, ry: 0.76, rzMin: 0.67, backPort: 0.58,
  },
  penguin: {
    ax: 0.89, ayTop: 0.58, ayBottom: 1.09,
    centerY: 0.25, centerZ: 0.11, rxMin: 0.8, ry: 1, rzMin: 0.76, backPort: 0,
  },
  owl: {
    ax: 0.9, ayTop: 0.61, ayBottom: 1.07,
    centerY: 0.29, centerZ: 0.1, rxMin: 0.79, ry: 0.98, rzMin: 0.75, backPort: 0,
  },
  lion: {
    ax: 0.94, ayTop: 0.6, ayBottom: 1.03,
    centerY: 0.3, centerZ: 0.09, rxMin: 0.78, ry: 0.91, rzMin: 0.72, backPort: 0,
  },
  tiger: {
    ax: 0.96, ayTop: 0.52, ayBottom: 0.89,
    centerY: 0.35, centerZ: 0.11, rxMin: 0.73, ry: 0.79, rzMin: 0.69, backPort: 0.58,
  },
  elephant: {
    ax: 0.96, ayTop: 0.61, ayBottom: 1.09,
    centerY: 0.23, centerZ: 0.12, rxMin: 0.88, ry: 0.94, rzMin: 0.76, backPort: 0,
  },
  giraffe: {
    ax: 0.94, ayTop: 0.6, ayBottom: 1.02,
    centerY: 0.31, centerZ: 0.08, rxMin: 0.76, ry: 0.89, rzMin: 0.7, backPort: 0,
  },
}

/**
 * Build species-specific headgear and signature back/tail accessory.
 * Hair and wardrobe are composed by the registry so all twelve entries can
 * share these species forms while retaining independent fashion silhouettes.
 */
export function buildSpeciesCosplay(
  context: AnimalBuildContext,
  spec: SpeciesHeadSpec,
): AnimalCostumeRig {
  const { crownH: L, halfW, face, S } = context
  const hitMeshes: THREE.Mesh[] = []
  const animated: AnimatedPart[] = []
  const secondaryMotions: SecondaryMotion[] = []
  const headRoot = new THREE.Group()
  headRoot.name = `${spec.slug}CosplayHead`
  if (S === -1) headRoot.rotation.y = Math.PI

  const headFollow = new THREE.Group()
  headFollow.name = `${spec.slug}HoodFollow`
  headRoot.add(headFollow)
  const muzzleFollow = new THREE.Group()
  muzzleFollow.name = `${spec.slug}DetailFollow`
  headFollow.add(muzzleFollow)

  const faceZ = face?.frontZ ?? -L * 0.5
  // FaceBounds includes the actual rendered face/hair envelope. Clamp only the
  // pathological long-hair case, never shrink below the eye-derived halfW.
  const faceHalf = Math.max(halfW, Math.min(face?.halfW ?? halfW, L * 0.72))
  const profile = HOOD_PROFILES[spec.slug]
  const { ax, ayTop, ayBottom } = profile
  const center = new THREE.Vector3(0, L * profile.centerY, L * profile.centerZ)
  const ry = L * profile.ry
  const rx = Math.max(
    L * profile.rxMin,
    (faceHalf + L * 0.12) / Math.sin(ax),
  )
  const rz = Math.max(L * profile.rzMin, Math.abs(faceZ) * 1.13)
  const hasShell = spec.mode === 'full' || spec.mode === 'ported' || spec.mode === 'cowl'
  const openBottom = spec.mode === 'ported' || spec.mode === 'cowl'

  if (hasShell) {
    const shell = new THREE.Mesh(
      openHoodGeometry(ax, ayTop, ayBottom, profile.backPort, openBottom),
      toonMat(spec.shell, spec.shellShade, { doubleSide: true }),
    )
    shell.name = `${spec.slug}TailoredHood`
    shell.position.copy(center)
    shell.scale.set(rx, ry, rz)
    addOutline(shell, L * 0.03, OUTLINE)
    headFollow.add(shell)
    hitMeshes.push(shell)

    // Sample the binding from the exact aperture curve. The tube's inner edge
    // still leaves >=0.068L clearance beyond measured cheek/temple bounds.
    const frame = new THREE.Mesh(
      apertureRimGeometry(
        center,
        rx,
        ry,
        rz,
        ax,
        ayTop,
        ayBottom,
        L * (openBottom ? 0.022 : 0.03),
        openBottom,
      ),
      toonMat(spec.lining, spec.shellShade, { doubleSide: true }),
    )
    frame.name = `${spec.slug}FaceBinding`
    addOutline(frame, L * 0.006, OUTLINE)
    headFollow.add(frame)
  } else {
    // Rabbit/giraffe expose their full coiffure through an open headband;
    // lion uses the same tailored band under the separate mane ring.
    addCrownBand(headFollow, spec, L, faceZ, hitMeshes)
  }

  switch (spec.ear) {
    case 'round':
      addRoundEars(headFollow, spec, L, center.z, animated, hitMeshes)
      break
    case 'long':
      addLongEars(headFollow, spec, L, center.z, animated, hitMeshes)
      break
    case 'point':
      addPointEars(headFollow, spec, L, center.z, animated, hitMeshes)
      break
    case 'leaf':
      addLeafEars(headFollow, spec, L, center.z, animated, hitMeshes)
      break
    case 'fan':
      addFanEars(headFollow, spec, L, center.z, animated, hitMeshes)
      break
    case 'tuft':
      addTufts(headFollow, spec, L, center.z, animated, hitMeshes)
      break
    case 'none':
      break
  }
  addHeadSilhouetteDetails(headFollow, spec, L, center.z, animated, hitMeshes)
  // Animal emblems sit above the human brow. Band-mode rabbit intentionally
  // has no mascot muzzle; its long ears are the signature.
  if (spec.slug !== 'rabbit') {
    const markZ = hasShell ? center.z - rz * 0.84 : faceZ + L * 0.11
    addMark(headFollow, muzzleFollow, spec, L, markZ, hitMeshes)
  }

  addTailOrBackpack(context, spec, hitMeshes, secondaryMotions)
  addBodySignatures(context, spec, hitMeshes, secondaryMotions)
  let elapsed = 0
  return {
    headRoot,
    headFollow,
    muzzleFollow,
    hitMeshes,
    update(pitchS, yaw, breath, dt) {
      elapsed += THREE.MathUtils.clamp(dt, 0, 0.05)
      const idle = Math.sin(elapsed * 2.4) * 0.012
      const y = THREE.MathUtils.clamp(yaw, -0.8, 0.8)
      const b = THREE.MathUtils.clamp(breath, -1, 1)
      for (const part of animated) {
        part.node.rotation.z =
          part.baseZ + part.side * (b * part.gain * 0.16 + idle) - y * part.gain
      }
      const muzzleTarget = THREE.MathUtils.clamp(-pitchS, -0.5, 0.5) * 0.045
      const follow = 1 - Math.exp(-THREE.MathUtils.clamp(dt, 0, 0.05) * 12)
      muzzleFollow.rotation.x = THREE.MathUtils.lerp(
        muzzleFollow.rotation.x,
        muzzleTarget,
        follow,
      )
      for (const motion of secondaryMotions) {
        const swing =
          Math.sin(elapsed * motion.frequency + motion.phase) * motion.amplitude
        motion.node.rotation.x =
          motion.baseX + b * motion.breathGain * 0.35
        motion.node.rotation.z =
          motion.baseZ + swing + y * motion.yawGain + b * motion.breathGain
      }
    },
  }
}
