# BRIEF: 밍고 3D 프로시저럴 모델 (src/model/**)

## 미션
`refs/target-preview.png`(2D 정면 목표 룩)와 `refs/DESIGN-2D.md`(비율·팔레트·성격 계약)를
**three.js 프로시저럴 지오메트리 + 커스텀 툰셰이더**로 3D 재현한다. 정면 샷은 2D 프리뷰와
"같은 캐릭터"로 즉시 읽혀야 하고, 고개를 돌리고 끄덕여도(3D의 존재 이유) 형태가 무너지지 않아야 한다.

**캐릭터**: Mingo — 핑크 플라밍고, 귀엽고 자신만만, 약간 스머그. 데스크톱 마스코트.

## 절대 규칙
- `src/model/` 안의 파일만 생성/수정. `contract.ts`, `palette.ts`, `harness.ts`, 스캐폴드 파일 수정 금지.
- 진입점: `src/model/index.ts`의 `createMingo(): MingoModel` (계약: `src/contract.ts`).
- 새 npm 의존성 금지. 텍스처 파일 금지 — 색·그라데이션 전부 셰이더/버텍스컬러로.
- 결정적(deterministic): `Math.random()` 금지. 모든 2차 모션은 `apply(frame, dt, t)`에서 dt 기반 시뮬레이션.
- 팔레트는 `src/palette.ts`의 `PALETTE`/`TOON`만 사용.

## 룩 스펙 (2D→3D 번역)
- **툰 머티리얼(공유 커스텀 ShaderMaterial)**: 씬 라이트 무시, `TOON.lightDir` 고정 유니폼.
  `smoothstep(shadeEdge±shadeWidth, N·L)` 2단계 램프로 basColor↔shadeColor(파트별 페어) 전환.
  그림자는 어둡게가 아니라 **hue-shift 페어** (plumageBase↔plumageShade 등). 미세 림라이트 `TOON.rim`.
  스페큘러 없음. fog/tone mapping 없음.
- **아웃라인**: inverted-hull (BackSide, 노멀 방향 확장 `TOON.outlineWidth`, 파트 크기 비례 조정).
  몸/얼굴 계열 `PALETTE.outline`, 눈·부리 계열 `PALETTE.nightPurple`.
- **눈이 캐릭터의 80%다.** 2D 시트 비율 그대로 거대하게: 흰자 렌즈(납작 타원체, 머리 표면에서 살짝 돌출,
  바깥쪽 ±4° 기울임) + 홍채 원판(셰이더로 `irisTop→irisBottom` 수직 그라데이션, **완전한 원** — 뚜껑에
  가려져도 풀 지오메트리) + 하이라이트 3종(좌상단 큰 원, 우하단 스파클, 상단 4점 별 글린트 — 흰색
  unlit 메시) + 굵은 윗속눈썹 아크(nightPurple, 바깥쪽 래시 플릭 3개) + 얇은 아래 래시(바깥 절반).
  **블링크**: 스킨톤 윗눈꺼풀 셸이 본 회전으로 내려와 덮는 방식 (morph보다 본 선호).
- **부리**: 작고 귀엽게, 플라밍고 다운커브 + **검은 딥 팁**(끝 1/3 nightPurple). 위부리는 머리 고정,
  아래부리는 jaw 본 회전으로 `mouthOpen`. 입 안(딥핑크 `0x7a1f3d` 근사) + 혀(blush 톤) 풀 지오메트리.
- **머리 장식**: crest_front 깃털 3가닥(뷰어 오른쪽으로 스윕) + crest_back 4가닥(왼쪽 위로 팬) +
  **새우 핀**(brand! 살몬+골드, 앞머리에 클립).
- **몸**: 계란형 몸통, 가슴에 크림 구름 스캘럽 fluff 러프(호흡 타깃), 목에 골드 스카프+진주참(테일은
  캐릭터 오른쪽으로 드리움), 꼬리 깃 3가닥, 블러시 타원(뺨, 반투명).
- **날개(팔)**: 2세그먼트 본 + 끝에 깃털 손가락 3가닥. `WingPose` intents(raise/out/curl/spread/wave)로
  구동. 내려놨을 때 2D처럼 몸 앞에 얌전히 모은 포즈가 기본.
- **다리(2D에 없음 — 새로 디자인)**: 치비 비율의 짧고 가는 플라밍고 다리 + 물갈퀴 발. 무릎 살짝
  뒤로 굽음. 전체 실루엣에서 다리는 짧게(치비 유지, 얼굴이 커야 함). 높이 배분 대략:
  다리 18% / 몸통 34% / 목 16% / 머리 32%.
- **FX 토글**(기본 숨김): 하트 홍채(교체), ∪∪ 행복눈(뚜껑 풀클로즈 변형), 땀방울(오른쪽 관자놀이,
  살짝 바운스), 분노 마크(왼쪽 이마 십자 힘줄).

## 리깅/apply() 스펙
- **목 체인 3본** — 이 모델의 시그니처. head pose를 체인에 분배(대략 25/35/40%):
  - pitch>0(위 보기): 목이 S자로 펴지며 위로 뻗음. pitch<0: 목 움츠리며 턱 당김(플라밍고 특유의 목 접기).
  - yaw: 체인 분배 + 머리에서 마무리. roll: 대부분 머리에서.
- **gaze**: 홍채+하이라이트 어셈블리를 렌즈 안에서 이동(클램프, 렌즈 밖 금지).
- **breath**: 가슴 fluff 스케일 1±0.03 + 몸통 미세 스케일Y + 머리 미세 바운스.
- **2차 모션(스프링, dt 기반 감쇠 조화진동)**: crest 깃털들, 스카프 테일, 꼬리깃 — 머리/몸 움직임에
  1프레임 지연 팔로우 + 오버슛. wave intent는 어깨 z축 사인 진동.
- `hitMeshes`: 머리·몸통·날개 메인 메시.

## 검증 루프 (필수 — 최소 6라운드 반복)
```bash
npm run shot -- harness.html shots/front.png "bg=1"            # vs refs/target-preview.png 비교
npm run shot -- harness.html shots/pitch-up.png "pitch=0.45&bg=1"
npm run shot -- harness.html shots/pitch-down.png "pitch=-0.4&bg=1"
npm run shot -- harness.html shots/yaw.png "yaw=0.5&bg=1"
npm run shot -- harness.html shots/blink-open.png "blink=1&mouth=0.8&bg=1"
npm run shot -- harness.html shots/wings.png "wingRaiseL=1&wingOutL=0.7&wingRaiseR=0.4&bg=1"
npm run shot -- harness.html shots/fx.png "heart=1&sweat=1&bg=1"
npm run shot -- harness.html shots/face.png "cam=face&bg=1"
```
매 라운드: 스크린샷을 Read로 직접 보고 target-preview.png와 나란히 비교 →
실루엣/비율/눈 크기/팔레트/아웃라인 두께/셰이드 경계를 교정. 특히:
- 정면 face 샷에서 눈·부리·블러시·앞머리 배치가 2D와 일치하는가
- pitch 샷에서 목이 자연스럽게 S자를 그리는가 (기괴한 꺾임 금지)
- yaw 샷에서 눈 렌즈가 머리를 뚫고 나오지 않는가
- 아웃라인이 끊기거나 z-fight 하지 않는가

## 완료 기준
- `npm run typecheck` 통과 (내 파일 기준 — 타 모듈 WIP 오류는 무시)
- 위 8종 스크린샷 전부 의도대로
- `src/model/README.md`에 파트 구조·본 트리·튜닝 포인트 기록
