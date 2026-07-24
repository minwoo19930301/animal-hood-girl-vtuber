# 호랑이 / Tiger — 슬롯 `0` (Pack v3 실제 계약)

`./models/tiger.vrm`은 avatar.vrm(Shino CC0) 텍스처 수술 파생본이다. 의상은 고정 메시
(반팔 집업 톱 + 플리츠 스커트 + 로퍼 + 보타이) 위 컬러 블로킹, 후드는
`src/model/animals/tiger.ts`의 프로시저럴 hoodKit 빌드다. 코덱스 v2 스펙의 별도 얼굴
조형·레이싱 재킷·컴뱃 팬츠·꼬리·포니테일 포트는 이 파이프라인에서 달성 불가 항목으로
폐기했다.

## 베이스 VRM (build-avatar-pack 산출)

| 항목 | 실제 구현 |
|---|---|
| 헤어 | 앰버 틴트 base `#C05A2A` / shade `#2B211E` / accent `#F39A49`, 컷 없음(롱) |
| 홍채 | 코발트 3단 `#123D6B / #2D78C4 / #B7DDFF` |
| 표정 | eyeSharpen 카탈로그 0.88 → 런타임 클램프 ≈0.19 (샤프한 눈매) |
| 상의 | 오렌지 몸판 `#EE8A3C`(셰이드 `#C65F26`), 화이트 가슴 빕 `#FFF1DC`, 카라·커프·밑단·지퍼 웜블랙 `#2E2620` |
| 스커트 | 웜블랙 `#26211D` + 오렌지 밑단줄 `#EE8A3C` |
| 신발/보타이/삭스 | 블랙 `#26211D` / `#2E2620` / `#2E2620` |

## 후드 (src/model/animals/tiger.ts)

| 항목 | 실제 구현 |
|---|---|
| 셸/안감 | 오렌지 `#EE8A3C`/`#C65F26` 셸 + 화이트 `#FFF1DC`/`#DCC4A4` 안감 (hoodKit buildHoodBase) |
| 스트라이프 | 웜블랙 `#2E2620`/`#1C1712` 곡선 스트라이프 — 좌우 대칭 4쌍(이마 八자·볼 옆·상측면·뒤통수) + 정수리 세로 자오선 1개. taperedTube를 셸 곡률 호(y=ρsinφ, z=ρ(cosφ−1))로 구부려 radial 0.995 밀착, 끝 테이퍼, 아웃라인 0.010L |
| 귀 | 둥근 귀 ×2 (az ±1.0, el 0.66) — 오렌지 겉 + 화이트 이너 디스크, 법선을 정면 쪽 y 0.55 틸트, 히트메시 등록 |
| 코 | 핑크 코 `#F78FA7`/`#DB6A8E` (egg, 위 넓은 라운드 삼각) — muzzleFollow 앵커 자식으로 상단 림 중앙 위. rotation은 index.ts 스프링 소유 |
| 개구부 | 전 장식 SHELL_AP 콘 밖 검증 (센터 스트라이프 하단 팁 el 0.59 > 상단 경계 0.52) |

## 액세서리 (buildAccessories)

bandBase `#FFF1DC` / bandStripe `#2E2620` / bandLine·cord `#EE8A3C` / tip `#2E2620`
(셰이드 각 명도 −20%p). 드로스트링 sway는 rig.update → acc.sway 배선.

## 판정샷 (shots/dev/, 판정 기준 5게이트 통과본)

| 파일 | 증명 |
|---|---|
| `tiger-face.png` | 이마 센터+八자 스트라이프·핑크 코·화이트 이너 귀로 1초 정체성, 개구부 침범 0 |
| `tiger-front.png` | 전신 팔레트 조화 (오렌지/웜블랙/크림), 손목밴드·드로스트링 부착 |
| `tiger-pitch.png` | pitch 0.4에서 눈썹~턱 가림 없음, 코가 림 위 유지 |
| `tiger-orbit.png` | 측면 스트라이프 밀착(부상 없음), 헤어/VRM 관통 없음 |
| `tiger-blink.png` | blink+mouth 표정 무결, 장식 간섭 없음 |
