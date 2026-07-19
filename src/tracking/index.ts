/**
 * src/tracking/index.ts — MediaPipe Tasks(FaceLandmarker + HandLandmarker) 웹캠 트래커.
 *
 * 계약: createTracker(): Tracker (src/contract.ts)
 * 파이프라인: rVFC 루프 → detectForVideo → (순수 함수 math.ts로 분해/매핑)
 *             → One Euro 필터 → 더블버퍼 RigFrame → latest()
 *
 * 수학(행렬 분해·블렌드셰이프 매핑·intent 계산)은 전부 src/tracking/math.ts 의
 * 순수 함수에 있고, 이 파일은 I/O·스케줄링·상태 관리만 담당한다.
 */
import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import type { RigFrame, Tracker, WingPose } from '../contract'
import { neutralFrame } from '../contract'
import { OneEuroFilter } from './oneEuro'
import {
  approach,
  clamp,
  clamp01,
  clampHeadPose,
  computeWingIntents,
  decomposeHeadMatrix,
  DEFAULT_FACE_REF,
  faceRefFromLandmarks,
  initialWaveState,
  mapBlendshapes,
  waveStep,
  type FaceRef,
  type WaveState,
} from './math'

/* ---------------- 튜닝 상수 (README 참조) ---------------- */

// tracked: 얼굴 재검출 시 0.15s에 걸쳐 상승, 미검출 시 0.5s에 걸쳐 감쇠 (BRIEF)
const TRACKED_RISE_S = 0.15
const TRACKED_FALL_S = 0.5
// present: 등장 0.12s, 소실 0.4s 감쇠 (BRIEF: 스냅 금지)
const PRESENT_RISE_S = 0.12
const PRESENT_FALL_S = 0.4
// 손은 격프레임(≈15Hz) 실행이라 2~3프레임 미검출은 소실로 치지 않는다
const HAND_SEEN_TIMEOUT_MS = 300
// 이 시간 이상 소실 후 재획득이면 필터 리셋 (One Euro 미분 스파이크 방지)
const REACQUIRE_RESET_MS = 1000
// handedness 신뢰도 게이팅 + 히스테리시스 (BRIEF)
const PRESENT_ENTER_SCORE = 0.7
const PRESENT_KEEP_SCORE = 0.5
// 부재(absence) 백오프: 이 시간 이상 얼굴 미검출이면 상주 앱 CPU 절감 모드 —
// 얼굴 검출을 1/4 케이던스(≈7.5Hz)로 낮추고 손 검출은 완전 스킵.
// (손 intent는 얼굴 참조계 기반이라 얼굴 없이는 어차피 부정확)
const ABSENCE_BACKOFF_MS = 10_000
// 백오프 중 얼굴 검출 실행 주기 (frameIdx % N === 0)
const ABSENCE_FACE_EVERY_N = 4

/* ---------------- 디버그 훅 ---------------- */

export interface MingoTrackingDebug {
  fps: number
  lastBlendshapes: Record<string, number> | null
  lastMatrix: number[] | null
}

declare global {
  interface Window {
    __mingoTracking?: MingoTrackingDebug
  }
}

/* ---------------- 내부 상태 타입 ---------------- */

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

/** 날개 intent 필터: 손 랜드마크는 지터가 크므로 minCutoff ↓ (0.5) — 부드럽게 (BRIEF) */
interface WingFilters {
  raise: OneEuroFilter
  out: OneEuroFilter
  curl: OneEuroFilter
  spread: OneEuroFilter
  wave: OneEuroFilter
}

const makeWingFilters = (): WingFilters => ({
  raise: new OneEuroFilter(0.5, 0.007),
  out: new OneEuroFilter(0.5, 0.007),
  curl: new OneEuroFilter(0.5, 0.007),
  spread: new OneEuroFilter(0.5, 0.007),
  wave: new OneEuroFilter(0.5, 0.007),
})

interface WingState {
  /** 필터 적용 후 현재 출력값 (매 프레임 back 버퍼로 복사) */
  value: WingPose
  filters: WingFilters
  waveState: WaveState
  lastSeenMs: number
}

const makeWingState = (): WingState => ({
  value: { present: 0, raise: 0, out: 0, curl: 0.35, spread: 0.2, wave: 0 },
  filters: makeWingFilters(),
  waveState: initialWaveState(),
  lastSeenMs: -Infinity,
})

/* ---------------- 트래커 본체 ---------------- */

export function createTracker(): Tracker {
  let faceLm: FaceLandmarker | null = null
  let handLm: HandLandmarker | null = null
  let videoEl: HTMLVideoElement | null = null
  let running = false
  let rvfcHandle = 0

  // 락 없는 더블버퍼: 콜백이 back(1-front)을 완성한 뒤 front 인덱스만 바꾼다.
  // JS는 단일 스레드라 latest() 호출자는 항상 "완성된" 프레임만 본다 —
  // 쓰다 만 프레임이 노출되지 않는 것이 목적.
  const buffers: [RigFrame, RigFrame] = [neutralFrame(), neutralFrame()]
  let front = 0

  const faceF = makeFaceFilters()
  const wingStates = { L: makeWingState(), R: makeWingState() }

  let frameIdx = 0
  let lastTs = 0 // mediapipe 타임스탬프 (단조 증가 보장용)
  let lastNowMs = 0
  let lastHandMs = 0
  let lastFaceSeenMs = -Infinity
  let faceRef: FaceRef = DEFAULT_FACE_REF
  let fpsEma = 0
  let detectErrLogged = 0

  const dbg: MingoTrackingDebug = { fps: 0, lastBlendshapes: null, lastMatrix: null }
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

  /** 매 프레임: 날개 상태(등장/감쇠) 갱신 후 back 버퍼에 기록 */
  const writeWing = (out: WingPose, st: WingState, dt: number, nowMs: number): void => {
    const seenRecently = nowMs - st.lastSeenMs < HAND_SEEN_TIMEOUT_MS
    // 소실 시 ~0.4s에 걸쳐 present 감쇠 (스냅 금지 — BRIEF)
    st.value.present = approach(
      st.value.present,
      seenRecently ? 1 : 0,
      dt,
      PRESENT_RISE_S,
      PRESENT_FALL_S,
    )
    if (!seenRecently) {
      // wave는 진동 구동값이라 손이 사라지면 함께 감쇠 (나머지 intent는 유지 —
      // 계약상 present→0 이면 모델이 idle 포즈로 복귀시키므로 값 유지가 안전)
      st.value.wave = approach(st.value.wave, 0, dt, PRESENT_RISE_S, PRESENT_FALL_S)
      if (nowMs - st.lastSeenMs > REACQUIRE_RESET_MS) {
        st.waveState = initialWaveState()
        for (const f of Object.values(st.filters)) f.reset()
      }
    }
    out.present = st.value.present
    out.raise = st.value.raise
    out.out = st.value.out
    out.curl = st.value.curl
    out.spread = st.value.spread
    out.wave = st.value.wave
  }

  const processFrame = (nowMs: number): void => {
    if (!videoEl || !faceLm || videoEl.readyState < 2 || videoEl.videoWidth === 0) return

    const dt = lastNowMs > 0 ? clamp((nowMs - lastNowMs) / 1000, 1 / 240, 0.1) : 1 / 30
    lastNowMs = nowMs
    // mediapipe VIDEO 모드는 타임스탬프 단조 증가를 요구한다.
    // rVFC/performance.now 가 같은 ms를 반환하는 경우를 대비해 +1ms 하한 보장.
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

        // 손 정규화용 얼굴 참조계 갱신
        const lm = res.faceLandmarks[0]
        if (lm) faceRef = faceRefFromLandmarks(lm) ?? faceRef

        dbg.lastMatrix = Array.from(mat.data)
        dbg.lastBlendshapes = scores
      }
    } catch (err) {
      if (detectErrLogged < 3) {
        detectErrLogged++
        console.error('[tracking] face detectForVideo 실패', err)
      }
    }
    if (!faceSeen) copyFaceFields(prev, back)
    // 미검출 시 ~0.5s에 걸쳐 tracked 감쇠, 검출 시 0.15s 상승 (BRIEF)
    back.tracked = approach(prev.tracked, faceSeen ? 1 : 0, dt, TRACKED_RISE_S, TRACKED_FALL_S)

    /* ---- 손: 격프레임 (부하 절감 — BRIEF 허용), 부재 백오프 중엔 완전 스킵 ---- */
    if (handLm && !absent && frameIdx % 2 === 1) {
      const handDt = lastHandMs > 0 ? clamp((nowMs - lastHandMs) / 1000, 1 / 120, 0.2) : 2 / 30
      lastHandMs = nowMs
      try {
        const res = handLm.detectForVideo(videoEl, ts)
        const claimed = new Set<'L' | 'R'>()
        for (let i = 0; i < res.landmarks.length; i++) {
          const cat = res.handedness[i]?.[0]
          const lm = res.landmarks[i]
          if (!cat || !lm || lm.length < 21) continue
          // 라벨 → 날개 매핑 (이중 반전 = 원위치):
          //  (1) Tasks 문서: handedness는 셀피(좌우 반전) 입력을 가정하고 예측된다.
          //      우리 <video>는 무반전 원본 피드 → 라벨을 한 번 스왑해야 실제 손.
          //      즉 라벨 'Left' = 사용자의 실제 오른손.
          //  (2) 거울 매핑(계약): 사용자 오른손 → 캐릭터 왼날개(wingL).
          //  (1)×(2) 두 번 뒤집혀 결국 라벨 'Left' → wingL, 'Right' → wingR.
          //  (틀렸다면 여기 한 곳만 뒤집으면 됨 — README '알려진 한계' 참조)
          const side: 'L' | 'R' = cat.categoryName === 'Left' ? 'L' : 'R'
          if (claimed.has(side)) continue // 동일 라벨 중복 검출 방지
          const st = wingStates[side]
          // 신뢰도 게이팅 + 히스테리시스: 신규 등장 0.7, 이미 보이는 손 유지 0.5
          const gate = st.value.present > 0.3 ? PRESENT_KEEP_SCORE : PRESENT_ENTER_SCORE
          if (cat.score < gate) continue
          claimed.add(side)
          st.lastSeenMs = nowMs

          const geom = computeWingIntents(lm, faceRef)
          const wv = waveStep(st.waveState, lm[0].x, handDt)
          st.waveState = wv.state
          st.value.raise = clamp01(st.filters.raise.filter(geom.raise, handDt))
          st.value.out = clamp01(st.filters.out.filter(geom.out, handDt))
          st.value.curl = clamp01(st.filters.curl.filter(geom.curl, handDt))
          st.value.spread = clamp01(st.filters.spread.filter(geom.spread, handDt))
          st.value.wave = clamp01(st.filters.wave.filter(wv.wave, handDt))
        }
      } catch (err) {
        if (detectErrLogged < 3) {
          detectErrLogged++
          console.error('[tracking] hand detectForVideo 실패', err)
        }
      }
    }
    writeWing(back.wingL, wingStates.L, dt, nowMs)
    writeWing(back.wingR, wingStates.R, dt, nowMs)

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
      } catch (err) {
        console.error(
          '[tracking] mediapipe 초기화 실패 — ./wasm 및 ./models/*.task 경로/파일 확인',
          err,
        )
        faceLm?.close()
        handLm?.close()
        faceLm = null
        handLm = null
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
      faceLm = null
      handLm = null
      videoEl = null
    },

    latest(): RigFrame {
      return buffers[front]
    },
  }
}
