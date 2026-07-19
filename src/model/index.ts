/**
 * Mingo 3D 프로시저럴 모델 — 진입점.
 * createMingo(): MingoModel (계약: src/contract.ts)
 *
 * 파트 구조/본 트리/튜닝 포인트: src/model/README.md 참조.
 * 결정적: Math.random 없음, 모든 2차 모션은 dt 기반 스프링.
 */
import * as THREE from 'three'
import type { MingoModel, RigFrame, WingPose } from '../contract'
import { buildBody, NECK_SEG, type WingRig } from './body'
import { buildHead, EYE, type EyeRig } from './head'
import { Follower } from './springs'

const { clamp, lerp } = THREE.MathUtils

/** 목 체인 pitch/yaw 분배 (25/35/40 근사) */
const PITCH_SHARE = [0.22, 0.33, 0.45]
const YAW_SHARE = [0.20, 0.28, 0.27] // + 머리 0.25
/** idle S-커브 베이스 (플라밍고 목) */
const S_BASE = [0.16, -0.11, -0.07]

interface WingPoseCalc {
  shX: number; shZ: number
  elX: number; elZ: number
  fingerCurl: number; fingerFan: number
}

function wingTargets(w: WingPose, side: 1 | -1): WingPoseCalc {
  const raise = clamp(w.raise, 0, 1)
  const out = clamp(w.out, 0, 1)
  const curl = clamp(w.curl, 0, 1)
  const spread = clamp(w.spread, 0, 1)
  return {
    shX: -0.16 - raise * 0.30,
    shZ: side * (0.06 + out * 1.05 + raise * 1.45),
    elX: -0.24 * (1 - Math.max(out, raise)) - raise * 0.10,
    elZ: side * out * 0.35,
    fingerCurl: curl,
    fingerFan: 0.10 + spread * 0.5,
  }
}

const IDLE_WING: Omit<WingPoseCalc, 'shZ' | 'elZ'> & { shZ: number; elZ: number } = {
  shX: -0.55, shZ: -0.15, elX: 0.20, elZ: 0, fingerCurl: 0.35, fingerFan: 0.14,
}

export function createMingo(): MingoModel {
  const root = new THREE.Group()

  const body = buildBody()
  root.add(body.group)
  const head = buildHead()
  // 초대두 비율 보정: 머리 폭 ≈ 몸통 폭 (2D 타깃) — 0.172→0.187 vs 몸통 0.162
  const HEAD_SCALE = 1.09
  head.group.scale.setScalar(HEAD_SCALE)
  body.headSocket.add(head.group)

  // ---- 2차 모션 스프링 (팔로워: 머리 회전을 지연 추종 → 러그+오버슛) ----
  const crestFrontP = new Follower(120, 8.5, 0.45)
  const crestFrontY = new Follower(120, 8.5, 0.45)
  const crestBackP = new Follower(95, 7.5, 0.55)
  const crestBackY = new Follower(95, 7.5, 0.55)
  const scarfP = new Follower(80, 7, 0.4)
  const scarfY = new Follower(80, 7, 0.4)
  const tailP = new Follower(90, 8, 0.35)

  const headBaseY = NECK_SEG

  function applyWing(rig: WingRig, pose: WingPose, t: number) {
    const p = clamp(pose.present, 0, 1)
    const drv = wingTargets(pose, rig.side)
    const shX = lerp(IDLE_WING.shX, drv.shX, p)
    let shZ = lerp(rig.side * IDLE_WING.shZ, drv.shZ, p)
    const elX = lerp(IDLE_WING.elX, drv.elX, p)
    let elZ = lerp(rig.side * IDLE_WING.elZ, drv.elZ, p)
    // 인사 웨이브: 어깨 z축 사인 진동 (+ 팔꿈치 위상차 휩)
    const wv = clamp(pose.wave, 0, 1)
    if (wv > 0) {
      shZ += rig.side * wv * Math.sin(t * 9) * 0.30
      elZ += rig.side * wv * Math.sin(t * 9 + 1.1) * 0.22
    }
    rig.shoulder.rotation.set(shX, 0, shZ)
    rig.elbow.rotation.set(elX, 0, elZ)
    const curl = lerp(IDLE_WING.fingerCurl, drv.fingerCurl, p)
    const fan = lerp(IDLE_WING.fingerFan, drv.fingerFan, p)
    rig.fingers.forEach((f, i) => {
      const k = i - 1 // -1, 0, +1
      f.rotation.z = k * fan
      f.rotation.x = -(curl - 0.35) * 1.35
    })
  }

  function applyEye(eye: EyeRig, blink: number, gx: number, gy: number, fxHeart: boolean, fxHappy: boolean) {
    const bl = fxHappy ? 1 : clamp(blink, 0, 1)
    eye.lid.rotation.x = lerp(EYE.lidOpen, EYE.lidClosed, bl)
    eye.lidMesh.scale.y = lerp(EYE.ry * 1.09, EYE.rz * 1.6, bl)
    eye.lidMesh.scale.z = lerp(EYE.rz * 1.45, EYE.ry * 1.08, bl)
    eye.lashPivot.rotation.x = bl * EYE.lashSweep
    eye.lashPivot.scale.setScalar(1 - EYE.lashShrink * bl)
    // blink≈1: 래시 어셈블리 → 굵은 ∪ 커브(플릭 포함)로 스왑해 감은 눈 캐릭터성 유지
    const closedOn = !fxHappy && bl > 0.82
    eye.closedEye.visible = closedOn
    if (closedOn) eye.closedEye.scale.setScalar(0.9 + 0.1 * clamp((bl - 0.82) / 0.18, 0, 1))
    eye.lashPivot.visible = !fxHappy && !closedOn
    eye.lowerLash.visible = !fxHappy && !closedOn
    eye.happy.visible = fxHappy
    // 감은 눈/행복 눈에서는 전방 돔 홍채(하이라이트 포함)가 눈꺼풀 셸을 뚫지 않게 숨김
    eye.iris.visible = !closedOn && !fxHappy
    eye.iris.position.x = clamp(gx, -1, 1) * EYE.maxGX
    eye.iris.position.y = clamp(gy, -1, 1) * EYE.maxGY
    eye.irisNormal.visible = !fxHeart
    eye.heart.visible = fxHeart
  }

  const api: MingoModel = {
    root,
    height: 1.12, // 크레스트 포함 실측 높이 (헤드 1.09 업스케일 + 라운드 뒷볏 반영)
    hitMeshes: [head.mesh, body.torso, body.wingL.paddle, body.wingR.paddle],

    apply(frame: RigFrame, dt: number, t: number) {
      dt = clamp(dt, 1e-4, 0.05)
      const pitch = clamp(frame.head.pitch, -0.6, 0.6)
      const yaw = clamp(frame.head.yaw, -0.7, 0.7)
      const roll = clamp(frame.head.roll, -0.5, 0.5)

      // ---- 목 체인: pitch>0 → S 펴며 위로, pitch<0 → 목 접으며 움츠림 ----
      const tuck = Math.max(0, -pitch)
      const stretch = Math.max(0, pitch)
      const sScale = 1 + tuck * 1.5 - stretch * 0.85
      const segLen = NECK_SEG * (1 - tuck * 0.24 + stretch * 0.24)
      body.neck.forEach((bone, i) => {
        bone.rotation.x = S_BASE[i] * sScale - pitch * PITCH_SHARE[i]
        bone.rotation.y = yaw * YAW_SHARE[i]
        bone.rotation.z = i === 2 ? -roll * 0.15 : 0
        if (i > 0) bone.position.y = segLen
      })

      // ---- 머리 마무리 회전 + 호흡 바운스 ----
      const breathAmp = Math.sin(frame.breath * Math.PI * 2)
      head.group.rotation.set(-S_BASE[0] * sScale * 0.4, yaw * 0.25, -roll * 0.85)
      body.headSocket.position.y = headBaseY * (1 - tuck * 0.24 + stretch * 0.24)
      head.group.position.y = 0.003 * breathAmp

      // ---- 눈 (블링크/gaze/FX) ----
      applyEye(head.eyeL, frame.blinkL, frame.gaze.x, frame.gaze.y, frame.fx.heart, frame.fx.happy)
      applyEye(head.eyeR, frame.blinkR, frame.gaze.x, frame.gaze.y, frame.fx.heart, frame.fx.happy)

      // ---- 눈썹 (블링크 시 눈꺼풀 셸에 가리지 않게 이마 쪽으로 살짝 리프트) ----
      const blL = clamp(frame.blinkL, 0, 1)
      const blR = clamp(frame.blinkR, 0, 1)
      head.browL.position.y = 0.238 + clamp(frame.browL, -1, 1) * 0.016 + blL * 0.013
      head.browR.position.y = 0.238 + clamp(frame.browR, -1, 1) * 0.016 + blR * 0.013
      head.browL.position.z = 0.131 + blL * 0.008
      head.browR.position.z = 0.131 + blR * 0.008
      head.browL.rotation.z = 0.18 - clamp(frame.browL, -1, 1) * 0.10
      head.browR.rotation.z = -0.18 + clamp(frame.browR, -1, 1) * 0.10

      // ---- 부리 / 미소 ----
      head.jaw.rotation.x = clamp(frame.mouthOpen, 0, 1) * 0.85
      const smile = clamp(frame.mouthSmile, -1, 1)
      head.beak.rotation.x = -smile * 0.05
      const blushS = 1 + Math.max(0, smile) * 0.15
      head.blushL.scale.set(0.034 * blushS, 0.019 * blushS, 0.010)
      head.blushR.scale.set(0.034 * blushS, 0.019 * blushS, 0.010)

      // ---- 날개 ----
      applyWing(body.wingL, frame.wingL, t)
      applyWing(body.wingR, frame.wingR, t)

      // ---- FX ----
      head.sweat.visible = frame.fx.sweat
      if (frame.fx.sweat) head.sweat.position.y = 0.172 + Math.abs(Math.sin(t * 6)) * 0.007
      head.anger.visible = frame.fx.anger

      // ---- 호흡: 가슴 fluff + 몸통 미세 스케일 ----
      body.fluff.scale.setScalar(1 + 0.03 * breathAmp)
      body.torso.scale.y = 1 + 0.008 * breathAmp

      // ---- 2차 모션: 크레스트/스카프/꼬리 팔로우 스루 ----
      const dCFp = crestFrontP.step(pitch, dt)
      const dCFy = crestFrontY.step(yaw, dt)
      head.crestFront.rotation.x = dCFp * 0.8
      head.crestFront.rotation.z = dCFy * 0.55
      const dCBp = crestBackP.step(pitch, dt)
      const dCBy = crestBackY.step(yaw, dt)
      head.crestBack.rotation.x = dCBp * 1.0
      head.crestBack.rotation.z = dCBy * 0.7
      const dSp = scarfP.step(pitch, dt)
      const dSy = scarfY.step(yaw, dt)
      body.scarfTail.rotation.x = 0.14 + dSp * 0.5
      body.scarfTail.rotation.z = dSy * 0.45 - 0.02 * breathAmp
      const dTp = tailP.step(pitch, dt)
      body.tail.rotation.x = dTp * 0.4
    },
  }
  return api
}
