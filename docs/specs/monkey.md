# 원숭이 / Monkey — 슬롯 `2` (Pack v3 실제 계약)

베이스는 `./models/monkey.vrm` — avatar.vrm(Shino CC0 텍스처 수술본)에서 빌드
파이프라인이 파생한 리페인트본이다. 코스튬의 동물 정체성은 **프로시저럴 후드**
(`src/model/animals/monkey.ts`)가 전담한다. 비주얼 무드는
`refs/avatar-pack/bear-monkey-turtle.png` 중앙 원숭이.

## 얼굴·헤어 (빌드 파이프라인 소유 — 카탈로그 값)

| 항목 | 확정 값 |
|---|---|
| 헤어 | 쿨 애시브라운 base `#6E5F58` / shade `#302826` / accent `#A2938A` — v3.1(오커/버건디와 분리). 렌더 보상 틴트 `#877873`. 컷 없음(롱) |
| 홍채 | 그린 3단: `#063F32` / `#19A979` / `#B8FFD4` |
| 눈매(v3.1) | 장난기 올라간 눈: lift +7 / thick 1.0 / lower 0.3 / irisScale 1.0 / brow arch. 눈썹 틴트 헤어 동조. bias 없음 |
| 눈매 | eyeSharpen 카탈로그 0.64 → registry 클램프(0.06..0.20) 적용 0.141 |
| 피부 | `#D6A078` |

## 의상 (고정 메시 컬러 블로킹 — 빌드 파이프라인 소유)

반팔 집업 톱 + 플리츠 스커트 + 로퍼 + 보타이 (메시 교체 없음, 리페인트만):
오커 몸판 / 크림 트림 / 버건디 지퍼, 스커트 버건디+오커 밑단 줄, 신발 화이트,
보타이 버건디. 팔레트: primary `#A9764C` / secondary `#F1D9BE` /
accent `#8A5A34` / dark `#3B2A1C`, 셰이드 `#7A4A2E`.

## 후드 계약 (src/model/animals/monkey.ts — 구현 완료)

- **셸/안감**: 브라운 `0xA9764C/0x7A4A2E` / 탠 `0xF1D9BE/0xC9A87E`.
  hoodKit.buildHoodBase 공통 베이스(개구부 컷 + GROW 1.08 + 아웃라인).
- **둥근 귀×2**: R=0.285·crownH 납작 구(셸색) + 탠 이너 디스크.
  surfacePoint(azimuth ±1.34, elevation 0.12, radial 0.97) — 측면 낮은 위치,
  SHELL_AP 콘(반각 ~0.98) 밖. 디스크 노멀은 rotation.y = side·0.62로 정면 쪽
  3/4 트위스트. 뒷반구는 셸에 파묻혀 이음새 없음. hitMeshes 등록.
- **이마 하트 패치(탠)**: surfacePoint(0, 0.60) 앵커에 로브 납작 구 2개
  (0.118s×0.112s×0.042s, x=±0.066s) + 뒤집은 teardrop(0.19s, 0.17s) 꼭지.
  전부 **개구부 림 위 셸 면에만** — 최하단 꼭지 elevation ≈ 0.44로 림 상단
  (ayUp−TILT = 0.30) 위 마진 유지. 얼굴 침범 0이 P0 (코덱스 실패 지점).
- **muzzleFollow**: 빈 앵커 유지 (원숭이는 주둥이 장식 없음).
- **액세서리**: buildAccessories — bandBase `#F1D9BE`/bandStripe `#8A5A34`/
  bandLine·cord `#6D2338`/tip `#3B2A1C` (셰이드 −18~22%p). update에서 acc.sway.

### 폐기된 코덱스 항목 (달성 불가/방침 변경)

포니테일 절개 후드, 크롭 봄버/카고 팬츠 별도 메시, 스프링 본 나선 꼬리,
스니커즈 메시, 표정 그리드·손 모션 증명샷 — 전부 v3 아키텍처(고정 메시
리페인트 + 프로시저럴 후드)에 없는 항목이라 제거.

## 판정샷 (shots/dev/) — 2026-07-25 통과

| 파일 | 증명 |
|---|---|
| `monkey-face.png` | 귀 탠 이너·하트 패치 선명, 얼굴 개구부 침범 0 |
| `monkey-front.png` | 전신 팔레트 조화 (오커 베스트·버건디 스커트와 브라운/탠 후드) |
| `monkey-pitch.png` | pitch 0.4에서 개구부 상단 무결, 눈썹~턱 가림 없음 |
| `monkey-orbit.png` | orbit 1.2에서 헤어/VRM 관통 없음, 귀 측면 실루엣 |
| `monkey-blink.png` | blink+mouth 표정 무결, 손목밴드·드로스트링 정상 부착 |
