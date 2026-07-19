/**
 * src/tracking/math.ts — 트래킹 수학 전부를 모은 순수 함수 모듈.
 * DOM/웹캠/mediapipe 런타임 의존이 전혀 없어 이 파일만으로 코드 리뷰/단위 검증이 가능하다.
 * (웹캠 실행이 불가능한 환경에서 작성되었으므로, 부호 근거를 전부 주석으로 남긴다.)
 *
 * ── MediaPipe "world landmarks" 좌표 규약 (pose·hand 공통 — tasks-vision d.ts) ──
 *  - 미터 단위 3D. Landmark 주석: "the smaller the value the closer the world
 *    landmark is to the camera" → +z_mp = 카메라에서 멀어지는 방향.
 *  - x/y는 이미지 방향과 일치: +x_mp = 이미지 오른쪽, +y_mp = 이미지 아래.
 *    사용자는 카메라를 마주보므로 이미지 오른쪽 = 사용자의 해부학적 왼쪽.
 *  - 원점: pose = 엉덩이 중점, hand = 손 중심 — 서로 다르지만 여기서는
 *    "방향벡터(차분)"만 쓰므로 원점 차이는 소거된다.
 *
 * ── 계약 캐릭터 공간 (contract.ts) ──
 *  x = 캐릭터 왼쪽+, y = 위+, z = 앞(카메라 방향)+. 모든 Dir3 정규화.
 */
import type { Dir3, HeadPose } from '../contract'

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v))
export const clamp01 = (v: number): number => clamp(v, 0, 1)

/* ======================================================================
 * 0) 벡터/스칼라 기본 유틸
 * ====================================================================== */

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** mediapipe Landmark/NormalizedLandmark 구조 호환 (visibility는 pose에서만 신뢰) */
export interface Lm3 extends Vec3 {
  visibility?: number
}

export interface Pt {
  x: number
  y: number
}

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
export const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z)
export const mid = (a: Vec3, b: Vec3): Vec3 => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
})

/** 정규화. 길이가 퇴화하면 null (호출측이 이전 값 유지) */
export function normOrNull(v: Vec3, eps = 1e-6): Vec3 | null {
  const l = len(v)
  return l > eps ? { x: v.x / l, y: v.y / l, z: v.z / l } : null
}

/** 두 벡터 사이 각 (0..π). 퇴화 시 0 */
export function angleBetween(a: Vec3, b: Vec3): number {
  const la = len(a)
  const lb = len(b)
  if (la < 1e-6 || lb < 1e-6) return 0
  return Math.acos(clamp(dot(a, b) / (la * lb), -1, 1))
}

export const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * 1차 지수평활 한 스텝. tau = 시간상수(초).
 * a = 1 - e^(-dt/τ) 를 쓰면 프레임레이트가 변해도 감쇠 속도가 실시간 기준으로 일정하다.
 */
export function emaStep(prev: number, target: number, dt: number, tau: number): number {
  if (dt <= 0) return target
  const a = 1 - Math.exp(-dt / Math.max(tau, 1e-6))
  return prev + (target - prev) * a
}

/** 비대칭 EMA(엔벨로프 추종): 상승/하강 시간상수를 따로 준다. shrug 기준선 등에 사용 */
export function envelopeStep(
  prev: number,
  x: number,
  dt: number,
  riseTau: number,
  fallTau: number,
): number {
  return emaStep(prev, x, dt, x > prev ? riseTau : fallTau)
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

/** 히스테리시스 게이트: 꺼진 상태에선 enter 이상, 켜진 상태에선 keep 이상이면 on */
export const hysteresis = (prevOn: boolean, v: number, enter: number, keep: number): boolean =>
  prevOn ? v >= keep : v >= enter

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
 * 3) 랜드마크 인덱스 (공식 토폴로지)
 * ====================================================================== */

/**
 * Pose Landmarker 33점 중 사용 인덱스.
 * 여기의 L_/R_는 **사용자의 해부학적 좌/우**다 — pose 모델은 관절의 "정체성"을
 * 예측하므로(분류형 handedness가 아님) 무반전 원본 피드에서 라벨 그대로 신뢰한다.
 * (캐릭터 좌/우로의 거울 매핑은 ARM_POSE_IDX / bodyRawFromPose에서 수행)
 */
export const POSE = {
  L_EAR: 7,
  R_EAR: 8,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
} as const

/** MediaPipe Hands 21 랜드마크 인덱스 (공식 토폴로지) */
export const HAND = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  MIDDLE_MCP: 9,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
} as const

/* ======================================================================
 * 4) 캐릭터 공간 기저 (그람-슈미트) + 거울 매핑
 * ====================================================================== */

/**
 * 몸통 기준 정규직교 기저 (mp 월드 좌표로 표현):
 *  bx = 사용자 왼쪽 방향 (어깨라인 12→11)
 *  by = 몸통 위 방향 (월드 위 -y_mp 를 bx에 직교화)
 *  bz = bx × by (오른손 규칙 → 카메라 쪽)
 */
export interface TorsoBasis {
  bx: Vec3
  by: Vec3
  bz: Vec3
}

/**
 * 포즈 미검출 시 폴백: 카메라 정렬 기저.
 * bx=+x_mp(이미지 오른쪽=사용자 왼쪽), by=-y_mp(위), bz=bx×by=(0,0,-1)(카메라 쪽).
 * 검산: (1,0,0)×(0,-1,0) = (0·0−0·(−1), 0·0−1·0, 1·(−1)−0·0) = (0,0,−1) ✓
 */
export const CAMERA_BASIS: TorsoBasis = {
  bx: { x: 1, y: 0, z: 0 },
  by: { x: 0, y: -1, z: 0 },
  bz: { x: 0, y: 0, z: -1 },
}

/**
 * 어깨라인 기반 몸통 기저 (그람-슈미트).
 *  - bx = normalize(어깨12→어깨11) : 오른어깨→왼어깨 = 사용자 왼쪽 방향.
 *  - by = normalize(up − (up·bx)bx), up = (0,-1,0) = 월드 위(-y_mp — BRIEF).
 *    어깨라인이 기울어도(=bx에 up 성분이 섞여도) 직교화로 몸통 y축이 안정된다.
 *  - bz = bx × by : bx,by가 정규직교이므로 bz도 단위벡터. 정면 자세에서
 *    (0,0,-1) = 카메라 쪽 (위 CAMERA_BASIS 검산과 동일).
 * 퇴화(어깨라인이 수직에 가까움 — 눕기 등): null → 호출측 CAMERA_BASIS 폴백.
 */
export function torsoBasisFromPose(world: ReadonlyArray<Lm3>): TorsoBasis | null {
  if (world.length < 33) return null
  const bx = normOrNull(sub(world[POSE.L_SHOULDER], world[POSE.R_SHOULDER]))
  if (!bx) return null
  const up: Vec3 = { x: 0, y: -1, z: 0 }
  const k = dot(up, bx)
  const by = normOrNull({ x: up.x - k * bx.x, y: up.y - k * bx.y, z: up.z - k * bx.z }, 1e-3)
  if (!by) return null
  return { bx, by, bz: cross(bx, by) }
}

/**
 * mp 월드 방향벡터 → 캐릭터 공간 Dir3 (거울 매핑 포함). 정규화해서 반환.
 *
 * 유도: 몸통 기저 성분 u=d·bx(사용자 왼쪽+), v=d·by(위+), w=d·bz(카메라 쪽+).
 * 거울 매핑은 "사용자 몸 기준 좌우"만 반전한다:
 *   char = ( -u, v, w )
 * 이는 행렬식 -1인 반사 변환인데, 거울상이 원래 그것이다(회전으로는 불가능).
 *
 * 검산 (기저=CAMERA_BASIS, 즉 정면 자세):
 *  1) 사용자 오른팔 차렷(어깨→팔꿈치 ≈ 아래+살짝 바깥): d=(-0.17, 0.98, 0)
 *     → u=-0.17, v=-0.98, w=0 → char=(+0.17, -0.98, 0)
 *     = 캐릭터 왼팔(armL) 차렷 (contract neutralArm(1).upperDir와 일치) ✓
 *  2) 사용자 오른팔 T자(사용자 오른쪽=이미지 왼쪽): d=(-1,0,0)
 *     → char=(+1,0,0) = 캐릭터 왼팔이 캐릭터 왼쪽(+x)으로 = 화면상 사용자가
 *     뻗은 쪽과 같은 쪽 (거울) ✓  [계약 주석 "옆으로 T {±1,0,0}"]
 *  3) 사용자가 카메라를 향해 팔 뻗음(앞으로 나란히): d=(0,0,-1) (카메라쪽 = -z_mp)
 *     → w = d·bz = (0,0,-1)·(0,0,-1) = +1 → char=(0,0,1) = 계약 "앞으로 {0,0,1}" ✓
 */
export function charDirFromWorld(d: Vec3, B: TorsoBasis): Dir3 | null {
  return normOrNull({ x: -dot(d, B.bx), y: dot(d, B.by), z: dot(d, B.bz) })
}

/* ======================================================================
 * 5) 팔 방향 (Pose worldLandmarks → ArmPose.upperDir/lowerDir)
 * ====================================================================== */

/**
 * 캐릭터 팔 ↔ 포즈 인덱스 (거울: 캐릭터 L = 사용자 오른팔).
 * 손 handedness와 달리 여기는 관절 정체성이므로 이 표가 곧 거울 매핑이다.
 */
export const ARM_POSE_IDX = {
  L: { shoulder: POSE.R_SHOULDER, elbow: POSE.R_ELBOW, wrist: POSE.R_WRIST },
  R: { shoulder: POSE.L_SHOULDER, elbow: POSE.L_ELBOW, wrist: POSE.L_WRIST },
} as const

export interface ArmDirs {
  upperDir: Dir3
  lowerDir: Dir3
  /** min(어깨,팔꿈치,손목 visibility) — present 게이팅용 */
  vis: number
}

/** 어깨→팔꿈치 / 팔꿈치→손목 방향을 캐릭터 공간으로. 퇴화 시 null */
export function armDirsFromPose(
  world: ReadonlyArray<Lm3>,
  B: TorsoBasis,
  charSide: 'L' | 'R',
): ArmDirs | null {
  if (world.length < 33) return null
  const idx = ARM_POSE_IDX[charSide]
  const sh = world[idx.shoulder]
  const el = world[idx.elbow]
  const wr = world[idx.wrist]
  const upperDir = charDirFromWorld(sub(el, sh), B)
  const lowerDir = charDirFromWorld(sub(wr, el), B)
  if (!upperDir || !lowerDir) return null
  const vis = Math.min(sh.visibility ?? 1, el.visibility ?? 1, wr.visibility ?? 1)
  return { upperDir, lowerDir, vis }
}

/* ======================================================================
 * 6) 손 3D 자세 (Hand worldLandmarks → palmNormal/handDir)
 * ====================================================================== */

export interface HandOrient {
  handDir: Dir3
  palmNormal: Dir3
}

/**
 * 손바닥 기저 (BRIEF §4):
 *   handDir = 손목(0) → 중지MCP(9)
 *   palmRef = 검지MCP(5) → 새끼MCP(17)
 *   palmNormal = ±(handDir × palmRef) — **외적 순서가 손의 좌우에 따라 다르다.**
 *
 * ── 외적 부호 유도 (mp 월드: +x=이미지 오른쪽, +y=아래, +z=카메라 반대) ──
 * 검증 자세: 손바닥을 카메라로 향하고 손가락 위. 법선은 카메라 쪽 = (0,0,-1)이어야 함.
 *
 *  · 사용자 오른손: handDir = 위 = (0,-1,0).
 *    엄지는 사용자 왼쪽 = 이미지 오른쪽(+x) → 검지MCP가 새끼MCP보다 +x 쪽
 *    → palmRef(5→17) = (-1,0,0).
 *    handDir×palmRef = (0,-1,0)×(-1,0,0)
 *      = ((-1)·0−0·0, 0·(−1)−0·0, 0·0−(−1)(−1)) = (0,0,-1) = 카메라 쪽 ✓
 *    → 오른손은 handDir × palmRef 그대로 손바닥 쪽.
 *
 *  · 사용자 왼손: handDir = (0,-1,0), 엄지는 사용자 오른쪽 = 이미지 왼쪽(−x)
 *    → palmRef(5→17) = (+1,0,0).
 *    handDir×palmRef = (0,-1,0)×(1,0,0) = (0,0,+1) = 손등 쪽 ✗
 *    → 왼손은 순서를 뒤집어 palmRef × handDir = (0,0,-1) ✓
 *
 * 즉 palmNormal = (오른손 ? handDir×palmRef : palmRef×handDir).
 * 이유: 왼손/오른손은 서로 거울상이라 (handDir, palmRef, 손바닥법선)의
 * 손대칭성(chirality)이 반대다 — 외적은 오른손 규칙 고정이므로 한쪽은 뒤집어야 한다.
 *
 * userHand는 **사용자의 실제 손** ('L'=왼손). handedness 라벨이 아니라
 * 캐릭터 사이드에서 역산한 실제 손을 넘길 것 (캐릭터 L = 사용자 오른손).
 */
export function handOrientFromWorld(
  handWorld: ReadonlyArray<Vec3>,
  B: TorsoBasis,
  userHand: 'L' | 'R',
): HandOrient | null {
  if (handWorld.length < 21) return null
  const hd = sub(handWorld[HAND.MIDDLE_MCP], handWorld[HAND.WRIST])
  const ref = sub(handWorld[HAND.PINKY_MCP], handWorld[HAND.INDEX_MCP])
  const n = userHand === 'R' ? cross(hd, ref) : cross(ref, hd)
  const handDir = charDirFromWorld(hd, B)
  const palmNormal = charDirFromWorld(n, B)
  if (!handDir || !palmNormal) return null
  return { handDir, palmNormal }
}

/**
 * 필터링(성분별) 후 흐트러진 직교성 복구: palmNormal에서 handDir 성분 제거(그람-슈미트).
 * handDir는 정규화 상태 가정. 퇴화 시 null (호출측이 이전 값 유지).
 */
export function orthonormalizePalm(handDir: Dir3, palmNormal: Dir3): Dir3 | null {
  const k = dot(palmNormal, handDir)
  return normOrNull({
    x: palmNormal.x - k * handDir.x,
    y: palmNormal.y - k * handDir.y,
    z: palmNormal.z - k * handDir.z,
  })
}

/* ======================================================================
 * 7) 손가락 개별 curl + spread (Hand worldLandmarks, 3D 관절각)
 * ====================================================================== */

export const FINGER_TUNING = {
  /** 손가락(검지~새끼) 관절각 합(MCP+PIP+DIP, rad)의 펴짐/주먹 기준값.
   * 펴짐: 손바닥 아치·랜드마크 잡음으로 0이 아닌 ~0.6, 주먹: ≈90°+100°+65° ≈ 4.0 */
  fingerOpenRad: 0.6,
  fingerFistRad: 4.0,
  /** 엄지(MCP+IP 2관절 — BRIEF 예시식)의 펴짐/접힘 기준값 */
  thumbOpenRad: 0.25,
  thumbFoldRad: 1.5,
  /** spread: 검지(5→6)와 새끼(17→18) 기절골 방향 사이 각의 모음/벌림 기준 */
  spreadMinRad: 0.3,
  spreadMaxRad: 0.95,
} as const

/** 체인 [a,b,c,d]에서 연속 세그먼트 사이 관절각 합: ∠(a→b,b→c)+∠(b→c,c→d) */
const chainAngles = (w: ReadonlyArray<Vec3>, a: number, b: number, c: number, d: number): number =>
  angleBetween(sub(w[b], w[a]), sub(w[c], w[b])) + angleBetween(sub(w[c], w[b]), sub(w[d], w[c]))

/**
 * 손가락 5개 개별 curl [엄지, 검지, 중지, 약지, 새끼] 각 0(펴짐)..1(접힘).
 *
 * BRIEF 예시식(검지 = ∠(5→6,6→7)+∠(6→7,7→8))은 PIP·DIP만 본다. 여기에
 * MCP 굽힘 ∠(0→5,5→6)을 추가한 이유: 손가락을 편 채 밑관절만 접는 동작
 * (테이블 위 손가락 굽히기)도 curl로 잡혀야 개별 손가락 표현이 자연스럽다.
 * 엄지는 BRIEF대로 (1→2,2→3)+(2→3,3→4) — 엄지 CMC는 방향이 특이해 제외.
 * 3D world 랜드마크라 손 방향/원근과 무관하게 각도가 보존된다.
 */
export function fingerCurls(
  handWorld: ReadonlyArray<Vec3>,
): [number, number, number, number, number] | null {
  if (handWorld.length < 21) return null
  const t = FINGER_TUNING
  const norm = (sum: number, lo: number, hi: number): number =>
    clamp01((sum - lo) / (hi - lo))
  const finger = (mcp: number): number => {
    const mcpBend = angleBetween(
      sub(handWorld[mcp], handWorld[HAND.WRIST]),
      sub(handWorld[mcp + 1], handWorld[mcp]),
    )
    return norm(
      mcpBend + chainAngles(handWorld, mcp, mcp + 1, mcp + 2, mcp + 3),
      t.fingerOpenRad,
      t.fingerFistRad,
    )
  }
  return [
    norm(chainAngles(handWorld, 1, 2, 3, 4), t.thumbOpenRad, t.thumbFoldRad),
    finger(5),
    finger(9),
    finger(13),
    finger(17),
  ]
}

/**
 * spread = 검지~새끼 부채각: 검지 기절골(5→6)과 새끼 기절골(17→18) 방향 사이 각.
 * 기절골 방향은 주먹을 쥐어도 서로 거의 평행(≈spreadMinRad)이고
 * 부채꼴로 벌릴 때만 커지므로 curl과 독립적인 신호가 된다.
 */
export function fingerSpread(handWorld: ReadonlyArray<Vec3>): number | null {
  if (handWorld.length < 21) return null
  const a = angleBetween(
    sub(handWorld[HAND.INDEX_PIP], handWorld[HAND.INDEX_MCP]),
    sub(handWorld[HAND.PINKY_PIP], handWorld[HAND.PINKY_MCP]),
  )
  return clamp01(
    (a - FINGER_TUNING.spreadMinRad) / (FINGER_TUNING.spreadMaxRad - FINGER_TUNING.spreadMinRad),
  )
}

/* ======================================================================
 * 8) 몸통/하체 (Pose worldLandmarks → BodyPose 원시값)
 * ====================================================================== */

export const BODY_TUNING = {
  /** shrug 정규화: 귀↔어깨 거리(기준선 대비)가 이 비율만큼 줄면 shrug=1 */
  shrugRangeFrac: 0.2,
  /** shrug 기준선 엔벨로프: 이완(거리 증가)은 빨리, 으쓱(감소)은 아주 천천히 반영
   * — 기준선은 "이완 상태의 최대 거리"를 따라가야 하므로 비대칭 */
  shrugBaseRiseTau: 3,
  shrugBaseFallTau: 25,
  /** 무릎 완전 굽힘으로 보는 각 (≈126°) — 스쿼트 하한 */
  kneeFullRad: 2.2,
  /** 체중 이동 정규화: 엉덩이중심이 발목중심에서 이만큼 벗어나면 |hipShift|=1 */
  hipShiftRangeM: 0.09,
  /** 발목 비가시 폴백: 이미지 엉덩이 x 편차를 (어깨폭 × 이 비율)로 정규화 */
  hipShiftImgFrac: 0.35,
  /** 폴백 기준선(이미지 엉덩이 x) EMA 시간상수 */
  hipImgBaseTau: 8,
  leanXClamp: 0.4,
  leanZClamp: 0.45,
  twistClamp: 0.6,
  /** 관절 사용 가능 최소 visibility */
  visMin: 0.5,
} as const

export interface BodyRaw {
  /** min(어깨11,12 visibility) — body.present 게이팅 */
  visBody: number
  /** min(무릎25,26 visibility) — legsPresent 게이팅 (BRIEF §6) */
  visLegs: number
  /** 귀↔어깨 몸통-위(by) 방향 거리 (m). 캐릭터 L = 사용자 오른쪽(귀8,어깨12) */
  earShoulderL: number | null
  earShoulderR: number | null
  /** 어깨라인 기울기 rad (+캐릭터 왼쪽) — 항상 산출 (어깨만 필요) */
  leanX: number
  /** 앞뒤 기울기 rad (+앞). 엉덩이 비가시 시 null */
  leanZ: number | null
  /** 어깨라인 vs 엉덩이라인 y회전차 rad (+캐릭터 왼쪽으로 돌음). 엉덩이 비가시 시 null */
  twist: number | null
  /** 무릎 관절각 rad (0=곧게 폄). 해당 다리 비가시 시 null. L=사용자 오른다리 */
  kneeL: number | null
  kneeR: number | null
  /** 발목 기준 체중 이동, 이미 -1..1 (+캐릭터 왼발). 발목 비가시 시 null */
  hipShiftWorld: number | null
  /** 폴백용 이미지 좌표 엉덩이중심 x / 어깨폭 (landmarks 미제공 시 null) */
  hipCxImg: number | null
  shoulderWImg: number | null
}

/**
 * BodyPose 원시값 계산. 기준선(EMA)·필터는 상태가 필요하므로 호출측(index.ts) 담당.
 *
 * 부호 근거 (모두 "거울 = 방의 같은 쪽" 원리 — head.yaw/roll 유도와 동일):
 *  · leanX: s = 어깨12→11 (사용자 왼쪽+). 사용자가 자기 오른쪽으로 기울면
 *    왼어깨가 올라가 s의 위(-y_mp) 성분이 +가 됨. 거울상은 방의 같은 쪽
 *    (= 화면 오른쪽 = 캐릭터의 왼쪽)으로 기움 = 계약 +x → leanX = atan2(up성분, 수평성분).
 *  · leanZ: 어깨중심이 엉덩이중심보다 카메라 쪽(-z_mp)이면 앞으로 숙인 것.
 *    계약 +z = 앞(카메라) → leanZ = atan2(카메라쪽 성분, 위 성분).
 *  · twist: 라인의 y회전각 θ(v) = atan2(-v.z, v.x) — 사용자가 자기 오른쪽으로
 *    돌면 왼어깨(+x쪽)가 카메라 쪽(-z)으로 와서 θ>0. 거울: 사용자 오른쪽 돌기 =
 *    캐릭터가 자기 왼쪽으로 돌기 = 계약 + → twist = θ(어깨) - θ(엉덩이).
 *  · hipShift: 엉덩이중심 - 발목중심의 bx(사용자 왼쪽+) 성분 u. 오른발에 체중을
 *    실으면 골반이 사용자 오른쪽(-u)으로 가고, 거울상은 캐릭터 왼발 지지(+1)
 *    = 계약 + → hipShift = -u / range. (pose 월드 원점이 엉덩이 중점이라
 *    엉덩이의 "절대" 이동은 없으므로 반드시 발목 기준 상대값을 쓴다)
 */
export function bodyRawFromPose(
  world: ReadonlyArray<Lm3>,
  img: ReadonlyArray<Lm3> | null,
  B: TorsoBasis,
): BodyRaw | null {
  if (world.length < 33) return null
  const t = BODY_TUNING
  const vis = (i: number): number => world[i].visibility ?? 0
  const visBody = Math.min(vis(POSE.L_SHOULDER), vis(POSE.R_SHOULDER))
  const visLegs = Math.min(vis(POSE.L_KNEE), vis(POSE.R_KNEE))

  // shrug 원시값: 귀-어깨를 몸통 위 방향(by)에 사영 — 몸이 기울어도 안정
  const earShoulder = (ear: number, sh: number): number | null =>
    vis(ear) >= t.visMin && vis(sh) >= t.visMin
      ? dot(sub(world[ear], world[sh]), B.by)
      : null

  // leanX: 어깨라인의 수평면 대비 기울기
  const s = sub(world[POSE.L_SHOULDER], world[POSE.R_SHOULDER])
  const sUp = -s.y // 월드 위(-y_mp) 성분
  const sHoriz = Math.sqrt(Math.max(len(s) ** 2 - sUp * sUp, 1e-12))
  const leanX = Math.atan2(sUp, sHoriz)

  const hipsVis = Math.min(vis(POSE.L_HIP), vis(POSE.R_HIP)) >= t.visMin
  let leanZ: number | null = null
  let twist: number | null = null
  let hipShiftWorld: number | null = null
  if (hipsVis) {
    const shMid = mid(world[POSE.L_SHOULDER], world[POSE.R_SHOULDER])
    const hipMid = mid(world[POSE.L_HIP], world[POSE.R_HIP])
    const torso = sub(shMid, hipMid)
    const fwd = -torso.z // 카메라 쪽(-z_mp) 성분 = 앞으로 숙임
    const up = -torso.y
    if (Math.abs(fwd) + Math.abs(up) > 1e-6) leanZ = Math.atan2(fwd, Math.max(up, 1e-6))

    const h = sub(world[POSE.L_HIP], world[POSE.R_HIP])
    const yawOf = (v: Vec3): number => Math.atan2(-v.z, v.x)
    twist = wrapPi(yawOf(s) - yawOf(h))

    if (Math.min(vis(POSE.L_ANKLE), vis(POSE.R_ANKLE)) >= t.visMin) {
      const ankMid = mid(world[POSE.L_ANKLE], world[POSE.R_ANKLE])
      const u = dot(sub(hipMid, ankMid), B.bx) // 사용자 왼쪽+
      hipShiftWorld = clamp(-u / t.hipShiftRangeM, -1, 1)
    }
  }

  // 무릎: ∠(엉덩이→무릎, 무릎→발목). 캐릭터 L = 사용자 오른다리 (24,26,28)
  const knee = (hip: number, kn: number, ank: number): number | null =>
    Math.min(vis(hip), vis(kn), vis(ank)) >= t.visMin
      ? angleBetween(sub(world[kn], world[hip]), sub(world[ank], world[kn]))
      : null

  let hipCxImg: number | null = null
  let shoulderWImg: number | null = null
  if (img && img.length >= 33 && hipsVis) {
    hipCxImg = (img[POSE.L_HIP].x + img[POSE.R_HIP].x) / 2
    shoulderWImg = Math.abs(img[POSE.L_SHOULDER].x - img[POSE.R_SHOULDER].x)
  }

  return {
    visBody,
    visLegs,
    earShoulderL: earShoulder(POSE.R_EAR, POSE.R_SHOULDER), // 캐릭터 L = 사용자 오른쪽
    earShoulderR: earShoulder(POSE.L_EAR, POSE.L_SHOULDER),
    leanX,
    leanZ,
    twist,
    kneeL: knee(POSE.R_HIP, POSE.R_KNEE, POSE.R_ANKLE),
    kneeR: knee(POSE.L_HIP, POSE.L_KNEE, POSE.L_ANKLE),
    hipShiftWorld,
    hipCxImg,
    shoulderWImg,
  }
}

/** shrug 정규화: 기준선(이완 거리) 대비 감소량 → 0..1 */
export function shrugFrom(d: number, baseline: number): number {
  if (!(baseline > 1e-6)) return 0
  return clamp01((baseline - d) / (BODY_TUNING.shrugRangeFrac * baseline))
}

/* ======================================================================
 * 9) 손 ↔ 팔 매칭 (handedness 라벨 보정)
 * ====================================================================== */

/** 손목-포즈손목 매칭 허용 반경 (정규화 이미지 좌표) */
export const HAND_ASSOC_MAX_DIST = 0.2

/**
 * 손이 어느 캐릭터 팔에 속하는지 결정.
 * 1순위: 포즈 손목(이미지 좌표)과의 최근접 — 손은 물리적으로 자기 팔에 붙어
 *   있으므로 라벨 오분류에 강건하다 (pose 16=사용자 오른손목→캐릭터 L).
 * 2순위(포즈 없음/비가시/원거리): handedness 라벨 이중반전 —
 *   (1) Tasks 문서: handedness는 셀피(좌우 반전) 입력을 가정하고 예측된다.
 *       우리 <video>는 무반전 원본 피드 → 라벨을 한 번 스왑해야 실제 손.
 *       즉 라벨 'Left' = 사용자의 실제 오른손.
 *   (2) 거울 매핑(계약): 사용자 오른손 → 캐릭터 왼팔(armL).
 *   (1)×(2) 두 번 뒤집혀 결국 라벨 'Left' → armL, 'Right' → armR.
 * labelSide에는 이미 이중반전을 적용한 값을 넘길 것.
 */
export function associateHandSide(
  wristImg: Pt,
  poseImg: ReadonlyArray<Lm3> | null,
  labelSide: 'L' | 'R',
): 'L' | 'R' {
  if (poseImg && poseImg.length >= 33) {
    const cands: ReadonlyArray<readonly ['L' | 'R', Lm3]> = [
      ['L', poseImg[POSE.R_WRIST]], // 캐릭터 L = 사용자 오른손목
      ['R', poseImg[POSE.L_WRIST]],
    ]
    let best: 'L' | 'R' | null = null
    let bestD = HAND_ASSOC_MAX_DIST
    for (const [side, lm] of cands) {
      if ((lm.visibility ?? 0) < BODY_TUNING.visMin) continue
      const d = Math.hypot(wristImg.x - lm.x, wristImg.y - lm.y)
      if (d < bestD) {
        bestD = d
        best = side
      }
    }
    if (best) return best
  }
  return labelSide
}
