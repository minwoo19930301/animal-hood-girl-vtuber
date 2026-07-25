# 부엉이 / Owl — 슬롯 `8` (Pack v3 실제 계약)

`./models/owl.vrm`은 베이스 VRM(Shino CC0 텍스처 수술본)의 팔레트 리페인트 파생 +
프로시저럴 부엉이 후드다. 정본: shared/avatar-catalog.json `owl` 엔트리,
docs/DESIGN-PACK-V3.md 12종 표, 빌더 `src/model/animals/owl.ts`.

## 베이스 리스타일 (빌드 파이프라인 소유 — scripts/build-avatar-pack.mjs)

| 항목 | 실제 값 |
|---|---|
| 헤어 | 다크 그레이 애시 base `#55565E` / shade `#202023` / accent `#878892` — v3.1(브라운 의상과 쿨 대비). 렌더 보상 틴트 `#6B6C77`(순흑 잠김 방지). 컷 없음(롱 유지). |
| 홍채 | 앰버 3단 램프 `#5B2408 / #E07318 / #FFE0A0` |
| 눈매(v3.1) | 크게 뜬 원형: lift +1 / thick 1.3 / lower 0.4 / irisScale 1.12 / highlight 1.15x / brow arch-high(raise +4). 눈썹 틴트 헤어 동조. bias 없음 |
| 눈매 | eyeSharpen 카탈로그 0.7 → 런타임 클램프 0.154 |
| 상의 | 코코아 브라운 베스트 + 크림 카라 + 밑단 앰버 아가일 밴드 (UV 영역 마스크 컬러 블로킹) |
| 하의/신발 | 다크브라운 플리츠 스커트 / 브라운 로퍼 + 다크 니삭스 |
| 보타이 | 앰버(팔레트 accent) 리페인트 — 숨기지 않는다 |

## 프로시저럴 후드 (src/model/animals/owl.ts)

hoodKit `buildHoodBase` 셸+안감 (개구부 컷·치수 자동 산출 공통 규약) 위에 장식.
전부 SHELL_AP 개구부 콘 밖 — 얼굴(눈썹~턱) 위 드리움 0 (P0 게이트).

| 파트 | 실제 구현 |
|---|---|
| 셸/안감 | 브라운 `#8C6849/#65482F` / 크림 `#E8D5B8/#C0A980` |
| 셸 눈×2 | 플라밍고 눈판 기법, `surfacePoint(±0.54, 0.30, radial 0.955)` — 검증 좌표 + 인셋 (판정 라운드: 기본 radial 0.99는 orbit에서 눈판이 셸 실루엣 밖으로 떠 보임 — 표면 오프셋 절반 이하로 인셋해 셸에 심긴 디스크로). Re=0.15·crownH(플라밍고보다 크고 동그랗게). 앰버 링 `#F0B429/#C98C14` 1.5Re + 검정 동공 `#221A29` 1.02Re + 흰 하이라이트 대(0.36Re)·소(0.15Re) |
| 귀깃 터프트×2 | `surfacePoint(±0.62, 1.02)` 콘(r 0.15·crownH, h 0.40·crownH, z-납작 0.7), 바깥으로 눕힘. 다크브라운 `#74543A/#523A26`. hitMeshes 등록 |
| 미니 부리 | muzzleFollow 앵커(위치를 눈 사이 y 0.37ry / z −0.90rz로 조정, rotation은 index.ts 스프링 소유 — 부리는 자식으로만 add). 아래 향한 앰버 콘 r 0.105·crownH, h 0.30·crownH `#F0B429/#C98C14` |

## 3D 액세서리 (buildAccessories — flamingo 배선과 동일, 색만 owl)

bandBase 크림 `#E8D5B8/#C0A980` · bandStripe 다크브라운 `#74543A/#523A26` ·
bandLine/cord 앰버 `#F0B429/#C98C14` · tip 다크 `#33261B/#1F1610`.
드로스트링 2차 모션은 `update`에서 `acc.sway(pitchS, yaw, breath, dt)`.

## 판정샷 (shots/dev/owl-*.png — DECOR-BRIEF 필수 5샷 + 후면)

| 샷 | 증명 |
|---|---|
| `owl-face.png` (`cam=face&bg=1`) | 눈판·터프트·부리 정면 판독, 얼굴 개구부 침범 0 |
| `owl-front.png` (`bg=1`) | 전신 팔레트 조화 (브라운/크림/앰버), 액세서리 부착 |
| `owl-pitch.png` (`pitch=0.4&bg=1`) | 고개 들어도 장식이 눈썹~턱을 안 가림 |
| `owl-orbit.png` (`orbit=1.2&bg=1`) | 측면 — 헤어/VRM 메시 관통 없음, 눈판·부리 측면 실루엣 |
| `owl-blink.png` (`blink=1&mouth=0.6&cam=face&bg=1`) | 표정 무결 (눈감음+입벌림) |
| `owl-back.png` (`orbit=2.6&bg=1`) | 후면 셸 클린, 헤어가 셸 아래로 자연스럽게 흐름 |
