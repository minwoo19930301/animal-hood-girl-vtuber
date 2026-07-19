/**
 * VRM 휴머노이드 모델 + 프로시저럴 플라밍고 후드 — 진입점.
 * createMingo(): MingoModel (계약: src/contract.ts — v2 ArmPose/BodyPose)
 *
 * - 동기 생성 + `ready` 프라미스로 VRM 비동기 로드. 로드 전 apply()는 no-op.
 * - 리그는 정규화 본(normalized human bones)에만 쓴다: rest 회전이 항등이라
 *   모델(VRM0/VRM1)과 무관하게 축이 예측 가능. 단순 오일러 채널(머리/몸통/다리)의
 *   부호는 S(±1)로 흡수: VRM0 원공간은 정면 -Z(S=+1), VRM1은 +Z(S=-1). rotateVRM0가
 *   씬을 π 회전시켜 두 경우 모두 월드 정면 = +Z (계약). 팔은 부호 가지치기 대신
 *   armSolver가 리그 루트 월드 쿼터니언으로 좌표계를 통째로 흡수한다.
 * - 팔: ArmPose 방향벡터(upperDir/lowerDir/palmNormal/handDir) → ArmSolver FK
 *   (스윙-트위스트 롤 안정화 + 팔꿈치 힌지 + 손목 기저 + 클램프). 팔별 present로
 *   neutralArm(idle)↔트래킹 크로스페이드 (스냅 금지).
 * - 손가락: fingers[5] 개별 본 체인 (엄지 축 별도), spread → proximal 벌림.
 * - BodyPose: shrug→어깨 리프트, lean/twist→spine/chest 분배, hipShift→hips 이동+롤,
 *   knee→다리 (legsPresent 게이팅, 정강이 수직 유지 + hips y 보정으로 발 접지).
 * - 결정적: Math.random 없음, 2차 모션은 전부 dt 기반 스프링.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  VRM, VRMLoaderPlugin, VRMUtils,
  type MToonMaterial, type VRMExpressionManager, type VRMHumanBoneName,
} from '@pixiv/three-vrm'
import type { MingoModel, RigFrame, ArmPose, Dir3 } from '../contract'
import { neutralArm } from '../contract'
import { TOON } from '../palette'
import { Follower } from './springs'
import { ArmSolver, armSolverSelfTest } from './armSolver'
import { buildHood, type HoodRig } from './hood'
import { buildFx, type FxRig } from './fx'
import { buildAccessories, type AccessoryRig } from './accessories'

const { clamp, lerp } = THREE.MathUtils

/** ★ 사용자 VRoid 모델 교체 지점: public/models/에 .vrm을 넣고 이 경로만 바꾼다 */
const MODEL_URL = './models/avatar.vrm'

/** 머리 회전 분배: neck 40% + head 60% */
const NECK_SHARE = 0.4
const HEAD_SHARE = 0.6

/**
 * 눈매 강화 바이어스 (0~1): `angry` 표정(VRoid 프리셋 — 아래 눈꺼풀 리프트 + 눈썹
 * 미세 각도)을 상시 소량 적용해 눈을 살짝 가늘게 — 레퍼런스(refs/target-human.png)의
 * 어른스럽고 또렷한 눈매. blink 가중치가 클 땐 (1 - blink)로 자동 감쇠해
 * 눈꺼풀 이중 변형(과닫힘)을 막는다. 0 = 끔. 권장 0.1~0.2 (과하면 사나워짐).
 */
export const EYE_SHARPEN = 0.15

/** 팔 크로스페이드/스무딩 + wave 오버레이 튜닝 */
const PRESENT_TAU = 0.12 // present 크로스페이드 시정수 (s)
const POSE_SMOOTH = 22   // 본 회전 slerp 속도 (1/s) — 트래킹 One Euro 위 미세 완충만
const WAVE = { hz: 9, amp: 0.26, whip: 0.12 } as const

/** BodyPose 적용 튜닝 상수 */
export const BODY = {
  spineShare: 0.45, chestShare: 0.35, upperChestShare: 0.20, // lean/twist 분배
  shrugMax: 0.28,     // shrug=1 어깨 z 리프트 (rad)
  raiseAssist: 0.15,  // 팔을 높이 들 때(upperDir.y>0) 어깨 보조 리프트 (rad)
  // knee=1 허벅지 전방 회전 (rad) — 정강이는 수직 유지(발 접지).
  // 트래킹 정규화(kneeFullRad 2.2 ≈ 126° 굽힘 = knee 1)와 스케일을 맞춰
  // knee=0.5 ≈ 0.9rad(52°) 반스쿼트로 읽히게 1.8 (구 0.9는 하강이 신장의 2%로 미미)
  kneeMax: 1.8,
  hipShiftX: 0.06,    // hipShift=1 골반 x 이동 (다리 길이 비율)
  hipRoll: 0.06,      // hipShift=1 골반 롤 (rad)
  rate: 10,           // 바디 채널 스무딩 (1/s) — 하네스 스텝 입력 스냅 방지
  legGateRate: 4,     // legsPresent 게이트 스무딩 (1/s)
} as const

/** 손가락 curl 관절별 회전량 — 손가락별 curl 값으로 전 관절 비례 (thumb은 축이 달라 별도) */
export const FINGER_CURL = { proximal: 1.28, intermediate: 1.5, distal: 0.95 } as const
export const THUMB_CURL = [0.36, 0.55, 0.70] as const // metacarpal, proximal, distal
const SPREAD_MAX = 0.13

type Node3 = THREE.Object3D | null

interface FingerRig {
  prox: Node3
  inter: Node3
  dist: Node3
  /** 벌림 방향 계수 (index +1 … little -1) */
  k: number
}

/** neutralArm(계약)에서 뽑아 캐시한 idle 목표 (매 프레임 할당 방지) */
interface ArmNeutral {
  u: THREE.Vector3
  l: THREE.Vector3
  pn: THREE.Vector3
  hd: THREE.Vector3
  fingers: number[]
  spread: number
}

interface ArmRig {
  /** Z축(손가락 말기 등 오일러 채널) 부호 = side·S (VRM0 왼팔 = +1) */
  sign: number
  /**
   * Y축(spread/엄지 curl) 부호 = side만 (S 미포함).
   * Y축 회전은 VRM0↔VRM1 π-플립(Ry(π) 켤레변환)에 불변이라 S를 곱하면
   * VRM1에서 방향이 반전된다 — 히치하이커 엄지/교차 손가락.
   */
  sideSign: number
  shoulder: Node3
  upper: Node3
  lower: Node3
  hand: Node3
  fingers: FingerRig[]
  thumb: Node3[]
  /** 방향벡터 FK 솔버 (팔 본 없으면 null) */
  solver: ArmSolver | null
  /** present 크로스페이드 상태 (지수 평활) */
  pSm: number
  neutral: ArmNeutral
  // 블렌드 스크래치 (핫패스 할당 금지)
  u: THREE.Vector3
  l: THREE.Vector3
  pn: THREE.Vector3
  hd: THREE.Vector3
}

interface LegRig {
  upper: Node3
  lower: Node3
  /** 허벅지 길이 (정규화 본 실측) — 무릎 굽힘 시 hips y 보정용 */
  thigh: number
}

interface Rig {
  vrm: VRM
  S: number
  neck: Node3
  head: Node3
  /** 몸통 최상단(upperChest ?? chest) — 호흡·드로스트링 앵커 (기존 규약 유지) */
  chest: Node3
  /** lean/twist 분배용 개별 본 */
  spine: Node3
  chestMid: Node3
  upperChestB: Node3
  rawChest: Node3
  hips: Node3
  hipsRest: THREE.Vector3
  legL: LegRig
  legR: LegRig
  /** 다리 전체 길이 (hipShift 스케일 기준) */
  legLen: number
  armL: ArmRig
  armR: ArmRig
  em: VRMExpressionManager | null
  has: Record<'blinkL' | 'blinkR' | 'blink' | 'aa' | 'happy' | 'relaxed' | 'sad' | 'surprised' | 'angry', boolean>
  hood: HoodRig
  fx: FxRig
  acc: AccessoryRig
}

/** MToon 순회 튜닝: 셰이드는 어둡게가 아니라 hue-shift, 셀 경계 크리스프, 아웃라인 강화 */
function tuneMToon(materials: THREE.Material[] | undefined) {
  const hsl = { h: 0, s: 0, l: 0 }
  const outlineColor = new THREE.Color(0x3a2040)
  for (const m of materials ?? []) {
    if (!(m as MToonMaterial).isMToonMaterial) continue
    const mt = m as MToonMaterial
    // 셰이드 hue-shift: 마젠타/퍼플 쪽으로 살짝 돌리고 명도는 오히려 올려 "탁한 그림자" 제거
    mt.shadeColorFactor.getHSL(hsl)
    mt.shadeColorFactor.setHSL(
      (hsl.h + 1 - 0.045) % 1,
      Math.min(1, hsl.s * 1.12 + 0.04),
      Math.min(0.9, hsl.l * 1.16 + 0.05),
    )
    mt.shadingToonyFactor = Math.max(mt.shadingToonyFactor, 0.92) // 셀 경계 크리스프
    mt.shadingShiftFactor = clamp(mt.shadingShiftFactor - 0.02, -1, 1)
    // 가산 림/매트캡 제거: VRoid 기본 재질의 파라메트릭 림이 스커트 허리단·플리츠·
    // 조끼 밑단에 밝은 금색 에지 아티팩트를 만든다 (rim = matcap·matcapFactor +
    // parametricRimColor·fresnel 가산항 — 두 색 팩터를 0으로 클램프해 통째로 끔)
    mt.parametricRimColorFactor.setRGB(0, 0, 0)
    mt.matcapFactor.setRGB(0, 0, 0)
    if (mt.outlineWidthMode !== 'none' && mt.outlineWidthFactor > 0) {
      mt.outlineWidthFactor = clamp(mt.outlineWidthFactor * 1.3, 0.0006, 0.0035)
      mt.outlineColorFactor.copy(outlineColor)
    }
  }
}

// ---- 모듈 스크래치 (핫패스 할당 금지) ----
const FRONT_Z = new THREE.Vector3(0, 0, 1)
const _qWave = new THREE.Quaternion()

/**
 * 트래킹 방향(Dir3)과 idle 방향을 present로 성분 lerp 후 재정규화.
 * 트래킹 값이 퇴화(영벡터)했거나 중간 블렌드가 붕괴하면 idle로 폴백.
 */
function blendDir(out: THREE.Vector3, idle: THREE.Vector3, d: Dir3, p: number): void {
  out.set(d.x, d.y, d.z)
  const l2 = out.lengthSq()
  if (l2 < 1e-8) { out.copy(idle); return }
  out.multiplyScalar(p / Math.sqrt(l2)).addScaledVector(idle, 1 - p)
  if (out.lengthSq() < 1e-6) out.copy(idle)
  else out.normalize()
}

interface BodySm {
  leanX: number; leanZ: number; twist: number
  shrugL: number; shrugR: number; hipShift: number
  kneeL: number; kneeR: number; legGate: number
}

/**
 * 몸통 오일러 채널: 로컬 = (−S·world_x, world_y, −S·world_z) — 정규화 본의
 * VRM0 π-플립 켤레변환 규약 (머리 회전과 동일 계열, README 참조).
 * world_x = lean.z(+앞 숙임), world_y = twist(+캐릭터 왼쪽), world_z = −lean.x(+왼쪽 기움).
 */
function torsoEuler(nd: Node3, S: number, sm: BodySm, share: number, extraX: number): void {
  nd?.rotation.set(-S * sm.leanZ * share + extraX, sm.twist * share, S * sm.leanX * share)
}

let armSelfTestRan = false

export function createMingo(): MingoModel {
  const root = new THREE.Group()

  // ---- 임시 검증 (BRIEF v3): 하네스 미지원 동안 FK 솔버 수치 셀프테스트 1회 ----
  if (!armSelfTestRan) {
    armSelfTestRan = true
    armSolverSelfTest()
  }

  // ---- 고정 조명 (모델 모듈 소유 — 절대 안 움직임): TOON.lightDir + 낮은 Ambient ----
  const sun = new THREE.DirectionalLight(0xffffff, 1.25)
  sun.position.set(TOON.lightDir[0], TOON.lightDir[1], TOON.lightDir[2]).multiplyScalar(10)
  const amb = new THREE.AmbientLight(0xffffff, 0.55)
  root.add(sun, amb)

  let rig: Rig | null = null

  // ---- 2차 모션 스프링 (후드가 고개 pitch/yaw를 지연 추종 → 출렁임) ----
  const hoodP = new Follower(120, 9, 0.22)
  const hoodY = new Follower(120, 9, 0.22)
  const beakP = new Follower(75, 6.5, 0.30)
  const beakY = new Follower(75, 6.5, 0.30)

  // ---- BodyPose 지수 평활 상태 (스냅 방지 — 트래킹 필터 위 얇은 완충) ----
  const bodySm: BodySm = {
    leanX: 0, leanZ: 0, twist: 0,
    shrugL: 0, shrugR: 0, hipShift: 0,
    kneeL: 0, kneeR: 0, legGate: 0,
  }

  const api: MingoModel = {
    root,
    height: 1.5, // 로드 후 실측으로 갱신
    hitMeshes: [],
    ready: undefined,
    apply(frame: RigFrame, dt: number, t: number) {
      if (!rig) return // 로드 전 no-op
      dt = clamp(dt, 1e-4, 0.05)
      const { vrm, S } = rig

      // ---- 머리: pitch/yaw/roll → neck 40% + head 60% ----
      const pitch = clamp(frame.head.pitch, -0.6, 0.6)
      const yaw = clamp(frame.head.yaw, -0.7, 0.7)
      const roll = clamp(frame.head.roll, -0.5, 0.5)
      rig.neck?.rotation.set(S * pitch * NECK_SHARE, yaw * NECK_SHARE, S * roll * 0.3)
      rig.head?.rotation.set(S * pitch * HEAD_SHARE, yaw * HEAD_SHARE, S * roll * 0.7)

      // ---- gaze → lookAt (deg; three-vrm: yaw+ = 캐릭터-왼쪽, pitch+ = 아래) ----
      if (vrm.lookAt) {
        vrm.lookAt.yaw = clamp(frame.gaze.x, -1, 1) * 14
        vrm.lookAt.pitch = -clamp(frame.gaze.y, -1, 1) * 11
      }

      // ---- 표정 (expressionManager) ----
      const em = rig.em
      if (em) {
        const has = rig.has
        const blL = clamp(frame.blinkL, 0, 1)
        const blR = clamp(frame.blinkR, 0, 1)
        if (has.blinkL && has.blinkR) {
          em.setValue('blinkLeft', blL)
          em.setValue('blinkRight', blR)
        } else if (has.blink) {
          em.setValue('blink', Math.max(blL, blR))
        }
        // ---- 눈매 강화: angry를 상시 소량 적용해 눈을 살짝 가늘게 (EYE_SHARPEN 주석 참조).
        //      blink가 진행 중일 땐 (1 - max(blink))로 감쇠 — 감은 눈에 겹치지 않게.
        if (has.angry) em.setValue('angry', EYE_SHARPEN * (1 - Math.max(blL, blR)))
        if (has.aa) em.setValue('aa', clamp(frame.mouthOpen, 0, 1))
        const smile = clamp(frame.mouthSmile, -1, 1)
        const sm = Math.max(0, smile)
        // 미소 리매핑 (closed-lip): 레퍼런스는 다문 입꼬리 미소 — jaw-open이 포함된
        // happy(VRoid Joy)는 상위 구간을 0.2로 캡하고, 입꼬리 상승 위주의
        // relaxed(VRoid Fun)를 주 채널로 쓴다. fx.happy(이벤트)만 풀 Joy.
        if (has.happy) em.setValue('happy', frame.fx.happy ? 1 : Math.min(sm * 0.5, 0.12))
        if (has.relaxed) em.setValue('relaxed', sm * 0.8)
        if (has.sad) em.setValue('sad', Math.max(0, -smile) * 0.4)
        if (has.surprised) {
          const browRaise = Math.max(clamp(frame.browL, -1, 1), clamp(frame.browR, -1, 1))
          em.setValue('surprised', Math.max(0, browRaise) * 0.3)
        }
      }

      // ---- 호흡: raw chest 미세 스케일 + 어깨 들썩 (회전분은 아래 몸통 오일러에 합산) ----
      const breathAmp = Math.sin(frame.breath * Math.PI * 2)
      rig.rawChest?.scale.setScalar(1 + 0.006 * breathAmp)
      const breathLift = 0.02 * (0.5 + 0.5 * breathAmp)

      // ---- BodyPose: 채널 평활 ----
      const body = frame.body
      const kB = 1 - Math.exp(-dt * BODY.rate)
      bodySm.leanX += (clamp(body.lean.x, -0.5, 0.5) - bodySm.leanX) * kB
      bodySm.leanZ += (clamp(body.lean.z, -0.5, 0.5) - bodySm.leanZ) * kB
      bodySm.twist += (clamp(body.twist, -0.7, 0.7) - bodySm.twist) * kB
      bodySm.shrugL += (clamp(body.shrugL, 0, 1) - bodySm.shrugL) * kB
      bodySm.shrugR += (clamp(body.shrugR, 0, 1) - bodySm.shrugR) * kB
      bodySm.hipShift += (clamp(body.hipShift, -1, 1) - bodySm.hipShift) * kB
      bodySm.kneeL += (clamp(body.kneeL, 0, 1) - bodySm.kneeL) * kB
      bodySm.kneeR += (clamp(body.kneeR, 0, 1) - bodySm.kneeR) * kB
      bodySm.legGate += (clamp(body.legsPresent, 0, 1) - bodySm.legGate) * (1 - Math.exp(-dt * BODY.legGateRate))

      // ---- lean/twist → spine/chest/upperChest 분배 (+호흡 회전은 최상단 본에) ----
      const breathX = S * 0.012 * breathAmp
      torsoEuler(rig.spine, S, bodySm, BODY.spineShare, 0)
      if (rig.upperChestB) {
        torsoEuler(rig.chestMid, S, bodySm, BODY.chestShare, 0)
        torsoEuler(rig.upperChestB, S, bodySm, BODY.upperChestShare, breathX)
      } else {
        torsoEuler(rig.chestMid, S, bodySm, BODY.chestShare + BODY.upperChestShare, breathX)
      }

      // ---- 다리: knee 굽힘 (legsPresent 게이팅) — 허벅지 전방·정강이 수직 유지로
      //      발바닥 접지를 지오메트리로 보장하고, 짧아진 다리만큼 hips y를 내린다 ----
      const gate = bodySm.legGate
      const aL = bodySm.kneeL * BODY.kneeMax * gate
      const aR = bodySm.kneeR * BODY.kneeMax * gate
      rig.legL.upper?.rotation.set(S * aL, 0, 0)
      rig.legL.lower?.rotation.set(-S * aL, 0, 0)
      rig.legR.upper?.rotation.set(S * aR, 0, 0)
      rig.legR.lower?.rotation.set(-S * aR, 0, 0)
      const drop = (rig.legL.thigh * (1 - Math.cos(aL)) + rig.legR.thigh * (1 - Math.cos(aR))) / 2

      // ---- hipShift: 골반 x 이동 + 미세 롤 (+무릎 굽힘 y 보정) ----
      if (rig.hips) {
        const shiftW = bodySm.hipShift * BODY.hipShiftX * rig.legLen // 월드 +x = 캐릭터 왼쪽
        rig.hips.position.set(rig.hipsRest.x - S * shiftW, rig.hipsRest.y - drop, rig.hipsRest.z)
        rig.hips.rotation.set(0, 0, -S * bodySm.hipShift * BODY.hipRoll)
      }

      // ---- 팔 = ArmPose 방향벡터 FK (어깨 리프트: 호흡 + shrug + 팔들기 보조) ----
      const liftL = breathLift + bodySm.shrugL * BODY.shrugMax
        + Math.max(0, frame.armL.upperDir.y) * BODY.raiseAssist * rig.armL.pSm
      const liftR = breathLift + bodySm.shrugR * BODY.shrugMax
        + Math.max(0, frame.armR.upperDir.y) * BODY.raiseAssist * rig.armR.pSm
      applyArm(rig.armL, frame.armL, dt, t, liftL)
      applyArm(rig.armR, frame.armR, dt, t, liftR)

      // ---- 후드 2차 모션 (고개 지연 추종) ----
      const hp = hoodP.step(S * pitch, dt)
      const hy = hoodY.step(yaw, dt)
      rig.hood.shellPivot.rotation.set(hp * 0.35, hy * 0.28, 0)
      const bp = beakP.step(S * pitch, dt)
      const by = beakY.step(yaw, dt)
      // 부리 pitch 오버슈트 0.55→0.32: 고개 숙임 때 부리 끝이 눈썹 아래로 안 내려오게
      rig.hood.beakPivot.rotation.set(bp * 0.32, 0, -by * 0.30)

      // ---- 드로스트링 2차 모션 (몸/고개 지연 추종 살랑임 — 액세서리 내부 스프링) ----
      rig.acc.sway(S * pitch, yaw, breathAmp, dt)

      // ---- FX ----
      const fx = rig.fx
      fx.hearts.visible = frame.fx.heart
      if (frame.fx.heart) {
        for (const h of fx.heartMeshes) {
          h.position.y = h.userData.baseY + Math.sin(t * 4 + h.userData.phase) * 0.012
          h.scale.setScalar(1 + 0.1 * Math.sin(t * 6 + h.userData.phase))
        }
      }
      fx.sweat.visible = frame.fx.sweat
      if (frame.fx.sweat) fx.sweat.position.y = fx.sweat.userData.baseY - Math.abs(Math.sin(t * 3)) * 0.014
      fx.anger.visible = frame.fx.anger
      if (frame.fx.anger) fx.anger.scale.setScalar(1 + 0.06 * Math.sin(t * 7))

      // ---- VRM 갱신 (정규화→raw 복사, lookAt/expression/springbone) ----
      vrm.update(dt)
    },
  }

  /**
   * ArmPose 한 팔 적용: present 크로스페이드(neutralArm↔트래킹) → wave 오버레이 →
   * FK 솔브 → 손가락 5개 개별 체인. 스크래치 전부 ArmRig 필드 재사용 (할당 0).
   */
  function applyArm(a: ArmRig, w: ArmPose, dt: number, t: number, lift: number) {
    a.shoulder?.rotation.set(0, 0, -a.sign * lift)

    // present 크로스페이드 (트래킹 히스테리시스 위 얇은 완충 — 스냅 금지)
    a.pSm += (clamp(w.present, 0, 1) - a.pSm) * (1 - Math.exp(-dt / PRESENT_TAU))
    const p = a.pSm

    blendDir(a.u, a.neutral.u, w.upperDir, p)
    blendDir(a.l, a.neutral.l, w.lowerDir, p)
    blendDir(a.pn, a.neutral.pn, w.palmNormal, p)
    blendDir(a.hd, a.neutral.hd, w.handDir, p)

    // wave (aliveness/idle 전용 채널): 캐릭터 z(전방)축 둘레 진자 스윙 + 전완 위상차 휩
    const wv = clamp(w.wave, 0, 1)
    if (wv > 1e-3) {
      const swing = Math.sin(t * WAVE.hz) * WAVE.amp * wv
      _qWave.setFromAxisAngle(FRONT_Z, swing)
      a.u.applyQuaternion(_qWave)
      _qWave.setFromAxisAngle(FRONT_Z, swing + Math.sin(t * WAVE.hz + 1.1) * WAVE.whip * wv)
      a.l.applyQuaternion(_qWave)
      a.hd.applyQuaternion(_qWave)
      a.pn.applyQuaternion(_qWave)
    }

    a.solver?.solve(a.u, a.l, a.pn, a.hd, 1 - Math.exp(-dt * POSE_SMOOTH))

    // ---- 손가락 개별: fingers = [엄지, 검지, 중지, 약지, 새끼] 0..1 ----
    const spread = lerp(a.neutral.spread, clamp(w.spread, 0, 1), p)
    for (let i = 0; i < a.fingers.length; i++) {
      const f = a.fingers[i]
      const curl = lerp(a.neutral.fingers[i + 1], clamp(w.fingers[i + 1], 0, 1), p)
      f.prox?.rotation.set(0, -a.sideSign * spread * SPREAD_MAX * f.k, a.sign * curl * FINGER_CURL.proximal)
      f.inter?.rotation.set(0, 0, a.sign * curl * FINGER_CURL.intermediate)
      f.dist?.rotation.set(0, 0, a.sign * curl * FINGER_CURL.distal)
    }
    const thumbCurl = lerp(a.neutral.fingers[0], clamp(w.fingers[0], 0, 1), p)
    for (let i = 0; i < a.thumb.length; i++) {
      a.thumb[i]?.rotation.set(0, a.sideSign * thumbCurl * THUMB_CURL[i], 0)
    }
  }

  api.ready = loadVRM(root, api)
    .then((r) => { rig = r })
    .catch((err) => { console.error('[mingo] VRM load failed — 모델 없이 idle', err) })

  return api
}

async function loadVRM(root: THREE.Group, api: MingoModel): Promise<Rig> {
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))
  const gltf = await loader.loadAsync(MODEL_URL)
  const vrm = gltf.userData.vrm as VRM

  VRMUtils.removeUnnecessaryVertices(gltf.scene)
  VRMUtils.combineSkeletons(gltf.scene)
  VRMUtils.combineMorphs(vrm)
  VRMUtils.rotateVRM0(vrm) // VRM0(-Z 정면) → 계약 +Z 정면
  vrm.scene.traverse((o) => { o.frustumCulled = false })
  // Do not reuse the donor's visible outfit. The new jacket is authored in
  // this app and is attached to the live humanoid bones below.
  // AccessoryNeck(교복 보타이)도 숨김 — 레퍼런스 트랙탑 룩에 리본이 남으면
  // 교복으로 읽힌다 (원본 VRM은 불변, 런타임 가시성만 끔).
  vrm.scene.traverse((o) => {
    const n = o.name.toLowerCase()
    const mats = (o as THREE.Mesh).isMesh
      ? [(o as THREE.Mesh).material].flat().map((m) => (m?.name ?? '').toLowerCase())
      : []
    if (
      n.includes('athleticjacket') || n.includes('athleticjogger') || n.includes('athleticsneaker') ||
      n.includes('accessoryneck') || mats.some((m) => m.includes('accessoryneck'))
    ) {
      o.visible = false
    }
  })
  tuneMToon(vrm.materials)
  root.add(vrm.scene)

  const S = vrm.meta.metaVersion === '0' ? 1 : -1
  const H = vrm.humanoid
  const bone = (n: VRMHumanBoneName): Node3 => H.getNormalizedBoneNode(n)

  const fingerNames = ['Index', 'Middle', 'Ring', 'Little'] as const
  const fingerK = [1, 0.35, -0.35, -1]
  function armRig(side: 'left' | 'right'): ArmRig {
    const sideSign = side === 'left' ? 1 : -1
    const sign = sideSign * S
    const fingers: FingerRig[] = fingerNames.map((f, i) => ({
      prox: bone(`${side}${f}Proximal` as VRMHumanBoneName),
      inter: bone(`${side}${f}Intermediate` as VRMHumanBoneName),
      dist: bone(`${side}${f}Distal` as VRMHumanBoneName),
      k: fingerK[i],
    }))
    const nA = neutralArm(sideSign as 1 | -1)
    const d3 = (v: Dir3) => new THREE.Vector3(v.x, v.y, v.z).normalize()
    return {
      sign,
      sideSign,
      shoulder: bone(`${side}Shoulder` as VRMHumanBoneName),
      upper: bone(`${side}UpperArm` as VRMHumanBoneName),
      lower: bone(`${side}LowerArm` as VRMHumanBoneName),
      hand: bone(`${side}Hand` as VRMHumanBoneName),
      fingers,
      thumb: [
        bone(`${side}ThumbMetacarpal` as VRMHumanBoneName),
        bone(`${side}ThumbProximal` as VRMHumanBoneName),
        bone(`${side}ThumbDistal` as VRMHumanBoneName),
      ],
      solver: null, // 아래에서 rest 실측 후 생성
      pSm: 0,
      neutral: {
        u: d3(nA.upperDir), l: d3(nA.lowerDir), pn: d3(nA.palmNormal), hd: d3(nA.handDir),
        fingers: [...nA.fingers], spread: nA.spread,
      },
      u: new THREE.Vector3(), l: new THREE.Vector3(), pn: new THREE.Vector3(), hd: new THREE.Vector3(),
    }
  }

  // ---- 다리 리그 + 실측 길이 (BodyPose knee/hipShift용) ----
  function legRig(side: 'left' | 'right'): LegRig {
    const upper = bone(`${side}UpperLeg` as VRMHumanBoneName)
    const lower = bone(`${side}LowerLeg` as VRMHumanBoneName)
    return { upper, lower, thigh: lower ? lower.position.length() : 0 }
  }

  const headNode = bone('head')
  const hipsNode = bone('hips')
  const legL = legRig('left')
  const legR = legRig('right')
  const footL = bone('leftFoot')
  const shin = footL ? footL.position.length() : 0
  const legLen = Math.max(legL.thigh + shin, 1e-3)

  const rig: Omit<Rig, 'hood' | 'fx' | 'acc'> = {
    vrm,
    S,
    neck: bone('neck'),
    head: headNode,
    chest: bone('upperChest') ?? bone('chest'),
    spine: bone('spine'),
    chestMid: bone('chest'),
    upperChestB: bone('upperChest'),
    rawChest: H.getRawBoneNode('chest'),
    hips: hipsNode,
    hipsRest: hipsNode ? hipsNode.position.clone() : new THREE.Vector3(),
    legL,
    legR,
    legLen,
    armL: armRig('left'),
    armR: armRig('right'),
    em: vrm.expressionManager ?? null,
    has: {
      blinkL: !!vrm.expressionManager?.getExpression('blinkLeft'),
      blinkR: !!vrm.expressionManager?.getExpression('blinkRight'),
      blink: !!vrm.expressionManager?.getExpression('blink'),
      aa: !!vrm.expressionManager?.getExpression('aa'),
      happy: !!vrm.expressionManager?.getExpression('happy'),
      relaxed: !!vrm.expressionManager?.getExpression('relaxed'),
      sad: !!vrm.expressionManager?.getExpression('sad'),
      surprised: !!vrm.expressionManager?.getExpression('surprised'),
      angry: !!vrm.expressionManager?.getExpression('angry'),
    },
  }

  // ---- 머리 바운딩 실측 → 후드 자동 스케일 ----
  root.updateMatrixWorld(true)

  // ---- 팔 FK 솔버 생성 (rest 상태·updateMatrixWorld 이후) ----
  // 리그 루트 월드 쿼터니언 하나로 VRM0/1 좌표 차이를 흡수 — armSolver.ts 참조.
  // stopAt = 팔이 매달린 몸통 본: 트래킹 팔 방향은 어깨라인 기저(몸통 기준)이므로
  // 몸통 lean/twist에 팔이 같이 실리도록 몸통 회전은 보상하지 않는다.
  {
    const rigRootQ = H.normalizedHumanBonesRoot.getWorldQuaternion(new THREE.Quaternion())
    const mkSolver = (a: ArmRig): ArmSolver | null => {
      if (!a.upper || !a.lower || !a.hand) return null
      const stopAt = (a.shoulder ?? a.upper).parent
      if (!stopAt) return null
      return new ArmSolver({
        upper: a.upper, lower: a.lower, hand: a.hand,
        middleProx: a.fingers[1].prox, indexProx: a.fingers[0].prox, littleProx: a.fingers[3].prox,
      }, stopAt, rigRootQ)
    }
    rig.armL.solver = mkSolver(rig.armL)
    rig.armR.solver = mkSolver(rig.armR)
  }

  const box = new THREE.Box3().setFromObject(vrm.scene)
  const headY = headNode ? headNode.getWorldPosition(new THREE.Vector3()).y : box.max.y * 0.85
  const crownH = Math.max(0.1, box.max.y - headY)
  const eL = bone('leftEye')
  const eR = bone('rightEye')
  let hw = crownH * 0.40
  if (eL && eR) {
    const d = Math.abs(eL.getWorldPosition(new THREE.Vector3()).x - eR.getWorldPosition(new THREE.Vector3()).x)
    if (d > 1e-3) hw = Math.max(hw * 0.7, d * 1.35)
  }

  // ---- 얼굴 평면 실측: 목보다 완전히 위에 있는 메시(=얼굴, 헤어/바디 제외)의
  //      월드 바운딩 → 후드 프레임(정면 -Z) 변환. raw 본 기준 — 메시와 같은 공간 보장.
  //      rotateVRM0 이후 월드 정면은 VRM0/1 공통 +Z 이므로 frontZ = -(maxZ - headZ).
  const headRaw = H.getRawBoneNode('head')
  const neckRaw = H.getRawBoneNode('neck')
  const headWp = headRaw ? headRaw.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, headY, 0)
  const neckYw = neckRaw ? neckRaw.getWorldPosition(new THREE.Vector3()).y : headY - crownH * 0.3
  const faceBox = new THREE.Box3()
  const tmpBox = new THREE.Box3()
  vrm.scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry) return
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    tmpBox.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld)
    if (tmpBox.min.y > neckYw) faceBox.union(tmpBox)
  })
  const face = faceBox.isEmpty()
    ? undefined
    : {
        frontZ: -(faceBox.max.z - headWp.z),
        halfW: Math.max(Math.abs(faceBox.max.x - headWp.x), Math.abs(faceBox.min.x - headWp.x)),
      }

  // avatar.vrm(리페인트 VRoid)에는 후드 지오메트리가 없으므로 프로시저럴
  // 플라밍고 후드(hood.ts)를 항상 켠다 — 레퍼런스의 시그니처 액세서리
  // (핑크 후드+부리+아이패치). 머리 바운딩 실측 스케일이라 모델 무관하게 맞는다.
  // 프로시저럴 스포츠재킷(clothing.ts)은 구 플라밍고 모델 전용 하드코딩 치수 —
  // avatar.vrm은 텍스처 리페인트(화이트 트랙탑+코랄 트림)로 의상을 표현하므로 중첩 금지.
  const hood = buildHood(crownH, hw, face)
  const fx = buildFx(crownH)
  fx.sweat.userData.baseY = fx.sweat.position.y
  if (S === -1) { // VRM1: 후드는 -Z 정면 프레임으로 빌드했으므로 π 뒤집기
    hood.pivot.rotation.y = Math.PI
    // fx.group은 hood.pivot의 자식이라 위 π를 상속한다 — 자체 회전을 더하면 2π(원위치)
  }
  headNode?.add(fx.group)
  headNode?.add(hood.pivot)

  // ---- 트랙재킷 액세서리 (손목밴드 + 후드 드로스트링) — 본 실측 자동 배치 ----
  // rest 포즈 월드 행렬 기준으로 산출하므로 위 updateMatrixWorld 이후·포즈 적용 전 빌드.
  // 손목밴드는 정규화 hand 본의 자식이므로 armSolver가 세팅하는 손목 회전
  // (palmNormal/handDir 기저)을 그대로 상속해 함께 돈다 — 별도 배선 불필요.
  const acc = buildAccessories({
    chest: rig.chest,
    neck: rig.neck ?? headNode,
    upperArmL: rig.armL.upper, upperArmR: rig.armR.upper,
    lowerArmL: rig.armL.lower, lowerArmR: rig.armR.lower,
    handL: rig.armL.hand, handR: rig.armR.hand,
  }, S)

  // ---- 높이/히트메시 갱신 ----
  root.updateMatrixWorld(true)
  const full = new THREE.Box3().setFromObject(root)
  api.height = full.max.y
  const hit: THREE.Object3D[] = [...hood.hitMeshes]
  vrm.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) hit.push(o) })
  api.hitMeshes = hit

  return { ...rig, hood, fx, acc }
}
