# 여우 / Fox — 슬롯 `5` (Pack v3 실제 계약)

`./models/fox.vrm` — Shino CC0 베이스의 텍스처 수술본(빌드 파이프라인 파생) 위에
프로시저럴 후드·액세서리(`src/model/animals/fox.ts`)를 얹은 키구루미 여우.
v2 코덱스 스펙(모토 재킷·하네스·부시 테일·앵클 부츠 등)은 폐기 — 아래가 구현된 전부다.

## 베이스 VRM (빌드 파이프라인 소유)

| 항목 | 실제 구현 |
|---|---|
| 헤어 | 번트코퍼 `#A84423`, 하단 컷 row ≈737 (울프컷 느낌 레이어드) |
| 홍채 | 에메랄드 3단 램프 `#174A35 / #4FA46C / #D2F0A8` |
| 표정 | eyeSharpen 카탈로그 0.82 → 런타임 클램프 ≈ 0.18 |
| 의상 | 고정 메시 컬러 블로킹: 러스트 몸판 + 크림 트림·리브 + 다크 지퍼, 블랙+러스트 밑단줄 플리츠 스커트, 다크 니삭스, 다크브라운 로퍼, 크림 보타이 |
| 팔레트 | primary `#E8833A` / shade `#B85A26` / secondary `#FFF4E3` / accent `#C9622B` / dark `#3B2A20` |

## 후드 (fox.ts — hoodKit 베이스)

- 셸/안감: 러스트 `#C9622B/#94451E` / 크림 `#FFF4E3/#DCCBB0`. 공통 개구부
  (SHELL_AP/LINING_AP) — 얼굴은 항상 전부 오픈.
- **삼각 귀 ×2**: 납작 콘(반폭 0.30·crownH, 높이 0.62·crownH, z 0.45) + 상단 42%를
  덮는 다크 팁 콘 `#3B2A20/#251A13` + 크림 이너 플라크(앞면 경사에 평행 기울임,
  높이 밴드는 돔 교차선~다크 팁 하단으로 한정 — 밴드 밖이면 플라크가 돔 위로 새어
  보인다, 디버그 렌더로 실측). anchor azimuth ±0.70 / elevation 0.80, 위끝 바깥 벌어짐.
- **브로우 터프트 ×2**: 눈썹 위쪽 셸 면 surfacePoint(±0.36, 0.56) — 개구부 콘 밖.
  teardrop 3가닥을 겹쳐 위-바깥 부채꼴로 병합한 흰 털 뭉치 `#FFFDF8/#E0D7C6`.
  주의: surfacePoint 로컬 +X는 항상 월드 −X — 캐릭터-바깥 로컬 부호는 `-side`
  (hood.ts 눈물점 선례).
- muzzleFollow = 빈 muzzleAnchor (주둥이 장식 없음, index.ts 스프링 대상 유지).
- hitMeshes: 셸 + 귀 메인 콘 2개.

## 액세서리 (accessories.ts, fox 팔레트)

bandBase `#F7EBD3/#D6C4A4`, bandStripe `#B5502A/#86381D`, bandLine·cord `#C9622B/#7F3A19`,
tip `#3B2A20/#251A13`. 손목밴드 2 + 드로스트링 2, `acc.sway`를 rig.update에서 호출.

## 판정 샷 (shots/dev/)

| 파일 | 통과 기준 |
|---|---|
| `fox-face.png` | 삼각 귀+다크 팁+크림 이너+터프트가 1초 안에 여우로 읽힘, 얼굴 가림 0 |
| `fox-front.png` | 전신 팔레트 조화 (러스트/크림 의상과 후드 동일 계열), 밴드·코드 부착 |
| `fox-pitch.png` | pitch 0.4에서 상단 림이 눈썹 위 유지, 터프트·이너 플라크 이탈 없음 |
| `fox-orbit.png` | orbit 1.2에서 헤어/VRM 관통 없음, 귀 측면 실루엣 무결 |
| `fox-blink.png` | blink+mouth 0.6 표정 무결 |
