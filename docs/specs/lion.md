# 사자 / Lion — 슬롯 `9` (Pack v3 실제 계약)

`./models/lion.vrm`은 베이스 VRM(Shino CC0 텍스처 수술본)의 팔레트 리페인트 파생 +
프로시저럴 갈기 후드다. 정본: shared/avatar-catalog.json `lion` 엔트리,
docs/DESIGN-PACK-V3.md 12종 표, 빌더 `src/model/animals/lion.ts`.

## 베이스 리스타일 (빌드 파이프라인 소유 — scripts/build-avatar-pack.mjs)

| 항목 | 실제 값 |
|---|---|
| 헤어 | 다크 버건디 base `#58242C` / shade `#0E0608` / accent `#A0424D` — v3.1(골드 의상 위 딥 포인트). 컷 없음(롱 유지). |
| 홍채 | 골드카키 3단 램프 `#4D480B / #A9A529 / #F3E985` |
| 눈매(v3.1) | 대담한 굵은 라인: lift +6 / thick 1.35 / lower 0.35 / irisScale 1.0 / brow thick-arch. 눈썹 틴트 헤어 동조. expressionBias angry 0.08 |
| 눈매 | eyeSharpen 카탈로그 0.8 → 런타임 클램프 0.176 |
| 상의 | 골드 베스트 + 네이비 레지멘털 카라·커프·밑단 + 골드 지퍼 (UV 영역 마스크 컬러 블로킹) |
| 하의/신발 | 네이비 플리츠 스커트(골드 밑단 줄) / 브라운 로퍼 + 다크 니삭스 |
| 보타이 | 네이비 리페인트 — 숨기지 않는다 |

## 프로시저럴 후드 (src/model/animals/lion.ts)

hoodKit `buildHoodBase` 셸+안감 위에 갈기. 갈기 페탈은 cutShellGeo와 동일한
림 각 공식 `rimTheta(φ)` + margin 바깥에 밑동을 두고 축은 개구부 반대 접선 +
바깥 들림(lift) — 얼굴 쪽으로 자라지 않는 구조라 개구부 침범이 원천 차단된다.
겹당 전체 페탈을 mergeShapes로 1지오메트리 병합(드로우콜 1+아웃라인 1).

| 파트 | 실제 구현 |
|---|---|
| 셸/안감 | 골든 `#EBB755/#C8872E` / 앰버 `#B5722E/#8A5520` |
| 갈기 바깥 겹 | 앰버 `#C8872E/#9C6220` featherLobe×11, δ±2.05(림 상단 기준, 턱 아래 비움), margin 0.34, lift 0.35 ± liftVar 0.15(인덱스 코사인 변주) + 짝/홀 방사 스태거 zStagger 0.030, len 0.55·crownH. 크기 변주도 인덱스 코사인(결정적). 재판정 반영: 페탈이 전부 같은 들림·같은 밑동 반경이라 측면 갈기가 얇은 단일 평면 부채로 읽혔음 — 들림각 변주 + 앞뒤 겹 스태거로 프로필 층 두께 확보 (변주 하한 0.20 > 0, 접선 아래(얼굴 쪽) 불가 구조 불변) |
| 갈기 안쪽 겹 | 허니 `#F7D180/#D9A54A` featherLobe×10, δ±1.85+stagger 0.10, margin 0.14, lift 0.60, len 0.36·crownH |
| 둥근 귀×2 | 림 프레임 앵커 `rimAnchor(δ±0.82, margin 0.30)` — 안겹 페탈 사이 틈. 셸색 돔(R 0.26·crownH, z-lift 0.20·crownH로 페탈 층 위) + 다크브라운 이너 디스크 `#8A5520/#663D15`, 반경 0.42R (판정 라운드: 이너 0.55R·앰버는 페탈 허니/앰버와 톤이 겹쳐 묻힘 — 반경 축소+색 어둡게+z-lift 상향으로 대비 확보). hitMeshes 등록 |
| 정수리 주둥이 | muzzleFollow 앵커 자식(rotation은 index.ts 스프링 소유). 허니 마운드(0.24×0.17×0.18·crownH) + 갈색 코 `#6B4423/#4A2F16` 아래 향한 납작 3면 콘(r 0.12·crownH) |

## 3D 액세서리 (buildAccessories — flamingo 배선과 동일, 색만 lion)

bandBase 크림골드 `#FFE9BC/#E8C48A` · bandStripe 네이비 `#22304E/#161F36` ·
bandLine/cord 골드 `#EBB755/#C8872E` · tip 다크브라운 `#4A331C/#2F1F10`.
드로스트링 2차 모션은 `update`에서 `acc.sway(pitchS, yaw, breath, dt)`.

## 판정샷 (shots/dev/lion-*.png — DECOR-BRIEF 필수 5샷 + 후면)

| 샷 | 증명 |
|---|---|
| `lion-face.png` (`cam=face&bg=1`) | 갈기 2겹 헤일로·귀·코 정면 판독, 얼굴 개구부 침범 0 |
| `lion-front.png` (`bg=1`) | 전신 팔레트 조화 (골드/네이비/크림), 액세서리 부착 |
| `lion-pitch.png` (`pitch=0.4&bg=1`) | 고개 들어도 갈기가 눈썹~턱을 안 가림 |
| `lion-orbit.png` (`orbit=1.2&bg=1`) | 측면 — 페탈이 셸을 감싸고 헤어/VRM 관통 없음 |
| `lion-blink.png` (`blink=1&mouth=0.6&cam=face&bg=1`) | 표정 무결 (눈감음+입벌림) |
| `lion-back.png` (`orbit=2.6&bg=1`) | 후면 셸 클린, 갈기 림 실루엣만 가장자리로 보임 |
