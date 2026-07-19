/** dt 기반 감쇠 조화진동 스프링 — 2차 모션(깃털/스카프/꼬리) 팔로우 스루 용 */
export class Spring {
  value = 0
  vel = 0
  constructor(public k = 110, public damp = 9) {}

  /** 고정 서브스텝으로 결정적 적분 */
  step(target: number, dt: number): number {
    let remain = Math.min(Math.max(dt, 0), 0.1)
    const h = 1 / 240
    while (remain > 1e-6) {
      const s = Math.min(h, remain)
      const a = -this.k * (this.value - target) - this.damp * this.vel
      this.vel += a * s
      this.value += this.vel * s
      remain -= s
    }
    return this.value
  }
}

/** 헤드 포즈를 따라가는 지연 팔로워: deflect = spring - current (러그+오버슛) */
export class Follower {
  private sp: Spring
  constructor(k = 110, damp = 9, public max = 0.45) {
    this.sp = new Spring(k, damp)
  }
  step(current: number, dt: number): number {
    const v = this.sp.step(current, dt)
    const d = v - current
    return Math.max(-this.max, Math.min(this.max, d))
  }
}
