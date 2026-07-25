# 기린 / Giraffe — 슬롯 `=` (Pack v3 실제 계약)

`./models/giraffe.vrm`은 avatar.vrm(Shino CC0) 텍스처 수술 파생본이다. 의상은 고정 메시
(반팔 집업 톱 + 플리츠 스커트 + 로퍼 + 보타이) 위 컬러 블로킹, 후드는
`src/model/animals/giraffe.ts`의 프로시저럴 hoodKit 빌드다. 코덱스 v2 스펙의 버블 포니·
사파리 베스트·니하이 부츠·쌍안경 펜던트는 이 파이프라인에서 달성 불가 항목으로 폐기했다.

## 베이스 VRM (build-avatar-pack 산출)

| 항목 | 실제 구현 |
|---|---|
| 헤어 | 그레이지 base `#8D8378` / shade `#514944` / accent `#BCB6AF` — v3.1(웜 새프런과 뉴트럴 대비). 렌더 보상 틴트 `#A59B8F`. 컷 없음(롱) |
| 홍채 | 헤이즐 3단 `#3A3310 / #718A32 / #E8E39A` |
| 눈매(v3.1) | 와이드 아몬드: lift +4 / thick 1.05 / lower 0.35 / irisScale 1.04 / 속눈썹 길이 1.3x / brow thin-long. 눈썹 틴트 헤어 동조. bias 없음 |
| 표정 | eyeSharpen 카탈로그 0.58 → 런타임 클램프 ≈0.13 (부드러운 눈매) |
| 상의 | 새프런크림 몸판 `#F3D689`(셰이드 `#D79F2C`), 카라·커프·지퍼 브라운 `#8A5A34`, 밑단 라운드 패치 모티프 `#C98A3B` |
| 스커트 | 탠 `#C99A5B` |
| 신발/보타이/삭스 | 크림 `#F5EFDC` / 브라운 `#8A5A34` / 다크브라운 `#4A371C` |

## 후드 (src/model/animals/giraffe.ts)

| 항목 | 실제 구현 |
|---|---|
| 셸/안감 | 크림 `#FFF3CE`/`#DCC794` 셸 + 탠 `#D9A35C`/`#B07F3F` 안감 (hoodKit buildHoodBase) |
| 패치 | 딥 탠 `#C98A3B`/`#8F5E24` 라운드 패치 8개 — 납작 렌즈(z-스케일 0.16)를 radial 0.975에 심어 밀착, 반경 0.150~0.205L 크기 변화 + 세로비/기울기 변화로 유기적 비대칭 분산, 아웃라인 0.010L |
| 오시콘 | ×2 (az ±0.42, el 1.08 정수리 앞쪽) — 탠 스토크(taperedTube, 방사 +Z 방향 0.23L) + 갈색 `#8A5A34`/`#63401F` 볼 팁(구 0.065L, 오버랩 심 은폐), 히트메시 등록 |
| 사이드 귀 | 작은 귀 ×2 (az ±1.28, el 0.30) — 크림 겉 + 탠 이너 디스크, 법선을 정면 쪽 y 0.5 틸트, 히트메시 등록 |
| 개구부 | 전 장식 SHELL_AP 콘 밖 검증 (최전방 패치 az 0.95/el 0.75, 각반경 포함 여유 유지). muzzleFollow는 빈 앵커 (기린은 코 장식 없음) |

## 액세서리 (buildAccessories)

bandBase `#FFF3CE` / bandStripe `#8A5A34` / bandLine·cord `#F2C94C` / tip `#4A371C`
(셰이드 각 명도 −20%p). 드로스트링 sway는 rig.update → acc.sway 배선.

## 판정샷 (shots/dev/, 판정 기준 5게이트 통과본)

| 파일 | 증명 |
|---|---|
| `giraffe-face.png` | 오시콘·탠 패치·사이드 귀로 1초 정체성, 개구부 침범 0 |
| `giraffe-front.png` | 전신 팔레트 조화 (크림/탠/골드), 손목밴드·드로스트링 부착 |
| `giraffe-pitch.png` | pitch 0.4에서 눈썹~턱 가림 없음, 오시콘·패치가 콘 밖 유지 |
| `giraffe-orbit.png` | 측면 패치 밀착(부상 없음), 헤어/VRM 관통 없음 |
| `giraffe-blink.png` | blink+mouth 표정 무결, 장식 간섭 없음 |
