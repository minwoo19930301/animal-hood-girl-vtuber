/**
 * 생명감(aliveness) 레이어 — 진입점.
 * 계약: createAliveness(): Aliveness (src/contract.ts)
 *
 * 파이프라인 위치: tracking(raw) → compose() → 최종 RigFrame → model.apply()
 * - tracked≈0: idle 스택(호흡+랜덤 깜빡임+sway+커서 시선+idle 모션+idle 팔/몸통)이 전권
 * - tracked≈1: 트래킹 존중, 호흡/블링크 스냅/미소 반응만 레이어
 * - 전환: FusionState(IDLE/TRACKED/RETURNING)가 attack 0.25s / release 1.2s 크로스페이드
 *
 * 계약 v2 융합 규칙 (BRIEF 생명감 섹션):
 * - ArmPose 방향벡터는 성분 lerp 후 재정규화 (각도 slerp 불필요 — 소각 크로스페이드 전용)
 * - fingers 5개는 개별 lerp, BodyPose는 채널별 lerp
 * - 팔/몸통은 자체 present 램프(팔별·몸통별)로 트래킹 중 부분 소실도 부드럽게
 *
 * 결정성: 모든 랜덤은 시드 고정 mulberry32(rng.ts)에서만 소비.
 * 동일 (raw, dt, t, cursor) 시퀀스 → 동일 출력. 검증 스크립트는 README.md 참조.
 * raw는 절대 변형하지 않음 — 매 프레임 새 객체 리터럴 반환 (structuredClone 금지).
 */
import { neutralFrame, type Aliveness, type ArmPose, type BodyPose, type CursorInfo, type RigFrame } from '../contract'
import { TIMING as T } from './constants'
import { AsymRamp, clamp01, lerp } from './fade'
import { lerpDir } from './vec'
import { FusionState } from './state'
import { IdleStack } from './idle'

export function createAliveness(): Aliveness {
  const fusion = new FusionState()
  const idle = new IdleStack()
  const neutral = neutralFrame() // idle측 기준값 (contract와 자동 동기 — mouthSmile 등)
  // 팔/몸통 present는 트래킹 중에도 깜빡일 수 있어 자체 attack/release 램프로 스무딩
  const armRampL = new AsymRamp(T.TRACK_ATTACK, T.TRACK_RELEASE)
  const armRampR = new AsymRamp(T.TRACK_ATTACK, T.TRACK_RELEASE)
  const bodyRamp = new AsymRamp(T.TRACK_ATTACK, T.TRACK_RELEASE)
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
      // 팔 융합: 유효 가중치 = 램프(팔 present × 전역 w).
      // 방향벡터는 성분 lerp 후 재정규화, fingers 5개 개별 lerp. 출력 present = 유효 가중치
      // (모델은 이 값으로 idle↔트래킹 크로스페이드 — 스냅 없음).
      const fuseArm = (src: ArmPose, ramp: AsymRamp, idleArm: ArmPose): ArmPose => {
        const aw = ramp.update(clamp01(src.present) * w, dt)
        return {
          present: aw,
          upperDir: lerpDir(idleArm.upperDir, src.upperDir, aw),
          lowerDir: lerpDir(idleArm.lowerDir, src.lowerDir, aw),
          palmNormal: lerpDir(idleArm.palmNormal, src.palmNormal, aw),
          handDir: lerpDir(idleArm.handDir, src.handDir, aw),
          fingers: [
            lerp(idleArm.fingers[0], src.fingers[0], aw),
            lerp(idleArm.fingers[1], src.fingers[1], aw),
            lerp(idleArm.fingers[2], src.fingers[2], aw),
            lerp(idleArm.fingers[3], src.fingers[3], aw),
            lerp(idleArm.fingers[4], src.fingers[4], aw),
          ],
          spread: lerp(idleArm.spread, src.spread, aw),
          wave: lerp(idleArm.wave, src.wave, aw), // 계약: 트래킹 중 src.wave=0 → 자연 소거
        }
      }
      // 몸통 융합: BodyPose 채널별 lerp. 다리는 idle측이 항상 0 (모델이 idle 스탠스 유지)
      const fuseBody = (src: BodyPose, idleBody: BodyPose): BodyPose => {
        const bw = bodyRamp.update(clamp01(src.present) * w, dt)
        return {
          present: bw,
          shrugL: lerp(idleBody.shrugL, src.shrugL, bw),
          shrugR: lerp(idleBody.shrugR, src.shrugR, bw),
          lean: {
            x: lerp(idleBody.lean.x, src.lean.x, bw),
            z: lerp(idleBody.lean.z, src.lean.z, bw),
          },
          twist: lerp(idleBody.twist, src.twist, bw),
          hipShift: lerp(idleBody.hipShift, src.hipShift, bw),
          legsPresent: lerp(0, clamp01(src.legsPresent), bw),
          kneeL: lerp(0, src.kneeL, bw),
          kneeR: lerp(0, src.kneeR, bw),
        }
      }
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
        armL: fuseArm(source.armL, armRampL, id.armL),
        armR: fuseArm(source.armR, armRampR, id.armR),
        body: fuseBody(source.body, id.body),
        fx: {
          heart: fxLive && source.fx.heart,
          happy: (fxLive && source.fx.happy) || happyLatch || (!fxLive && id.happy),
          sweat: fxLive && source.fx.sweat,
          anger: fxLive && source.fx.anger,
        },
        // 5) 호흡은 트래킹 여부와 무관하게 항상 레이어.
        // 계약(contract.ts): breath는 "위상 0..1" — 모델이 sin(breath·2π)로 변환하므로
        // 여기서는 톱니 위상만 채운다 (사인 변위를 넣으면 이중 사인 왜곡 발생).
        // idle 팔의 호흡 sway도 같은 시계(t/BREATH_PERIOD)를 쓰므로 가슴과 팔이 동기.
        breath: (t / T.BREATH_PERIOD) % 1,
      }
    },
  }
}
