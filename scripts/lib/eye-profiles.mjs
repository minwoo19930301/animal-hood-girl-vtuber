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
  // v3.2 진폭 정정: v3.1은 lift ±7~12px, brow ±4px, irisScale ±12%로 구조 변화가
  // turtle(drop 12 + lineSquash 0.7) 하나뿐이었다 — 렌더에서 "거북이만 다르고
  // 나머지는 색만 다르다"로 읽힌 원인이다. 개구(drop/lineSquash)와 눈꼬리 경사(lift),
  // 눈썹 기울기(brow.tilt)를 종별로 확실히 벌린다. 좌표계·연산자는 v3.1과 동일.
  bear: { // 순한 처진 눈 — 눈꼬리 크게 내리고 아래꺼풀 존재감
    lift: -18, thick: 1.25, drop: 2, lineSquash: 1.06, lower: 0.62,
    irisScale: 1.10, highlightScale: 1.06,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: -3, tilt: -4, raise: -1, thick: 1.60, length: 1.0 },
  },
  monkey: { // 장난기 올라간 눈 — 눈꼬리 올림 + 세로 개구 확대
    lift: 20, thick: 0.95, drop: 0, lineSquash: 1.12, lower: 0.28,
    irisScale: 1.0, highlightScale: 1.0,
    lash: { length: 1.0, outerBoost: 0.2 },
    brow: { arch: 6, tilt: 3, raise: 3, thick: 0.95, length: 0.95 },
  },
  turtle: { // 나른한 반개 직선 — 개구를 가장 크게 조인다
    lift: 0, thick: 1.30, drop: 16, lineSquash: 0.72, lower: 0.18,
    irisScale: 0.92, highlightScale: 0.95,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: -4, tilt: 0, raise: 0, thick: 0.72, length: 1.0 },
  },
  rabbit: { // 세로로 큰 동그란 눈 + 애교살 — 개구 최대
    lift: 4, thick: 0.90, drop: -6, lineSquash: 1.22, lower: 0.75,
    irisScale: 1.20, highlightScale: 1.18,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: 5, tilt: 0, raise: 3, thick: 0.75, length: 0.92 },
  },
  fox: { // 날카로운 폭스아이 — 눈꼬리 최대 상승 + 눈썹 강한 상향
    lift: 28, thick: 1.20, drop: 4, lineSquash: 0.86, lower: 0.16,
    irisScale: 0.86, highlightScale: 0.80,
    lash: { length: 1.05, outerBoost: 0.75 },
    brow: { arch: 3, tilt: 7, raise: -1, thick: 1.05, length: 1.05 },
  },
  panda: { // 동글 순둥 — 처진 눈꼬리 + 개구 확대 + 굵고 짧은 눈썹
    lift: -10, thick: 1.10, drop: -4, lineSquash: 1.18, lower: 0.66,
    irisScale: 1.18, highlightScale: 1.16,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: -1, tilt: -2, raise: 0, thick: 1.70, length: 0.82 },
  },
  penguin: { // 시원한 직선 윗꺼풀 — 아치를 눌러 직선화
    lift: 6, thick: 1.20, drop: 6, lineSquash: 0.80, lower: 0.22,
    irisScale: 0.96, highlightScale: 1.0,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: -5, tilt: 1, raise: 1, thick: 1.20, length: 1.05 },
  },
  owl: { // 크게 뜬 원형 — 개구 최대급 + 높은 아치 눈썹
    lift: 2, thick: 1.35, drop: -8, lineSquash: 1.26, lower: 0.42,
    irisScale: 1.22, highlightScale: 1.20,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: 7, tilt: 0, raise: 6, thick: 0.90, length: 0.95 },
  },
  lion: { // 대담한 굵은 라인 — 두께 최대
    lift: 12, thick: 1.50, drop: 0, lineSquash: 0.95, lower: 0.34,
    irisScale: 1.0, highlightScale: 1.0,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: 4, tilt: 2, raise: 0, thick: 1.55, length: 1.05 },
  },
  tiger: { // 가장 좁은 캣아이 — 눈꼬리 상승 + 개구 조임 + 로우 브로우
    lift: 26, thick: 1.30, drop: 10, lineSquash: 0.78, lower: 0.12,
    irisScale: 0.84, highlightScale: 0.76,
    lash: { length: 1.08, outerBoost: 0.80 },
    brow: { arch: 1, tilt: 8, raise: -5, thick: 1.25, length: 1.0 },
  },
  elephant: { // 길고 낮은 순한 눈 — 처짐 최대 + 긴 눈썹
    lift: -22, thick: 1.0, drop: 6, lineSquash: 0.90, lower: 0.50,
    irisScale: 1.02, highlightScale: 1.0,
    lash: { length: 1.0, outerBoost: 0 },
    brow: { arch: -3, tilt: -5, raise: -2, thick: 1.0, length: 1.15 },
  },
  giraffe: { // 와이드 아몬드 + 가장 긴 속눈썹
    lift: 8, thick: 1.05, drop: 0, lineSquash: 1.02, lower: 0.36,
    irisScale: 1.06, highlightScale: 1.02,
    lash: { length: 1.45, outerBoost: 0.35 },
    brow: { arch: 2, tilt: 0, raise: 2, thick: 0.72, length: 1.20 },
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
