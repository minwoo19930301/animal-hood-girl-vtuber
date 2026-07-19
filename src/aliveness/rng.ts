/**
 * 시드 고정 결정적 RNG — mulberry32.
 * BRIEF 규칙: Math.random() 직접 사용 금지. 동일 (dt,t) 시퀀스 → 동일 소비 순서 → 동일 출력.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Rng {
  private next: () => number

  constructor(seed: number) {
    this.next = mulberry32(seed)
  }

  /** [0,1) */
  float(): number {
    return this.next()
  }

  /** [min,max) */
  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  /** 확률 p로 true */
  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.min(arr.length - 1, Math.floor(this.next() * arr.length))]
  }
}
