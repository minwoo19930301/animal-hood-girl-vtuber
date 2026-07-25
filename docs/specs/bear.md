# 곰 / Bear — 슬롯 `1` (Pack v3 실제 계약)

`./models/bear.vrm`은 avatar.vrm(Shino CC0 텍스처 수술본)에서 빌드 파이프라인이 파생한
리페인트 모델이다. 프로시저럴 박스 의상·블롭 헤어(코덱스 v2)는 폐기됐다 — 진짜 VRoid
옷·헤어 메시를 살리고 컬러 블로킹 리페인트 + 프로시저럴 후드(hoodKit)로 완성한다.
무드 레퍼런스: `refs/avatar-pack/bear-monkey-turtle.png` 왼쪽 (비율·구조 계약이 아니라 분위기).

## 베이스 리페인트 (빌드 파이프라인 소유 — scripts/build-avatar-pack.mjs)

| 항목 | 실제 계약 |
|---|---|
| 헤어 | 블루블랙 base `#23283E` / shade `#07090D` / accent `#48507F` — v3.1 자유 컬러(크림 의상과 대비, 차분). 하단 알파 컷 ~row 799(512x1024, 하단 22%) = 숄더 랩 실루엣 + 페더 램프 + 팁 재음영. |
| 홍채 | 앰버 3단: `#4A2108` / `#C06B22` / `#FFD58A`. eyeSharpen 카탈로그 0.38 → 런타임 클램프 후 0.084 (느긋한 눈매). |
| 눈매(v3.1) | 순한 처진 눈: lift -5 / thick 1.15 / lower 0.5 / irisScale 1.06 / brow thick-straight. 눈썹 틴트 헤어 동조(FaceBrow 패치). expressionBias relaxed 0.06 |
| 상의(img17) | UV 영역 마스크 컬러 블로킹: 크림 몸판(`#D9B896` 계열) / 포레스트그린 카라·커프·밑단 / 브라운 지퍼 + 왼가슴 발바닥 패치. |
| 스커트/신발 | 카멜+브라운 밑단줄 플리츠 스커트, 브라운 로퍼. |
| 보타이 | 브라운 리페인트 — 숨기지 않는다 (유효한 시그니처 액세서리). |
| 피부 | 스킨톤 `#F2C8AE`, 니삭스 다크 유지(중화 제외). |

## 후드 (src/model/animals/bear.ts — 전부 코드, 좌표는 crownH=L 비례)

셸/안감: 코코아 `#8D6142`/`#65402D`, 크림 안감 `#D9B896`/`#B08D68` — hoodKit
`buildHoodBase` 공통 규약(TILT 0.22, SHELL_AP 개구부, GROW 1.08, 얼굴 실측 FaceBounds).

| 장식 | 실제 구현 (전부 SHELL_AP 개구부 콘 밖) |
|---|---|
| 둥근 귀 ×2 | `surfacePoint(az ±0.80, el 0.78, radial 0.97)`. 코코아 원판 R=0.26L, 두께 0.55R, 크림 이너 디스크 0.52R. 정지 틸트 rot.x 0.38 (정면에서 원판으로 읽힘). 히트메시 등록. |
| 주둥이 범프 | `muzzleAnchor`(상단 림 중앙) 자식. 크림 egg(0.26L, 0.20L, 0.22L) rot.x −0.35 로 셸 경사면에 눕혀 정수리→림 위 스누트. 히트메시 등록. |
| 갈색 코 | 스누트 전면 상부 egg(0.072L, 0.055L, 0.05L), `#6B4830`/`#4A2F1E`. 플라밍고 부리팁(−0.33L)보다 훨씬 위 — pitch 0.4에서도 눈썹 침범 0. |

## 액세서리 (src/model/accessories.ts 공용 — 빌더에서 색 지정)

손목밴드+드로스트링: bandBase `#D9B896` / stripe `#2F5D45` / line·cord `#8D6142` /
tip `#33221A` (셰이드 각 −20%p). 드로스트링은 공용 Follower 스프링 스윙.

## 2차 모션

- 후드 셸: index.ts 공통 headFollow 스프링 (rotation 소유권 index.ts — 빌더는 자식 add만).
- 귀: 파츠별 Follower (fp k=64/70, fy k=56/60 — 좌우 비대칭 상수, 결정적).
  anchor 베이시스는 보존하고 내부 sway 그룹 rot.x = 0.38 + p·0.45 + side·y·0.18.
- 주둥이: muzzleFollow 자식이라 index.ts 스프링이 자동 출렁임.

## 판정샷 (필수 5샷 — 전부 통과 확인됨)

`PORT=5311 CDP_PORT=9411 SKIP_BUILD=1 npm run shot -- harness.html shots/dev/bear-<name>.png "<query>"`

| 샷 | 쿼리 | 판정 기준 |
|---|---|---|
| face | `avatar=bear&cam=face&bg=1` | 곰 정체성 1초 인지 (귀+스누트+코), 개구부 침범 0 |
| front | `avatar=bear&bg=1` | 전신 팔레트 조화 (크림/그린/카멜), 손목밴드·드로스트링 부착 |
| pitch | `avatar=bear&pitch=0.4&bg=1` | 개구부 상단 침범 0 — 스누트가 눈썹 위에 머무름 |
| orbit | `avatar=bear&orbit=1.2&bg=1` | 헤어/VRM 메시 관통 0, 귀·스누트 측면 실루엣 |
| blink | `avatar=bear&blink=1&mouth=0.6&cam=face&bg=1` | 표정 무결 (blink+mouth) |
