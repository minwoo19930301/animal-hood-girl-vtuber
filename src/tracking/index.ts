/**
 * src/tracking/index.ts — MediaPipe Tasks(Face + Hand + Pose Landmarker) 웹캠 트래커.
 *
 * 계약 v2: createTracker(): Tracker (src/contract.ts — ArmPose/BodyPose)
 * 파이프라인: rVFC 루프 → detectForVideo(얼굴 매 프레임, 포즈/손 격프레임 교차)
 *             → (순수 함수 math.ts로 기하 분해/거울 매핑)
 *             → One Euro 필터(방향벡터는 성분별 후 재정규화) → 더블버퍼 → latest()
 *
 * 수학(행렬 분해·기저 변환·거울 매핑·관절각)은 전부 src/tracking/math.ts 의
 * 순수 함수에 있고, 이 파일은 I/O·스케줄링·상태(필터/기준선/히스테리시스)만 담당한다.
 */
import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
} from '@mediapipe/tasks-vision'
import type { ArmPose, BodyPose, Dir3, RigFrame, Tracker } from '../contract'
import { neutralArm, neutralBody, neutralFrame } from '../contract'
import { OneEuroFilter } from './oneEuro'
import {
  approach,
  armDirsFromPose,
  associateHandSide,
  BODY_TUNING,
  bodyRawFromPose,
  CAMERA_BASIS,
  clamp,
  clamp01,
  clampHeadPose,
  decomposeHeadMatrix,
  emaStep,
  envelopeStep,
  fingerCurls,
  fingerSpread,
  handOrientFromWorld,
  hysteresis,
  mapBlendshapes,
  orthonormalizePalm,
  shrugFrom,
  torsoBasisFromPose,
  type TorsoBasis,
} from './math'

/* ---------------- 튜닝 상수 (README 참조) ---------------- */

// tracked: 얼굴 재검출 시 0.15s에 걸쳐 상승, 미검출 시 0.5s에 걸쳐 감쇠 (BRIEF)
const TRACKED_RISE_S = 0.15
const TRACKED_FALL_S = 0.5
// present: 등장 0.12s, 소실 0.4s 감쇠 (BRIEF: 스냅 금지)
const PRESENT_RISE_S = 0.12
const PRESENT_FALL_S = 0.4
// 포즈/손은 격프레임(≈15Hz) 실행이라 2~4회 미검출은 소실로 치지 않는다
const POSE_SEEN_TIMEOUT_MS = 300
const HAND_SEEN_TIMEOUT_MS = 300
// 이 시간 이상 소실 후 재획득이면 필터 리셋 (One Euro 미분 스파이크 방지)
const REACQUIRE_RESET_MS = 1000
// 팔/몸통/다리 visibility 히스테리시스 (BRIEF: visibility 게이팅)
const ARM_VIS_ENTER = 0.6
const ARM_VIS_KEEP = 0.45
const BODY_VIS_ENTER = 0.6
const BODY_VIS_KEEP = 0.45
// BRIEF §6: visibility(25,26)>0.5 → legsPresent. 그 주변 히스테리시스
const LEGS_VIS_ENTER = 0.55
const LEGS_VIS_KEEP = 0.45
// 손 handedness 신뢰도 게이팅 + 히스테리시스
const HAND_SCORE_ENTER = 0.7
const HAND_SCORE_KEEP = 0.5
// 손↔팔 매칭에 쓸 포즈 이미지 랜드마크 신선도
const POSE_IMG_FRESH_MS = 500
// 부재(absence) 백오프: 이 시간 이상 얼굴 미검출이면 상주 앱 CPU 절감 모드 —
// 얼굴 검출을 1/4 케이던스(≈7.5Hz)로 낮추고 포즈/손 검출은 완전 스킵.
// (팔/몸은 present 감쇠로 idle 복귀 — 재획득은 얼굴부터)
const ABSENCE_BACKOFF_MS = 10_000
const ABSENCE_FACE_EVERY_N = 4

/* ---------------- 디버그 훅 ---------------- */

export interface MingoTrackingDebug {
  fps: number
  lastBlendshapes: Record<string, number> | null
  lastMatrix: number[] | null
  /** 포즈 visibility 게이팅 관찰용 (armL/armR=min(어깨,팔꿈치,손목), body=어깨, legs=무릎) */
  lastPoseVis: { armL: number; armR: number; body: number; legs: number } | null
}

declare global {
  interface Window {
    __mingoTracking?: MingoTrackingDebug
  }
}

/* ---------------- 얼굴 필터 ---------------- */

/** 얼굴 채널별 One Euro 필터.
 * BRIEF 기본값 minCutoff 1.0 / beta 0.007 에서:
 *  - 머리 회전은 beta ↑ (0.05): 빠른 끄덕임/도리질에 지연 없이 따라붙도록
 *  - 깜빡임은 minCutoff ↑ (3.0): 0.1s급 고속 신호라 과평활하면 눈이 안 감김
 */
interface FaceFilters {
  pitch: OneEuroFilter
  yaw: OneEuroFilter
  roll: OneEuroFilter
  gazeX: OneEuroFilter
  gazeY: OneEuroFilter
  blinkL: OneEuroFilter
  blinkR: OneEuroFilter
  browL: OneEuroFilter
  browR: OneEuroFilter
  mouthOpen: OneEuroFilter
  mouthSmile: OneEuroFilter
}

const makeFaceFilters = (): FaceFilters => ({
  pitch: new OneEuroFilter(1.0, 0.05),
  yaw: new OneEuroFilter(1.0, 0.05),
  roll: new OneEuroFilter(1.0, 0.05),
  gazeX: new OneEuroFilter(0.8, 0.02),
  gazeY: new OneEuroFilter(0.8, 0.02),
  blinkL: new OneEuroFilter(3.0, 0.05),
  blinkR: new OneEuroFilter(3.0, 0.05),
  browL: new OneEuroFilter(1.5, 0.01),
  browR: new OneEuroFilter(1.5, 0.01),
  mouthOpen: new OneEuroFilter(1.5, 0.02),
  mouthSmile: new OneEuroFilter(1.5, 0.01),
})

/* ---------------- 방향벡터/팔/몸 필터 ---------------- */

// 방향벡터: 반응성 유지 + 지터 억제. fingers는 살짝 느리게 (BRIEF §7)
const DIR_MINCUT = 1.2
const DIR_BETA = 0.04
const FINGER_MINCUT = 0.8
const FINGER_BETA = 0.015

/**
 * Dir3 성분별 One Euro + 재정규화 (BRIEF §7: "성분 One Euro 후 재정규화").
 * 단위벡터의 성분을 따로 평활하면 길이가 1에서 벗어나므로 반드시 재정규화한다.
 * 급회전 중 순간적으로 성분 평균이 0 근처로 퇴화하면(반대 방향 블렌드)
 * 이전 출력을 유지해 NaN/스냅을 방지한다.
 */
class DirEuro {
  private readonly fx: OneEuroFilter
  private readonly fy: OneEuroFilter
  private readonly fz: OneEuroFilter
  constructor(minCutoff = DIR_MINCUT, beta = DIR_BETA) {
    this.fx = new OneEuroFilter(minCutoff, beta)
    this.fy = new OneEuroFilter(minCutoff, beta)
    this.fz = new OneEuroFilter(minCutoff, beta)
  }
  /** target을 필터링해 out에 기록 (out은 이전 출력을 보유한 재사용 객체) */
  step(target: Dir3, dt: number, out: Dir3): void {
    const x = this.fx.filter(target.x, dt)
    const y = this.fy.filter(target.y, dt)
    const z = this.fz.filter(target.z, dt)
    const l = Math.hypot(x, y, z)
    if (l > 1e-4) {
      out.x = x / l
      out.y = y / l
      out.z = z / l
    }
  }
  reset(): void {
    this.fx.reset()
    this.fy.reset()
    this.fz.reset()
  }
}

interface ArmState {
  /** 필터 적용 후 현재 출력값 (매 프레임 back 버퍼로 복사) */
  value: ArmPose
  fUpper: DirEuro
  fLower: DirEuro
  fPalm: DirEuro
  fHand: DirEuro
  fFingers: [OneEuroFilter, OneEuroFilter, OneEuroFilter, OneEuroFilter, OneEuroFilter]
  fSpread: OneEuroFilter
  /** 포즈 visibility 히스테리시스 상태 */
  visOn: boolean
  lastPoseSeenMs: number
  lastHandSeenMs: number
}

const makeArmState = (side: 'L' | 'R'): ArmState => ({
  value: neutralArm(side === 'L' ? 1 : -1),
  fUpper: new DirEuro(),
  fLower: new DirEuro(),
  fPalm: new DirEuro(),
  fHand: new DirEuro(),
  fFingers: [
    new OneEuroFilter(FINGER_MINCUT, FINGER_BETA),
    new OneEuroFilter(FINGER_MINCUT, FINGER_BETA),
    new OneEuroFilter(FINGER_MINCUT, FINGER_BETA),
    new OneEuroFilter(FINGER_MINCUT, FINGER_BETA),
    new OneEuroFilter(FINGER_MINCUT, FINGER_BETA),
  ],
  fSpread: new OneEuroFilter(FINGER_MINCUT, FINGER_BETA),
  visOn: false,
  lastPoseSeenMs: -Infinity,
  lastHandSeenMs: -Infinity,
})

interface BodyState {
  value: BodyPose
  fShrugL: OneEuroFilter
  fShrugR: OneEuroFilter
  fLeanX: OneEuroFilter
  fLeanZ: OneEuroFilter
  fTwist: OneEuroFilter
  fHip: OneEuroFilter
  fKneeL: OneEuroFilter
  fKneeR: OneEuroFilter
  visOn: boolean
  legsOn: boolean
  lastSeenMs: number
  /** shrug 기준선 (이완 상태 귀↔어깨 거리, EMA 캘리브레이션 — BRIEF §6) */
  shrugBaseL: number | null
  shrugBaseR: number | null
  /** 발목 비가시 폴백용 이미지 엉덩이 x 기준선 */
  hipBaseImg: number | null
}

const makeBodyState = (): BodyState => ({
  value: neutralBody(),
  // shrug는 빠른 제스처(beta↑), lean/twist/hip은 저속 자세 신호(지터 억제 우선)
  fShrugL: new OneEuroFilter(1.5, 0.05),
  fShrugR: new OneEuroFilter(1.5, 0.05),
  fLeanX: new OneEuroFilter(0.8, 0.02),
  fLeanZ: new OneEuroFilter(0.8, 0.02),
  fTwist: new OneEuroFilter(0.8, 0.02),
  fHip: new OneEuroFilter(0.8, 0.02),
  fKneeL: new OneEuroFilter(1.0, 0.03),
  fKneeR: new OneEuroFilter(1.0, 0.03),
  visOn: false,
  legsOn: false,
  lastSeenMs: -Infinity,
  shrugBaseL: null,
  shrugBaseR: null,
  hipBaseImg: null,
})

const resetBodyFilters = (bs: BodyState): void => {
  bs.fShrugL.reset()
  bs.fShrugR.reset()
  bs.fLeanX.reset()
  bs.fLeanZ.reset()
  bs.fTwist.reset()
  bs.fHip.reset()
  bs.fKneeL.reset()
  bs.fKneeR.reset()
}

/* ---------------- 트래커 본체 ---------------- */

export function createTracker(): Tracker {
  let faceLm: FaceLandmarker | null = null
  let handLm: HandLandmarker | null = null
  let poseLm: PoseLandmarker | null = null
  let videoEl: HTMLVideoElement | null = null
  let running = false
  let rvfcHandle = 0

  // 락 없는 더블버퍼: 콜백이 back(1-front)을 완성한 뒤 front 인덱스만 바꾼다.
  // JS는 단일 스레드라 latest() 호출자는 항상 "완성된" 프레임만 본다 —
  // 쓰다 만 프레임이 노출되지 않는 것이 목적.
  const buffers: [RigFrame, RigFrame] = [neutralFrame(), neutralFrame()]
  let front = 0

  const faceF = makeFaceFilters()
  const armStates = { L: makeArmState('L'), R: makeArmState('R') }
  const bodyState = makeBodyState()

  let frameIdx = 0
  let lastTs = 0 // mediapipe 타임스탬프 (단조 증가 보장용)
  let lastNowMs = 0
  let lastHandMs = 0
  let lastPoseMs = 0
  let lastFaceSeenMs = -Infinity
  // 최근 포즈 결과 (손 프레임에서 기저/매칭에 사용 — 포즈와 손은 교차 실행이라 ≤2프레임 차)
  let lastBasis: TorsoBasis = CAMERA_BASIS
  let lastPoseImg: ReadonlyArray<{ x: number; y: number; z: number; visibility?: number }> | null =
    null
  let lastPoseImgMs = -Infinity
  let fpsEma = 0
  let detectErrLogged = 0

  const dbg: MingoTrackingDebug = {
    fps: 0,
    lastBlendshapes: null,
    lastMatrix: null,
    lastPoseVis: null,
  }
  if (typeof window !== 'undefined') window.__mingoTracking = dbg

  const resetFaceFilters = (): void => {
    for (const f of Object.values(faceF)) f.reset()
  }

  /** prev 프레임의 얼굴 관련 필드를 back으로 복사 (미검출 프레임: 마지막 포즈 유지) */
  const copyFaceFields = (prev: RigFrame, back: RigFrame): void => {
    back.head.pitch = prev.head.pitch
    back.head.yaw = prev.head.yaw
    back.head.roll = prev.head.roll
    back.gaze.x = prev.gaze.x
    back.gaze.y = prev.gaze.y
    back.blinkL = prev.blinkL
    back.blinkR = prev.blinkR
    back.browL = prev.browL
    back.browR = prev.browR
    back.mouthOpen = prev.mouthOpen
    back.mouthSmile = prev.mouthSmile
  }

  const copyDir = (out: Dir3, v: Dir3): void => {
    out.x = v.x
    out.y = v.y
    out.z = v.z
  }

  /** 매 프레임: 팔 present 갱신 + 필터 출력값을 back 버퍼에 기록 */
  const writeArm = (out: ArmPose, st: ArmState, dt: number, nowMs: number): void => {
    // BRIEF §8: 얼굴만 잡히고 포즈 실패 시 arm.present=0 — present는 포즈 팔 체인이
    // 구동한다 (손만 검출돼도 팔 방향을 모르면 idle이 안전). 소실 0.4s 감쇠.
    const poseSeen = nowMs - st.lastPoseSeenMs < POSE_SEEN_TIMEOUT_MS && st.visOn
    st.value.present = approach(st.value.present, poseSeen ? 1 : 0, dt, PRESENT_RISE_S, PRESENT_FALL_S)
    out.present = st.value.present
    copyDir(out.upperDir, st.value.upperDir)
    copyDir(out.lowerDir, st.value.lowerDir)
    copyDir(out.palmNormal, st.value.palmNormal)
    copyDir(out.handDir, st.value.handDir)
    for (let i = 0; i < 5; i++) out.fingers[i] = st.value.fingers[i]
    out.spread = st.value.spread
    out.wave = 0 // 계약: wave는 aliveness/idle 전용 — 트래킹 중엔 0
  }

  /** 매 프레임: 몸통 present/legsPresent 갱신 + back 버퍼 기록 */
  const writeBody = (out: BodyPose, bs: BodyState, dt: number, nowMs: number): void => {
    const seen = nowMs - bs.lastSeenMs < POSE_SEEN_TIMEOUT_MS && bs.visOn
    bs.value.present = approach(bs.value.present, seen ? 1 : 0, dt, PRESENT_RISE_S, PRESENT_FALL_S)
    bs.value.legsPresent = approach(
      bs.value.legsPresent,
      seen && bs.legsOn ? 1 : 0,
      dt,
      PRESENT_RISE_S,
      PRESENT_FALL_S,
    )
    out.present = bs.value.present
    out.shrugL = bs.value.shrugL
    out.shrugR = bs.value.shrugR
    out.lean.x = bs.value.lean.x
    out.lean.z = bs.value.lean.z
    out.twist = bs.value.twist
    out.hipShift = bs.value.hipShift
    out.legsPresent = bs.value.legsPresent
    out.kneeL = bs.value.kneeL
    out.kneeR = bs.value.kneeR
  }

  const logDetectErr = (what: string, err: unknown): void => {
    if (detectErrLogged < 3) {
      detectErrLogged++
      console.error(`[tracking] ${what} detectForVideo 실패`, err)
    }
  }

  const processFrame = (nowMs: number): void => {
    if (!videoEl || !faceLm || videoEl.readyState < 2 || videoEl.videoWidth === 0) return

    const dt = lastNowMs > 0 ? clamp((nowMs - lastNowMs) / 1000, 1 / 240, 0.1) : 1 / 30
    lastNowMs = nowMs
    // mediapipe VIDEO 모드는 타임스탬프 단조 증가를 요구한다.
    // rVFC/performance.now 가 같은 ms를 반환하는 경우를 대비해 +1ms 하한 보장.
    // (세 landmarker가 같은 ts를 공유해도 각 태스크별로 단조이므로 문제없음)
    const ts = Math.max(lastTs + 1, Math.floor(nowMs))
    lastTs = ts

    const prev = buffers[front]
    const back = buffers[1 - front]

    /* ---- 부재 백오프: 10s+ 얼굴 미검출이면 검출 케이던스 다운 ----
     * lastFaceSeenMs 초기값 -Infinity는 0으로 취급 → 기동 직후에는 10s간
     * 풀케이던스로 첫 획득을 시도하고, 이후 부재가 이어지면 백오프 진입.
     * 재획득(faceSeen) 즉시 lastFaceSeenMs 갱신 → 다음 프레임부터 풀케이던스 복귀. */
    const absent = nowMs - Math.max(lastFaceSeenMs, 0) > ABSENCE_BACKOFF_MS

    /* ---- 얼굴: 매 프레임 (부재 시 1/4 케이던스 ≈7.5Hz) ---- */
    let faceSeen = false
    if (!absent || frameIdx % ABSENCE_FACE_EVERY_N === 0) try {
      const res = faceLm.detectForVideo(videoEl, ts)
      const mat = res.facialTransformationMatrixes[0]
      const bs = res.faceBlendshapes[0]
      if (mat && bs && bs.categories.length > 0) {
        faceSeen = true
        if (nowMs - lastFaceSeenMs > REACQUIRE_RESET_MS) resetFaceFilters()
        lastFaceSeenMs = nowMs

        const dec = decomposeHeadMatrix(mat.data)
        const scores: Record<string, number> = {}
        for (const c of bs.categories) scores[c.categoryName] = c.score
        const expr = mapBlendshapes(scores)

        const head = clampHeadPose({
          pitch: faceF.pitch.filter(dec.pitch, dt),
          yaw: faceF.yaw.filter(dec.yaw, dt),
          roll: faceF.roll.filter(dec.roll, dt),
        })
        back.head.pitch = head.pitch
        back.head.yaw = head.yaw
        back.head.roll = head.roll
        back.gaze.x = clamp(faceF.gazeX.filter(expr.gazeX, dt), -1, 1)
        back.gaze.y = clamp(faceF.gazeY.filter(expr.gazeY, dt), -1, 1)
        back.blinkL = clamp01(faceF.blinkL.filter(expr.blinkL, dt))
        back.blinkR = clamp01(faceF.blinkR.filter(expr.blinkR, dt))
        back.browL = clamp(faceF.browL.filter(expr.browL, dt), -1, 1)
        back.browR = clamp(faceF.browR.filter(expr.browR, dt), -1, 1)
        back.mouthOpen = clamp01(faceF.mouthOpen.filter(expr.mouthOpen, dt))
        back.mouthSmile = clamp(faceF.mouthSmile.filter(expr.mouthSmile, dt), -1, 1)

        dbg.lastMatrix = Array.from(mat.data)
        dbg.lastBlendshapes = scores
      }
    } catch (err) {
      logDetectErr('face', err)
    }
    if (!faceSeen) copyFaceFields(prev, back)
    // 미검출 시 ~0.5s에 걸쳐 tracked 감쇠, 검출 시 0.15s 상승 (BRIEF)
    back.tracked = approach(prev.tracked, faceSeen ? 1 : 0, dt, TRACKED_RISE_S, TRACKED_FALL_S)

    /* ---- 포즈: 짝수 프레임 (손과 교차 ≈15Hz — BRIEF §2), 부재 백오프 중 스킵 ---- */
    if (poseLm && !absent && frameIdx % 2 === 0) {
      const poseDt = lastPoseMs > 0 ? clamp((nowMs - lastPoseMs) / 1000, 1 / 120, 0.2) : 2 / 30
      lastPoseMs = nowMs
      try {
        const res = poseLm.detectForVideo(videoEl, ts)
        const world = res.worldLandmarks[0] // 미터 단위 3D (BRIEF: 화면좌표 아님)
        const img = res.landmarks[0]
        if (world && world.length >= 33) {
          if (img && img.length >= 33) {
            lastPoseImg = img
            lastPoseImgMs = nowMs
          }
          // 몸통 기저: 어깨라인 + 월드 위 그람-슈미트 (math.ts). 퇴화 시 카메라 기저.
          lastBasis = torsoBasisFromPose(world) ?? CAMERA_BASIS

          /* -- 팔 체인 (BRIEF §8: 팔은 pose 기준) -- */
          for (const side of ['L', 'R'] as const) {
            const st = armStates[side]
            const ad = armDirsFromPose(world, lastBasis, side)
            st.visOn = hysteresis(st.visOn, ad?.vis ?? 0, ARM_VIS_ENTER, ARM_VIS_KEEP)
            if (ad && st.visOn) {
              if (nowMs - st.lastPoseSeenMs > REACQUIRE_RESET_MS) {
                st.fUpper.reset()
                st.fLower.reset()
              }
              st.lastPoseSeenMs = nowMs
              st.fUpper.step(ad.upperDir, poseDt, st.value.upperDir)
              st.fLower.step(ad.lowerDir, poseDt, st.value.lowerDir)
            }
          }
          dbg.lastPoseVis = {
            armL: armDirsFromPose(world, lastBasis, 'L')?.vis ?? 0,
            armR: armDirsFromPose(world, lastBasis, 'R')?.vis ?? 0,
            body: Math.min(world[11].visibility ?? 0, world[12].visibility ?? 0),
            legs: Math.min(world[25].visibility ?? 0, world[26].visibility ?? 0),
          }

          /* -- 몸통/하체 -- */
          const raw = bodyRawFromPose(world, img ?? null, lastBasis)
          const bst = bodyState
          bst.visOn = hysteresis(bst.visOn, raw?.visBody ?? 0, BODY_VIS_ENTER, BODY_VIS_KEEP)
          if (raw && bst.visOn) {
            // 필터만 리셋, shrug/hip 기준선은 유지 (캘리브레이션은 세션 자산)
            if (nowMs - bst.lastSeenMs > REACQUIRE_RESET_MS) resetBodyFilters(bst)
            bst.lastSeenMs = nowMs

            // shrug: 기준선(이완 거리) 엔벨로프 EMA 대비 감소량 (BRIEF §6)
            if (raw.earShoulderL != null) {
              bst.shrugBaseL =
                bst.shrugBaseL == null
                  ? raw.earShoulderL
                  : envelopeStep(
                      bst.shrugBaseL,
                      raw.earShoulderL,
                      poseDt,
                      BODY_TUNING.shrugBaseRiseTau,
                      BODY_TUNING.shrugBaseFallTau,
                    )
              bst.value.shrugL = clamp01(
                bst.fShrugL.filter(shrugFrom(raw.earShoulderL, bst.shrugBaseL), poseDt),
              )
            }
            if (raw.earShoulderR != null) {
              bst.shrugBaseR =
                bst.shrugBaseR == null
                  ? raw.earShoulderR
                  : envelopeStep(
                      bst.shrugBaseR,
                      raw.earShoulderR,
                      poseDt,
                      BODY_TUNING.shrugBaseRiseTau,
                      BODY_TUNING.shrugBaseFallTau,
                    )
              bst.value.shrugR = clamp01(
                bst.fShrugR.filter(shrugFrom(raw.earShoulderR, bst.shrugBaseR), poseDt),
              )
            }

            bst.value.lean.x = clamp(
              bst.fLeanX.filter(raw.leanX, poseDt),
              -BODY_TUNING.leanXClamp,
              BODY_TUNING.leanXClamp,
            )
            if (raw.leanZ != null)
              bst.value.lean.z = clamp(
                bst.fLeanZ.filter(raw.leanZ, poseDt),
                -BODY_TUNING.leanZClamp,
                BODY_TUNING.leanZClamp,
              )
            if (raw.twist != null)
              bst.value.twist = clamp(
                bst.fTwist.filter(raw.twist, poseDt),
                -BODY_TUNING.twistClamp,
                BODY_TUNING.twistClamp,
              )

            // 다리: visibility 히스테리시스 게이팅 (BRIEF §6)
            bst.legsOn = hysteresis(bst.legsOn, raw.visLegs, LEGS_VIS_ENTER, LEGS_VIS_KEEP)
            if (bst.legsOn) {
              if (raw.kneeL != null)
                bst.value.kneeL = clamp01(
                  bst.fKneeL.filter(clamp01(raw.kneeL / BODY_TUNING.kneeFullRad), poseDt),
                )
              if (raw.kneeR != null)
                bst.value.kneeR = clamp01(
                  bst.fKneeR.filter(clamp01(raw.kneeR / BODY_TUNING.kneeFullRad), poseDt),
                )
            }

            // 체중 이동: 발목 기준(절대 기하) 우선, 발목 비가시면 이미지 기준선 폴백
            if (raw.hipShiftWorld != null) {
              bst.value.hipShift = clamp(bst.fHip.filter(raw.hipShiftWorld, poseDt), -1, 1)
            } else if (
              raw.hipCxImg != null &&
              raw.shoulderWImg != null &&
              raw.shoulderWImg > 1e-3
            ) {
              bst.hipBaseImg =
                bst.hipBaseImg == null
                  ? raw.hipCxImg
                  : emaStep(bst.hipBaseImg, raw.hipCxImg, poseDt, BODY_TUNING.hipImgBaseTau)
              // 부호: 이미지 x는 사용자 왼쪽+ → 오른발 체중(사용자 오른쪽 이동)=-dev
              //       → hipShift=+1(캐릭터 왼발) 이 되도록 -dev (math.ts hipShift 유도 참조)
              const dev = raw.hipCxImg - bst.hipBaseImg
              bst.value.hipShift = clamp(
                bst.fHip.filter(-dev / (BODY_TUNING.hipShiftImgFrac * raw.shoulderWImg), poseDt),
                -1,
                1,
              )
            }
          }
        }
      } catch (err) {
        logDetectErr('pose', err)
      }
    }

    /* ---- 손: 홀수 프레임 (포즈와 교차 — BRIEF §2), 부재 백오프 중 스킵 ---- */
    if (handLm && !absent && frameIdx % 2 === 1) {
      const handDt = lastHandMs > 0 ? clamp((nowMs - lastHandMs) / 1000, 1 / 120, 0.2) : 2 / 30
      lastHandMs = nowMs
      try {
        const res = handLm.detectForVideo(videoEl, ts)
        const claimed = new Set<'L' | 'R'>()
        const poseImgFresh =
          lastPoseImg && nowMs - lastPoseImgMs < POSE_IMG_FRESH_MS ? lastPoseImg : null
        for (let i = 0; i < res.landmarks.length; i++) {
          const cat = res.handedness[i]?.[0]
          const img = res.landmarks[i]
          const world = res.worldLandmarks[i]
          if (!cat || !img || img.length < 21 || !world || world.length < 21) continue
          // 라벨 → 팔 매핑: 라벨 이중반전('Left'→armL — math.ts associateHandSide 주석)
          // + 포즈 손목 근접 매칭이 가능하면 그쪽을 우선 (라벨 오분류 방어)
          const labelSide: 'L' | 'R' = cat.categoryName === 'Left' ? 'L' : 'R'
          const side = associateHandSide(img[0], poseImgFresh, labelSide)
          if (claimed.has(side)) continue // 동일 사이드 중복 검출 방지
          const st = armStates[side]
          // 신뢰도 게이팅 + 히스테리시스: 신규 등장 0.7, 최근 보이던 손 유지 0.5
          const gate =
            nowMs - st.lastHandSeenMs < HAND_SEEN_TIMEOUT_MS ? HAND_SCORE_KEEP : HAND_SCORE_ENTER
          if (cat.score < gate) continue
          claimed.add(side)
          if (nowMs - st.lastHandSeenMs > REACQUIRE_RESET_MS) {
            st.fPalm.reset()
            st.fHand.reset()
            for (const f of st.fFingers) f.reset()
            st.fSpread.reset()
          }
          st.lastHandSeenMs = nowMs

          // 캐릭터 사이드 → 실제 사용자 손 (손은 항상 자기 팔에 붙어 있으므로
          // 매칭 결과와 해부학이 일치: 캐릭터 L = 사용자 오른손 'R')
          const userHand: 'L' | 'R' = side === 'L' ? 'R' : 'L'
          // 손 자세는 hand worldLandmarks 기준 (BRIEF §4 — 손목 위치 불일치와 무관)
          const orient = handOrientFromWorld(world, lastBasis, userHand)
          if (orient) {
            st.fHand.step(orient.handDir, handDt, st.value.handDir)
            st.fPalm.step(orient.palmNormal, handDt, st.value.palmNormal)
            // 성분 필터로 흐트러진 palmNormal⊥handDir 직교성 복구
            const pn = orthonormalizePalm(st.value.handDir, st.value.palmNormal)
            if (pn) copyDir(st.value.palmNormal, pn)
          }
          const curls = fingerCurls(world)
          if (curls)
            for (let k = 0; k < 5; k++)
              st.value.fingers[k] = clamp01(st.fFingers[k].filter(curls[k], handDt))
          const sp = fingerSpread(world)
          if (sp != null) st.value.spread = clamp01(st.fSpread.filter(sp, handDt))
        }
      } catch (err) {
        logDetectErr('hand', err)
      }
    }

    /* ---- 매 프레임: 팔/몸 상태 → back 버퍼 (present 감쇠 포함) ---- */
    writeArm(back.armL, armStates.L, dt, nowMs)
    writeArm(back.armR, armStates.R, dt, nowMs)
    writeBody(back.body, bodyState, dt, nowMs)

    /* ---- 트래킹이 만들지 않는 필드는 중립 유지 (aliveness가 채움) ---- */
    back.fx.heart = false
    back.fx.happy = false
    back.fx.sweat = false
    back.fx.anger = false
    back.breath = 0

    // 완성된 back을 원자적으로 공개 (인덱스 교체만)
    front = 1 - front
    frameIdx++

    fpsEma = fpsEma === 0 ? 1 / dt : fpsEma + (1 / dt - fpsEma) * 0.1
    dbg.fps = Math.round(fpsEma * 10) / 10
  }

  const scheduleLoop = (): void => {
    if (!videoEl || !running) return
    rvfcHandle = videoEl.requestVideoFrameCallback((now) => {
      if (!running) return
      processFrame(now)
      scheduleLoop()
    })
  }

  return {
    async start(video: HTMLVideoElement): Promise<void> {
      if (running) return
      try {
        // 에셋은 전부 로컬 (네트워크 금지 — BRIEF): ./wasm, ./models/*.task
        const fileset = await FilesetResolver.forVisionTasks('./wasm')

        const makeFace = (delegate: 'GPU' | 'CPU') =>
          FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: './models/face_landmarker.task', delegate },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
          })
        const makeHand = (delegate: 'GPU' | 'CPU') =>
          HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: './models/hand_landmarker.task', delegate },
            runningMode: 'VIDEO',
            numHands: 2,
          })
        const makePose = (delegate: 'GPU' | 'CPU') =>
          PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: './models/pose_landmarker.task', delegate },
            runningMode: 'VIDEO',
            numPoses: 1,
          })

        // GPU 우선, 실패 시 CPU 폴백 (초기화는 직렬 — GPU 컨텍스트 경합 회피)
        try {
          faceLm = await makeFace('GPU')
        } catch (e) {
          console.warn('[tracking] FaceLandmarker GPU 델리게이트 실패 → CPU 폴백', e)
          faceLm = await makeFace('CPU')
        }
        try {
          handLm = await makeHand('GPU')
        } catch (e) {
          console.warn('[tracking] HandLandmarker GPU 델리게이트 실패 → CPU 폴백', e)
          handLm = await makeHand('CPU')
        }
        try {
          poseLm = await makePose('GPU')
        } catch (e) {
          console.warn('[tracking] PoseLandmarker GPU 델리게이트 실패 → CPU 폴백', e)
          poseLm = await makePose('CPU')
        }
      } catch (err) {
        console.error(
          '[tracking] mediapipe 초기화 실패 — ./wasm 및 ./models/*.task 경로/파일 확인',
          err,
        )
        faceLm?.close()
        handLm?.close()
        poseLm?.close()
        faceLm = null
        handLm = null
        poseLm = null
        throw new Error(
          'tracking init failed: ' + (err instanceof Error ? err.message : String(err)),
          { cause: err },
        )
      }

      videoEl = video
      running = true
      scheduleLoop()
    },

    stop(): void {
      running = false
      if (videoEl && rvfcHandle !== 0) {
        videoEl.cancelVideoFrameCallback(rvfcHandle)
        rvfcHandle = 0
      }
      faceLm?.close()
      handLm?.close()
      poseLm?.close()
      faceLm = null
      handLm = null
      poseLm = null
      videoEl = null
    },

    latest(): RigFrame {
      return buffers[front]
    },
  }
}
