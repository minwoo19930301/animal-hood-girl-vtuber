/** 리액션 공용 수학 유틸 — 전부 순수 함수 (결정적) */

export const TAU = Math.PI * 2

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

/** a..b 구간 smoothstep (양끝 미분 0) */
export const ss = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** 0..1 → 0..1, 살짝 넘쳤다 돌아오는 팝 (스티커 느낌) */
export const easeOutBack = (u: number): number => {
  if (u >= 1) return 1
  if (u <= 0) return 0
  const c1 = 1.70158
  const c3 = c1 + 1
  const x = u - 1
  return 1 + c3 * x * x * x + c1 * x * x
}

/** 0 → 1 → 0 로 올랐다 내려오는 종 모양 (a..b 구간, 양끝 0) */
export const bell = (a: number, b: number, x: number): number => {
  const u = clamp01((x - a) / (b - a))
  return Math.sin(Math.PI * u)
}

export interface V3 { x: number; y: number; z: number }

/**
 * 방향 a → b 를 각도 기준(구면 보간)으로 k(0..1) 만큼 섞어 out 에 쓴다 (out === a 여도 안전). 입력은 정규화돼 있다고 본다.
 * 성분 lerp 후 정규화는 정반대에 가까운 두 방향(팔 내림 → 만세) 사이에서 중간점이 0 에 가까워 각도가 몇 프레임에 몰려 휙 돈다.
 * 구면 보간은 일정한 각속도로 돌고, 정반대일 때는 팔이 옆(outward = ±1, 캐릭터 왼팔 +1)으로 벌어지며 지나간다.
 */
export function slerpInto(out: V3, a: V3, b: V3, k: number, outward: number): void {
  const ax = a.x, ay = a.y, az = a.z
  const dot = ax * b.x + ay * b.y + az * b.z
  if (dot > 0.9995) {
    const x = ax + (b.x - ax) * k, y = ay + (b.y - ay) * k, z = az + (b.z - az) * k
    const l = Math.hypot(x, y, z) || 1
    out.x = x / l; out.y = y / l; out.z = z / l
    return
  }
  const theta = Math.acos(dot < -1 ? -1 : dot)
  if (dot < -0.9995) {
    // 정반대: a 에 수직인 옆 방향 p 를 지나 돈다 (a cosφ + p sinφ, φ = kπ)
    let px = outward - ax * ax * outward, py = -ay * ax * outward, pz = -az * ax * outward
    let pl = Math.hypot(px, py, pz)
    if (pl < 1e-3) { px = -ax * az; py = -ay * az; pz = 1 - az * az; pl = Math.hypot(px, py, pz) || 1 }
    px /= pl; py /= pl; pz /= pl
    const ph = Math.PI * k
    const c = Math.cos(ph), sn = Math.sin(ph)
    out.x = ax * c + px * sn; out.y = ay * c + py * sn; out.z = az * c + pz * sn
    return
  }
  const sinT = Math.sin(theta)
  const wa = Math.sin((1 - k) * theta) / sinT
  const wb = Math.sin(k * theta) / sinT
  const x = ax * wa + b.x * wb, y = ay * wa + b.y * wb, z = az * wa + b.z * wb
  const l = Math.hypot(x, y, z) || 1
  out.x = x / l; out.y = y / l; out.z = z / l
}
