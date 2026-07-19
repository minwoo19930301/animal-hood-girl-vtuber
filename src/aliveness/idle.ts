/**
 * idle 스택 — 미트래킹 상태의 생명감 본체.
 * 깜빡임 / 무게중심 sway / 시선(커서 팔로우 + 사카드 + 한눈팔기) / 랜덤 idle 모션 /
 * ArmPose 방향벡터 기반 idle 팔(neutralArm + 호흡 sway + 미세 드리프트 + 기지개) / BodyPose idle.
 * 모든 랜덤은 시드 고정 Rng에서만 소비 → 동일 (dt,t,cursor) 시퀀스면 동일 출력.
 */
import { neutralArm, neutralBody, type ArmPose, type BodyPose, type CursorInfo, type Dir3, type HeadPose } from '../contract'
import { TIMING as T } from './constants'
import { Rng } from './rng'
import { bump, clamp, clamp01, keyTrack, lerp, smoothTo, smoothstep01 } from './fade'
import { lerpDirInto, setNorm } from './vec'

export interface IdleOut {
  head: HeadPose
  gaze: { x: number; y: number }
  blink: number
  /** idle 팔 자세 (내부 스크래치 재사용 — 호출자는 읽기만, 보관 금지) */
  armL: ArmPose
  armR: ArmPose
  /** idle 몸통 자세 (내부 스크래치 재사용) */
  body: BodyPose
  /** 행복눈 idle 모션 활성 여부 */
  happy: boolean
}

type Motion = 'TILT' | 'STRETCH' | 'SHRUG' | 'HAPPY' | 'REACH'
const MOTIONS: readonly Motion[] = ['TILT', 'STRETCH', 'SHRUG', 'HAPPY', 'REACH']

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
  REACH: T.REACH_LEN,
}

// ---- 기지개(REACH) 목표 방향 (캐릭터 공간, lerpDirInto가 재정규화) ----
/** 상완: 앞으로 나란히 {0,0,1} 근처 (BRIEF: "upperDir을 {0,0,1} 근처로 2초 이징 왕복") */
const REACH_UPPER: Dir3 = { x: 0, y: 0.05, z: 1 }
/** 하완: 팔꿈치 거의 폄 — 상완과 같은 앞 방향 */
const REACH_LOWER: Dir3 = { x: 0, y: 0.02, z: 1 }
/** 손: 손끝 앞으로 */
const REACH_HAND: Dir3 = { x: 0, y: 0, z: 1 }
/** 손바닥: 바닥향 (자연스러운 앞 기지개) */
const REACH_PALM: Dir3 = { x: 0, y: -1, z: 0.15 }

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
  // 팔: 기준 포즈(불변) + 출력 스크래치(매 프레임 in-place 갱신 — 할당 없음)
  private readonly baseL = neutralArm(1)
  private readonly baseR = neutralArm(-1)
  private armL = neutralArm(1)
  private armR = neutralArm(-1)
  private body = neutralBody()
  // 미세 드리프트: 현재값(지수 수렴) / 목표(4~9s마다 재선정)
  private nextDriftAt = -1
  private driftLX = 0
  private driftLZ = 0
  private driftRX = 0
  private driftRZ = 0
  private driftTgtLX = 0
  private driftTgtLZ = 0
  private driftTgtRX = 0
  private driftTgtRZ = 0

  update(dt: number, t: number, cursor: CursorInfo | null): IdleOut {
    // 첫 호출에 타이머 초기화 (첫 t 기준 — 시퀀스가 같으면 결정적)
    if (this.nextBlinkAt < 0) this.nextBlinkAt = t + this.rng.range(T.BLINK_GAP_MIN, T.BLINK_GAP_MAX)
    if (this.nextSaccadeAt < 0) this.nextSaccadeAt = t + this.rng.range(T.SACCADE_GAP_MIN, T.SACCADE_GAP_MAX)
    if (this.nextDistractAt < 0) this.nextDistractAt = t + this.rng.range(T.DISTRACT_GAP_MIN, T.DISTRACT_GAP_MAX)
    if (this.nextMotionAt < 0) this.nextMotionAt = t + this.rng.range(T.MOTION_GAP_MIN, T.MOTION_GAP_MAX)
    if (this.nextDriftAt < 0) this.nextDriftAt = t + this.rng.range(T.ARM_DRIFT_GAP_MIN, T.ARM_DRIFT_GAP_MAX)

    const blink = this.updateBlink(t)
    const { head, shrugK, reachK, happy } = this.updateSwayAndMotion(t)
    const gaze = this.updateGaze(dt, t, cursor)
    this.updateArms(dt, t, reachK)
    this.updateBody(t, shrugK)
    return { head, gaze, blink, armL: this.armL, armR: this.armR, body: this.body, happy }
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

  private updateSwayAndMotion(t: number): { head: HeadPose; shrugK: number; reachK: number; happy: boolean } {
    const head: HeadPose = {
      pitch: 0,
      yaw: T.SWAY_YAW_AMP * Math.sin((Math.PI * 2 * t) / T.SWAY_YAW_PERIOD),
      roll: T.SWAY_ROLL_AMP * Math.sin((Math.PI * 2 * t) / T.SWAY_ROLL_PERIOD),
    }
    let shrugK = 0
    let reachK = 0
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
            shrugK = bump(p)
            break
          case 'HAPPY':
            happy = true
            break
          case 'REACH':
            // 팔 앞으로 기지개: 0→1→0 C1 엔벨로프 (양끝 속도 0 — 2초 이징 왕복)
            reachK = bump(p)
            break
        }
      }
    }
    return { head, shrugK, reachK, happy }
  }

  // ---- idle 팔: neutralArm 기반 방향벡터 + 호흡 sway + 미세 드리프트 + 기지개 ----

  private updateArms(dt: number, t: number, reachK: number): void {
    // 드리프트 목표 재선정 (양팔 4성분을 한 이벤트에 소비 — RNG 순서 고정)
    if (t >= this.nextDriftAt) {
      this.driftTgtLX = this.rng.range(-T.ARM_DRIFT_AMP, T.ARM_DRIFT_AMP)
      this.driftTgtLZ = this.rng.range(-T.ARM_DRIFT_AMP, T.ARM_DRIFT_AMP)
      this.driftTgtRX = this.rng.range(-T.ARM_DRIFT_AMP, T.ARM_DRIFT_AMP)
      this.driftTgtRZ = this.rng.range(-T.ARM_DRIFT_AMP, T.ARM_DRIFT_AMP)
      this.nextDriftAt = t + this.rng.range(T.ARM_DRIFT_GAP_MIN, T.ARM_DRIFT_GAP_MAX)
    }
    this.driftLX = smoothTo(this.driftLX, this.driftTgtLX, T.ARM_DRIFT_TAU, dt)
    this.driftLZ = smoothTo(this.driftLZ, this.driftTgtLZ, T.ARM_DRIFT_TAU, dt)
    this.driftRX = smoothTo(this.driftRX, this.driftTgtRX, T.ARM_DRIFT_TAU, dt)
    this.driftRZ = smoothTo(this.driftRZ, this.driftTgtRZ, T.ARM_DRIFT_TAU, dt)

    // 호흡 위상은 compose()의 breath(톱니 t/BREATH_PERIOD)와 동일 시계 — 가슴과 팔이 같이 숨쉰다
    const s = Math.sin((Math.PI * 2 * t) / T.BREATH_PERIOD)
    this.writeArm(this.armL, this.baseL, 1, this.driftLX, this.driftLZ, s, reachK)
    this.writeArm(this.armR, this.baseR, -1, this.driftRX, this.driftRZ, s, reachK)
  }

  /** base(neutralArm)에 sway/드리프트를 성분 가산 → 재정규화 → 기지개 목표로 성분 lerp */
  private writeArm(out: ArmPose, base: ArmPose, side: 1 | -1, dx: number, dz: number, s: number, k: number): void {
    // 호흡 sway: 들숨에 팔이 바깥·앞으로 살짝 벌어짐 (좌우 대칭 — side로 x 부호 반전)
    const ox = side * T.ARM_SWAY_X * s + dx
    const oz = T.ARM_SWAY_Z * s + dz
    setNorm(out.upperDir, base.upperDir.x + ox, base.upperDir.y, base.upperDir.z + oz)
    setNorm(out.lowerDir, base.lowerDir.x + ox * T.ARM_SWAY_LOWER, base.lowerDir.y, base.lowerDir.z + oz * T.ARM_SWAY_LOWER)
    setNorm(out.handDir, base.handDir.x + ox * T.ARM_SWAY_LOWER, base.handDir.y, base.handDir.z + oz * T.ARM_SWAY_LOWER)
    out.palmNormal.x = base.palmNormal.x
    out.palmNormal.y = base.palmNormal.y
    out.palmNormal.z = base.palmNormal.z
    // 손가락: 호흡에 실리는 미세 curl 변조 (전부 동일 위상 — 릴랙스 상태)
    for (let i = 0; i < 5; i++) out.fingers[i] = clamp01(base.fingers[i] + T.ARM_SWAY_FINGER * s)
    out.spread = base.spread
    if (k > 0) {
      // 기지개: 방향벡터는 성분 lerp 후 재정규화, 손가락은 쫙 폄
      lerpDirInto(out.upperDir, out.upperDir, REACH_UPPER, k)
      lerpDirInto(out.lowerDir, out.lowerDir, REACH_LOWER, k)
      lerpDirInto(out.handDir, out.handDir, REACH_HAND, k)
      lerpDirInto(out.palmNormal, out.palmNormal, REACH_PALM, k)
      for (let i = 0; i < 5; i++) out.fingers[i] = lerp(out.fingers[i], T.REACH_CURL, k)
      out.spread = lerp(out.spread, T.REACH_SPREAD, k)
    }
    out.present = 0
    out.wave = 0
  }

  // ---- idle 몸통: 미세 lean/hipShift sway + SHRUG 모션 ----

  private updateBody(t: number, shrugK: number): void {
    const b = this.body
    b.present = 0
    b.shrugL = T.SHRUG_AMT * shrugK
    b.shrugR = T.SHRUG_AMT * shrugK
    b.lean.x = T.BODY_LEAN_AMP * Math.sin((Math.PI * 2 * t) / T.SWAY_ROLL_PERIOD)
    b.lean.z = 0
    b.twist = 0
    b.hipShift = T.HIP_SWAY_AMP * Math.sin((Math.PI * 2 * t) / T.HIP_SWAY_PERIOD)
    b.legsPresent = 0 // idle: 모델은 idle 스탠스 유지 (계약)
    b.kneeL = 0
    b.kneeR = 0
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
