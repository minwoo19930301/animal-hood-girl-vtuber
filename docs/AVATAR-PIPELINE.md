# 12종 아바타 제작 파이프라인 — 검증된 플레이북 (2026-07)

디자인 레퍼런스와 캐릭터 계약에서 시작해 `mingo-mate`에서 움직이는 독립 VRM을 만드는
재현 가능한 절차다. 현재 곰부터 기린까지 12종을 같은 파이프라인으로 관리한다.
VRoid Studio, 외부 생성 AI, API 키나 로컬 LLM은 빌드·실행에 필요하지 않다.

## 아키텍처 원칙
- **트래킹·생명감·Electron 셸은 캐릭터 무관** — 새 아바타는 카탈로그, 외형 레이어와
  VRM 에셋만 추가한다.
- `shared/avatar-catalog.json`이 키, 모델 URL, 눈·헤어·의상 팔레트의 단일 진실 공급원이다.
  Electron 메뉴와 렌더러 레지스트리가 같은 파일을 읽는다.
- 아바타 = ①공통 휴머노이드 VRM ②결정적 텍스처 수술(얼굴·눈·옷)
  ③본에 붙는 프로시저럴 헤드기어·헤어·의상 ④캐릭터별 튜닝.
- 베이스 VRM은 수정하지 않는다. 배포본은 `public/models/<slug>.vrm`으로 별도 생성한다.
- `work/avatar-pack/`은 언제든 재생성 가능한 중간물이고, `public/models/`의 완성 VRM은
  앱 배포 자산이다.

## 0. 캐릭터 계약

레퍼런스는 `refs/avatar-pack/`, 확정 계약은 `docs/specs/<slug>.md`에 둔다. 얼굴·헤어와
옷의 색만 쓰지 말고 형태, 재질, 금지 사항과 검증 샷까지 기록한다.

| 항목 | 예시 (플라밍고 후드 소녀) |
|---|---|
| 헤어 | 다크네이비, 사이드뱅 |
| 눈 | 회청 #4a5578, 눈매 강하게(EYE_SHARPEN 0.15) |
| 상의 | 화이트 트랙탑 + 코랄 #f2799e 지퍼/트림 + 네이비 카라 |
| 하의 | 네이비 + 코랄 스트라이프 |
| 헤드기어 | 플라밍고 후드(부리+눈+안감) — 탈은 3D로 생성, VRM에 없음 |
| 액세서리 | 손목밴드, 드로스트링 |
| 성격/표정 | 차분+강단 (판정 기준이 됨) |

현재 12종은 키 `1`–`9`, `0`, `-`, `=`를 사용한다. `slug`, 키, 모델 경로는 중복될 수
없으며 카탈로그 순서는 앱 메뉴와 QA 행렬 순서가 된다.

## 1. 베이스 VRM 선택
- 기본 탐색 순서: `public/models/avatar.vrm`, 없으면 `public/models/placeholder.vrm`.
  텍스처 지도는 `work/NOTES.md`에 있다.
- 다른 베이스(다른 체형/헤어): madjin/vrm-samples 의 VRoid 공식 샘플 등에서 조달.
  **새 베이스면 반드시** `node scripts/vrm-tex.mjs dump <파일>` 후 텍스처를 Read로 보고
  `work/NOTES-<base>.md` 지도(어떤 이미지가 옷/얼굴/홍채/헤어인지)를 먼저 작성.
- 출처 라이선스와 완성 VRM 재배포 가능 여부를 별도로 확인한다.

## 2. 12종 텍스처·VRM 생성

정식 경로는 아래 한 명령이다.

```bash
npm run avatars:build
```

`scripts/build-avatar-pack.mjs`가 카탈로그를 읽고 12종의 얼굴/입술/아이라인/속눈썹/눈썹/
홍채/피부/상의/하의/신발 텍스처와 헤어 재질 패치를 생성한다. 캐릭터별 중간 PNG,
`material-patch.json`, `manifest.json`은 `work/avatar-pack/<slug>/`에 쓰고
`scripts/vrm-tex.mjs`가 VRM 확장 JSON을 보존한 채 완성 VRM을 재구축한다.

단일 외형을 진단할 때만 저수준 명령을 직접 사용한다.

```bash
node scripts/vrm-tex.mjs dump public/models/avatar.vrm
node scripts/vrm-tex.mjs rebuild public/models/avatar.vrm public/models/<slug>.vrm \
  --edited-dir work/avatar-pack/<slug>/edited \
  --material-patch work/avatar-pack/<slug>/material-patch.json
```

리페인트 원칙:

- **명도 보존 색상 치환**: HSV 색역 선택으로 대상 색만 hue/sat 치환 → 주름·음영 유지. 단색 덮어칠 금지.
- 지퍼/스트라이프/로고는 UV 좌표에 직접 드로잉.
- 편집 PNG를 매번 Read로 직접 보고 교정 (경계 침범, 원본 디테일 소실 체크).
- 눈매: 아이라인·속눈썹·눈썹 텍스처와 3단 홍채색을 함께 바꾸고, 카탈로그의
  `eyeSharpen` 값을 런타임 표현 가중치로 사용한다.

## 3. 프로시저럴 외형

`src/model/animals/`의 종별 코스프레, 헤어, 워드로브 빌더가 공통 VRM의 본에 외형을
붙인다. 새 외형은 기존 하나를 복제해 색만 바꾸지 말고 해당 캐릭터 계약의 실루엣을
별도 구현한다.

- 셸 + **얼굴 개구부 컷**: 개구부 콘 내부 버텍스 collapse 후 **전부-내부 삼각형을 인덱스에서
  드롭**해야 진짜 구멍이 됨 (이거 안 하면 웹 페이스가 얼굴 덮음 — 실제 겪은 P0)
- **실측 얼굴 평면**(`FaceBounds`) 기반 개구부/림 배치 — 목보다 위의 메시 바운딩으로 자동 산출,
  림은 얼굴 평면보다 뒤(-Z)
- 포니테일·번은 후면 포트 또는 밴드형 헤드기어로 열어 두고 셸 속에 가두지 않는다.
- 장식(부리/귀/오시콘 등)은 사람의 눈·코·입을 가리지 않는 코스프레 구조로 둔다.
- 헤어, 꼬리, 끈, 키링은 `Follower` 계열 2차 모션을 사용한다.
- 의상과 액세서리는 head/chest/hips/arms/hands/legs 본을 기준으로 배치한다.

## 4. 구조 감사

```bash
npm run avatars:audit
```

감사는 정확히 12개 카탈로그 항목, 유효한 GLB, 휴머노이드·표정 정의 보존, 원본과 편집
텍스처 크기 일치, 내장 PNG 해시, 메타데이터와 매니페스트, 12종 모델/홍채/상의의
고유성을 확인한다. 중간물을 버전 관리하지 않으므로 깨끗한 체크아웃에서는 반드시
`avatars:build` 후 `avatars:audit` 순서로 실행한다.

## 5. 렌더 QA

```bash
npm run avatars:shots -- --plan
npm run avatars:shots
npm run avatars:shots -- --only bear,tiger,giraffe
```

전체 실행은 각 캐릭터에 대해 `front`, `face`, `pitch`, `blink-mouth`,
`hands-fingers`, `body-legs`, `orbit` 일곱 장을 `shots/avatar-pack/<slug>/`에 만든다. 판정 기준은
① 레퍼런스와 같은 캐릭터로 읽히는가 ② 12종 얼굴·헤어·옷 실루엣이 구별되는가
③ 개구부/헤어/몸 관통이 없는가 ④ blink·mouth·팔·손가락·하체가 정상인가
⑤ 측면에서도 헤드기어와 뒷머리가 성립하는가다.

## 함정 모음 (전부 실제로 밟은 것)
1. GLB rebuild: 새 PNG는 BIN 끝에 4바이트 정렬 append + bufferView 신설. VRM 확장 JSON 무수정.
2. VRM0은 -Z 정면 → `VRMUtils.rotateVRM0()` 필수 (계약은 +Z 정면).
3. 스크린샷: Chrome `--virtual-time-budget`은 15MB VRM 로드와 교착 → CDP로 title==='READY' 폴링
   (이미 scripts/screenshot.mjs에 반영).
4. 거울 매핑/손바닥 법선 외적 부호는 계약 v2 주석이 진실 — 임의 변경 금지.
5. 판정관 점수만 믿지 말 것 — 최종 샷은 반드시 오케스트레이터가 직접 Read (후드 개구부 사건).
6. 카탈로그만 추가하고 끝내지 말 것. 감사 스크립트는 현재 12종을 계약으로 삼으므로 팩 크기를
   바꿀 때는 카탈로그, 런타임 키, Electron 메뉴, 감사 기준과 렌더 행렬을 한 번에 갱신한다.
7. `work/avatar-pack/`은 생성 중간물이므로 커밋하지 않는다. CI는 임시 디렉터리에 비교용
   모델과 매니페스트를 생성하고 커밋된 `public/models/`의 해시를 감사한다. 이 감사가
   실패하면 카탈로그·생성기·완성 VRM 중 하나가 뒤처진 상태다.

## v3 갱신 (2026-07-25) — 이 섹션이 위 내용과 충돌하면 이 섹션이 정본

플라밍고 방식을 12종 동물로 일반화한 팩 v3 완료. 코덱스식 프로시저럴 헤어/워드로브
(cosplay/hair/wardrobe.ts)는 **삭제**됐다 — 원본 VRM 옷·헤어 메시를 살리고 텍스처 수술로
바꾸는 것이 정본. 상세 설계·판정 기록: docs/DESIGN-PACK-V3.md, docs/DECOR-BRIEF.md.

새 아바타 추가 절차 (v3):
1. `shared/avatar-catalog.json` 엔트리 (slug/label/key/modelUrl/eyeSharpen/iris/hair/palette)
2. `scripts/lib/outfit-designs.mjs` 엔트리 (의상 컬러 블로킹+motif+socks+hairCut+hairpin)
3. `src/model/animals/<slug>.ts` 빌더 — `hoodKit.buildHoodBase()`+`surfacePoint()` 장식
   (개구부 콘 밖 규칙, DECOR-BRIEF 함정 목록 준수) + `buildAccessories(bones, S, colors)`
4. `node scripts/build-avatar-pack.mjs --only <slug>` → audit → `npm run avatars:shots`
5. `docs/specs/<slug>.md` 계약 기록

핵심 함정 (v3에서 실제로 밟은 것):
- **헤어 틴트 material patch는 HAIR_02(헤어핀)에 곱하면 안 된다** — 헤어핀은 텍스처
  치환+화이트 틴트 (다크 틴트 곱해지면 핀이 검정 붕괴).
- 헤어 길이 컷: img25 하단 알파 컷 + 페더 22px + 컬럼 지터 + 팁 재음영 (bear 799 /
  fox 737 / turtle 666 / penguin 512). 앞머리도 비례 단축됨(구조적).
- QA 씬 포즈는 도너 리깅 한계 안으로 (body-legs knee ≤0.3): 스커트 스키닝·소매
  백페이스는 도너 유래 공통 한계 (DESIGN-PACK-V3 "알려진 한계").
- 워크트리 병렬 개발: node_modules 심링크 + VITE_CACHE_DIR 분리 + PORT/CDP_PORT 분리.
