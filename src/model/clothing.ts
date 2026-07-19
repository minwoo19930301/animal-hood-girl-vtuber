import * as THREE from 'three'
import { toonMat, unlitMat, addOutline } from './materials'

/** Image-first sports jacket overlay.  It is attached to the humanoid bones,
 * so the garment remains a live 3D part while the VRM donor clothing is hidden. */
export function buildSportsJacket(chest: THREE.Object3D | null, upperL: THREE.Object3D | null, upperR: THREE.Object3D | null) {
  const root = new THREE.Group()
  root.name = 'MingoSportsJacket'
  const white = toonMat(0xf4eef4, 0xcbbdca)
  const coral = unlitMat(0xf05d74)
  const navy = unlitMat(0x1f2a50)

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.245, 0.38, 8, 20), white)
  body.scale.set(0.46, 0.52, 0.38)
  body.position.set(0, -0.055, 0.015)
  addOutline(body, 0.008, 0x3a2040)
  root.add(body)

  const zip = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.50, 0.012), coral)
  zip.position.set(0, -0.055, -0.095)
  root.add(zip)
  for (const side of [-1, 1]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.40, 0.010), coral)
    trim.position.set(side * 0.075, -0.06, -0.09)
    trim.rotation.z = side * -0.18
    root.add(trim)
  }
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.06, 0.06), navy)
  collar.scale.setScalar(0.5)
  collar.position.set(0, 0.045, -0.10)
  root.add(collar)

  for (const [side, bone] of [[-1, upperL], [1, upperR]] as const) {
    if (!bone) continue
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 8, 16), white)
    sleeve.position.set(side * 0.04, -0.07, 0)
    sleeve.rotation.z = side * 0.38
    addOutline(sleeve, 0.006, 0x3a2040)
    bone.add(sleeve)
  }
  chest?.add(root)
  return root
}
