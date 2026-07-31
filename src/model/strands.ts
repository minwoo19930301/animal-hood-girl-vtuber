/**
 * strands — 머리카락처럼 흔들리는 분절 체인.
 *
 * 왜 필요한가: 꼬리를 단일 테이퍼 튜브로 만들고 루트만 회전시키면 막대가 통째로 돌아
 * '뻣뻣'하게 읽힌다. 갈기를 블롭으로 채우면 '거품'으로 읽힌다(둘 다 사용자 지적).
 * 머리카락 느낌은 (1) 가닥이 여러 분절로 나뉘고 (2) 모션이 밑동→끝으로 시간 지연되며
 * 전파되고 (3) 가닥마다 위상·길이가 달라야 나온다.
 *
 * 여기서는 분절마다 Group 피벗을 쌓고, 각 분절이 자기 Follower(스프링)로 상위 신호를
 * 늦게 따라가게 한다. 끝으로 갈수록 스프링을 무르게 해서 채찍처럼 늦게 휘고, idle
 * 사인의 위상을 분절 인덱스로 밀어 파동이 타고 내려가게 한다. 전부 결정적이다
 * (Math.random 금지 — 룩덱 렌더 재현성 유지).
 */
import * as THREE from 'three'
import { PALETTE } from '../palette'
import { taperedTube, unitSphereLo } from './geo'
import { toonMat, addOutline } from './animals/hoodKit'
import { Follower } from './springs'

export interface StrandSpec {
  /** 분절 수 (2~12) — 많을수록 파동이 부드럽다. 꼬리 9, 갈기 3 정도. */
  segments: number
  /** 가닥 전체 길이 (world) */
  length: number
  /** 밑동 반지름 (world) */
  radius: number
  /** 끝 반지름 / 밑동 반지름 */
  taper: number
  base: number
  baseShade: number
  /** 끝단 색 (없으면 base 유지) */
  tip?: number | null
  tipShade?: number | null
  /** 정지 자세에서 분절마다 누적되는 굽힘 (rad) — 자연스러운 곡선 */
  restBend: number
  /** idle 흔들림 진폭 (rad, 끝 분절 기준) */
  amp: number
  /** idle 주파수 (rad/s) */
  freq: number
  /** 가닥 고유 위상 — 가닥마다 다르게 줘야 군집이 한 몸처럼 움직이지 않는다 */
  phase: number
  /** 끝에 둥근 뭉치 (사자 꼬리) */
  tuft?: boolean
  /** 아웃라인 두께 (0이면 생략 — 갈기처럼 가닥이 많을 때 드로우콜 절약) */
  outline?: number
  /** 머리 반대 방향 반응 세기 (1 = 기본, 0 = 반응 없음) */
  counter?: number
  /** 분절 색 교대 [색, 셰이드] — 지정하면 홀수 분절이 이 색이 된다(라쿤 링무늬) */
  rings?: [number, number] | null
  /** 끝으로 갈수록 누적되는 추가 굽힘 (rad/분절) — 전체적인 꼬불거림 */
  curl?: number
  /**
   * 끝단에 집중되는 굽힘 (rad/분절) — t^3 가중이라 마지막 2~3분절만 크게 말린다.
   * 원숭이처럼 '끄트머리가 둥글게 말린' 꼬리를 만들 때 쓴다(curl은 전체 곡률).
   */
  tipCurl?: number
  /** 분절마다 주는 비틀림 (rad) — curl과 합쳐 3D 코일이 된다 */
  twist?: number
}

export interface StrandRig {
  root: THREE.Group
  sway(pitchS: number, yaw: number, breath: number, dt: number): void
}

/**
 * 한 가닥을 만든다. 로컬 기준: 가닥은 -Y(아래)로 자라고, +Z가 바깥(방사)이다.
 * 반환 root를 원하는 앵커에 add하고 매 프레임 sway를 호출한다.
 */
export function buildStrand(spec: StrandSpec): StrandRig {
  const n = Math.max(2, Math.min(12, spec.segments))
  const segLen = spec.length / n
  const root = new THREE.Group()
  root.name = 'strand'

  const pivots: THREE.Group[] = []
  const followers: Follower[] = []
  const restZ: number[] = []
  // 분절 회전은 체인을 따라 누적된다 — 분절 수로 나누지 않으면 마디를 늘릴 때마다
  // 총 회전량이 비례해 커져 끝이 원뿔을 그리며 돈다('헬리콥터' 버그).
  // 기준 분절 수 4를 유지 척도로 삼아 모든 각도 스펙을 정규화한다.
  const norm = 4 / n
  const curl = (spec.curl ?? 0) * norm
  const tipCurl = (spec.tipCurl ?? 0) * norm
  const twist = (spec.twist ?? 0) * norm
  let parent: THREE.Object3D = root

  for (let i = 0; i < n; i++) {
    const pivot = new THREE.Group()
    pivot.position.y = i === 0 ? 0 : -segLen
    // 정지 자세: 기본 굽힘 + 끝으로 갈수록 누적되는 curl (꼬불), twist는 코일 축
    const t = i / Math.max(1, n - 1)
    const rest = spec.restBend + curl * (0.35 + 0.65 * t) + tipCurl * Math.pow(t, 3)
    restZ.push(rest)
    pivot.rotation.z = rest
    pivot.rotation.y = twist
    parent.add(pivot)
    pivots.push(pivot)
    // 끝으로 갈수록 무른 스프링 → 지연이 커지고 채찍처럼 휜다
    followers.push(new Follower(70 - i * 11, 6.2 - i * 0.7, 0.5))

    const t0 = i / n
    const t1 = (i + 1) / n
    const r0 = spec.radius * (1 - (1 - spec.taper) * t0)
    const r1 = spec.radius * (1 - (1 - spec.taper) * t1)
    const isTipSegment = i === n - 1 && spec.tip != null
    const isRing = spec.rings != null && i % 2 === 1
    const mesh = new THREE.Mesh(
      taperedTube(
        [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -segLen * 0.5, 0), new THREE.Vector3(0, -segLen, 0)],
        [r0, (r0 + r1) / 2, r1],
      ),
      isRing && spec.rings
        ? toonMat(spec.rings[0], spec.rings[1])
        : isTipSegment
          ? toonMat(spec.tip as number, spec.tipShade ?? (spec.tip as number))
          : toonMat(spec.base, spec.baseShade),
    )
    if (spec.outline && spec.outline > 0) addOutline(mesh, spec.outline, PALETTE.nightPurple)
    pivot.add(mesh)
    parent = pivot
  }

  if (spec.tuft) {
    const tuft = new THREE.Mesh(
      unitSphereLo(),
      toonMat(spec.tip ?? spec.base, spec.tipShade ?? spec.baseShade),
    )
    tuft.scale.setScalar(spec.radius * 2.1)
    tuft.position.y = -segLen
    if (spec.outline && spec.outline > 0) addOutline(tuft, spec.outline, PALETTE.nightPurple)
    pivots[pivots.length - 1].add(tuft)
  }

  let clock = 0
  // 분절별 스무딩 상태 — 끝으로 갈수록 시간상수를 키워 반응이 늦게 도착한다.
  const smoothYaw = new Array<number>(n).fill(0)
  const smoothPitch = new Array<number>(n).fill(0)
  const counter = spec.counter ?? 1

  return {
    root,
    sway(pitchS, yaw, breath, dt) {
      clock += dt
      for (let i = 0; i < n; i++) {
        const depth = (i + 1) / n // 끝일수록 크게 흔들린다
        // 위상을 분절 인덱스로 밀어 파동이 밑동→끝으로 타고 내려간다
        const wave = Math.sin(clock * spec.freq - i * 0.75 + spec.phase)
        const wave2 = Math.sin(clock * spec.freq * 0.53 - i * 0.5 + spec.phase * 1.7)
        const idle = spec.amp * norm * depth * (0.72 * wave + 0.38 * wave2)
        // 머리 반대 방향 반응 (사용자 디렉션: 고개를 오른쪽으로 돌리면 꼬리는 왼쪽으로).
        // 부호는 실측으로 확정했다 — 앵커가 x축 −2.62rad 젖혀져 있어 로컬 z 회전이
        // 월드에서 뒤집히므로, 반대 방향을 얻으려면 +부호가 맞다(CDP로 꼬리끝 월드 x 측정).
        // 시간상수 0.18~0.45s — 트래킹 노이즈가 꼬리에 그대로 실리지 않게 느리게 따라간다
        const rate = 1 - Math.exp(-dt * (5.5 - i * 0.55))
        smoothYaw[i] += (yaw - smoothYaw[i]) * rate
        smoothPitch[i] += (pitchS - smoothPitch[i]) * rate
        pivots[i].rotation.z = restZ[i] + idle + counter * smoothYaw[i] * 1.05 * norm * depth
        // x축(앞뒤)은 작게만 — z축 스윙과 섞이면 끝이 원을 그린다.
        pivots[i].rotation.x = counter * smoothPitch[i] * 0.06 * norm * depth
      }
    },
  }
}

/** 여러 가닥을 한 리그로 묶는다. */
export function groupStrands(strands: StrandRig[]): StrandRig {
  const root = new THREE.Group()
  root.name = 'strandGroup'
  for (const s of strands) root.add(s.root)
  return {
    root,
    sway(pitchS, yaw, breath, dt) {
      for (const s of strands) s.sway(pitchS, yaw, breath, dt)
    },
  }
}
