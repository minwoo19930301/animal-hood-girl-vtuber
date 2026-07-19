/**
 * src/tracking/math.ts — 트래킹 수학 전부를 모은 순수 함수 모듈.
 * DOM/웹캠/mediapipe 런타임 의존이 전혀 없어 이 파일만으로 코드 리뷰/단위 검증이 가능하다.
 * (웹캠 실행이 불가능한 환경에서 작성되었으므로, 부호 근거를 전부 주석으로 남긴다.)
 */
import type { HeadPose } from '../contract'

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v))
export const clamp01 = (v: number): number => clamp(v, 0, 1)

/* ======================================================================
 * 1) 얼굴 변환행렬 → HeadPose (계약 부호, 거울 모드)
 * ====================================================================== */

export interface HeadDecomposition extends HeadPose {
  /** 평행이동(카메라 공간, cm). 얼굴이 카메라 앞에 있으면 tz는 음수(≈ -25 ~ -60) */
  tx: number
  ty: number
  tz: number
  /** 자동 판별된 행렬 저장 순서 (디버그/검증용) */
  layout: 'column-major' | 'row-major'
}

/**
 * MediaPipe facialTransformationMatrixes[0].data (4×4) → pitch/yaw/roll 분해.
 *
 * ── 좌표계 근거 (MediaPipe Face Geometry 문서) ──────────────────────────
 *  - 카메라 공간은 오른손 좌표계. 가상 카메라가 원점에서 -Z 방향을 본다.
 *    → 얼굴은 -Z 영역, 평행이동 z는 음수 cm (공식 데모에서 data[14] ≈ -30 관측).
 *  - +X = 카메라 이미지의 오른쪽, +Y = 위.
 *    사용자는 카메라를 마주보므로 "이미지 오른쪽" = 사용자의 해부학적 왼쪽.
 *  - canonical face model은 +Z(카메라 쪽)를 향한다 → 정면 응시 시 회전은 항등.
 *
 * ── 저장 순서 (column-major 가정 + 런타임 자동 검증) ─────────────────────
 *  MatrixData proto의 기본 layout은 COLUMN_MAJOR이고, tasks-vision JS 번들은
 *  proto의 rows/cols/packed data를 그대로 복사한다(레이아웃 변환 없음 — 번들
 *  소스 확인). 공식 데모가 three.js `Matrix4.fromArray(data)`(column-major
 *  해석)를 그대로 쓰는 것과도 일치한다.
 *  검증 논리: 동차행렬의 마지막 행은 (0,0,0,1)이다.
 *    - column-major라면 data[3],[7],[11] = 0, 평행이동(수십 cm)은 data[12..14].
 *    - row-major라면 반대.
 *  잘못 읽으면 회전부가 전치(=역회전)되어 **모든 각의 부호가 뒤집히므로**,
 *  두 슬롯의 크기를 비교해 layout을 자동 판별한다(순수·결정적이라 테스트 가능).
 *
 * ── 분해식: R = Ry(θ)·Rx(φ)·Rz(ψ) (내재적 yaw→pitch→roll) ──────────────
 *  전개하면
 *    row1col2 = -sinφ
 *    row0col2 = sinθ·cosφ,  row2col2 = cosθ·cosφ  → θ = atan2(r02, r22)
 *    row1col0 = cosφ·sinψ,  row1col1 = cosφ·cosψ  → ψ = atan2(r10, r11)
 *  |φ|→90°에서 θ/ψ가 퇴화(짐벌)하지만 웹캠 머리 포즈에서는 도달 불가.
 *
 * ── 부호 → 계약 매핑 (거울 모드) ────────────────────────────────────────
 *  · pitch: Rx(+φ)는 코 벡터 (0,0,1)을 (0,-sinφ,cosφ)로 보낸다 → +φ = 코가
 *    아래(-Y). 사용자가 위를 보면 φ<0. 계약은 +pitch=위 → pitch = -φ = asin(r12).
 *    거울(x축 반전)은 상하에 영향 없음.
 *  · yaw: Ry(+θ)는 코를 +X(이미지 오른쪽 = 사용자의 왼쪽)로 돌린다.
 *    사용자가 자기 오른쪽을 보면 θ<0. 거울 모드 요구: 사용자가 오른쪽을 보면
 *    캐릭터는 화면상 뷰어 오른쪽 = 계약 +yaw(캐릭터 자기 왼쪽) → yaw = -θ.
 *  · roll: Rz(+ψ)는 정수리 벡터 (0,1,0)을 (-sinψ,cosψ,0)로 보낸다 → +ψ = 정수리가
 *    이미지 왼쪽(-X) = 사용자가 자기 오른쪽 어깨 쪽으로 기움. 거울에서 반사상은
 *    방의 같은 쪽(사용자 오른쪽 = 화면상 뷰어 오른쪽 = 캐릭터의 왼쪽)으로 기운다
 *    = 계약 +roll → roll = +ψ (부호 유지).
 *    ※ 거울이 yaw는 뒤집는데 roll은 유지하는 이유: 반사는 회전의 카이랄리티
 *    (시계/반시계)를 뒤집고, "캐릭터 기준 왼쪽" 정의 역시 뒤집혀서 상쇄된다.
 */
export function decomposeHeadMatrix(data: ArrayLike<number>): HeadDecomposition {
  // layout 자동 판별: 평행이동이 실린 슬롯이 어느 쪽인지 크기로 비교
  const colT = Math.abs(data[12]) + Math.abs(data[13]) + Math.abs(data[14])
  const rowT = Math.abs(data[3]) + Math.abs(data[7]) + Math.abs(data[11])
  const isCol = colT >= rowT
  /** (row i, col j) 원소 접근 */
  const m = (i: number, j: number): number => (isCol ? data[j * 4 + i] : data[i * 4 + j])

  const r02 = m(0, 2)
  const r10 = m(1, 0)
  const r11 = m(1, 1)
  const r12 = m(1, 2)
  const r22 = m(2, 2)

  const phi = Math.asin(-clamp(r12, -1, 1)) // 카메라 X축 회전. +φ = 코가 아래로
  const theta = Math.atan2(r02, r22) //         카메라 Y축 회전. +θ = 코가 이미지 오른쪽
  const psi = Math.atan2(r10, r11) //           카메라 Z축 회전. +ψ = 정수리가 이미지 왼쪽

  return {
    pitch: -phi, // 계약: +pitch = 위를 봄
    yaw: -theta, // 계약(거울): 사용자가 자기 오른쪽을 보면 +yaw
    roll: psi, //   계약(거울): 사용자가 자기 오른쪽으로 기울면 +roll
    tx: isCol ? data[12] : data[3],
    ty: isCol ? data[13] : data[7],
    tz: isCol ? data[14] : data[11],
    layout: isCol ? 'column-major' : 'row-major',
  }
}

/** 계약 권장 범위로 클램프 (contract.ts HeadPose 주석) */
export function clampHeadPose(p: HeadPose): HeadPose {
  return {
    pitch: clamp(p.pitch, -0.6, 0.6),
    yaw: clamp(p.yaw, -0.7, 0.7),
    roll: clamp(p.roll, -0.5, 0.5),
  }
}

/* ======================================================================
 * 2) 블렌드셰이프(ARKit 52) → 표정 채널 (거울 매핑)
 * ====================================================================== */

export interface FaceExpr {
  blinkL: number
  blinkR: number
  browL: number
  browR: number
  mouthOpen: number
  mouthSmile: number
  gazeX: number
  /** +위 (head.pitch 계약 부호와 동일 방향으로 통일) */
  gazeY: number
}

/**
 * 블렌드셰이프 이름의 Left/Right는 **사용자의 해부학적 좌우**다 (ARKit 규약).
 * 거울 모드: 화면 속 캐릭터는 거울상이므로 사용자의 왼눈이 캐릭터의 오른눈을 구동한다.
 *
 * 시선 부호 근거: 사용자가 자기 오른쪽을 보면 왼눈은 In(코 쪽), 오른눈은 Out.
 * 거울에서는 반사상도 화면상 뷰어 오른쪽을 보므로 → +x (yaw 계약과 동일 방향).
 */
export function mapBlendshapes(scores: Readonly<Record<string, number>>): FaceExpr {
  const g = (name: string): number => scores[name] ?? 0
  // 눈: 사용자 오른눈 → 캐릭터 왼눈 (거울)
  const blinkL = clamp01(g('eyeBlinkRight'))
  const blinkR = clamp01(g('eyeBlinkLeft'))
  // 눈썹: 올림(browInnerUp은 좌우 공통 + 바깥 올림) - 찌푸림(browDown) → -1..1
  const browL = clamp(Math.max(g('browInnerUp'), g('browOuterUpRight')) - g('browDownRight'), -1, 1)
  const browR = clamp(Math.max(g('browInnerUp'), g('browOuterUpLeft')) - g('browDownLeft'), -1, 1)
  // 입
  const mouthOpen = clamp01(g('jawOpen'))
  const mouthSmile = clamp(
    (g('mouthSmileLeft') + g('mouthSmileRight')) / 2 -
      (g('mouthFrownLeft') + g('mouthFrownRight')) / 2,
    -1,
    1,
  )
  // 시선 (거울: 사용자 오른쪽 응시 = +x)
  const userLooksRight = (g('eyeLookInLeft') + g('eyeLookOutRight')) / 2
  const userLooksLeft = (g('eyeLookOutLeft') + g('eyeLookInRight')) / 2
  const gazeX = clamp(userLooksRight - userLooksLeft, -1, 1)
  const gazeY = clamp(
    (g('eyeLookUpLeft') + g('eyeLookUpRight')) / 2 -
      (g('eyeLookDownLeft') + g('eyeLookDownRight')) / 2,
    -1,
    1,
  )
  return { blinkL, blinkR, browL, browR, mouthOpen, mouthSmile, gazeX, gazeY }
}

/* ======================================================================
 * 3) 얼굴 기준 프레임 (손 intent 정규화용)
 * ====================================================================== */

export interface Pt {
  x: number
  y: number
}

/** 손 랜드마크 정규화의 기준이 되는 얼굴 참조계 (정규화 이미지 좌표, y는 아래로 증가) */
export interface FaceRef {
  /** 얼굴 중심(코끝) x */
  cx: number
  /** 얼굴 중심(코끝) y */
  cy: number
  /** 턱 끝 y */
  chinY: number
  /** 얼굴 세로 높이 (이마 상단 #10 ↔ 턱 #152) */
  faceH: number
}

/** 얼굴 미검출 시 폴백: 640×480 프레임 상단 중앙에 평균 크기 얼굴 가정 */
export const DEFAULT_FACE_REF: FaceRef = { cx: 0.5, cy: 0.4, chinY: 0.55, faceH: 0.28 }

/**
 * FaceLandmarker 468 랜드마크에서 참조계 추출.
 * 인덱스 근거(공식 face mesh 토폴로지): 1=코끝, 10=이마 상단 중앙, 152=턱 끝.
 */
export function faceRefFromLandmarks(lm: ReadonlyArray<Pt>): FaceRef | null {
  if (lm.length < 153) return null
  const faceH = Math.abs(lm[152].y - lm[10].y)
  if (!(faceH > 1e-4)) return null
  return { cx: lm[1].x, cy: lm[1].y, chinY: lm[152].y, faceH }
}

/* ======================================================================
 * 4) 손 21 랜드마크 → 날개 intent (순수 기하)
 * ====================================================================== */

/** MediaPipe Hands 21 랜드마크 인덱스 (공식 토폴로지) */
export const HAND = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_TIP: 20,
} as const

/** 튜닝 상수 — 전부 얼굴높이(faceH)/손크기 비율 기반이라 카메라 거리에 대체로 불변 */
export const HAND_TUNING = {
  /** 어깨선 근사: 턱 아래로 얼굴높이 × 이 값 */
  shoulderDropFaceH: 0.9,
  /** raise가 0→1이 되는 손목 상승 범위 (얼굴높이 배수). 어깨=0, 눈높이 위≈1 */
  raiseRangeFaceH: 1.6,
  /** out 데드존: 몸 중심축에서 이 거리(faceH 배수)까지는 0 (몸통 폭 근사) */
  outDeadzoneFaceH: 0.5,
  /** out이 0→1이 되는 수평 범위 (faceH 배수) */
  outRangeFaceH: 1.4,
  /** curl: 손끝-손바닥중심 평균거리/손크기 비율 — 완전히 편 손 */
  curlOpenRatio: 1.15,
  /** curl: 주먹 쥔 손의 비율 */
  curlFistRatio: 0.45,
  /** spread: 검지-약지 "방향(MCP→끝)" 각(rad)의 하한(모음, 거의 평행) / 상한(활짝 벌림) */
  spreadMinRad: 0.1,
  spreadMaxRad: 0.55,
  /** wave가 1이 되는 손목 수평 속도 (정규화 화면폭/초) */
  waveFullSpeed: 1.0,
  /** |vx| EMA 시간상수 (초) — 좌우 왕복의 부호 상쇄 없이 "흔드는 세기"만 남긴다 */
  waveTau: 0.25,
} as const

export interface WingIntentsGeom {
  raise: number
  out: number
  curl: number
  spread: number
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * 사람 손 → 새 날개 "의도" 번역 (wave 제외 — wave는 속도 상태가 필요해서 waveStep으로 분리).
 * 좌표는 정규화 이미지 좌표(0..1, y 아래로 증가) 기준.
 * ※ x/y 정규화 단위가 픽셀 종횡비(4:3)만큼 다르지만, 모든 값이 클램프되는
 *   휴리스틱이라 실용상 문제없음 (README '알려진 한계' 참조).
 */
export function computeWingIntents(lm: ReadonlyArray<Pt>, face: FaceRef): WingIntentsGeom {
  if (lm.length < 21) return { raise: 0, out: 0, curl: 0.35, spread: 0.2 }
  const wrist = lm[HAND.WRIST]
  const fh = Math.max(face.faceH, 1e-3)

  // raise: 손목이 어깨선 위로 올라온 정도. y는 아래로 증가하므로 (어깨y - 손목y)
  const shoulderY = face.chinY + HAND_TUNING.shoulderDropFaceH * fh
  const raise = clamp01((shoulderY - wrist.y) / (HAND_TUNING.raiseRangeFaceH * fh))

  // out: 몸 중심축(얼굴 cx)에서의 수평 거리 (몸통 폭만큼 데드존)
  const out = clamp01(
    (Math.abs(wrist.x - face.cx) - HAND_TUNING.outDeadzoneFaceH * fh) /
      (HAND_TUNING.outRangeFaceH * fh),
  )

  // curl: 4손끝(검지~새끼)과 손바닥 중심의 평균 거리를 손 크기(손목→중지MCP)로
  // 정규화한 비율 r. 편 손 r≈curlOpenRatio, 주먹 r≈curlFistRatio → 역정규화.
  const palm: Pt = {
    x: (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5,
    y: (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5,
  }
  const handScale = dist(lm[HAND.WRIST], lm[HAND.MIDDLE_MCP])
  let curl = 0.35 // 손 크기 퇴화 시 중립 컬(neutralFrame과 동일)
  if (handScale > 1e-4) {
    const tips = [HAND.INDEX_TIP, HAND.MIDDLE_TIP, HAND.RING_TIP, HAND.PINKY_TIP]
    const r =
      tips.reduce((acc, t) => acc + dist(lm[t], palm), 0) / tips.length / handScale
    curl = clamp01(
      (HAND_TUNING.curlOpenRatio - r) / (HAND_TUNING.curlOpenRatio - HAND_TUNING.curlFistRatio),
    )
  }

  // spread: 검지 방향(MCP→끝)과 약지 방향(MCP→끝) 사이 각도.
  // ※ 손목→손끝 각도를 쓰지 않는 이유: 그 각도는 MCP 기둥 간격이 지배해서
  //   주먹을 쥐어도 거의 줄지 않는다(수치 검증에서 확인). 손가락 "방향" 벡터는
  //   모아 편 손/주먹 모두 거의 평행(각≈0)이고 부채꼴로 벌릴 때만 커진다.
  let spread = 0.2
  const v1: Pt = {
    x: lm[HAND.INDEX_TIP].x - lm[HAND.INDEX_MCP].x,
    y: lm[HAND.INDEX_TIP].y - lm[HAND.INDEX_MCP].y,
  }
  const v2: Pt = {
    x: lm[HAND.RING_TIP].x - lm[HAND.RING_MCP].x,
    y: lm[HAND.RING_TIP].y - lm[HAND.RING_MCP].y,
  }
  const n1 = Math.hypot(v1.x, v1.y)
  const n2 = Math.hypot(v2.x, v2.y)
  if (n1 > 1e-5 && n2 > 1e-5) {
    const ang = Math.acos(clamp((v1.x * v2.x + v1.y * v2.y) / (n1 * n2), -1, 1))
    spread = clamp01(
      (ang - HAND_TUNING.spreadMinRad) / (HAND_TUNING.spreadMaxRad - HAND_TUNING.spreadMinRad),
    )
  }

  return { raise, out, curl, spread }
}

/* ======================================================================
 * 5) 시간 도메인 유틸 (EMA / wave / 비대칭 접근)
 * ====================================================================== */

/**
 * 1차 지수평활 한 스텝. tau = 시간상수(초).
 * a = 1 - e^(-dt/τ) 를 쓰면 프레임레이트가 변해도 감쇠 속도가 실시간 기준으로 일정하다.
 */
export function emaStep(prev: number, target: number, dt: number, tau: number): number {
  if (dt <= 0) return target
  const a = 1 - Math.exp(-dt / Math.max(tau, 1e-6))
  return prev + (target - prev) * a
}

/** wave 계산용 상태 (손목 x 속도의 EMA). 순수 함수 스텝으로 유지해 테스트 가능. */
export interface WaveState {
  x: number
  emaAbsV: number
  init: boolean
}

export const initialWaveState = (): WaveState => ({ x: 0, emaAbsV: 0, init: false })

/**
 * wave = |손목 x 속도| 의 EMA 를 0..1 로 정규화.
 * |v|를 평활하는 이유: 좌우 왕복 속도를 그대로 평균하면 부호가 상쇄되어 0이 되므로,
 * 크기만 평활해 "지속적으로 흔드는 중" 신호를 얻는다 (진동 위상은 모델 쪽에서 생성).
 */
export function waveStep(
  s: WaveState,
  wristX: number,
  dt: number,
): { state: WaveState; wave: number } {
  if (!s.init || dt <= 0) {
    return { state: { x: wristX, emaAbsV: 0, init: true }, wave: 0 }
  }
  const v = Math.abs(wristX - s.x) / dt
  const emaAbsV = emaStep(s.emaAbsV, v, dt, HAND_TUNING.waveTau)
  return {
    state: { x: wristX, emaAbsV, init: true },
    wave: clamp01(emaAbsV / HAND_TUNING.waveFullSpeed),
  }
}

/**
 * 비대칭 선형 접근: 상승은 riseTime초에 0→1, 하강은 fallTime초에 1→0 속도.
 * tracked / present 의 "스냅 금지 + 감쇠" 요구(BRIEF)를 구현하는 기본 블록.
 */
export function approach(
  cur: number,
  target: number,
  dt: number,
  riseTime: number,
  fallTime: number,
): number {
  if (target > cur) return Math.min(target, cur + dt / Math.max(riseTime, 1e-6))
  return Math.max(target, cur - dt / Math.max(fallTime, 1e-6))
}
