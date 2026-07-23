import type * as THREE from 'three'
import type { FaceBounds } from '../hood'

export type AvatarSlug = 'bear' | 'monkey' | 'turtle'

export interface AnimalBones {
  head: THREE.Object3D | null
  chest: THREE.Object3D | null
  upperArmL: THREE.Object3D | null
  upperArmR: THREE.Object3D | null
  upperLegL: THREE.Object3D | null
  upperLegR: THREE.Object3D | null
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

