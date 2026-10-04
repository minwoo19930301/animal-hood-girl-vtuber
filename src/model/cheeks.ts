/**
 * 볼 홍조 자리 실측 — 로드 시 1회, 정점 통계만 쓴다 (레이캐스트·스키닝 불필요).
 *
 * 얼굴형 워프 파이프라인이 눈·얼굴 메시를 종마다 옮기므로 눈 본(bone) 위치는 믿을 수 없다.
 * 대신 홍채(EyeIris) 메시 정점 중심을 눈 위치로, 얼굴 피부(Face_00_SKIN) 정점에서
 * 그 아래 볼 자리의 가장 앞쪽 표면 z를 읽는다.
 *
 * 반환 좌표는 fx.group 로컬 = 헤드 본 로컬을 S로 보정해 "정면 -Z, 캐릭터 왼쪽 x<0"으로 통일한 프레임
 * (VRM1은 정면이 +Z라 fx.group을 y π 회전해 두므로 x·z에 S를 곱한다).
 */
import * as THREE from 'three'

export interface CheekSpots {
  /** 캐릭터 왼쪽(fx.group x<0) 볼 중심, z = 피부 표면에서 살짝 앞 */
  l: THREE.Vector3
  r: THREE.Vector3
}

/** 눈 중심에서 볼 중심까지 아래로 내리는 거리 (머리 높이 crownH 비율) */
const CHEEK_DROP = 0.24
/** 볼 중심의 바깥 이동 (눈 간격 비율) */
const CHEEK_OUT = 1.04
/** 표면에서 앞으로 띄우는 거리 (crownH 비율) */
const LIFT = 0.012
/** 표면 z 탐색 반경 (crownH 비율) */
const PROBE = 0.07

export function measureCheeks(
  scene: THREE.Object3D,
  head: THREE.Object3D,
  S: number,
  crownH: number,
): CheekSpots | null {
  scene.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(head.matrixWorld).invert()
  const v = new THREE.Vector3()
  const irisSum = [new THREE.Vector3(), new THREE.Vector3()] // [x<0, x>0]
  const irisN = [0, 0]
  const skin: number[] = [] // group-local xyz 평탄 배열

  scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry) return
    const mat = [m.material].flat()[0]
    const name = (mat?.name ?? '').toLowerCase()
    const isIris = name.includes('eyeiris')
    const isSkin = name.includes('face_00_skin')
    if (!isIris && !isSkin) return
    const pos = m.geometry.attributes.position
    if (!pos) return
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv)
      const gx = S * v.x, gy = v.y, gz = S * v.z
      if (isIris) {
        const k = gx < 0 ? 0 : 1
        irisSum[k].x += gx; irisSum[k].y += gy; irisSum[k].z += gz
        irisN[k]++
      } else {
        skin.push(gx, gy, gz)
      }
    }
  })
  if (irisN[0] === 0 || irisN[1] === 0 || skin.length === 0) return null

  const spot = (k: 0 | 1): THREE.Vector3 => {
    const n = irisN[k]
    const ex = irisSum[k].x / n, ey = irisSum[k].y / n
    const cx = ex * CHEEK_OUT
    const cy = ey - CHEEK_DROP * crownH
    // 볼 중심 주변 피부 정점 중 가장 앞(-z)쪽 표면
    let best = Infinity
    const r2 = (PROBE * crownH) ** 2
    for (let i = 0; i < skin.length; i += 3) {
      const dx = skin[i] - cx, dy = skin[i + 1] - cy
      if (dx * dx + dy * dy < r2 && skin[i + 2] < best) best = skin[i + 2]
    }
    if (!Number.isFinite(best)) best = irisSum[k].z / n
    return new THREE.Vector3(cx, cy, best - LIFT * crownH)
  }
  return { l: spot(0), r: spot(1) }
}
