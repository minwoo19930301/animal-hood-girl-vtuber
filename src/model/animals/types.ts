import type * as THREE from 'three'
import type { FaceBounds } from '../hood'

export type AvatarSlug =
  | 'bear'
  | 'monkey'
  | 'turtle'
  | 'rabbit'
  | 'fox'
  | 'panda'
  | 'penguin'
  | 'owl'
  | 'cat'
  | 'dog'
  | 'tiger'
  | 'elephant'
  | 'giraffe'
  | 'flamingo'

export interface AnimalBones {
  head: THREE.Object3D | null
  chest: THREE.Object3D | null
  /** Optional lower-body anchors used by modular wardrobes. */
  hips?: THREE.Object3D | null
  upperArmL: THREE.Object3D | null
  upperArmR: THREE.Object3D | null
  upperLegL: THREE.Object3D | null
  upperLegR: THREE.Object3D | null
  lowerLegL?: THREE.Object3D | null
  lowerLegR?: THREE.Object3D | null
  footL?: THREE.Object3D | null
  footR?: THREE.Object3D | null
  handL?: THREE.Object3D | null
  handR?: THREE.Object3D | null
  /** 액세서리(손목밴드/드로스트링) 배치용 — accessories.ts AccessoryBones 참조 */
  neck?: THREE.Object3D | null
  lowerArmL?: THREE.Object3D | null
  lowerArmR?: THREE.Object3D | null
}

export interface AnimalBuildContext {
  crownH: number
  halfW: number
  face?: FaceBounds
  bones: AnimalBones
  /** VRM0 = 1, VRM1 = -1. Procedural geometry is authored facing -Z. */
  S: number
}

export interface AnimalCostumeRig {
  /** Attach to the normalized head bone. */
  headRoot: THREE.Group
  /** Secondary-motion target for the hood/ears. */
  headFollow: THREE.Group
  /** Secondary-motion target for muzzle/snout details. */
  muzzleFollow: THREE.Group
  hitMeshes: THREE.Mesh[]
  /** Optional costume-specific animation. */
  update?(pitchS: number, yaw: number, breath: number, dt: number): void
}

export type AnimalBuilder = (context: AnimalBuildContext) => AnimalCostumeRig
