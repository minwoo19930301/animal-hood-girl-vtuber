/**
 * giraffe — 기린 후드 (Pack v3 스텁: 셸+안감 베이스만, 장식은 후속 단계).
 *
 * DESIGN-PACK-V3.md 장식 계약 (전부 개구부 밖 셸 면 위):
 * - 셸/안감: 크림/탠
 * - 장식: 셸 위 탠 라운드 패치들, 오시콘×2(갈색 볼 팁), 작은 사이드 귀
 * 앵커는 hoodKit.surfacePoint(base, azimuth, elevation)/muzzleAnchor(base) 사용
 * (플라밍고 눈 검증값 azimuth ±0.54, elevation 0.30 — SHELL_AP 콘 밖 유지).
 */
import type { AnimalBuildContext, AnimalCostumeRig } from './types'
import { buildHoodBase, muzzleAnchor, type HoodColors } from './hoodKit'

/** 셸/안감 색 — 카탈로그 팔레트 계승 (giraffe.palette secondary(크림) + hair accent(탠)) */
const COL: HoodColors = {
  shell: 0xfff3ce, shellShade: 0xdcc794,
  lining: 0xd9a35c, liningShade: 0xb07f3f,
}

export function buildGiraffe(ctx: AnimalBuildContext): AnimalCostumeRig {
  const base = buildHoodBase(ctx.crownH, ctx.halfW, ctx.face, COL)
  base.pivot.name = 'giraffeHood'
  // VRM1 대응: 후드는 -Z 정면(VRM0 원공간)으로 저작 — index.ts fx 패턴과 동일
  if (ctx.S === -1) base.pivot.rotation.y = Math.PI
  // muzzleFollow: 상단 림 중앙 앵커 (플라밍고 beakPivot 좌표) — 아직 빈 Group,
  // 장식 단계가 코/부리/주둥이를 채우고 필요하면 위치를 조정한다
  const muzzleFollow = muzzleAnchor(base)
  return {
    headRoot: base.pivot,
    headFollow: base.shellPivot,
    muzzleFollow,
    hitMeshes: base.hitMeshes,
    update: undefined,
  }
}
