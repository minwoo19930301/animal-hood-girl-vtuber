# 거북이 / Turtle — 슬롯 `3` (Pack v3 실제 계약)

`./models/turtle.vrm` + `src/model/animals/turtle.ts` 프로시저럴 후드. 코덱스 v2 스펙의
달성 불가 항목(등껍질 백팩, 비대칭 하프후디, 카고 팬츠, 트레일 러너, 산소 게이지 참,
쇼트 카울 엠보싱)은 폐기 — v3는 고정 의상 메시 컬러 블로킹 + hoodKit 후드 + 장식이 정본.

## 얼굴·헤어 (VRM 텍스처 수술 — 빌드 파이프라인 소유)

| 항목 | 실제 구현 |
|---|---|
| 헤어 | 로즈 브라운 base `#8A5A55` / shade `#452A2A` / accent `#B8928D` — v3.1(그린 의상 위 웜 포인트). 렌더 보상 틴트 `#9A6863`. 친 보브 컷 row 666. |
| 홍채 | 시안 3단 램프 (카탈로그 iris dark/mid/light) |
| 눈매(v3.1) | 나른한 반개 직선: lift 0 + drop 4px / thick 1.25 / lower 0.2 / irisScale 0.95 / brow straight-thin. 눈썹 틴트 헤어 동조. expressionBias relaxed 0.10 |
| 표정 | eyeSharpen 카탈로그값 → registry 클램프(0.06..0.20). blink+mouth 무결 검증됨 |

## 의상 (고정 메시 리페인트 — 빌드 파이프라인 소유)

세이지 몸판 집업 베스트/틸 카라/크림 리브 트림 + 밑단 헥사 플레이트 모티프,
화이트 이너 + 틸 소매 트림, 차콜 플리츠 스커트 + 틸 밑단줄, 다크그린 니삭스,
그린 로퍼, 틸 보타이(AccessoryNeck 노출).

## 후드 (src/model/animals/turtle.ts — 이 파일이 계약 소유)

- **셸/안감**: 모스그린 `0x7FB069/0x4F7C48` / 크림 `0xDCEBC4/0xAFC590` (hoodKit
  buildHoodBase, SHELL_AP/LINING_AP 공통 개구부 — 얼굴 침범 0).
- **등껍질 플레이트**: 다크그린 `0x4C7038/0x30491F` 납작 육각 실린더 디스크 10개
  (r=0.26·crownH·s, h=0.05·crownH, 아웃라인 nightPurple). 후상부 로제트 7 —
  중심판 (az π, el 0.50) + 정수리 쪽 (π, 1.05) + 하단 (π, −0.06) + 상부 좌우
  (π±0.75, 0.80) + 하부 좌우 (π±0.72, 0.18) — 개구부 콘 반대편(후면)이라 침범 불가.
  정면 판독용 소형 3 (판정 라운드: 정면이 민무늬 그린 돔이었음) — 림 상단 중앙
  (az 0, el 1.02, s 0.56) + 정면 상측 좌우 (az ±1.32, el 0.58, s 0.72). 개구부
  콘축 이격 θ ≈1.22/1.50 rad vs 해당 φ 콘 경계 ≈0.58/0.74 — 판 각반경(≤0.2)
  감안 마진 ≥0.45 rad. 전부 surfacePoint 앵커(radial 1.0), roll은 결정적 고정값.
- **꼬리 놉**: 셸색 taperedTube (radii 0.11→0.026·crownH), surfacePoint(π, −0.48, 0.97)
  앵커에서 바깥(+Z)·아래로 훅. 뒷모습에서 명확히 돌출 확인됨.
- **muzzleFollow**: 빈 앵커 유지 (거북이는 주둥이 장식 없음 — index.ts 스프링 무해).

## 액세서리 (buildAccessories 오버라이드)

bandBase `0xDCEBC4` / bandStripe `0x2E7D74` / bandLine·cord `0x2E8C81` / tip `0x31431F`
(셰이드 각 명도 −18~22%p + hue 미세 회전). 손목밴드 2 + 드로스트링 2가닥,
update에서 acc.sway (Follower 스프링, 결정적).

## 판정 샷 (shots/dev/turtle-*.png — 전부 통과 확인, 2026-07-25)

| 샷 | 쿼리 | 통과 기준 |
|---|---|---|
| face | `avatar=turtle&cam=face&bg=1` | 개구부 침범 0, 액세서리 부착, 정면 플레이트 3개로 등껍질 모티프 판독 |
| front | `avatar=turtle&bg=1` | 팔레트-의상 조화, 전신 실루엣 |
| pitch | `avatar=turtle&pitch=0.4&bg=1` | 상단 림이 눈썹 위 유지 |
| orbit | `avatar=turtle&orbit=1.2&bg=1` | 측면 플레이트·헤어 관통 없음 |
| blink | `avatar=turtle&blink=1&mouth=0.6&cam=face&bg=1` | 표정 무결 |
| back(보조) | `avatar=turtle&orbit=3.1&bg=1&cam=face` | 육각 패턴+꼬리 놉 판독 — 동물 정체성 |
