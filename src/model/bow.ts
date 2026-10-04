/**
 * 허리 숙임(motion.bow)의 골반 자세 — 모델 없이도 검증할 수 있게 순수 수식으로 떼어 둔 것 (scripts/test-reactions.mjs 가 이 함수로 발이 제자리인지 확인한다).
 *
 * 몸통 앞 숙임은 로컬 x 회전 -S·bow 다 (torsoEuler 와 같은 규약, S = VRM0 +1 / VRM1 -1).
 * 골반(hips)을 이만큼 접으면 hips 의 자식인 다리가 같이 뒤로 휘두르니
 *  - 허벅지에 +S·bow 를 되돌려 주어 다리를 월드에서 곧게 세우고,
 *  - 접는 축이 hips 원점이 아니라 고관절 중점(pivot)이므로, 그 점이 제자리에 남도록 hips 위치를 (c - R·c) 만큼 옮긴다.
 * 이렇게 하면 허벅지·정강이·발은 월드에서 움직이지 않고 상체만 고관절을 축으로 앞으로 접힌다.
 */
export interface BowPose {
  /** hips 로컬 x 회전 (rad) */
  hipsRotX: number
  /** hips 위치 보정 (hips 로컬 y, z) — 고관절 중점을 제자리에 두는 값 */
  hipsDY: number
  hipsDZ: number
  /** 허벅지 로컬 x 회전에 더할 값 (rad) */
  thighRotX: number
}

export function createBowPose(): BowPose {
  return { hipsRotX: 0, hipsDY: 0, hipsDZ: 0, thighRotX: 0 }
}

/** pivotY/Z = 두 고관절 중점의 hips 로컬 좌표(rest). bow = 숙임 각 (rad, +앞). out 을 제자리에서 채운다 */
export function bowPose(out: BowPose, pivotY: number, pivotZ: number, S: number, bow: number): BowPose {
  const a = -S * bow
  const cs = Math.cos(a)
  const sn = Math.sin(a)
  out.hipsRotX = a
  out.hipsDY = pivotY - (pivotY * cs - pivotZ * sn)
  out.hipsDZ = pivotZ - (pivotY * sn + pivotZ * cs)
  out.thighRotX = S * bow
  return out
}
