/**
 * 머리 파트: 계란형 머리 + 거대 눈 2개 + 부리(턱 본) + 크레스트 + 새우 핀 + FX.
 * 좌표계: group 원점 = 목 꼭대기(머리 밑동). 정면 +z. 캐릭터-왼쪽 = +x(뷰어 오른쪽).
 */
import * as THREE from 'three'
import { PALETTE } from '../palette'
import { toonMat, unlitMat, irisMat, addOutline } from './materials'
import { unitSphere, unitSphereLo, egg, teardrop, featherLobe, mergeShapes, taperedTube, ellipseArcTube, heartGeo, star4Geo } from './geo'

export const EYE = {
  rx: 0.0585, ry: 0.0708, rz: 0.0322, // 흰자 렌즈 반경 (z=납작)
  irisR: 0.052,                      // 납작 돔 — 실루엣 전체가 항상 보이는 완전원
  maxGX: 0.006, maxGY: 0.010,        // gaze 클램프 (렌즈 밖 금지)
  lidOpen: -0.9, lidClosed: 1.32,    // 눈꺼풀 셸 회전
  lashSweep: 1.75, lashShrink: 0.26, // 블링크 시 래시 스윕/수축
}

export interface EyeRig {
  group: THREE.Group
  lid: THREE.Group
  lidMesh: THREE.Mesh
  lashPivot: THREE.Group
  lowerLash: THREE.Object3D
  iris: THREE.Group
  irisNormal: THREE.Group
  heart: THREE.Object3D
  happy: THREE.Object3D
  /** 감은 눈 ∪ 커브 + 래시 플릭 (blink≈1에서 래시 어셈블리와 스왑) */
  closedEye: THREE.Object3D
}

export interface HeadRig {
  group: THREE.Group
  mesh: THREE.Mesh
  eyeL: EyeRig
  eyeR: EyeRig
  browL: THREE.Object3D
  browR: THREE.Object3D
  beak: THREE.Group
  jaw: THREE.Group
  blushL: THREE.Mesh
  blushR: THREE.Mesh
  crestFront: THREE.Group
  crestBack: THREE.Group
  sweat: THREE.Group
  anger: THREE.Group
}

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

function makeEye(side: 1 | -1): EyeRig {
  const { rx, ry, rz, irisR } = EYE
  const g = new THREE.Group()
  g.position.set(side * 0.080, 0.159, 0.128)
  g.rotation.y = side * 0.06          // 머리 곡면 따라 살짝 바깥 (크면 홍채가 안쪽으로 시차 밀림)
  g.rotation.z = side * 0.07          // 바깥쪽 ±4° 기울임 (outer edge up)

  // 흰자 렌즈 (unlit white + nightPurple 아웃라인)
  const lens = new THREE.Mesh(unitSphere(), unlitMat(PALETTE.white))
  lens.scale.set(rx, ry, rz)
  addOutline(lens, 0.0042, PALETTE.nightPurple)
  g.add(lens)

  // 홍채 어셈블리 (gaze로 렌즈 안에서 이동)
  // 납작 돔을 렌즈 앞면에 얹는다 — 보이는 원 = 홍채 실루엣 전체 (컵 교차 캡이 아님)
  // → 어떤 카메라 각도에서도 원이 줄거나 아래-안쪽으로 밀리지 않음. gaze 0,0 = 정중앙.
  const iris = new THREE.Group()
  iris.position.z = 0.0042
  const irisNormal = new THREE.Group()
  const irisBall = new THREE.Mesh(unitSphere(), irisMat(PALETTE.irisTop, PALETTE.irisBottom))
  irisBall.scale.set(irisR, irisR, 0.0165)
  irisBall.position.set(0, 0.001, 0.020)
  irisNormal.add(irisBall)
  const pupil = new THREE.Mesh(unitSphereLo(), unlitMat(PALETTE.irisBottom))
  pupil.scale.set(0.0260, 0.0260, 0.010)
  pupil.position.set(0, 0, 0.0330)
  irisNormal.add(pupil)
  // 하이라이트 3종 + 동공 점 (큰 하이라이트 좌상단 · 작은 스파클 우하단 고정)
  const hlBig = new THREE.Mesh(unitSphereLo(), unlitMat(PALETTE.white))
  hlBig.scale.set(0.0180, 0.0180, 0.004)
  hlBig.position.set(-0.0165, 0.0180, 0.0390)
  const sparkle = new THREE.Mesh(unitSphereLo(), unlitMat(PALETTE.white))
  sparkle.scale.set(0.0074, 0.0074, 0.003)
  sparkle.position.set(0.0185, -0.020, 0.0380)
  const star = new THREE.Mesh(star4Geo(0.022), unlitMat(PALETTE.white))
  star.position.set(0.005, 0.0400, 0.0330)
  const pupilDot = new THREE.Mesh(unitSphereLo(), unlitMat(PALETTE.white))
  pupilDot.scale.set(0.0052, 0.0052, 0.0025)
  pupilDot.position.set(-0.006, -0.012, 0.0430)
  irisNormal.add(hlBig, sparkle, star, pupilDot)
  iris.add(irisNormal)
  // 하트 홍채 FX (교체)
  const heartG = new THREE.Group()
  const heart = new THREE.Mesh(heartGeo(irisR * 2.05), unlitMat(PALETTE.deepPinkAccent))
  heart.position.z = 0.044
  const heartHl = new THREE.Mesh(unitSphereLo(), unlitMat(PALETTE.white))
  heartHl.scale.set(0.009, 0.009, 0.003)
  heartHl.position.set(-0.014, 0.013, 0.047)
  heartG.add(heart, heartHl)
  heartG.visible = false
  iris.add(heartG)
  g.add(iris)

  // 윗눈꺼풀 셸 (스킨톤, 본 회전 블링크)
  const lid = new THREE.Group()
  const lidGeo = new THREE.SphereGeometry(1, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2)
  const lidMesh = new THREE.Mesh(lidGeo, toonMat(PALETTE.plumageBase, PALETTE.plumageShade, { doubleSide: true }))
  lidMesh.scale.set(rx * 1.09, ry * 1.09, rz * 1.45)
  addOutline(lidMesh, 0.0036, PALETTE.outline)
  lid.add(lidMesh)
  lid.rotation.x = EYE.lidOpen
  g.add(lid)

  // 굵은 윗속눈썹 아크 + 바깥 래시 플릭 3개 (블링크 때 함께 스윕) — 정적 형제 병합 (6→1 드로우콜)
  const lashPivot = new THREE.Group()
  const lashMat = unlitMat(PALETTE.nightPurple)
  const outerDeg = side > 0 ? 22 : 158
  const oth = THREE.MathUtils.degToRad(outerDeg)
  const flickBase: [number, number, number] = [rx * 1.03 * Math.cos(oth), ry * 1.03 * Math.sin(oth), rz * 0.38]
  const lashGeo = mergeShapes([
    { g: ellipseArcTube(rx * 1.045, ry * 1.045, rz * 0.52, 26, 154, 0.0064) },
    ...[26, 154].map((deg) => {
      const th = THREE.MathUtils.degToRad(deg)
      return {
        g: unitSphereLo(),
        p: [rx * 1.045 * Math.cos(th), ry * 1.045 * Math.sin(th), rz * 0.52] as [number, number, number],
        s: 0.0064,
      }
    }),
    ...[0, 1, 2].map((i) => ({
      g: teardrop(0.020 + i * 0.004, 0.0068, 0.7),
      p: flickBase,
      r: [0, 0, side * -(0.95 + i * 0.35)] as [number, number, number], // 바깥쪽으로 눕는 플릭
    })),
  ])
  lashPivot.add(new THREE.Mesh(lashGeo, lashMat))
  g.add(lashPivot)

  // 얇은 아래 래시 (바깥 절반)
  const lowDeg: [number, number] = side > 0 ? [-62, -8] : [188, 242]
  const lowerLash = new THREE.Mesh(ellipseArcTube(rx * 1.02, ry * 1.02, rz * 0.30, lowDeg[0], lowDeg[1], 0.0026), lashMat)
  g.add(lowerLash)

  // ∪∪ 행복눈 (뚜껑 풀클로즈 + ∪ 커브) — 병합 1메시
  const happy = new THREE.Group()
  const happyGeo = mergeShapes([
    { g: ellipseArcTube(rx * 0.70, ry * 0.52, rz * 1.95, 197, 343, 0.0058) },
    ...[197, 343].map((deg) => {
      const th = THREE.MathUtils.degToRad(deg)
      return {
        g: unitSphereLo(),
        p: [rx * 0.70 * Math.cos(th), ry * 0.52 * Math.sin(th), rz * 1.95] as [number, number, number],
        s: 0.0058,
      }
    }),
  ])
  happy.add(new THREE.Mesh(happyGeo, lashMat))
  happy.visible = false
  g.add(happy)

  // 감은 눈 (2D eye_closed): 굵은 ∪ 커브 + 바깥쪽 래시 플릭 3개 — blink≈1에서 표시, 병합 1메시
  const closedEye = new THREE.Group()
  const closedZ = rz * 1.9
  const cDeg = side > 0 ? 341 : 199
  const cth = THREE.MathUtils.degToRad(cDeg)
  const cBase: [number, number, number] = [rx * 0.84 * Math.cos(cth), ry * 0.44 * Math.sin(cth), closedZ]
  const closedGeo = mergeShapes([
    { g: ellipseArcTube(rx * 0.84, ry * 0.44, closedZ, 199, 341, 0.0068) },
    ...[199, 341].map((deg) => {
      const th = THREE.MathUtils.degToRad(deg)
      return {
        g: unitSphereLo(),
        p: [rx * 0.84 * Math.cos(th), ry * 0.44 * Math.sin(th), closedZ] as [number, number, number],
        s: 0.0068,
      }
    }),
    ...[0, 1, 2].map((i) => ({
      g: teardrop(0.019 + i * 0.004, 0.0066, 0.7),
      p: cBase,
      r: [0, 0, side * -(1.35 + i * 0.38)] as [number, number, number], // 바깥-아래로 눕는 플릭
    })),
  ])
  closedEye.add(new THREE.Mesh(closedGeo, lashMat))
  closedEye.position.y = -0.006
  closedEye.visible = false
  g.add(closedEye)

  return { group: g, lid, lidMesh, lashPivot, lowerLash, iris, irisNormal, heart: heartG, happy, closedEye }
}

function makeBeak(): { beak: THREE.Group; jaw: THREE.Group } {
  const beak = new THREE.Group()
  beak.position.set(0, 0.100, 0.140)
  const salmon = toonMat(PALETTE.beakSalmon, PALETTE.blush)
  const night = unlitMat(PALETTE.beakTipNight)

  // 윗부리: 바나나 다운커브 — 마스터 스파인 "하나"를 u 구간으로 분할해
  // 살몬(0..0.70)과 나이트 딥 팁(0.66..1, 하단 1/3)을 같은 축 위에 굽는다.
  // → 팁이 별도 데칼 커브가 아니므로 요/피치 어떤 각도에서도 미끄러지거나 분리되지 않음.
  const spine = [V3(0, 0.012, -0.028), V3(0, 0.013, 0.008), V3(0, 0.007, 0.030), V3(0, -0.006, 0.044), V3(0, -0.024, 0.047)]
  const spineR = [0.031, 0.029, 0.022, 0.012, 0.0035]
  const master = new THREE.CatmullRomCurve3(spine)
  const radiusAt = (u: number) => {
    const f = u * (spineR.length - 1)
    const i = Math.min(Math.floor(f), spineR.length - 2)
    return spineR[i] * (1 - (f - i)) + spineR[i + 1] * (f - i)
  }
  const section = (u0: number, u1: number, n: number, sheath = 0) => {
    const pts: THREE.Vector3[] = []
    const radii: number[] = []
    for (let i = 0; i < n; i++) {
      const u = u0 + ((u1 - u0) * i) / (n - 1)
      pts.push(master.getPoint(u))
      radii.push(radiusAt(u) + sheath)
    }
    return { pts, radii }
  }
  const up = section(0, 0.70, 8)
  const upper = new THREE.Mesh(taperedTube(up.pts, up.radii, { scaleY: 0.62 }), salmon)
  addOutline(upper, 0.0034, PALETTE.nightPurple)
  beak.add(upper)
  const tp = section(0.64, 1, 7, 0.0009) // 살짝 겹침 + 얇은 시스 → 경계 틈/지파이팅 방지
  const tip = new THREE.Mesh(taperedTube(tp.pts, tp.radii, { scaleY: 0.62, seg: 16 }), night)
  addOutline(tip, 0.0028, PALETTE.nightPurple)
  beak.add(tip)

  // 아래부리 (jaw 본으로 mouthOpen 회전) + 혀
  const jaw = new THREE.Group()
  jaw.position.set(0, -0.008, 0.001)
  const lowerGeo = taperedTube(
    [V3(0, -0.003, -0.012), V3(0, -0.005, 0.008), V3(0, -0.011, 0.024), V3(0, -0.020, 0.034)],
    [0.026, 0.023, 0.015, 0.004],
    { scaleY: 0.55, seg: 18 },
  )
  const lower = new THREE.Mesh(lowerGeo, salmon)
  addOutline(lower, 0.0028, PALETTE.nightPurple)
  jaw.add(lower)
  // 입 안 (딥핑크) — beak_lower(jaw)에 고정: 아래부리보다 항상 작게 뒤에 숨어
  // 어떤 요/피치 각도에서도 측면으로 새지 않고, 입을 벌리면 jaw와 함께 드러남
  const inside = new THREE.Mesh(unitSphereLo(), unlitMat(PALETTE.irisBottom))
  inside.scale.set(0.016, 0.010, 0.012)
  inside.position.set(0, -0.002, 0.006)
  jaw.add(inside)
  const tongue = new THREE.Mesh(unitSphereLo(), unlitMat(PALETTE.blush))
  tongue.scale.set(0.010, 0.0045, 0.012)
  tongue.position.set(0, -0.0065, 0.011)
  jaw.add(tongue)
  beak.add(jaw)

  return { beak, jaw }
}

function makeCrests(): { crestFront: THREE.Group; crestBack: THREE.Group } {
  const plume = toonMat(PALETTE.plumageBase, PALETTE.plumageShade)
  // 앞머리: 3가닥 통통한 락 — 이마 표면 "앞"에 드리워 뷰어 오른쪽(+x)으로 스윕
  const crestFront = new THREE.Group()
  crestFront.position.set(0, 0, 0)
  const frontSpec: Array<[number, number, number, number, number, number, number]> = [
    // len, w, px, py, pz, rotX, rotZ
    [0.165, 0.095, -0.075, 0.281, 0.062, 1.55, -0.72],
    [0.145, 0.082, -0.012, 0.290, 0.072, 1.70, -1.02],
    [0.106, 0.066, 0.040, 0.276, 0.076, 1.82, -1.30],
  ]
  const frontGeo = mergeShapes(frontSpec.map(([len, w, px, py, pz, rx2, rz2]) => ({
    g: teardrop(len, w, 0.5),
    p: [px, py, pz] as [number, number, number],
    r: [rx2, 0, rz2] as [number, number, number],
  })))
  const frontMesh = new THREE.Mesh(frontGeo, plume)
  addOutline(frontMesh, 0.0045, PALETTE.outline)
  crestFront.add(frontMesh)
  // 뒷크레스트: 둥근 깃털 로브 4장이 겹치며 왼쪽 위(-x)로 부채꼴 — 하드 코너 금지.
  // 뿌리는 로브 길이의 ~28%를 머리 안에 파묻음 (2D의 80px 오버드로 상당).
  const crestBack = new THREE.Group()
  crestBack.position.set(-0.014, 0.252, -0.046)
  const backSpec: Array<{ len: number; w: number; px: number; rz: number }> = [
    { len: 0.210, w: 0.100, px: 0.000, rz: 0.30 },
    { len: 0.192, w: 0.092, px: -0.028, rz: 0.62 },
    { len: 0.168, w: 0.084, px: -0.054, rz: 0.95 },
    { len: 0.142, w: 0.076, px: -0.076, rz: 1.28 },
  ]
  const backGeo = mergeShapes(backSpec.map(({ len, w, px, rz }) => ({
    g: featherLobe(len, w, 0.34, -0.16),
    p: [px, -0.010, 0] as [number, number, number],
    r: [-0.12, 0, rz] as [number, number, number],
  })))
  // 로브 밑동을 머리 쪽으로 당겨 파묻기 (로컬 -y 방향 오프셋)
  backGeo.translate(0.012, -0.030, 0)
  const backMesh = new THREE.Mesh(backGeo, plume)
  addOutline(backMesh, 0.0050, PALETTE.outline)
  crestBack.add(backMesh)
  return { crestFront, crestBack }
}

function makeShrimpPin(): THREE.Group {
  const g = new THREE.Group()
  g.position.set(0.080, 0.262, 0.126)
  g.rotation.set(0.45, 0.18, 0.55)
  g.scale.setScalar(1.5) // 브랜드 참: 존재감 있게 (2D ~140px 상당)
  const body = new THREE.Mesh(new THREE.TorusGeometry(0.0148, 0.0068, 10, 20, 4.3), toonMat(PALETTE.beakSalmon, PALETTE.blush))
  addOutline(body, 0.0030, PALETTE.scarfGold) // 골드 아웃라인 + 살몬 필 대비
  g.add(body)
  // 꼬리 팬 2장 (아크 끝 t=4.3 rad 지점) — 병합 1메시
  const tailA = 4.3
  const tx = 0.0148 * Math.cos(tailA)
  const ty = 0.0148 * Math.sin(tailA)
  const fanGeo = mergeShapes([0, 1].map((i) => ({
    g: teardrop(0.015, 0.010, 0.5),
    p: [tx, ty, 0] as [number, number, number],
    r: [0, 0, tailA + Math.PI / 2 + (i - 0.5) * 0.55] as [number, number, number],
  })))
  g.add(new THREE.Mesh(fanGeo, toonMat(PALETTE.scarfGold, PALETTE.scarfGoldShade)))
  // 눈 점 (아크 시작 쪽)
  const eyeDot = new THREE.Mesh(unitSphereLo(), unlitMat(PALETTE.nightPurple))
  eyeDot.scale.setScalar(0.0024)
  eyeDot.position.set(0.0148, 0.004, 0.0062)
  g.add(eyeDot)
  return g
}

export function buildHead(): HeadRig {
  const group = new THREE.Group()
  const plume = toonMat(PALETTE.plumageBase, PALETTE.plumageShade)

  // 머리 계란 (위가 살짝 넓고 턱으로 테이퍼)
  const mesh = new THREE.Mesh(egg(0.172, 0.160, 0.155, 0.09), plume)
  mesh.position.set(0, 0.171, 0.005)
  addOutline(mesh, 0.0058, PALETTE.outline)
  group.add(mesh)

  // 볼 플러프 스캘럽 (아래 옆면 3개씩, 표면에 반쯤 파묻힘) — 6개 병합 (드로우콜 12→2)
  const cheekSpec: Array<[number, number, number, number]> = [
    [0.140, 0.095, 0.020, 0.010],
    [0.119, 0.070, 0.020, 0.009],
    [0.096, 0.048, 0.020, 0.0085],
  ]
  const cheekGeo = mergeShapes(
    ([1, -1] as const).flatMap((side) =>
      cheekSpec.map(([sx, sy, sz, r]) => ({
        g: unitSphereLo(),
        p: [side * sx, sy, sz] as [number, number, number],
        s: r,
      })),
    ),
  )
  const cheeks = new THREE.Mesh(cheekGeo, plume)
  addOutline(cheeks, 0.004, PALETTE.outline)
  group.add(cheeks)

  // 눈
  const eyeL = makeEye(1)
  const eyeR = makeEye(-1)
  group.add(eyeL.group, eyeR.group)

  // 눈썹 (깃털 터프트, 살짝 바깥 올림)
  const browGeoMat = unlitMat(PALETTE.browTone)
  const mkBrow = (side: 1 | -1) => {
    const b = new THREE.Mesh(unitSphereLo(), browGeoMat)
    b.scale.set(0.0165, 0.0060, 0.005)
    b.position.set(side * 0.084, 0.238, 0.131)
    b.rotation.z = side * 0.18
    group.add(b)
    return b
  }
  const browL = mkBrow(1)
  const browR = mkBrow(-1)

  // 부리 + 턱
  const { beak, jaw } = makeBeak()
  group.add(beak)

  // 블러시 (반투명 타원 + 사선 스트로크 — 스트로크 3개 병합)
  const mkBlush = (side: 1 | -1) => {
    const m = new THREE.Mesh(unitSphereLo(), unlitMat(PALETTE.blush, 0.55))
    m.scale.set(0.033, 0.018, 0.010)
    m.position.set(side * 0.114, 0.083, 0.086)
    m.rotation.y = side * 0.42
    m.renderOrder = 5
    const strokeGeo = mergeShapes([0, 1, 2].map((i) => ({
      g: unitSphereLo(),
      p: [-0.55 + i * 0.55, 0, 0.55] as [number, number, number],
      r: [0, 0, 0.32] as [number, number, number],
      s: [0.10, 0.62, 0.28] as [number, number, number], // 부모 스케일 기준 상대
    })))
    const strokes = new THREE.Mesh(strokeGeo, unlitMat(PALETTE.deepPinkAccent, 0.4))
    strokes.renderOrder = 6
    m.add(strokes)
    group.add(m)
    return m
  }
  const blushL = mkBlush(1)
  const blushR = mkBlush(-1)

  // 크레스트 + 새우 핀
  const { crestFront, crestBack } = makeCrests()
  group.add(crestFront, crestBack, makeShrimpPin())

  // FX: 땀방울 (오른쪽 관자놀이 = 뷰어 오른쪽 +x) — 110px급 티어드롭, 눈 옆 관자놀이 높이
  const sweat = new THREE.Group()
  sweat.position.set(0.152, 0.172, 0.112)
  const drop = new THREE.Mesh(teardrop(0.098, 0.062, 0.75), unlitMat(PALETTE.lagoonBG))
  drop.position.y = -0.030
  addOutline(drop, 0.0032, PALETTE.nightPurple)
  sweat.add(drop)
  const glint = new THREE.Mesh(unitSphereLo(), unlitMat(PALETTE.white))
  glint.scale.set(0.0080, 0.0112, 0.004)
  glint.position.set(-0.009, 0.004, 0.024)
  sweat.add(glint)
  sweat.rotation.z = -0.18
  sweat.visible = false
  group.add(sweat)

  // FX: 분노 마크 (왼쪽 이마 = -x, 십자 힘줄) — 세그 4개 병합 1메시
  const anger = new THREE.Group()
  anger.position.set(-0.112, 0.232, 0.122)
  anger.rotation.set(0.18, -0.55, 0)
  const segGeo = new THREE.CapsuleGeometry(0.0040, 0.015, 4, 10)
  const angerGeo = mergeShapes((
    [
      [0, 0.0135, Math.PI / 2],
      [0, -0.0135, Math.PI / 2],
      [0.0135, 0, 0],
      [-0.0135, 0, 0],
    ] as Array<[number, number, number]>
  ).map(([px, py, rot]) => ({
    g: segGeo,
    p: [px, py, 0] as [number, number, number],
    r: [0, 0, rot] as [number, number, number],
  })))
  segGeo.dispose()
  anger.add(new THREE.Mesh(angerGeo, unlitMat(PALETTE.deepPinkAccent)))
  anger.visible = false
  group.add(anger)

  return { group, mesh, eyeL, eyeR, browL, browR, beak, jaw, blushL, blushR, crestFront, crestBack, sweat, anger }
}
