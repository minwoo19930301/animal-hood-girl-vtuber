// outfit-designs.mjs — DESIGN-PACK-V3.md 12종 디자인 표의 코드화.
//
// Tops(img17)는 placeholder 니트 원본 위 UV 영역 마스크 컬러 블로킹으로 칠한다.
// 여기 정의된 색이 그 블로킹의 단일 진실 공급원이다. 색은 코덱스 카탈로그 팔레트를
// 계승하되(진단서 D표) 표의 지침(카라/트림/지퍼/모티프)을 우선한다.
//
// 필드 (전부 sRGB hex):
//   vest        조끼(베스트) 몸판          vestShade  몸판 셰이드(모티프 윤곽 등 보조)
//   collar      셔츠 카라(상단 중앙 밴드)   trim       V넥 리브 트림(개구부 둘레)
//   cuff        소매 커프 밴드             hem        밑단 골지 밴드
//   zipper      중앙 지퍼                  placket    셔츠 앞섶(V 개구부로 보이는 셔츠)
//   sleeves     null=셔츠 소매/바디 소매 페인트 원본 유지, 지정 시 재염색
//   skirt       스커트 본체               skirtStripe 밑단 스트라이프(null=스커트색으로 중화)
//   skirtDots   스커트 도트 장식 색(선택)
//   shoes       로퍼 본체                 shoesSole   밝은 부위/밑창(null=본체 자동 밝힘)
//   bow         목 보타이                 hairpin     헤어핀(img28)
//   wristband   손목 밴드(img15 페인트)    motif       {type, color} 상의 UV 직접 드로잉(선택)
//   socks       니삭스(img15 다리 스트립 y1560~2048 다크그레이 삭스 영역 재염색.
//               실루엣 경계는 원본 알베도 그대로 — 색만 바꾼다)
//   hairCut     헤어 길이 컷 라인(img25 512x1024 기준 row, null=컷 없음 롱헤어 유지).
//               DESIGN-PACK-V3 "헤어 길이" 표: bear 799(숄더) / fox 737(울프) /
//               turtle 666(친 보브) / penguin 512(귀선 크롭).
//               v3.1: rabbit 799(숄더랩, bear 레시피) — 롱헤어가 토끼 후드 셸
//               후면을 관통하고 pitch에서 어깨 가닥이 돌출하던 결함 해소.
//
// motif.type: 'pawPatch' | 'hexPlates' | 'bibPanel' | 'argyleBand' | 'roundPatches'
//             | 'regimentalCollar'  — 전부 UV 심을 넘지 않는 몸판 중앙부/카라 밴드 안.

export const OUTFIT_DESIGNS = Object.freeze({
  bear: {
    vest: '#F2E6CF', vestShade: '#D8C2A0', collar: '#2F5D45', trim: '#2F5D45',
    cuff: '#2F5D45', hem: '#2F5D45', zipper: '#6B4830', placket: '#F3F1EC', sleeves: null,
    skirt: '#C08A4F', skirtStripe: '#65402D', skirtDots: null,
    shoes: '#6B4830', shoesSole: null, bow: '#8D6142', hairpin: '#D9B896',
    wristband: '#6B4830', motif: { type: 'pawPatch', color: '#6B4830' },
    socks: '#33221A', hairCut: [{ row: 799 }, { row: 870, region: 'front', softness: 0.42 }],
  },
  monkey: {
    vest: '#BC8532', vestShade: '#96682A', collar: '#F1D9BE', trim: '#F1D9BE',
    cuff: '#F1D9BE', hem: '#F1D9BE', zipper: '#6D2338', placket: '#F3F1EC', sleeves: null,
    skirt: '#6D2338', skirtStripe: '#BC8532', skirtDots: null,
    // hairpin: img28은 헤어 액센트 스트랜드도 샘플한다 — 크림(#F1D9BE) 대신
    // 카탈로그 hair.accent 코퍼로 클램프(와인레드 표류 지적, 셰이드는 램프 자동).
    shoes: '#F3EFE7', shoesSole: null, bow: '#6D2338', hairpin: '#D77B3E',
    wristband: '#8A5A34', motif: null,
    socks: '#3B2A1C', hairCut: [{ row: 950 }, { row: 700, region: 'front', softness: 0.40 }],
  },
  turtle: {
    vest: '#7FB069', vestShade: '#4F7C48', collar: '#2E7D74', trim: '#DCEBC4',
    cuff: '#2E7D74', hem: '#DCEBC4', zipper: '#31431F', placket: '#F3F1EC', sleeves: null,
    skirt: '#3C4247', skirtStripe: '#2E8C81', skirtDots: null,
    shoes: '#4F7C48', shoesSole: null, bow: '#2E8C81', hairpin: '#24AFA4',
    wristband: '#5B7C4A', motif: { type: 'hexPlates', color: '#31431F' },
    socks: '#31431F', hairCut: [{ row: 666, tiltZ: 0.06 }],
  },
  rabbit: {
    vest: '#F5F0EA', vestShade: '#D8CEC3', collar: '#E4849E', trim: '#E4849E',
    cuff: '#E4849E', hem: '#E4849E', zipper: '#F5A9B8', placket: '#F3F1EC', sleeves: null,
    skirt: '#D8A0A8', skirtStripe: '#FFFFFF', skirtDots: '#FFFFFF',
    shoes: '#E4849E', shoesSole: null, bow: '#F5A9B8', hairpin: '#F5A9B8',
    wristband: '#F5A9B8', motif: null,
    socks: '#F2F3F7', hairCut: [{ row: 799 }, { row: 850, region: 'front', softness: 0.45 }],
  },
  fox: {
    vest: '#B5502A', vestShade: '#8C3B1E', collar: '#F7EBD3', trim: '#F7EBD3',
    cuff: '#F7EBD3', hem: '#F7EBD3', zipper: '#3B2A20', placket: '#F3F1EC', sleeves: null,
    skirt: '#232024', skirtStripe: '#B5502A', skirtDots: null,
    shoes: '#4A2E1E', shoesSole: null, bow: '#F7EBD3', hairpin: '#F7EBD3',
    wristband: '#C9622B', motif: null,
    socks: '#3B2A20', hairCut: [{ row: 737, tiltX: 0.18 }, { row: 660, region: 'left', softness: 0.5 }],
  },
  panda: {
    vest: '#F7F4EF', vestShade: '#D6D1CB', collar: '#2E2B2C', trim: '#2E2B2C',
    cuff: '#2E2B2C', hem: '#2E2B2C', zipper: '#2E2B2C', placket: '#F3F1EC', sleeves: null,
    skirt: '#262324', skirtStripe: null, skirtDots: null,
    shoes: '#201D1E', shoesSole: null, bow: '#C63838', hairpin: '#C63838',
    wristband: '#2E2B2C', motif: null,
    socks: '#2E2B2C', hairCut: [{ row: 900 }, { row: 690, region: 'front', softness: 0.38 }],
  },
  penguin: {
    vest: '#26324A', vestShade: '#1E2532', collar: '#F6F8FA', trim: '#F6F8FA',
    cuff: '#F6F8FA', hem: '#F6F8FA', zipper: '#F5B940', placket: '#F3F1EC', sleeves: null,
    skirt: '#26324A', skirtStripe: null, skirtDots: null,
    shoes: '#1B1D24', shoesSole: null, bow: '#F5B940', hairpin: '#F5B940',
    wristband: '#F5B940', motif: { type: 'bibPanel', color: '#F6F8FA' },
    socks: '#20242E', hairCut: [{ row: 512 }, { row: 700, region: 'front', softness: 0.45 }],
  },
  owl: {
    vest: '#74543A', vestShade: '#54391F', collar: '#E8D5B8', trim: '#E8D5B8',
    cuff: '#E8D5B8', hem: '#74543A', zipper: '#33261B', placket: '#F3F1EC', sleeves: null,
    skirt: '#4A3423', skirtStripe: null, skirtDots: null,
    shoes: '#65482F', shoesSole: null, bow: '#F0B429', hairpin: '#F0B429',
    wristband: '#F0B429', motif: { type: 'argyleBand', color: '#F0B429' },
    socks: '#33261B', hairCut: null,
  },
  lion: {
    vest: '#EBB755', vestShade: '#C8872E', collar: '#22304E', trim: '#22304E',
    cuff: '#22304E', hem: '#22304E', zipper: '#C8872E', placket: '#F3F1EC', sleeves: null,
    skirt: '#22304E', skirtStripe: '#EBB755', skirtDots: null,
    // hairpin: 네이비(#22304E)는 허니골드 헤어 위에서 검정으로 읽혀 골드로 변경.
    shoes: '#6B4526', shoesSole: null, bow: '#22304E', hairpin: '#F0B657',
    wristband: '#B5722E', motif: { type: 'regimentalCollar', color: '#EBB755' },
    socks: '#4A331C', hairCut: null,
  },
  tiger: {
    vest: '#EE8A3C', vestShade: '#C65F26', collar: '#2E2620', trim: '#2E2620',
    cuff: '#2E2620', hem: '#2E2620', zipper: '#2E2620', placket: '#F3F1EC', sleeves: null,
    skirt: '#26211D', skirtStripe: '#EE8A3C', skirtDots: null,
    shoes: '#26211D', shoesSole: null, bow: '#2E2620', hairpin: '#F39A49',
    wristband: '#2E2620', motif: { type: 'bibPanel', color: '#FFF1DC' },
    socks: '#2E2620', hairCut: [{ row: 880 }, { row: 760, region: 'right', softness: 0.5 }],
  },
  elephant: {
    vest: '#8290A6', vestShade: '#6F7B91', collar: '#E9EEF5', trim: '#E9EEF5',
    cuff: '#E9EEF5', hem: '#E9EEF5', zipper: '#F0A7B4', placket: '#F3F1EC', sleeves: null,
    skirt: '#9BA8BC', skirtStripe: null, skirtDots: null,
    shoes: '#F2F3F7', shoesSole: null, bow: '#F0A7B4', hairpin: '#F0A7B4',
    wristband: '#F0A7B4', motif: null,
    socks: '#F2F3F7', hairCut: [{ row: 820, tiltX: 0.12 }],
  },
  giraffe: {
    vest: '#F3D689', vestShade: '#D79F2C', collar: '#8A5A34', trim: '#8A5A34',
    cuff: '#8A5A34', hem: '#F3D689', zipper: '#8A5A34', placket: '#F3F1EC', sleeves: null,
    skirt: '#C99A5B', skirtStripe: null, skirtDots: null,
    shoes: '#F5EFDC', shoesSole: null, bow: '#8A5A34', hairpin: '#8A5A34',
    wristband: '#C98A3B', motif: { type: 'roundPatches', color: '#C98A3B' },
    socks: '#4A371C', hairCut: [{ row: 860 }, { row: 780, region: 'front', softness: 0.4 }, { row: 900, region: 'back', softness: 0.45 }],
  },
});

/** 슬러그의 의상 디자인을 반환. 표에 없는 슬러그는 조용히 망가지는 대신 즉시 실패. */
export function getOutfitDesign(entry) {
  const design = OUTFIT_DESIGNS[entry?.slug];
  if (!design) {
    throw new Error(
      `outfit-designs: no design for slug "${entry?.slug}" — `
      + 'add it to scripts/lib/outfit-designs.mjs (DESIGN-PACK-V3.md 표 참조)',
    );
  }
  return design;
}
