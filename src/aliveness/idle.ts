/**
 * idle 스택 — 미트래킹 상태의 생명감 본체.
 * 깜빡임 / 무게중심 sway / 시선(커서 팔로우 + 사카드 + 한눈팔기) / 랜덤 idle 모션.
 * 모든 랜덤은 시드 고정 Rng에서만 소비 → 동일 (dt,t,cursor) 시퀀스면 동일 출력.
 */
import type { CursorInfo, HeadPose } from '../contract'
import { TIMING as T } from './constants'
import { Rng } from './rng'
import { bump, clamp, keyTrack, smoothTo, smoothstep01 } from './fade'

export interface IdleOut {
  head: HeadPose
  gaze: { x: number; y: number }
  blink: number
  /** 날개 들썩 모션의 raise 기여 (양 날개 공통) */
  wingRaise: number
  /** 행복눈 idle 모션 활성 여부 */
  happy: boolean
}

type Motion = 'TILT' | 'STRETCH' | 'SHRUG' | 'HAPPY'
const MOTIONS: readonly Motion[] = ['TILT', 'STRETCH', 'SHRUG', 'HAPPY']

/** 목 스트레치 키프레임: 위로 0.3 → 아래로 -0.1 → 복귀 */
const STRETCH_KEYS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.35, T.STRETCH_PITCH_UP],
  [0.65, T.STRETCH_PITCH_DOWN],
  [1, 0],
]

const MOTION_LEN: Record<Motion, number> = {
  TILT: T.TILT_LEN,
  STRETCH: T.STRETCH_LEN,
  SHRUG: T.SHRUG_LEN,
  HAPPY: T.HAPPY_LEN,
}

export class IdleStack {
  private rng = new Rng(T.RNG_SEED)
  // 깜빡임
  private nextBlinkAt = -1
  private blinkStart = -1
  private isDouble = false
  // 시선
  private gx = 0
  private gy = 0
  private sacX = 0
  private sacY = 0
  private nextSaccadeAt = -1
  private nextDistractAt = -1
  private distractUntil = -1
  private distractX = 0
  private distractY = 0
  // idle 모션 (동시 발동 금지 — 한 번에 하나만)
  private nextMotionAt = -1
  private motion: Motion | null = null
  private motionStart = 0

  update(dt: number, t: number, cursor: CursorInfo | null): IdleOut {
    // 첫 호출에 타이머 초기화 (첫 t 기준 — 시퀀스가 같으면 결정적)
    if (this.nextBlinkAt < 0) this.nextBlinkAt = t + this.rng.range(T.BLINK_GAP_MIN, T.BLINK_GAP_MAX)
    if (this.nextSaccadeAt < 0) this.nextSaccadeAt = t + this.rng.range(T.SACCADE_GAP_MIN, T.SACCADE_GAP_MAX)
    if (this.nextDistractAt < 0) this.nextDistractAt = t + this.rng.range(T.DISTRACT_GAP_MIN, T.DISTRACT_GAP_MAX)
    if (this.nextMotionAt < 0) this.nextMotionAt = t + this.rng.range(T.MOTION_GAP_MIN, T.MOTION_GAP_MAX)

    const blink = this.updateBlink(t)
    const { head, wingRaise, happy } = this.updateSwayAndMotion(t)
    const gaze = this.updateGaze(dt, t, cursor)
    return { head, gaze, blink, wingRaise, happy }
  }

  // ---- 깜빡임: 평균 2~6s 간격, 10% 더블, 닫힘 80ms/열림 180ms 비대칭 ----

  /** 비대칭 블링크 커브: 빠르게 감고(80ms) 천천히 뜬다(180ms) */
  private blinkCurve(e: number): number {
    if (e < T.BLINK_CLOSE) return smoothstep01(e / T.BLINK_CLOSE)
    return 1 - smoothstep01((e - T.BLINK_CLOSE) / T.BLINK_OPEN)
  }

  private updateBlink(t: number): number {
    if (this.blinkStart < 0 && t >= this.nextBlinkAt) {
      this.blinkStart = t
      this.isDouble = this.rng.chance(T.BLINK_DOUBLE_CHANCE)
    }
    if (this.blinkStart < 0) return 0
    const single = T.BLINK_CLOSE + T.BLINK_OPEN
    const total = this.isDouble ? single + T.BLINK_DOUBLE_GAP + single : single
    const e = t - this.blinkStart
    if (e >= total) {
      this.blinkStart = -1
      this.nextBlinkAt = t + this.rng.range(T.BLINK_GAP_MIN, T.BLINK_GAP_MAX)
      return 0
    }
    const local = this.isDouble && e >= single + T.BLINK_DOUBLE_GAP ? e - single - T.BLINK_DOUBLE_GAP : e
    return local < single ? this.blinkCurve(local) : 0
  }

  // ---- sway(리사주 7s/11s) + 랜덤 idle 모션 — 몸 흔들림은 head에만 ----

  private updateSwayAndMotion(t: number): { head: HeadPose; wingRaise: number; happy: boolean } {
    const head: HeadPose = {
      pitch: 0,
      yaw: T.SWAY_YAW_AMP * Math.sin((Math.PI * 2 * t) / T.SWAY_YAW_PERIOD),
      roll: T.SWAY_ROLL_AMP * Math.sin((Math.PI * 2 * t) / T.SWAY_ROLL_PERIOD),
    }
    let wingRaise = 0
    let happy = false

    if (this.motion === null && t >= this.nextMotionAt) {
      this.motion = this.rng.pick(MOTIONS)
      this.motionStart = t
    }
    if (this.motion !== null) {
      const p = (t - this.motionStart) / MOTION_LEN[this.motion]
      if (p >= 1) {
        this.motion = null
        // 다음 모션은 종료 시점 기준 20~60s 후 — 동시 발동 원천 차단
        this.nextMotionAt = t + this.rng.range(T.MOTION_GAP_MIN, T.MOTION_GAP_MAX)
      } else {
        switch (this.motion) {
          case 'TILT':
            head.roll += T.TILT_ROLL * bump(p)
            break
          case 'STRETCH':
            head.pitch += keyTrack(p, STRETCH_KEYS)
            break
          case 'SHRUG':
            wingRaise = T.SHRUG_RAISE * bump(p)
            break
          case 'HAPPY':
            happy = true
            break
        }
      }
    }
    return { head, wingRaise, happy }
  }

  // ---- 시선: 커서 팔로우(지연 스프링) + 마이크로 사카드 + 한눈팔기 ----

  private updateGaze(dt: number, t: number, cursor: CursorInfo | null): { x: number; y: number } {
    // 마이크로 사카드: 0.5~2s마다 ±0.05 점프 (점프는 스프링 뒤가 아니라 목표에 가산)
    if (t >= this.nextSaccadeAt) {
      this.sacX = this.rng.range(-T.SACCADE_AMP, T.SACCADE_AMP)
      this.sacY = this.rng.range(-T.SACCADE_AMP, T.SACCADE_AMP)
      this.nextSaccadeAt = t + this.rng.range(T.SACCADE_GAP_MIN, T.SACCADE_GAP_MAX)
    }
    // 한눈팔기: 8~20s마다 1~2s 동안 커서 무시
    if (this.distractUntil >= 0 && t >= this.distractUntil) {
      this.distractUntil = -1
      this.nextDistractAt = t + this.rng.range(T.DISTRACT_GAP_MIN, T.DISTRACT_GAP_MAX)
    }
    if (this.distractUntil < 0 && t >= this.nextDistractAt) {
      this.distractUntil = t + this.rng.range(T.DISTRACT_LEN_MIN, T.DISTRACT_LEN_MAX)
      this.distractX = this.rng.range(-0.7, 0.7)
      this.distractY = this.rng.range(-0.5, 0.5)
    }

    let bx: number
    let by: number
    if (this.distractUntil >= 0) {
      bx = this.distractX
      by = this.distractY
    } else if (cursor) {
      // 화면 ny는 +아래 — gaze는 head.pitch(+위) 규약과 정합하도록 부호 반전
      bx = clamp(cursor.nx, -1, 1) * T.GAZE_GAIN
      by = -clamp(cursor.ny, -1, 1) * T.GAZE_GAIN
    } else {
      bx = 0
      by = 0
    }
    const tx = clamp(bx + this.sacX, -1, 1)
    const ty = clamp(by + this.sacY, -1, 1)
    this.gx = smoothTo(this.gx, tx, T.GAZE_LAG, dt)
    this.gy = smoothTo(this.gy, ty, T.GAZE_LAG, dt)
    return { x: this.gx, y: this.gy }
  }
}
