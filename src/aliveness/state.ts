/**
 * 상태 머신: IDLE / TRACKED / RETURNING (BRIEF: 별도 파일 분리)
 *
 *   IDLE ── raw.tracked ≥ TRACK_ON ──▶ TRACKED   (attack 0.25s 크로스페이드)
 *   TRACKED ── raw.tracked < TRACK_OFF ──▶ RETURNING (마지막 포즈 동결, release 1.2s)
 *   RETURNING ── weight ≈ 0 ──▶ IDLE
 *   RETURNING ── raw.tracked ≥ TRACK_ON ──▶ TRACKED (현재 블렌드 지점에서 재상승)
 *
 * weight(0..1)는 AsymRamp로 레이트 제한 후 smoothstep 셰이핑 — 스냅 없음.
 * RETURNING 소스는 소실 직전 동결(frozen) 프레임이므로 "현재 포즈에서" idle로 귀환한다.
 */
import { neutralFrame, type ArmPose, type BodyPose, type RigFrame } from '../contract'
import { TIMING as T } from './constants'
import { AsymRamp, clamp01, smoothstep01 } from './fade'
import { copyDirInto } from './vec'

export type TrackState = 'IDLE' | 'TRACKED' | 'RETURNING'

function copyArmInto(dst: ArmPose, src: ArmPose): void {
  dst.present = src.present
  copyDirInto(dst.upperDir, src.upperDir)
  copyDirInto(dst.lowerDir, src.lowerDir)
  copyDirInto(dst.palmNormal, src.palmNormal)
  copyDirInto(dst.handDir, src.handDir)
  for (let i = 0; i < 5; i++) dst.fingers[i] = src.fingers[i]
  dst.spread = src.spread
  dst.wave = src.wave
}

function copyBodyInto(dst: BodyPose, src: BodyPose): void {
  dst.present = src.present
  dst.shrugL = src.shrugL
  dst.shrugR = src.shrugR
  dst.lean.x = src.lean.x
  dst.lean.z = src.lean.z
  dst.twist = src.twist
  dst.hipShift = src.hipShift
  dst.legsPresent = src.legsPresent
  dst.kneeL = src.kneeL
  dst.kneeR = src.kneeR
}

/** structuredClone 금지(GC 압박) — 명시적 필드 복사 */
export function copyFrameInto(dst: RigFrame, src: RigFrame): void {
  dst.tracked = src.tracked
  dst.head.pitch = src.head.pitch
  dst.head.yaw = src.head.yaw
  dst.head.roll = src.head.roll
  dst.gaze.x = src.gaze.x
  dst.gaze.y = src.gaze.y
  dst.blinkL = src.blinkL
  dst.blinkR = src.blinkR
  dst.browL = src.browL
  dst.browR = src.browR
  dst.mouthOpen = src.mouthOpen
  dst.mouthSmile = src.mouthSmile
  copyArmInto(dst.armL, src.armL)
  copyArmInto(dst.armR, src.armR)
  copyBodyInto(dst.body, src.body)
  dst.fx.heart = src.fx.heart
  dst.fx.happy = src.fx.happy
  dst.fx.sweat = src.fx.sweat
  dst.fx.anger = src.fx.anger
  dst.breath = src.breath
}

export class FusionState {
  state: TrackState = 'IDLE'
  /** 셰이핑된 트래킹 가중치 0..1 (idle↔tracking 크로스페이드 계수) */
  weight = 0
  private ramp = new AsymRamp(T.TRACK_ATTACK, T.TRACK_RELEASE)
  /** 소실 직전 마지막 트래킹 프레임 (RETURNING 동안의 블렌드 소스) */
  private frozen: RigFrame = neutralFrame()

  /** @returns w: 셰이핑 가중치, source: 트래킹측 블렌드 소스 (live면 raw, 아니면 frozen) */
  update(raw: RigFrame, dt: number): { w: number; source: RigFrame } {
    // 히스테리시스: 진입은 TRACK_ON, 유지는 TRACK_OFF까지
    const live = raw.tracked >= (this.state === 'TRACKED' ? T.TRACK_OFF : T.TRACK_ON)
    if (live) copyFrameInto(this.frozen, raw)
    // 중간 tracked 값도 크로스페이드 (계약: "중간값: 크로스페이드")
    const wLin = this.ramp.update(live ? clamp01(raw.tracked) : 0, dt)
    this.weight = smoothstep01(wLin)
    this.state = live ? 'TRACKED' : wLin > 1e-3 ? 'RETURNING' : 'IDLE'
    return { w: this.weight, source: live ? raw : this.frozen }
  }
}
