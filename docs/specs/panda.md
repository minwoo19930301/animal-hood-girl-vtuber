# 판다 / Panda — 슬롯 `6` (Pack v3 실제 계약)

`./models/panda.vrm`은 avatar.vrm(Shino CC0 텍스처 수술본)에서 빌드 파이프라인이 파생한
리페인트 모델이다. 프로시저럴 박스 의상·블롭 헤어(코덱스 v2)는 폐기됐다 — 진짜 VRoid
옷·헤어 메시를 살리고 컬러 블로킹 리페인트 + 프로시저럴 후드(hoodKit)로 완성한다.
무드 레퍼런스: `refs/avatar-pack/rabbit-fox-panda.png` 오른쪽 (비율·구조 계약이 아니라 분위기).

## 베이스 리페인트 (빌드 파이프라인 소유 — scripts/build-avatar-pack.mjs)

| 항목 | 실제 계약 |
|---|---|
| 헤어 | 잉크블랙 틴트 base `#222126` / shade `#09090C` / accent `#5B5865`. 컷 없음 — 롱 실루엣 유지 (v2의 스페이스 번 두 개는 베이스 헤어 메시 구조상 달성 불가 — 폐기). |
| 홍채 | 회보라 3단: `#3B1F3E` / `#8B568C` / `#EBCFEA`. eyeSharpen 카탈로그 0.32 → 런타임 클램프 후 0.070 (가장 느긋한 눈매 그룹). |
| 상의(img17) | UV 영역 마스크 컬러 블로킹: 화이트 몸판(`#F7F4EF`) / 블랙 카라·커프·밑단 / 블랙 지퍼. |
| 스커트/신발 | 블랙 플리츠 스커트, 블랙 로퍼. |
| 보타이 | **레드** 리페인트 — 모노크롬에 유일한 컬러 포인트, 숨기지 않는다. |
| 피부 | 스킨톤 `#F1C7AD`, 니삭스 다크 유지(중화 제외). |

## 후드 (src/model/animals/panda.ts — 전부 코드, 좌표는 crownH=L 비례)

셸/안감: 화이트 `#F7F4EF`/`#D6D1CB`, 블랙 림(안감) `#2E2B2C`/`#232122` — hoodKit
`buildHoodBase` 공통 규약(TILT 0.22, SHELL_AP 개구부, GROW 1.08, 얼굴 실측 FaceBounds).
개구부 림 안쪽으로 블랙 밴드가 보이는 것이 판다 시그니처 림이다. 블랙 계열
셰이드는 base 근접값(−7%p 이내)으로 완화 — 저폴리 파세팅이 토온 램프 경계로
드러나던 문제 해소 (판정 라운드).

| 장식 | 실제 구현 (전부 SHELL_AP 개구부 콘 밖) |
|---|---|
| 검정 반구 귀 ×2 | `surfacePoint(az ±0.78, el 0.92, radial 0.97)`. 잉크 반구 R=0.28L, 두께 0.80R, rot.x 0.12, unitSphere(48×32) + `toonMat(rim:0)` 매트 (판정 라운드: 0.30 젖힘·얇은 두께가 선글라스 디스크로 읽혔고 림 하이라이트가 파세팅을 회색 패치로 노출 — 바깥 이동·두께 증가·젖힘 완화·매트화). 히트메시 등록. |
| 눈물방울 아이패치 ×2 | `surfacePoint(az ±0.54, el 0.34, radial 0.985)` — 플라밍고 눈 검증 좌표대. teardrop(0.27L, 0.19L, flat 0.30) — 길이 −10%로 패치 팁-귀 사이 화이트 갭 확보 (판정 라운드). **팁은 위-바깥** (`rot.z = +side·0.45`; 앵커 로컬 +X는 월드 캐릭터-왼쪽 고정이라 바깥 = −side·X̂ — 팁을 아래-안쪽으로 내리면 개구부 위로 드리워 P0). `toonMat(rim:0)` 매트. |
| 흰 눈동자 점 ×2 | 패치 통통한 몸통 위 unlit 화이트 (0.050L×0.058L), 패치 앞 z 0.055L. |

## 액세서리 (src/model/accessories.ts 공용 — 빌더에서 색 지정)

손목밴드+드로스트링: bandBase `#F7F4EF` / stripe `#2E2B2C` / line·cord `#C63838`(레드) /
tip `#2E2B2C` (셰이드 각 −20%p). 레드 코드가 보타이와 호응하는 포인트.
`cordScale 0.45` — 기본 길이(1.12hw)는 레드 코드가 레드 보타이 위를 가로질러
레드-온-레드로 겹쳤다(판정 라운드). 1차 축소값 0.62는 앵커가 카라 기부라 코드
끝이 여전히 보타이 아래까지 내려와(재판정) 0.45로 재축소 — 코드가 보타이 위에서
끝난다 (buildAccessories 4번째 옵션 인자, 타 종 기본 1 무영향).

## 2차 모션

- 후드 셸: index.ts 공통 headFollow 스프링 (rotation 소유권 index.ts — 빌더는 자식 add만).
- 귀·패치: 셸에 밀착된 강체 — 파츠별 스프링 없음 (반구 귀는 출렁임이 어색).
- muzzleFollow: 장식 없는 빈 앵커 유지 (계약 준수 — index.ts가 rotation을 덮어쓴다).
- 드로스트링: 공용 Follower 스프링 스윙.

## 판정샷 (필수 5샷 — 전부 통과 확인됨)

`PORT=5311 CDP_PORT=9411 SKIP_BUILD=1 npm run shot -- harness.html shots/dev/panda-<name>.png "<query>"`

| 샷 | 쿼리 | 판정 기준 |
|---|---|---|
| face | `avatar=panda&cam=face&bg=1` | 판다 정체성 1초 인지 (흑백+귀+아이패치), 개구부 침범 0 |
| front | `avatar=panda&bg=1` | 전신 모노크롬+레드 포인트 조화, 손목밴드·드로스트링 부착 |
| pitch | `avatar=panda&pitch=0.4&bg=1` | 개구부 상단 침범 0 — 패치가 림 밖 셸 면에 머무름 |
| orbit | `avatar=panda&orbit=1.2&bg=1` | 헤어/VRM 메시 관통 0, 귀 측면 실루엣 |
| blink | `avatar=panda&blink=1&mouth=0.6&cam=face&bg=1` | 표정 무결 (blink+mouth) |
