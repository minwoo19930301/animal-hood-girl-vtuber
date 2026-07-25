# 토끼 / Rabbit — 슬롯 `4` (Pack v3 실제 계약)

`./models/rabbit.vrm` — Shino CC0 베이스의 텍스처 수술본(빌드 파이프라인 파생) 위에
프로시저럴 후드·액세서리(`src/model/animals/rabbit.ts`)를 얹은 키구루미 토끼.
v2 코덱스 스펙(독립 제작 발레복·2단 관절 귀·폼폼 파우치 등)은 폐기 — 아래가 구현된 전부다.

## 베이스 VRM (빌드 파이프라인 소유)

| 항목 | 실제 구현 |
|---|---|
| 헤어 | 페일 골드 블론드 base `#E8D3A4` / shade `#C9A97A`(저채도 — 토온 셰이드 브라시 스트라이프 방지) / accent `#F7F0DE` — v3.1(핑크·크림 파스텔). 렌더 보상 틴트 `#FBE7B8`. 컷 없음(롱) |
| 홍채 | 로즈 3단 램프 `#6A294F / #C85C8D / #FFD2E4` |
| 눈매(v3.1) | 세로로 큰 동그란 눈: lift +2 / thick 0.95 / lower 0.6(애교살) / irisScale 1.10 / highlight 1.12x / brow thin-arch. 눈썹 틴트 헤어 동조. bias 없음 |
| 표정 | eyeSharpen 카탈로그 0.48 → 런타임 클램프 ≈ 0.106 |
| 의상 | 고정 메시 컬러 블로킹: 아이보리 몸판 + 로즈핑크 카라·커프·밑단 + 핑크 지퍼, 더스티핑크+화이트 도트 플리츠 스커트, 화이트 니삭스, 핑크 로퍼, 핑크 보타이 |
| 팔레트 | primary `#F5F0EA` / shade `#D8CEC3` / secondary `#FFFFFF` / accent `#F5A9B8` / dark `#3A3335` |

## 후드 (rabbit.ts — hoodKit 베이스)

- 셸/안감: 아이보리 `#F5F0EA/#D8CEC3` / 핑크 `#F5A9B8/#D08595`. 공통 개구부
  (SHELL_AP/LINING_AP) — 얼굴은 항상 전부 오픈.
- **긴 직립 귀 ×2**: taperedTube(길이 ≈ 1.16·crownH, 앞뒤 납작 0.5), 끝이 바깥+뒤로
  살짝 굽음. 앞면에 핑크 이너 튜브(겉보다 가늘고 앞으로 오프셋 → 이너 패널로 보임).
  셸 상단 전면 anchor azimuth ±0.34 / elevation 1.0 (개구부 콘 θB≈0.54 대비 θP≈1.25).
  미세 비대칭 직립(rest 기울기·스프링 상수 좌우 상이).
- **귀 스프링**: 귀당 Follower ×2 (pitch k 46/52, yaw k 40/45, max 0.5) —
  rig.update에서 step, rotation.x = rest + p·0.85 + breath·0.025 / rotation.z = rest − y·0.6.
- muzzleFollow = 빈 muzzleAnchor (주둥이 장식 없음, index.ts 스프링 대상 유지).
- hitMeshes: 셸 + 귀 겉 튜브 2개.

## 액세서리 (accessories.ts, rabbit 팔레트)

bandBase `#F5F0EA/#CFC2B4`, bandStripe `#E4849E/#C0647E`, bandLine·cord `#F5A9B8/#C97E8F`,
tip `#3A3335/#241F21`. 손목밴드 2 + 드로스트링 2, `acc.sway`를 rig.update에서 호출.

## 판정 샷 (shots/dev/)

| 파일 | 통과 기준 |
|---|---|
| `rabbit-face.png` | 귀 2개+핑크 이너+셸/안감이 1초 안에 토끼로 읽힘, 얼굴 가림 0 |
| `rabbit-front.png` | 전신 팔레트 조화 (아이보리/핑크 의상과 후드 동일 계열), 밴드·코드 부착 |
| `rabbit-pitch.png` | pitch 0.4에서 상단 림이 눈썹 위 유지, 귀 스프링 처짐 자연 |
| `rabbit-orbit.png` | orbit 1.2에서 헤어/VRM 관통 없음, 귀 측면 실루엣 무결 |
| `rabbit-blink.png` | blink+mouth 0.6 표정 무결 |
