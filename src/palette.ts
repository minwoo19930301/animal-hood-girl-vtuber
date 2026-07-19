/** 밍고 브랜드 팔레트 — refs/DESIGN-2D.md와 동일, 게임(DOOMINGO/SUPER MINGO) 브랜드 고정 */
export const PALETTE = {
  plumageBase: 0xffb3cf,
  plumageShade: 0xf27ba8,
  deepPinkAccent: 0xff5e9c,
  outline: 0xb23a68,
  chestFluffCream: 0xffd6e4,
  chestFluffShade: 0xffbfd6,
  beakSalmon: 0xff8e72,
  beakTipNight: 0x241631,
  irisTop: 0xff5e9c,
  irisBottom: 0x7a1f4d,
  blush: 0xff8ea6,
  scarfGold: 0xffc857,
  scarfGoldShade: 0xe0a63e,
  nightPurple: 0x241631,
  lagoonBG: 0x8fd3e8,
  wingTone: 0xff8fbb,
  browTone: 0xd94f85,
  white: 0xffffff,
} as const

/** 툰셰이딩 규칙: 그림자는 어둡게가 아니라 hue-shift (2D 셰이딩 룰 계승) */
export const TOON = {
  /** 고정 가상 조명 방향 (정면 약간 위-왼쪽, 절대 안 움직임) */
  lightDir: [-0.35, 0.55, 0.76] as [number, number, number],
  /** 셰이드 경계 위치/폭 (smoothstep) */
  shadeEdge: 0.12,
  shadeWidth: 0.08,
  /** 림 라이트 강도 */
  rim: 0.10,
  /** 아웃라인 두께 (월드 단위, 파트 크기에 비례 조정) */
  outlineWidth: 0.011,
} as const
