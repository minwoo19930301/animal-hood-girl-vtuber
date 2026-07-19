/**
 * STUB — 모델 에이전트가 교체할 파일.
 * 계약: createMingo(): MingoModel  (src/contract.ts 참조)
 * 지금은 툰셰이딩 확인용 플레이스홀더 구체만 렌더.
 */
import * as THREE from 'three'
import type { MingoModel, RigFrame } from '../contract'
import { PALETTE, TOON } from '../palette'

export function createMingo(): MingoModel {
  const root = new THREE.Group()

  const geo = new THREE.SphereGeometry(0.3, 48, 32)
  const mat = new THREE.MeshToonMaterial({ color: PALETTE.plumageBase })
  const body = new THREE.Mesh(geo, mat)
  body.position.y = 0.5
  root.add(body)

  const light = new THREE.DirectionalLight(0xffffff, 2.2)
  light.position.set(...TOON.lightDir)
  root.add(light, new THREE.AmbientLight(0xffffff, 0.8))

  return {
    root,
    height: 1.0,
    hitMeshes: [body],
    apply(frame: RigFrame, _dt: number, t: number) {
      body.position.y = 0.5 + Math.sin(t * 2) * 0.01 + frame.breath * 0.01
      body.rotation.set(-frame.head.pitch * 0.3, frame.head.yaw * 0.3, frame.head.roll * 0.2)
    },
  }
}
