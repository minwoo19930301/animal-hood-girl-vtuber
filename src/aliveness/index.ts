/**
 * 생명감(aliveness) 레이어 — 진입점.
 * 계약: createAliveness(): Aliveness (src/contract.ts)
 *
 * 파이프라인 위치: tracking(raw) → compose() → 최종 RigFrame → model.apply()
 * - tracked≈0: idle 스택(호흡+랜덤 깜빡임+sway+커서 시선+idle 모션)이 전권
 * - tracked≈1: 트래킹 존중, 호흡/블링크 스냅/미소 반응만 레이어
 * - 전환: FusionState(IDLE/TRACKED/RETURNING)가 attack 0.25s / release 1.2s 크로스페이드
 *
 * 결정성: 모든 랜덤은 시드 고정 mulberry32(rng.ts)에서만 소비.
 * 동일 (raw, dt, t, cursor) 시퀀스 → 동일 출력. 검증 스크립트는 README.md 참조.
 * raw는 절대 변형하지 않음 — 매 프레임 새 객체 리터럴 반환 (structuredClone 금지).
 */
import { neutralFrame, type Aliveness, type CursorInfo, type RigFrame, type WingPose } from '../contract'
import { TIMING as T } from './constants'
import { AsymRamp, clamp01, lerp } from './fade'
import { FusionState } from './state'
import { IdleStack } from './idle'

export function createAliveness(): Aliveness {
  const fusion = new FusionState()
  const idle = new IdleStack()
  const neutral = neutralFrame() // idle측 기준 포즈 (contract와 자동 동기)
  // 날개 present는 트래킹 중에도 깜빡일 수 있어 자체 attack/release 램프로 스무딩
  const presentL = new AsymRamp(T.TRACK_ATTACK, T.TRACK_RELEASE)
  const presentR = new AsymRamp(T.TRACK_ATTACK, T.TRACK_RELEASE)
  // 미소 반응 래치
  let smileHeld = 0
  let happyLatch = false
  let happyRelease = 0

  /** 트래킹 blink 존중 + 0.7 초과 시 1.0 스냅 가속 (자연스러운 완전 감김) */
  const shapeBlink = (b: number): number =>
    b <= T.BLINK_SNAP_START ? b : Math.min(1, T.BLINK_SNAP_START + (b - T.BLINK_SNAP_START) * T.BLINK_SNAP_GAIN)

  return {
    compose(raw: RigFrame, dt: number, t: number, cursor: CursorInfo | null): RigFrame {
      // 1) 상태 머신 + 크로스페이드 가중치 (source: live면 raw, RETURNING이면 동결 포즈)
      const { w, source } = fusion.update(raw, dt)
      // 2) idle 스택은 항상 갱신 (스프링 연속성 — 트래킹 소실 시 점프 없음)
      const id = idle.update(dt, t, cursor)

      // 3) 미소 반응: mouthSmile>0.7이 0.3s 지속 → fx.happy (지속 유지 + 0.5s 릴리즈)
      const smiling = raw.tracked >= T.TRACK_ON && raw.mouthSmile > T.SMILE_THRESH
      if (smiling) {
        smileHeld += dt
        if (smileHeld >= T.SMILE_HOLD) {
          happyLatch = true
          happyRelease = T.SMILE_RELEASE
        }
      } else {
        smileHeld = 0
        if (happyLatch) {
          happyRelease -= dt
          if (happyRelease <= 0) happyLatch = false
        }
      }

      // 4) 채널별 크로스페이드로 최종 프레임 조립 (raw 비변형 — 새 객체)
      const wing = (src: WingPose, ramp: AsymRamp, base: WingPose, shrug: number): WingPose => ({
        present: ramp.update(clamp01(src.present) * w, dt),
        raise: lerp(base.raise + shrug, src.raise, w),
        out: lerp(base.out, src.out, w),
        curl: lerp(base.curl, src.curl, w),
        spread: lerp(base.spread, src.spread, w),
        wave: lerp(base.wave, src.wave, w),
      })
      const fxLive = w > 0.5 // boolean은 크로스페이드 불가 — 가중치 과반 게이트

      return {
        tracked: w,
        head: {
          pitch: lerp(id.head.pitch, source.head.pitch, w),
          yaw: lerp(id.head.yaw, source.head.yaw, w),
          roll: lerp(id.head.roll, source.head.roll, w),
        },
        gaze: {
          x: lerp(id.gaze.x, source.gaze.x, w),
          y: lerp(id.gaze.y, source.gaze.y, w),
        },
        blinkL: lerp(id.blink, shapeBlink(source.blinkL), w),
        blinkR: lerp(id.blink, shapeBlink(source.blinkR), w),
        browL: lerp(0, source.browL, w),
        browR: lerp(0, source.browR, w),
        mouthOpen: lerp(0, source.mouthOpen, w),
        mouthSmile: lerp(neutral.mouthSmile, source.mouthSmile, w),
        wingL: wing(source.wingL, presentL, neutral.wingL, id.wingRaise),
        wingR: wing(source.wingR, presentR, neutral.wingR, id.wingRaise),
        fx: {
          heart: fxLive && source.fx.heart,
          happy: (fxLive && source.fx.happy) || happyLatch || (!fxLive && id.happy),
          sweat: fxLive && source.fx.sweat,
          anger: fxLive && source.fx.anger,
        },
        // 5) 호흡은 트래킹 여부와 무관하게 항상 레이어.
        // 계약(contract.ts): breath는 "위상 0..1" — 모델이 sin(breath·2π)로 변환하므로
        // 여기서는 톱니 위상만 채운다 (사인 변위를 넣으면 이중 사인 왜곡 발생).
        breath: (t / T.BREATH_PERIOD) % 1,
      }
    },
  }
}
