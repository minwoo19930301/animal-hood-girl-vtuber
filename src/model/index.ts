/**
 * VRM 휴머노이드 모델 + 프로시저럴 플라밍고 후드 — 진입점.
 * createMingo(): MingoModel (계약: src/contract.ts)
 *
 * - 동기 생성 + `ready` 프라미스로 VRM 비동기 로드. 로드 전 apply()는 no-op.
 * - 리그는 정규화 본(normalized human bones)에만 쓴다: rest 회전이 항등이라
 *   모델(VRM0/VRM1)과 무관하게 축이 예측 가능. 부호는 S(±1)로 흡수:
 *   VRM0 원공간은 정면 -Z(S=+1), VRM1은 +Z(S=-1). rotateVRM0가 씬을 π 회전시켜
 *   두 경우 모두 월드 정면 = +Z (계약).
 * - 결정적: Math.random 없음, 2차 모션은 전부 dt 기반 스프링.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  VRM, VRMLoaderPlugin, VRMUtils,
  type MToonMaterial, type VRMExpressionManager, type VRMHumanBoneName,
} from '@pixiv/three-vrm'
import type { MingoModel, RigFrame, WingPose } from '../contract'
import { TOON } from '../palette'
import { Follower } from './springs'
import { buildHood, type HoodRig } from './hood'
import { buildFx, type FxRig } from './fx'

const { clamp } = THREE.MathUtils

/** ★ 사용자 VRoid 모델 교체 지점: public/models/에 .vrm을 넣고 이 경로만 바꾼다 */
const MODEL_URL = './models/placeholder.vrm'

/** 머리 회전 분배: neck 40% + head 60% */
const NECK_SHARE = 0.4
const HEAD_SHARE = 0.6

/** 팔 FK 포즈 튜닝 상수 (rad) — VRM T포즈 기준 upperArm z 회전으로 A포즈化 */
export const ARM = {
  idleDown: 1.12,      // present=0 차렷: 팔 내림 각 (T포즈→A포즈)
  raiseSwing: 1.55,    // raise=1: 내림각에서 빼는 양 (수평 지나 위로)
  outSwing: 0.80,      // out=1: 옆으로 벌리는 양
  minDown: -0.85,      // 위 스윙 한계
  shoulderRaise: 0.20, // raise 시 어깨 본 보조 리프트
  elbowIdle: 0.35,     // 차렷 팔꿈치 살짝 전방 굽힘
  waveAmp: 0.26,       // wave 어깨 사인 진동 진폭
  waveHz: 9,           // wave 각속도
} as const

/** 손가락 curl 관절별 회전량 — curl 하나로 전 관절 비례 (thumb은 축이 달라 별도) */
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

interface ArmRig {
  /** Z축(팔 내리기/손가락 말기) 부호 = side·S (VRM0 왼팔 = +1) */
  sign: number
  /**
   * Y축(팔꿈치 굽힘/spread/엄지 curl) 부호 = side만 (S 미포함).
   * Y축 회전은 VRM0↔VRM1 π-플립(Ry(π) 켤레변환)에 불변이라 S를 곱하면
   * VRM1에서 방향이 반전된다 — 역관절 팔꿈치/히치하이커 엄지/교차 손가락.
   */
  sideSign: number
  shoulder: Node3
  upper: Node3
  lower: Node3
  hand: Node3
  fingers: FingerRig[]
  thumb: Node3[]
}

interface Rig {
  vrm: VRM
  S: number
  neck: Node3
  head: Node3
  chest: Node3
  rawChest: Node3
  armL: ArmRig
  armR: ArmRig
  em: VRMExpressionManager | null
  has: Record<'blinkL' | 'blinkR' | 'blink' | 'aa' | 'happy' | 'sad' | 'surprised', boolean>
  hood: HoodRig
  fx: FxRig
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

export function createMingo(): MingoModel {
  const root = new THREE.Group()

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
        if (has.aa) em.setValue('aa', clamp(frame.mouthOpen, 0, 1))
        const smile = clamp(frame.mouthSmile, -1, 1)
        if (has.happy) em.setValue('happy', frame.fx.happy ? 1 : Math.max(0, smile) * 0.6)
        if (has.sad) em.setValue('sad', Math.max(0, -smile) * 0.4)
        if (has.surprised) {
          const browRaise = Math.max(clamp(frame.browL, -1, 1), clamp(frame.browR, -1, 1))
          em.setValue('surprised', Math.max(0, browRaise) * 0.3)
        }
      }

      // ---- 호흡: chest 미세 회전/스케일 + 어깨 들썩 ----
      const breathAmp = Math.sin(frame.breath * Math.PI * 2)
      rig.chest?.rotation.set(S * 0.012 * breathAmp, 0, 0)
      rig.rawChest?.scale.setScalar(1 + 0.006 * breathAmp)
      const breathLift = 0.02 * (0.5 + 0.5 * breathAmp)

      // ---- 팔 = WingPose intents (FK 블렌드) ----
      applyArm(rig.armL, frame.wingL, t, breathLift)
      applyArm(rig.armR, frame.wingR, t, breathLift)

      // ---- 후드 2차 모션 (고개 지연 추종) ----
      const hp = hoodP.step(S * pitch, dt)
      const hy = hoodY.step(yaw, dt)
      rig.hood.shellPivot.rotation.set(hp * 0.35, hy * 0.28, 0)
      const bp = beakP.step(S * pitch, dt)
      const by = beakY.step(yaw, dt)
      // 부리 pitch 오버슈트 0.55→0.32: 고개 숙임 때 부리 끝이 눈썹 아래로 안 내려오게
      rig.hood.beakPivot.rotation.set(bp * 0.32, 0, -by * 0.30)

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

  function applyArm(a: ArmRig, w: WingPose, t: number, breathLift: number) {
    const s = a.sign        // Z축 성분용 (side·S)
    const sd = a.sideSign   // Y축 성분용 (side만 — S 불변축)
    const p = clamp(w.present, 0, 1)
    const raise = clamp(w.raise, 0, 1) * p
    const out = clamp(w.out, 0, 1) * p
    const wv = clamp(w.wave, 0, 1)
    let down = ARM.idleDown - raise * ARM.raiseSwing - out * ARM.outSwing
    down = Math.max(down, ARM.minDown)
    if (wv > 0) down += Math.sin(t * ARM.waveHz) * ARM.waveAmp * wv
    a.upper?.rotation.set(0, 0, s * down)
    const bend =
      ARM.elbowIdle * (1 - Math.max(raise, out) * 0.65) +
      raise * 0.12 +
      (wv > 0 ? Math.sin(t * ARM.waveHz + 1.1) * 0.12 * wv : 0)
    a.lower?.rotation.set(0, -sd * bend, 0)
    a.shoulder?.rotation.set(0, 0, -s * (raise * ARM.shoulderRaise + breathLift))
    a.hand?.rotation.set(0, 0, s * 0.05)
    // 손가락: curl은 present와 무관하게 항상 반영 (주먹 intent 단독 사용 가능)
    const curl = clamp(w.curl, 0, 1)
    const spread = clamp(w.spread, 0, 1)
    for (const f of a.fingers) {
      f.prox?.rotation.set(0, -sd * spread * SPREAD_MAX * f.k, s * curl * FINGER_CURL.proximal)
      f.inter?.rotation.set(0, 0, s * curl * FINGER_CURL.intermediate)
      f.dist?.rotation.set(0, 0, s * curl * FINGER_CURL.distal)
    }
    for (let i = 0; i < a.thumb.length; i++) {
      a.thumb[i]?.rotation.set(0, sd * curl * THUMB_CURL[i], 0)
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
    }
  }

  const headNode = bone('head')
  const rig: Omit<Rig, 'hood' | 'fx'> = {
    vrm,
    S,
    neck: bone('neck'),
    head: headNode,
    chest: bone('upperChest') ?? bone('chest'),
    rawChest: H.getRawBoneNode('chest'),
    armL: armRig('left'),
    armR: armRig('right'),
    em: vrm.expressionManager ?? null,
    has: {
      blinkL: !!vrm.expressionManager?.getExpression('blinkLeft'),
      blinkR: !!vrm.expressionManager?.getExpression('blinkRight'),
      blink: !!vrm.expressionManager?.getExpression('blink'),
      aa: !!vrm.expressionManager?.getExpression('aa'),
      happy: !!vrm.expressionManager?.getExpression('happy'),
      sad: !!vrm.expressionManager?.getExpression('sad'),
      surprised: !!vrm.expressionManager?.getExpression('surprised'),
    },
  }

  // ---- 머리 바운딩 실측 → 후드 자동 스케일 ----
  root.updateMatrixWorld(true)
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

  const hood = buildHood(crownH, hw, face)
  const fx = buildFx(crownH)
  fx.sweat.userData.baseY = fx.sweat.position.y
  if (S === -1) { // VRM1: 후드는 -Z 정면 프레임으로 빌드했으므로 π 뒤집기
    hood.pivot.rotation.y = Math.PI
    // fx.group은 hood.pivot의 자식이라 위 π를 상속한다 — 자체 회전을 더하면 2π(원위치)
  }
  hood.pivot.add(fx.group)
  headNode?.add(hood.pivot)

  // ---- 높이/히트메시 갱신 ----
  root.updateMatrixWorld(true)
  const full = new THREE.Box3().setFromObject(root)
  api.height = full.max.y
  const hit: THREE.Object3D[] = [...hood.hitMeshes]
  vrm.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) hit.push(o) })
  api.hitMeshes = hit

  return { ...rig, hood, fx }
}
