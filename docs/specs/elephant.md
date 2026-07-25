# 코끼리 / Elephant — 슬롯 `-` (Pack v3 실제 계약)

베이스는 `./models/elephant.vrm` — avatar.vrm(Shino CC0 텍스처 수술본)에서 빌드
파이프라인이 파생한 리페인트본이다. 코끼리의 귀와 코는 **프로시저럴 후드**
(`src/model/animals/elephant.ts`)로만 표현하며 사람 얼굴을 가리는 코 가면은
만들지 않는다. 비주얼 무드는 `refs/avatar-pack/tiger-elephant-giraffe.png` 중앙.

## 얼굴·헤어 (빌드 파이프라인 소유 — 카탈로그 값)

| 항목 | 확정 값 |
|---|---|
| 헤어 | 허니 브라운 base `#9A6B3F` / shade `#4A2F1E` / accent `#C8A177` — v3.1(쿨 슬레이트 위 웜). 렌더 보상 틴트 `#B27F4E`. 컷 없음(롱) |
| 홍채 | 라벤더블루 3단: `#25255C` / `#626CC4` / `#D4D8FF` |
| 눈매(v3.1) | 길고 낮은 순한 눈: lift -7 / thick 1.0 / lower 0.45 / irisScale 1.02 / brow soft-straight(틸트 -1.5). 눈썹 틴트 헤어 동조. expressionBias relaxed 0.08 |
| 눈매 | eyeSharpen 카탈로그 0.44 → registry 클램프(0.06..0.20) 적용 0.097 |
| 피부 | `#9E6B4D` |

## 의상 (고정 메시 컬러 블로킹 — 빌드 파이프라인 소유)

반팔 집업 톱 + 플리츠 스커트 + 로퍼 + 보타이 (메시 교체 없음, 리페인트만):
슬레이트 몸판 / 화이트 트림 / 핑크 지퍼, 스커트 그레이, 신발 화이트, 보타이
핑크, 니삭스 화이트(rabbit/elephant 예외). 팔레트: primary `#9BA8BC` /
secondary `#C9D3E0` / accent `#F0A7B4` / dark `#3D4350`, 셰이드 `#6F7B91`.

## 후드 계약 (src/model/animals/elephant.ts — 구현 완료)

- **셸/안감**: 슬레이트 `0x9BA8BC/0x6F7B91` / 핑크 `0xF0A7B4/0xCC8492`.
  hoodKit.buildHoodBase 공통 베이스(개구부 컷 + GROW 1.08 + 아웃라인).
- **큰 부채 귀×2**: egg(R, 1.22R, 0.30R, bias 0.22 — 위가 넓은 부채形),
  R=0.36·crownH + 핑크 이너 egg. surfacePoint(azimuth ±1.42, elevation 0.04,
  radial 0.97) — 측면 낮게, SHELL_AP 콘 밖. anchor > twist(rotation.y side·0.50
  정적 3/4 각) > flap(동적) 계층 분리. hitMeshes 등록.
- **코 (분절 tapered 튜브)**: muzzleAnchor **자식** — rotation은 index.ts
  muzzleP/muzzleY 스프링이 매 프레임 덮어쓰므로 직접 세팅 금지. 코 전체는
  앵커 자식의 **셸 표면 오프셋 루트** (position (0, 0.03, −0.07)·crownH, 방사
  바깥 노멀 근사) 아래 — 앵커가 셸 표면보다 안쪽(0.78rz)이라 pitch 0.4에서
  스프링이 코를 젖히면 분절이 셸에 파묻히던 문제 해소 (판정 라운드). 경로
  (0,0.08,0.14)→(0,0.02,−0.12)→(0,−0.085,−0.27)→(0,−0.19,−0.325)→
  (0,−0.315,−0.345)·crownH, 반지름 0.150→0.062 테이퍼. 다크 슬레이트
  `0x8794A9/0x5C6880` 크리스 링 3개(컨트롤 포인트 위, 탄젠트 정렬)로 분절감.
  라운드 팁 구 + 핑크 코끝. **팁 y −0.315·crownH = 눈썹 위까지만** — 플라밍고
  부리 팁(−0.33/−0.365) 안쪽. 더 길면 pitch-down 출렁임 때 눈 사이를 가린다.
- **귀 플랩 2차 모션**: Follower 3개(pitch L/R 50·5.4/54·5.4, yaw 44·4.8 —
  좌우 미세 비대칭, 결정적). update에서 flap rotation 세팅.
- **액세서리**: buildAccessories — bandBase `#E9EEF5`/bandStripe `#6F7B91`/
  bandLine·cord `#F0A7B4`/tip `#3D4350` (셰이드 −18~22%p). update에서 acc.sway.

### 폐기된 코덱스 항목 (달성 불가/방침 변경)

랩 유틸리티 베스트·풍선 소매·배럴 팬츠·하이킹 부츠 별도 메시, 은색 기억 캡슐,
귀 보조 본 3개(→ Follower 스프링으로 대체), 위로 말린 봉제 코(→ 림 위에서
드리우는 분절 튜브), 표정 그리드·손 모션 증명샷 — v3 아키텍처(고정 메시
리페인트 + 프로시저럴 후드)에 없는 항목이라 제거.

## 판정샷 (shots/dev/) — 2026-07-25 통과

| 파일 | 증명 |
|---|---|
| `elephant-face.png` | 부채 귀 핑크 이너·분절 코 선명, 얼굴 개구부 침범 0 |
| `elephant-front.png` | 전신 팔레트 조화 (슬레이트 베스트·그레이 스커트와 후드) |
| `elephant-pitch.png` | pitch 0.4에서 개구부 상단 무결, 눈썹~턱 가림 없음, 코 분절이 셸 위에 얹힘(파묻힘 0) |
| `elephant-orbit.png` | orbit 1.2에서 헤어/VRM 관통 없음, 코 드리움 측면 확인 |
| `elephant-blink.png` | blink+mouth 표정 무결, 손목밴드·드로스트링 정상 부착 |
| `elephant-pitchdown.png` | (추가 안전샷) pitch −0.35에서 코 팁이 눈썹 위 유지 |
