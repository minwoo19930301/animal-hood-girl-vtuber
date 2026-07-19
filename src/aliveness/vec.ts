/**
 * Dir3(정규화 방향벡터) 유틸 — 계약 v2 ArmPose 융합/생성용.
 * 규칙: 방향벡터 보간은 반드시 "성분 lerp 후 재정규화" (BRIEF 생명감 섹션).
 * 전부 순수 함수 + in-place 변형 지원 (60fps GC 압박 회피).
 */
import type { Dir3 } from '../contract'

const EPS = 1e-6

/** out에 (x,y,z)를 정규화해 기록. 길이 0 근처면 안전 기본값(아래 방향) 유지. */
export function setNorm(out: Dir3, x: number, y: number, z: number): void {
  const len = Math.sqrt(x * x + y * y + z * z)
  if (len < EPS) {
    out.x = 0
    out.y = -1
    out.z = 0
    return
  }
  out.x = x / len
  out.y = y / len
  out.z = z / len
}

/** a→b 성분 lerp 후 재정규화, out에 기록 (out === a 여도 안전). 퇴화 시 b 유지. */
export function lerpDirInto(out: Dir3, a: Dir3, b: Dir3, k: number): void {
  const x = a.x + (b.x - a.x) * k
  const y = a.y + (b.y - a.y) * k
  const z = a.z + (b.z - a.z) * k
  const len = Math.sqrt(x * x + y * y + z * z)
  if (len < EPS) {
    // 정반대 벡터의 중간점 등 퇴화 케이스 — 목표측(b)으로 스냅 (b는 정규화 전제)
    out.x = b.x
    out.y = b.y
    out.z = b.z
    return
  }
  out.x = x / len
  out.y = y / len
  out.z = z / len
}

/** a→b 성분 lerp + 재정규화 — 새 Dir3 반환 (compose()의 프레임 조립용) */
export function lerpDir(a: Dir3, b: Dir3, k: number): Dir3 {
  const out: Dir3 = { x: 0, y: 0, z: 0 }
  lerpDirInto(out, a, b, k)
  return out
}

export function copyDirInto(dst: Dir3, src: Dir3): void {
  dst.x = src.x
  dst.y = src.y
  dst.z = src.z
}
