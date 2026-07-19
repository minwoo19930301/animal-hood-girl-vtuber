/**
 * 프로시저럴 플라밍고 후드 (키구루미) — refs/target-human.png 참조.
 * 정규화 head 본 로컬 프레임 기준으로 빌드: **정면 = -Z, 캐릭터-왼쪽 = -X** (VRM0 원공간).
 * VRM1 모델이면 index.ts가 pivot.rotation.y = π 로 뒤집는다.
 * 스케일은 전부 crownH(머리 본→정수리 높이)·hw(머리 반폭) 기반 자동 산출.
 */
import * as THREE from 'three'
import { PALETTE } from '../palette'
import { toonMat, unlitMat, addOutline } from './materials'
import { mergeShapes, taperedTube, unitSphereLo } from './geo'

export interface HoodRig {
  /** head 본에 어태치할 루트 (VRM1이면 y π 회전) */
  pivot: THREE.Group
  /** 셸+눈+부리 전체 — 2차 모션(고개 지연 추종) 회전 대상 */
  shellPivot: THREE.Group
  /** 부리만의 추가 출렁임 회전 대상 (shellPivot 자식 → 러그 중첩) */
  beakPivot: THREE.Group
  hitMeshes: THREE.Mesh[]
}

/** index.ts가 VRM 메시에서 실측해 넘기는 얼굴 바운딩 (후드 프레임: 정면 -Z) */
export interface FaceBounds {
  /** 얼굴 전방 평면 z (음수, 코끝) — 림이 이보다 뒤(+z)에 오거나 위에서만 드리운다 */
  frontZ: number
  /** 얼굴 반폭 (볼~귀 바깥) — 측면 림이 이보다 밖에 오도록 */
  halfW: number
}

/** 후드 전용 색 (target-human.png 샘플) — 브랜드 PALETTE와 별개 유지 */
export const HOOD_COL = {
  shell: 0xf2799e, shellShade: 0xd6588a,     // 겉감: 연핑크 → hue-shift 셰이드
  lining: 0xa3243f, liningShade: 0x7d1c31,   // 안감: 딥핑크 (레퍼런스 메시 질감 명도 -20%p)
  beak: 0xf78fa7, beakShade: 0xdb6a8e,       // 부리 살몬핑크
  beakTip: 0x28202e, beakTipShade: 0x191320, // 부리 끝 딥 (검보라 계열 블랙)
  eyeRim: 0xe4638f, eyeRimShade: 0xc44f7a,   // 눈판 둘레 핑크 링
  pupil: 0x221a29,
  lash: 0x3a2333,
  tear: 0xf2d94e,                            // 노란 눈물점
} as const

/** 개구부 축이 정면(-Z)에서 아래로 기운 각 (rad) */
const TILT = 0.22
/** 셸 개구부 타원 콘 반각 — 얼굴(이마 중간~턱, 양볼)이 여유 있게 전부 보이는 크기 */
const SHELL_AP = { ax: 0.98, ayUp: 0.52, ayDown: 1.05 } as const
/** 안감 개구부: 셸보다 살짝 좁게 → 림 안쪽 얇은 밴드로만 보임 (얼굴은 절대 안 덮음) */
const LINING_AP = { ax: 0.90, ayUp: 0.46, ayDown: 1.05 } as const

interface Aperture { ax: number; ayUp: number; ayDown: number }

/**
 * 얼굴 개구부(타원 포트홀)를 남긴 후드 셸 구.
 * -Z(정면)에서 아래로 TILT만큼 기운 축 둘레의 타원 콘 안쪽 버텍스를
 * 같은 φ 자오선의 림 커브로 이동(collapse)하고, **세 꼭짓점이 전부 콘 안쪽인
 * 삼각형은 인덱스에서 제거**한다 — 제거하지 않으면 축 근처에서 φ가 π 점프해
 * 림 반대편끼리 이어지는 "웹" 페이스가 개구부를 덮는다 (v2에서 얼굴을 가린 원인).
 * 경계에 걸친 삼각형만 남아 셸→림을 봉합하므로 림 에지는 매끈한 타원.
 * 위(ayUp)는 앞머리 위 오버행, 아래(ayDown 크게)는 바닥 컷과 합쳐져 턱 밑이 열린다.
 * y-바이어스 테이퍼로 아래가 살짝 통통한 두건形.
 */
function cutShellGeo(ap: Aperture, bias: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 48, 36, 0, Math.PI * 2, 0, Math.PI * 0.82)
  const P = new THREE.Vector3(0, -Math.sin(TILT), -Math.cos(TILT)) // 개구부 축
  const U = new THREE.Vector3(1, 0, 0)
  const V = new THREE.Vector3().crossVectors(P, U) // ≈ 아래 방향
  const pos = g.attributes.position
  const inside: boolean[] = new Array(pos.count).fill(false)
  const d = new THREE.Vector3()
  const e = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    d.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize()
    const cosT = THREE.MathUtils.clamp(d.dot(P), -1, 1)
    const thetaP = Math.acos(cosT)
    e.copy(d).addScaledVector(P, -cosT)
    const phiP = Math.atan2(e.dot(V), e.dot(U))
    const ay = Math.sin(phiP) > 0 ? ap.ayDown : ap.ayUp
    const cb = ay * Math.cos(phiP)
    const sb = ap.ax * Math.sin(phiP)
    const thetaB = (ap.ax * ay) / Math.sqrt(cb * cb + sb * sb)
    if (thetaP < thetaB) {
      inside[i] = true
      // 개구부 안 → 같은 φ 자오선의 림으로 이동 (경계 삼각형 봉합용)
      d.copy(P).multiplyScalar(Math.cos(thetaB))
        .addScaledVector(U, Math.cos(phiP) * Math.sin(thetaB))
        .addScaledVector(V, Math.sin(phiP) * Math.sin(thetaB))
      pos.setXYZ(i, d.x, d.y, d.z)
    }
  }
  // 전부-내부 삼각형 드롭 → 개구부가 실제 "구멍"이 된다
  const idx = g.getIndex()!
  const keep: number[] = []
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i)
    const b = idx.getX(i + 1)
    const c = idx.getX(i + 2)
    if (inside[a] && inside[b] && inside[c]) continue
    keep.push(a, b, c)
  }
  g.setIndex(keep)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const w = 1 + bias * y
    pos.setX(i, pos.getX(i) * w)
    pos.setZ(i, pos.getZ(i) * w)
  }
  g.computeVertexNormals()
  return g
}

export function buildHood(crownH: number, hw: number, face?: FaceBounds): HoodRig {
  const pivot = new THREE.Group()
  pivot.name = 'flamingoHood'
  const shellPivot = new THREE.Group()
  pivot.add(shellPivot)
  const hit: THREE.Mesh[] = []

  // ---- 셸 치수: 머리+헤어 볼륨을 감싸되 얼굴은 여는 두건 ----
  // 실측 얼굴 평면(face.frontZ)이 없으면 crownH 비례 폴백 (Shino 실측비 ≈ 0.50/0.48)
  const faceZ = face?.frontZ ?? -0.50 * crownH
  const faceHalfW = face?.halfW ?? 0.48 * crownH
  // GROW: 헤어 메시(네이비) 관통 방지 마진 — 셸 반경 일괄 +8%
  const GROW = 1.08
  const C = new THREE.Vector3(0, crownH * 0.42, crownH * 0.08)
  // rz 하한: 상단 림(개구부 위쪽 가장자리)이 얼굴 평면보다 앞(-Z)에서 앞머리 위로
  // 드리우도록 — 상단 림의 축방향 성분은 cos(ayUp - TILT)
  const rzDrape = (C.z - faceZ + crownH * 0.05) / Math.cos(SHELL_AP.ayUp - TILT)
  const rz = Math.max(hw * 1.85, crownH * 0.60, rzDrape) * GROW
  // rx 하한: 측면 림 x = sin(ax)·rx 가 얼굴 반폭 밖에 오도록
  const rx = Math.max(rz, hw * 1.90 * GROW, (faceHalfW + crownH * 0.06) / Math.sin(SHELL_AP.ax))
  const ry = crownH * 0.80 * GROW

  // ---- 겉감 셸 (타원 개구부: 얼굴 전부 오픈, 위 림만 앞머리 위 오버행) ----
  // 측면 림은 얼굴 평면보다 뒤(+z) — 얼굴이 개구부 밖으로 살짝 나온 느낌
  const shell = new THREE.Mesh(
    cutShellGeo(SHELL_AP, -0.10),
    toonMat(HOOD_COL.shell, HOOD_COL.shellShade),
  )
  shell.position.copy(C)
  shell.scale.set(rx, ry, rz)
  addOutline(shell, crownH * 0.030, PALETTE.nightPurple)
  shellPivot.add(shell)
  hit.push(shell)

  // ---- 안감 (진핑크): 셸보다 약간 좁은 개구부 → 림 안쪽 ~0.06rad 밴드로만 보임 ----
  const lining = new THREE.Mesh(
    cutShellGeo(LINING_AP, -0.10),
    toonMat(HOOD_COL.lining, HOOD_COL.liningShade, { doubleSide: true }),
  )
  lining.position.copy(C)
  lining.scale.set(rx * 0.985, ry * 0.985, rz * 0.99)
  shellPivot.add(lining)

  // ---- 부리 (상단 림 중앙에서 이마 위로 드리움, 연핑크 2/3 + 검정 딥 1/3) ----
  const beakPivot = new THREE.Group()
  beakPivot.position.set(0, C.y + ry * 0.46, C.z - rz * 0.78)
  shellPivot.add(beakPivot)
  const L = crownH
  // 통통한 연핑크 벌브가 아래로 드리움 → 정면에서 핑크 윗면이 크게 보인다
  // (레퍼런스: 큰 핑크 윗부리 + 검정 끝이 눈썹 근처까지 — 폭·길이 기존 대비 ~1.4x)
  const beakMain = new THREE.Mesh(
    taperedTube(
      [
        new THREE.Vector3(0, 0.08 * L, 0.12 * L), // 셸 안쪽 밑동
        new THREE.Vector3(0, 0.02 * L, -0.16 * L),
        new THREE.Vector3(0, -0.15 * L, -0.32 * L), // 아래로 드리움 (각도 하향)
      ],
      [0.33 * L, 0.29 * L, 0.16 * L],
      { scaleY: 0.9 },
    ),
    toonMat(HOOD_COL.beak, HOOD_COL.beakShade),
  )
  addOutline(beakMain, crownH * 0.022, PALETTE.nightPurple)
  const beakTip = new THREE.Mesh(
    taperedTube(
      [
        new THREE.Vector3(0, -0.135 * L, -0.30 * L), // 메인과 살짝 오버랩 (심 은폐)
        new THREE.Vector3(0, -0.25 * L, -0.37 * L),
        new THREE.Vector3(0, -0.33 * L, -0.365 * L), // 아래로 훅 — 눈썹 위까지만
        // (더 길면 pitch-down 출렁임 때 콧등까지 내려와 눈 사이를 가린다)
      ],
      [0.155 * L, 0.085 * L, 0.017 * L],
      { scaleY: 0.9 },
    ),
    toonMat(HOOD_COL.beakTip, HOOD_COL.beakTipShade),
  )
  addOutline(beakTip, crownH * 0.018, PALETTE.nightPurple)
  beakPivot.add(beakMain, beakTip)
  hit.push(beakMain)

  // ---- 플라밍고 눈 2개 — 레퍼런스: 검정 도미넌트 눈판 + 흰 하이라이트 대·소 +
  //      핑크 림 피핑 + 굵은 속눈썹 3가닥 + 노란 눈물점 ----
  const Re = crownH * 0.125
  const dir = new THREE.Vector3()
  for (const side of [-1, 1] as const) {
    const a = 0.54 // 정면(-Z)에서 수평으로 벌어진 각
    const e = 0.30 // 상향 각 — 확장된 개구부 밖의 단단한 셸 면에 오도록 (부리 좌우 위)
    dir.set(side * Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e))
    const g = new THREE.Group()
    g.position.set(
      C.x + dir.x * rx * 0.99,
      C.y + dir.y * ry * 0.99,
      C.z + dir.z * rz * 0.99,
    )
    // 로컬 +Z=바깥, +Y=수직 유지(롤 없는 베이시스).
    // setFromUnitVectors(z, dir)는 dir.z<0이라 ~146° 최단호 대회전이 되어
    // 로컬 Y가 안쪽으로 ~50° 기울고 하이라이트/속눈썹 배치가 통째로 뒤틀린다.
    const Zb = dir.clone().normalize()
    const Xb = new THREE.Vector3(0, 1, 0).cross(Zb).normalize()
    const Yb = Zb.clone().cross(Xb)
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(Xb, Yb, Zb))
    // 핑크 림 (검정 눈판 둘레로 피핑하는 뒤판 링)
    const rim = new THREE.Mesh(unitSphereLo(), toonMat(HOOD_COL.eyeRim, HOOD_COL.eyeRimShade))
    rim.scale.set(Re * 1.22, Re * 1.34, Re * 0.26)
    addOutline(rim, crownH * 0.022, PALETTE.nightPurple)
    g.add(rim)
    // 검정 눈판 (도미넌트)
    const eye = new THREE.Mesh(unitSphereLo(), unlitMat(HOOD_COL.pupil))
    eye.scale.set(Re, Re * 1.12, Re * 0.30)
    eye.position.z = Re * 0.05
    g.add(eye)
    // 흰 하이라이트: 상단 대형 + 하단 보조 소형 (조명 상수 무관 고정 배치)
    const hiBig = new THREE.Mesh(unitSphereLo(), unlitMat(0xffffff))
    hiBig.scale.set(Re * 0.34, Re * 0.30, Re * 0.08)
    hiBig.position.set(Re * 0.22, Re * 0.34, Re * 0.32)
    const hiSmall = new THREE.Mesh(unitSphereLo(), unlitMat(0xffffff))
    hiSmall.scale.set(Re * 0.14, Re * 0.13, Re * 0.06)
    hiSmall.position.set(-Re * 0.18, -Re * 0.12, Re * 0.33)
    g.add(hiBig, hiSmall)
    // 속눈썹 3가닥 (위쪽 방사형, 굵게) — 1메시 병합.
    // 림 링(1.34Re) 밖으로 확실히 삐져나오게 배치 — 링 다크 아웃라인과 겹치면 안 보인다
    const lashSeg = new THREE.CapsuleGeometry(Re * 0.15, Re * 0.62, 3, 8)
    const lashGeo = mergeShapes(
      ([-1, 0, 1] as const).map((k) => ({
        g: lashSeg,
        p: [k * Re * 0.78, Re * (1.34 - Math.abs(k) * 0.16), Re * 0.22] as [number, number, number],
        r: [0, 0, -k * 0.60] as [number, number, number],
      })),
    )
    lashSeg.dispose()
    g.add(new THREE.Mesh(lashGeo, unlitMat(HOOD_COL.lash)))
    // 노란 눈물점 (아래 삼각) — 림 하단
    const tear = new THREE.Mesh(new THREE.ConeGeometry(Re * 0.30, Re * 0.42, 3), unlitMat(HOOD_COL.tear))
    tear.rotation.z = Math.PI // 꼭지 아래
    tear.scale.z = 0.4
    tear.position.set(-side * Re * 0.15, -Re * 1.30, Re * 0.30)
    g.add(tear)
    shellPivot.add(g)
  }

  return { pivot, shellPivot, beakPivot, hitMeshes: hit }
}
