/**
 * One Euro Filter — Casiez, Roussel & Vogel, CHI 2012 (https://gery.casiez.net/1euro/)
 *
 * 왜 이 필터인가: 고정 컷오프 저역통과는 "지터 제거 ↔ 지연" 트레이드오프가 고정된다.
 * One Euro는 신호의 변화 속도 |d̂x| 에 비례해 컷오프를 올려서,
 *   - 느린 움직임(정지 상태의 미세 지터): 컷오프 ≈ minCutoff → 강한 평활
 *   - 빠른 움직임(고개를 홱 돌림): 컷오프 ↑ → 지연 최소화
 *
 * 구현 근거 (논문 Algorithm 그대로, 참조 구현 https://gery.casiez.net/1euro/ 의
 * Python 버전과 동일한 수식):
 *   1차 저역통과 한 스텝:  x̂ = α·x + (1-α)·x̂_prev
 *   α(cutoff, dt) = 1 / (1 + τ/dt),  τ = 1/(2π·cutoff)
 *     ← 아날로그 1차 RC 저역통과의 이산화. dt를 매 스텝 반영하므로
 *       rVFC처럼 프레임 간격이 흔들려도 주파수 응답이 일정하다.
 *   미분 추정:  dx = (x - x̂_prev)/dt  (참조 구현과 동일하게 "이전 필터 출력" 기준)
 *              d̂x = dx 를 dCutoff(기본 1Hz)로 저역통과
 *   적응 컷오프:  cutoff = minCutoff + beta·|d̂x|
 *
 * 튜닝 직관(논문 §5): 정지 시 지터가 보이면 minCutoff ↓,
 * 빠른 동작에서 끌리는 느낌(지연)이 있으면 beta ↑.
 *
 * 순수 클래스: DOM/mediapipe 의존 없음 → 단독 단위 검증 가능.
 */
export class OneEuroFilter {
  private readonly minCutoff: number
  private readonly beta: number
  private readonly dCutoff: number
  private xPrev = 0 // 이전 "필터 출력" x̂
  private dxPrev = 0 // 이전 미분 추정 d̂x
  private initialized = false

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
  }

  /** α = 1/(1 + τ/dt), τ = 1/(2π·fc) — 1차 저역통과의 지수 평활 계수 */
  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  /** 새 관측 x를 dt(초) 간격으로 필터링해 x̂ 반환 */
  filter(x: number, dt: number): number {
    if (!this.initialized || dt <= 0) {
      // 첫 샘플(또는 비정상 dt): 상태를 관측값으로 초기화하고 그대로 통과
      this.xPrev = x
      this.dxPrev = 0
      this.initialized = true
      return x
    }
    // 1) 미분 추정 + 미분 자체의 저역통과
    const dx = (x - this.xPrev) / dt
    const aD = OneEuroFilter.alpha(this.dCutoff, dt)
    const dxHat = aD * dx + (1 - aD) * this.dxPrev
    // 2) 속도 비례 적응 컷오프
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat)
    // 3) 본 신호 저역통과
    const a = OneEuroFilter.alpha(cutoff, dt)
    const xHat = a * x + (1 - a) * this.xPrev
    this.xPrev = xHat
    this.dxPrev = dxHat
    return xHat
  }

  /** 트래킹 소실 후 재획득 시 미분 스파이크 방지용 리셋 */
  reset(): void {
    this.initialized = false
    this.xPrev = 0
    this.dxPrev = 0
  }
}
