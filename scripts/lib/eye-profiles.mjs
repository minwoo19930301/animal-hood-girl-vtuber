// eye-profiles.mjs — DESIGN-PACK-V3.1.md 1절 눈매 표의 코드화 (플라밍고 제외 12종).
//
// build-avatar-pack.mjs 의 editEyeLine(5 아이라인 / 7 속눈썹 / 8 눈썹),
// editIris(9), editHighlight(10)가 이 프로필을 단일 진실 공급원으로 소비한다.
// 런타임 표정 바이어스(bias 열)는 여기가 아니라 shared/avatar-catalog.json 의
// expressionBias 필드(→ src/model/animals/registry.ts → index.ts)가 소유한다.
//
// 좌표계 주의: 텍스처 5/7/8은 1024x256, 좌우 눈이 나란히 배치되고 각 눈의
// **바깥쪽(눈꼬리)이 텍스처 좌우 가장자리**, 안쪽(눈앞머리)이 중앙이다.
// 알파 채널이 형태를 결정한다(work/NOTES.md) — 형태 변형은 항상 알파와 함께 움직인다.
//
// 필드:
//   lift        눈꼬리 수직 이동 px (+위로 = 올라간 눈, 음수 = 처진 눈)
//   thick       윗라인 두께 배 (도너 = 1.0)
//   drop        라인·속눈썹 전체 하강 px (반개/개구 축소 — turtle 주축, tiger 소량)
//   lineSquash  윗라인 세로 압축 배 (<1 = 눈꺼풀 라인(y≈130) 앵커로 위쪽을 눌러
//               아치를 직선화 — turtle 나른한 반개 전용, 생략 시 1.0)
//   lower       아랫라인/애교살 존재감 0..1 (도너 기본 ≈ 0.4, 알파 게인으로 구현)
//   irisScale   홍채(9) 중심 기준 스케일 배 (동공 위치 불변)
//   highlightScale 하이라이트(10) 자체 중심 기준 스케일 배 (1.0 = img10 무편집)
//   lash.length      속눈썹 가닥 길이 배 (베이스라인 y≈130 앵커 세로 스케일)
//   lash.outerBoost  바깥쪽 가닥 강조 0..1 (눈꼬리 존 알파 게인)
//   brow.arch   아치 진폭 px (+위로 볼록, 음수 = 도너 아치 상쇄 → 일자)
//   brow.tilt   눈꼬리쪽 기울기 px (+바깥끝 올림 = 샤프, 음수 = 처진 순한 눈썹)
//   brow.raise  눈썹 전체 수직 이동 px (+위로, 음수 = 눈에 붙는 로우 브로우)
//   brow.thick  눈썹 획 두께 배 (y≈132 중심 세로 스케일)
//   brow.length 눈썹 길이 배 (각 눈썹 중심 기준 가로 스케일)

export const EYE_PROFILES = Object.freeze({
  bear: { // 순한 처진 눈
    lift: -5, thick: 1.15, drop: 0, lower: 0.5, irisScale: 1.06, highlightScale: 1.0,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: -2, tilt: 0, raise: 0, thick: 1.55, length: 1.0 }, // thick-straight
  },
  monkey: { // 장난기 올라간 눈
    lift: 7, thick: 1.0, drop: 0, lower: 0.3, irisScale: 1.0, highlightScale: 1.0,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: 3, tilt: 0, raise: 1, thick: 1.0, length: 1.0 }, // arch
  },
  turtle: { // 나른한 반개 직선 — 윗라인을 drop으로 낮추고 lineSquash로 직선화
    // v3.1 판정: drop 4는 rabbit/owl과 구분 불가 — 12px(1024 기준)로 홍채 상단
    // ~20%를 가리고, 아치를 0.7로 눌러 '반개'가 실제로 읽히게 한다.
    lift: 0, thick: 1.25, drop: 12, lineSquash: 0.7, lower: 0.2, irisScale: 0.95, highlightScale: 1.0,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: -2.5, tilt: 0, raise: 0, thick: 0.75, length: 1.0 }, // straight-thin
  },
  rabbit: { // 세로로 큰 동그란 눈 + 애교살
    lift: 2, thick: 0.95, drop: 0, lower: 0.6, irisScale: 1.1, highlightScale: 1.12,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: 2.5, tilt: 0, raise: 1, thick: 0.8, length: 1.0 }, // thin-arch
  },
  fox: { // 날카로운 폭스아이
    lift: 10, thick: 1.2, drop: 0, lower: 0.2, irisScale: 0.9, highlightScale: 0.82,
    lash: { length: 1.0, outerBoost: 0.6 },
    brow: { arch: 2.5, tilt: 3, raise: 0, thick: 1.05, length: 1.0 }, // sharp-arch
  },
  panda: { // 동글 순둥
    lift: -3, thick: 1.05, drop: 0, lower: 0.55, irisScale: 1.1, highlightScale: 1.12,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: -1, tilt: 0, raise: 0, thick: 1.6, length: 0.85 }, // thick-short
  },
  penguin: { // 시원한 직선 윗꺼풀
    lift: 3, thick: 1.15, drop: 0, lower: 0.25, irisScale: 0.97, highlightScale: 1.0,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: -2.5, tilt: 0, raise: 0, thick: 1.15, length: 1.0 }, // straight
  },
  owl: { // 크게 뜬 원형
    lift: 1, thick: 1.3, drop: 0, lower: 0.4, irisScale: 1.12, highlightScale: 1.15,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: 4, tilt: 0, raise: 4, thick: 0.95, length: 1.0 }, // arch-high
  },
  lion: { // 대담한 굵은 라인
    lift: 6, thick: 1.35, drop: 0, lower: 0.35, irisScale: 1.0, highlightScale: 1.0,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: 3, tilt: 0, raise: 0, thick: 1.5, length: 1.0 }, // thick-arch
  },
  tiger: { // 가장 좁은 캣아이 — drop 2로 세로 개구를 조여 협소감 강화(v3.1 판정)
    lift: 12, thick: 1.25, drop: 2, lower: 0.15, irisScale: 0.88, highlightScale: 0.78,
    lash: { length: 1.0, outerBoost: 0.7 },
    brow: { arch: 1, tilt: 3.5, raise: -3, thick: 1.2, length: 1.0 }, // sharp-low
  },
  elephant: { // 길고 낮은 순한 눈
    lift: -7, thick: 1.0, drop: 0, lower: 0.45, irisScale: 1.02, highlightScale: 1.0,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: -2, tilt: -1.5, raise: 0, thick: 1.0, length: 1.0 }, // soft-straight
  },
  giraffe: { // 와이드 아몬드 + 긴 속눈썹
    lift: 4, thick: 1.05, drop: 0, lower: 0.35, irisScale: 1.04, highlightScale: 1.0,
    lash: { length: 1.3, outerBoost: 0 },
    brow: { arch: 1.5, tilt: 0, raise: 1, thick: 0.75, length: 1.12 }, // thin-long
  },
});

/** 슬러그의 눈매 프로필을 반환. 표에 없는 슬러그는 조용히 망가지는 대신 즉시 실패. */
export function getEyeProfile(slug) {
  const profile = EYE_PROFILES[slug];
  if (!profile) {
    throw new Error(
      `eye-profiles: no profile for slug "${slug}" — `
      + 'add it to scripts/lib/eye-profiles.mjs (DESIGN-PACK-V3.1.md 1절 표 참조)',
    );
  }
  return profile;
}
