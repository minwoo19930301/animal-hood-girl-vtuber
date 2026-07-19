/** 프로시저럴 지오메트리 헬퍼 — 텍스처/외부 에셋 없음, 전부 코드 생성 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export interface MergeItem {
  g: THREE.BufferGeometry
  /** 위치 */
  p?: [number, number, number]
  /** 오일러 회전 (rad) */
  r?: [number, number, number]
  /** 스케일 (숫자면 균일) */
  s?: number | [number, number, number]
}

/**
 * 정적 형제 파트 병합 → 드로우콜 1개 (아웃라인 헐도 병합 지오메트리 1개로 처리 가능).
 * position/normal만 유지해 소스 지오메트리 종류가 섞여도 병합 가능.
 * 입력 지오메트리는 clone 후 변환하므로 공유 지오메트리(unitSphere 등)를 넘겨도 안전.
 */
export function mergeShapes(items: MergeItem[]): THREE.BufferGeometry {
  const parts = items.map(({ g, p, r, s }) => {
    const c = g.clone()
    for (const name of Object.keys(c.attributes)) {
      if (name !== 'position' && name !== 'normal') c.deleteAttribute(name)
    }
    const sv = typeof s === 'number' ? [s, s, s] : s ?? [1, 1, 1]
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(p ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r ?? [0, 0, 0]))),
      new THREE.Vector3(sv[0], sv[1], sv[2]),
    )
    c.applyMatrix4(m)
    return c
  })
  const merged = mergeGeometries(parts, false)
  parts.forEach((c) => c.dispose())
  return merged
}

/** 공유 단위구 (스케일로 타원체를 만든다) */
let _uSphere: THREE.SphereGeometry | null = null
export function unitSphere(): THREE.SphereGeometry {
  if (!_uSphere) _uSphere = new THREE.SphereGeometry(1, 48, 32)
  return _uSphere
}

let _uSphereLo: THREE.SphereGeometry | null = null
export function unitSphereLo(): THREE.SphereGeometry {
  if (!_uSphereLo) _uSphereLo = new THREE.SphereGeometry(1, 24, 16)
  return _uSphereLo
}

/**
 * 계란형: 구를 y-바이어스로 테이퍼 (bias>0 → 위가 넓음, bias<0 → 아래가 넓음).
 * 반환 지오메트리는 (rx, ry, rz) 크기.
 */
export function egg(rx: number, ry: number, rz: number, bias = 0): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 48, 36)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const w = 1 + bias * y
    pos.setX(i, pos.getX(i) * w)
    pos.setZ(i, pos.getZ(i) * w)
  }
  g.scale(rx, ry, rz)
  g.computeVertexNormals()
  return g
}

/**
 * 둥근 깃털 로브: 티어드롭과 달리 끝이 '라운드'인 캡슐 단면 (하드 코너 없음).
 * 밑동 y=0, 끝 y=len (+y 방향). flat: z 납작 비율. bias<0 → 밑동이 더 통통.
 */
export function featherLobe(len: number, width: number, flat = 0.55, bias = -0.18): THREE.BufferGeometry {
  const g = egg(width / 2, len / 2, (width / 2) * flat, bias)
  g.translate(0, len / 2, 0)
  return g
}

/**
 * 깃털/머리카락 락: 밑이 통통하고 끝이 뾰족한 물방울 lathe.
 * 밑동 y=0, 끝 y=len (+y 방향). flat: z 납작 비율.
 */
export function teardrop(len: number, width: number, flat = 0.55): THREE.BufferGeometry {
  const N = 16
  const pts: THREE.Vector2[] = []
  for (let j = 0; j < N; j++) {
    const u = j / (N - 1)
    const r = Math.max(Math.sin(Math.PI * Math.pow(u, 0.62)) * width * 0.5, 0.0002)
    pts.push(new THREE.Vector2(r, u * len))
  }
  const g = new THREE.LatheGeometry(pts, 20)
  g.scale(1, 1, flat)
  g.computeVertexNormals()
  return g
}

export interface TubeOpts {
  seg?: number
  radial?: number
  /** 단면 세로 납작 비율 (부리용) */
  scaleY?: number
}

/**
 * 테이퍼 튜브: 폴리라인(CatmullRom 보간) + 구간별 반지름. 양끝 캡 포함.
 * 곡선이 대체로 yz-평면에 있을 때 안정적 (right=+x 고정 프레임).
 */
export function taperedTube(pts: THREE.Vector3[], radii: number[], opts: TubeOpts = {}): THREE.BufferGeometry {
  const seg = opts.seg ?? 24
  const radial = opts.radial ?? 14
  const sy = opts.scaleY ?? 1
  const curve = new THREE.CatmullRomCurve3(pts)
  const radiusAt = (u: number) => {
    const f = u * (radii.length - 1)
    const i = Math.min(Math.floor(f), radii.length - 2)
    const k = f - i
    return radii[i] * (1 - k) + radii[i + 1] * k
  }
  const positions: number[] = []
  const indices: number[] = []
  const right = new THREE.Vector3(1, 0, 0)
  const up = new THREE.Vector3()
  const v = new THREE.Vector3()
  for (let i = 0; i <= seg; i++) {
    const u = i / seg
    const p = curve.getPoint(u)
    const tan = curve.getTangent(u)
    up.crossVectors(tan, right).normalize()
    const r = radiusAt(u)
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2
      v.copy(p).addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r * sy)
      positions.push(v.x, v.y, v.z)
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j
      const b = i * radial + ((j + 1) % radial)
      const c = a + radial
      const d = b + radial
      indices.push(a, b, c, b, d, c)
    }
  }
  const startC = positions.length / 3
  positions.push(...curve.getPoint(0).toArray())
  const endC = startC + 1
  positions.push(...curve.getPoint(1).toArray())
  const base = seg * radial
  for (let j = 0; j < radial; j++) {
    indices.push(startC, (j + 1) % radial, j)
    indices.push(endC, base + j, base + ((j + 1) % radial))
  }
  const g = new THREE.BufferGeometry()
  g.setIndex(indices)
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.computeVertexNormals()
  return g
}

/**
 * 타원 아크 튜브 (래시/행복눈 ∪ 등).
 * xy-평면 타원 (a·cosθ, b·sinθ, z), θ deg0→deg1, 파이프 반지름 r.
 */
export function ellipseArcTube(
  a: number, b: number, z: number,
  deg0: number, deg1: number, r: number,
  taper = false,
): THREE.BufferGeometry {
  const N = 24
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= N; i++) {
    const th = THREE.MathUtils.degToRad(deg0 + ((deg1 - deg0) * i) / N)
    pts.push(new THREE.Vector3(a * Math.cos(th), b * Math.sin(th), z))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  const geo = new THREE.TubeGeometry(curve, 32, r, 8, false)
  if (taper) {
    // 끝쪽으로 얇아지게: 튜브 파라메터 u 기준 스케일
    const pos = geo.attributes.position
    const rings = 33
    const radial = 9
    for (let i = 0; i < rings; i++) {
      const u = i / (rings - 1)
      const k = 0.35 + 0.65 * Math.sin(Math.PI * Math.min(u * 1.15, 1))
      const c = curve.getPoint(u)
      for (let j = 0; j < radial; j++) {
        const idx = i * radial + j
        if (idx >= pos.count) break
        pos.setXYZ(
          idx,
          c.x + (pos.getX(idx) - c.x) * k,
          c.y + (pos.getY(idx) - c.y) * k,
          c.z + (pos.getZ(idx) - c.z) * k,
        )
      }
    }
    geo.computeVertexNormals()
  }
  return geo
}

/** 하트 (납작, +y가 위, 꼭지가 아래) — 폭 ≈ size */
export function heartGeo(size: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  // 고전 하트 경로 (three.js 예제 계열), 이후 중심/스케일 정규화
  s.moveTo(0.25, 0.25)
  s.bezierCurveTo(0.25, 0.25, 0.2, 0, 0, 0)
  s.bezierCurveTo(-0.3, 0, -0.3, 0.35, -0.3, 0.35)
  s.bezierCurveTo(-0.3, 0.55, -0.1, 0.77, 0.25, 0.95)
  s.bezierCurveTo(0.6, 0.77, 0.8, 0.55, 0.8, 0.35)
  s.bezierCurveTo(0.8, 0.35, 0.8, 0, 0.5, 0)
  s.bezierCurveTo(0.35, 0, 0.25, 0.25, 0.25, 0.25)
  const g = new THREE.ShapeGeometry(s, 24)
  g.center()
  g.rotateZ(Math.PI) // 꼭지 아래로
  g.computeBoundingBox()
  const bb = g.boundingBox!
  const w = bb.max.x - bb.min.x
  const k = size / w
  g.scale(k, k, 1)
  return g
}

/** 4점 별 글린트 (납작) — 전체 지름 ≈ size */
export function star4Geo(size: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  const R = 0.5
  const r = 0.13
  s.moveTo(0, R)
  s.lineTo(r, r)
  s.lineTo(R, 0)
  s.lineTo(r, -r)
  s.lineTo(0, -R)
  s.lineTo(-r, -r)
  s.lineTo(-R, 0)
  s.lineTo(-r, r)
  s.closePath()
  const g = new THREE.ShapeGeometry(s)
  g.scale(size, size, 1)
  return g
}
