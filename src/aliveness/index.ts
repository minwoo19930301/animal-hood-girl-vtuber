/**
 * STUB — 생명감(aliveness) 에이전트가 교체할 파일.
 * 계약: createAliveness(): Aliveness  (src/contract.ts 참조)
 * 지금은 호흡 + 5초 주기 깜빡임만.
 */
import type { Aliveness, CursorInfo, RigFrame } from '../contract'

export function createAliveness(): Aliveness {
  let blinkT = -1
  return {
    compose(raw: RigFrame, dt: number, t: number, _cursor: CursorInfo | null): RigFrame {
      const f: RigFrame = structuredClone(raw)
      f.breath = (Math.sin(t * Math.PI * 2 / 3.6) + 1) / 2

      if (f.tracked < 0.5) {
        // 단순 주기 깜빡임 (에이전트가 랜덤+더블블링크로 교체 예정)
        if (blinkT < 0 && t % 5 < 0.01) blinkT = 0
        if (blinkT >= 0) {
          blinkT += dt
          const k = blinkT / 0.28
          f.blinkL = f.blinkR = k < 0.5 ? k * 2 : Math.max(0, 2 - k * 2)
          if (k >= 1) blinkT = -1
        }
      }
      return f
    },
  }
}
