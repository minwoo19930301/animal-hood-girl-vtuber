/**
 * 리액션 공용 수학 유틸 — 전부 순수 함수 (결정적).
 * 프레임마다 도는 곳에서는 Math.hypot(가변 인자 빌트인, 호출마다 힙 할당)을 쓰지 않고 Math.sqrt 로 길이를 구한다.
 */

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

/** 스크래치 (프레임당 할당 금지) */
const S1: V3 = { x: 0, y: 0, z: 1 }
const S2: V3 = { x: 0, y: 0, z: 1 }
const MID: V3 = { x: 1, y: 0, z: 0 }

/**
 * 방향 a → b 를 각도 기준(구면 보간)으로 k(0..1) 만큼 섞어 out 에 쓴다 (out === a 여도 안전). 입력은 정규화돼 있다고 본다.
 * 성분 lerp 후 정규화는 정반대에 가까운 두 방향(팔 내림 → 만세) 사이에서 중간점이 0 에 가까워 각도가 몇 프레임에 몰려 휙 돈다.
 * 구면 보간은 일정한 각속도로 돌고, 정반대일 때는 팔이 옆(outward = ±1, 캐릭터 왼팔 +1)으로 벌어지며 지나간다.
 */
function slerpPlain(out: V3, a: V3, b: V3, k: number, outward: number): void {
  const ax = a.x, ay = a.y, az = a.z
  const dot = ax * b.x + ay * b.y + az * b.z
  if (dot > 0.9995) {
    const x = ax + (b.x - ax) * k, y = ay + (b.y - ay) * k, z = az + (b.z - az) * k
    const l = Math.sqrt(x * x + y * y + z * z) || 1
    out.x = x / l; out.y = y / l; out.z = z / l
    return
  }
  const theta = Math.acos(dot < -1 ? -1 : dot)
  if (dot < -0.9995) {
    // 정반대: a 에 수직인 옆 방향 p 를 지나 돈다 (a cosφ + p sinφ, φ = kπ)
    let px = outward - ax * ax * outward, py = -ay * ax * outward, pz = -az * ax * outward
    let pl = Math.sqrt(px * px + py * py + pz * pz)
    if (pl < 1e-3) { px = -ax * az; py = -ay * az; pz = 1 - az * az; pl = Math.sqrt(px * px + py * py + pz * pz) || 1 }
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
  const l = Math.sqrt(x * x + y * y + z * z) || 1
  out.x = x / l; out.y = y / l; out.z = z / l
}

/**
 * 구면 보간 + 정반대 안정화. 두 방향이 둔각 이상(내린 팔 ↔ 만세 등)이면 회전 평면이 a×b 의 미세한 차이로 정해져서,
 * 목표가 조금만 움직여도(레이어 교차·흔들기) 팔이 한 프레임에 50° 넘게 휙 돈다. 그래서 각이 벌어질수록 옆 방향(outward)으로
 * 휘는 2차 구면 베지에(de Casteljau)로 보간한다: 제어점 c = normalize((a+b) + outward·β), β 는 dot 0 → -0.9 에서 0 → 0.9 로
 * 연속으로 커진다. (a+b)/|a+b| 는 측지선 중점이라 β=0 이면 일반 slerp 와 같고, 정반대에서는 a+b=0 이라 c = 옆 방향이다.
 * 임계값 스위칭이 없어서 경로 가족이 매끄럽게 변하고(레이어 교차 중 목표가 움직여도 연속), 팔은 언제나 몸 옆으로 벌어지며 올라간다.
 * out === a 여도 안전, 할당 없음.
 */
export function slerpInto(out: V3, a: V3, b: V3, k: number, outward: number): void {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z
  if (dot > -0.05) {
    slerpPlain(out, a, b, k, outward)
    return
  }
  const beta = 0.9 * ss(0, -0.9, dot)
  let cx = a.x + b.x + outward * beta, cy = a.y + b.y, cz = a.z + b.z
  const cl = Math.sqrt(cx * cx + cy * cy + cz * cz)
  if (cl < 1e-6) { cx = outward; cy = 0; cz = 0 } else { cx /= cl; cy /= cl; cz /= cl }
  MID.x = cx; MID.y = cy; MID.z = cz
  slerpPlain(S1, a, MID, k, outward)
  slerpPlain(S2, MID, b, k, outward)
  slerpPlain(out, S1, S2, k, outward)
}
