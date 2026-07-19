/** 채널별 스프링/이징 유틸 (BRIEF: 별도 파일 분리). 전부 결정적 — 시간/입력 외 상태 없음. */

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

export const clamp01 = (v: number): number => clamp(v, 0, 1)

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

/** 0..1 입력을 부드럽게 (양끝 미분 0) */
export const smoothstep01 = (x: number): number => {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}

/** 0→1→0 C1 범프 엔벨로프 (idle 모션용: 시작/끝 속도 0) */
export const bump = (p: number): number =>
  p < 0.5 ? smoothstep01(p * 2) : smoothstep01(2 - p * 2)

/**
 * 지수 수렴 스무딩 — 시간상수 tau(초)의 "지연 스프링".
 * 프레임레이트 독립: dt가 어떻게 쪼개져도 같은 시각엔 같은 값에 수렴.
 */
export const smoothTo = (cur: number, target: number, tau: number, dt: number): number =>
  cur + (target - cur) * (1 - Math.exp(-dt / tau))

/**
 * 비대칭 램프: 상승은 attack초, 하강은 release초에 걸쳐 0..1 전체 구간 이동.
 * 트래킹 크로스페이드(획득 0.25s / 소실 1.2s)의 코어. 스냅 없음.
 */
export class AsymRamp {
  v = 0
  private attack: number
  private release: number

  constructor(attack: number, release: number) {
    this.attack = attack
    this.release = release
  }

  update(target: number, dt: number): number {
    if (target > this.v) this.v = Math.min(target, this.v + dt / this.attack)
    else this.v = Math.max(target, this.v - dt / this.release)
    return this.v
  }
}

/** [p, value] 키프레임 시퀀스를 smoothstep 보간으로 평가 (목 스트레치 등 다단 모션용) */
export function keyTrack(p: number, keys: readonly (readonly [number, number])[]): number {
  if (p <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i][0]) {
      const p0 = keys[i - 1][0]
      const v0 = keys[i - 1][1]
      const p1 = keys[i][0]
      const v1 = keys[i][1]
      return lerp(v0, v1, smoothstep01((p - p0) / (p1 - p0)))
    }
  }
  return keys[keys.length - 1][1]
}
