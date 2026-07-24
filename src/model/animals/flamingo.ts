/**
 * flamingo — 플라밍고 후드 (13번째 슬러그, key `` ` ``).
 * 검증된 src/model/hood.ts(buildHood)를 무수정 래핑해 AnimalCostumeRig로 변환.
 * 베이스 VRM은 원본 avatar.vrm — 보타이(AccessoryNeck)만 카탈로그 hiddenMaterials로
 * 숨겨 기존 룩을 보존한다 (다른 12종은 보타이를 보여준다).
 *
 * 3D 액세서리(손목밴드+드로스트링)는 rs-final 룩의 일부 — 코덱스 index.ts 재작성 때
 * 배선이 유실됐던 것을 빌더 안에서 복원한다 (기본 플라밍고 색).
 *
 * HoodRig ↔ AnimalCostumeRig 대응 (DESIGN-PACK-V3.md):
 * headRoot=pivot, headFollow=shellPivot, muzzleFollow=beakPivot.
 */
import { buildHood } from '../hood'
import { buildAccessories } from '../accessories'
import type { AnimalBuildContext, AnimalCostumeRig } from './types'

export function buildFlamingo(ctx: AnimalBuildContext): AnimalCostumeRig {
  const hood = buildHood(ctx.crownH, ctx.halfW, ctx.face)
  // VRM1 대응: hood.ts는 -Z 정면(VRM0 원공간) 저작 — index.ts fx 패턴과 동일
  if (ctx.S === -1) hood.pivot.rotation.y = Math.PI
  const acc = buildAccessories(
    {
      chest: ctx.bones.chest ?? null,
      neck: ctx.bones.neck ?? null,
      upperArmL: ctx.bones.upperArmL ?? null,
      upperArmR: ctx.bones.upperArmR ?? null,
      lowerArmL: ctx.bones.lowerArmL ?? null,
      lowerArmR: ctx.bones.lowerArmR ?? null,
      handL: ctx.bones.handL ?? null,
      handR: ctx.bones.handR ?? null,
    },
    ctx.S,
  )
  return {
    headRoot: hood.pivot,
    headFollow: hood.shellPivot,
    muzzleFollow: hood.beakPivot,
    hitMeshes: hood.hitMeshes,
    update: (pitchS, yaw, breath, dt) => acc.sway(pitchS, yaw, breath, dt),
  }
}
