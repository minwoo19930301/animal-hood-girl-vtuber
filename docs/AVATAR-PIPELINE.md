# 새 아바타 제작 파이프라인 — 검증된 플레이북 (2026-07)

사진 1장 또는 텍스트 설명 → mingo-mate에서 움직이는 새 아바타.
"플라밍고 후드 소녀" 제작(2026-07-19~20)에서 실증된 절차의 일반화. VRoid Studio 불필요.

## 아키텍처 원칙
- **트래킹·생명감·Electron 셸은 캐릭터 무관** — 새 아바타는 `src/model/` 레이어와 에셋만 만든다.
- 아바타 = ①베이스 VRM ②텍스처 수술(옷·눈) ③프로시저럴 헤드기어/액세서리 ④경로 전환.
- 원본 VRM은 절대 수정하지 않는다 — 편집본을 새 파일로 (`public/models/<slug>.vrm`).

## 0. 스펙 추출 (입력: 사진 or 설명)
레퍼런스 이미지를 `refs/target-<slug>.png`로 저장(Read로 직접 보고 진행). 설명만 있으면
표를 먼저 완성하고 사용자에게 1회 확인. `docs/specs/<slug>.md`에 기록:

| 항목 | 예시 (플라밍고 후드 소녀) |
|---|---|
| 헤어 | 다크네이비, 사이드뱅 |
| 눈 | 회청 #4a5578, 눈매 강하게(EYE_SHARPEN 0.15) |
| 상의 | 화이트 트랙탑 + 코랄 #f2799e 지퍼/트림 + 네이비 카라 |
| 하의 | 네이비 + 코랄 스트라이프 |
| 헤드기어 | 플라밍고 후드(부리+눈+안감) — 탈은 3D로 생성, VRM에 없음 |
| 액세서리 | 손목밴드, 드로스트링 |
| 성격/표정 | 차분+강단 (판정 기준이 됨) |

## 1. 베이스 VRM 선택
- 기본: `public/models/placeholder.vrm` (VRoid 샘플 Sendagaya Shino — 텍스처 지도 `work/NOTES.md` 완비)
- 다른 베이스(다른 체형/헤어): madjin/vrm-samples 의 VRoid 공식 샘플 등에서 조달.
  **새 베이스면 반드시** `node scripts/vrm-tex.mjs dump <파일>` 후 텍스처를 Read로 보고
  `work/NOTES-<base>.md` 지도(어떤 이미지가 옷/얼굴/홍채/헤어인지)를 먼저 작성.
- ⚠️ 출처 라이선스 확인 (VRoid 샘플은 개인 이용 OK, 재배포·상용은 별도 확인).

## 2. 텍스처 수술 (옷 갈아입히기)
도구: `scripts/vrm-tex.mjs` (GLB 파서 — dump/rebuild, VRM 확장 보존)
```bash
node scripts/vrm-tex.mjs dump public/models/placeholder.vrm     # → work/textures/, manifest.json
# 리페인트 스크립트 작성 (@napi-rs/canvas, work/edited/<imageIdx>.png 로 저장)
node scripts/vrm-tex.mjs rebuild public/models/placeholder.vrm public/models/<slug>.vrm
```
리페인트 원칙 (실증됨):
- **명도 보존 색상 치환**: HSV 색역 선택으로 대상 색만 hue/sat 치환 → 주름·음영 유지. 단색 덮어칠 금지.
- 지퍼/스트라이프/로고는 UV 좌표에 직접 드로잉.
- 편집 PNG를 매번 Read로 직접 보고 교정 (경계 침범, 원본 디테일 소실 체크).
- 눈매: 아이라인 두께/눈꼬리 각도/홍채색 텍스처 + 런타임 `EYE_SHARPEN` 상수 병행.

## 3. 프로시저럴 헤드기어 (탈/모자/후드)
`src/model/hood.ts` 가 패턴 원형. 새 탈은 이 모듈을 복제해 형상만 교체:
- 셸 + **얼굴 개구부 컷**: 개구부 콘 내부 버텍스 collapse 후 **전부-내부 삼각형을 인덱스에서
  드롭**해야 진짜 구멍이 됨 (이거 안 하면 웹 페이스가 얼굴 덮음 — 실제 겪은 P0)
- **실측 얼굴 평면**(`FaceBounds`) 기반 개구부/림 배치 — 목보다 위의 메시 바운딩으로 자동 산출,
  림은 얼굴 평면보다 뒤(-Z)
- 장식(눈/부리/귀 등)은 개구부 밖 셸 면 위에, 팔레트는 스펙 표에서
- 2차 모션: `Follower` 스프링으로 head pitch/yaw 지연 추종
- 액세서리(밴드/끈)는 VRM 본(손목/가슴) 기준 자동 배치 — 하드코딩 좌표 금지

## 4. 전환 & 검증
- `src/model/index.ts`의 모델 경로 상수 → `./models/<slug>.vrm`
- 표준 검증 샷 (각각 Read로 육안 판정, refs/target과 비교):
```bash
npm run shot -- harness.html shots/<slug>-front.png "bg=1"
npm run shot -- harness.html shots/<slug>-face.png "cam=face&bg=1"
npm run shot -- harness.html shots/<slug>-pitch.png "pitch=0.4&bg=1"
npm run shot -- harness.html shots/<slug>-blink.png "blink=1&mouth=0.6&bg=1"
npm run shot -- harness.html shots/<slug>-arms.png "armL=fwd&fingersR=1,0,1,1,1&bg=1"   # 전신 리그 머지 후
npm run shot -- harness.html shots/<slug>-orbit.png "orbit=1.2&bg=1"                      # 측면
```
- 판정 기준: ①레퍼런스와 같은 캐릭터로 읽히는가 ②개구부/클리핑/T포즈 잔재 없는가
  ③blink·mouth·팔 모션 무결성 ④툰 크리스프(조명 고정).
- 규모가 크면 Workflow 패턴: 빌드(병렬) → 판정관(채점+펀치리스트) → 수정 → 게이트.
  기존 스크립트: `~/.claude/projects/…/workflows/scripts/mingo-vrm-restyle-*.js` 참조.

## 함정 모음 (전부 실제로 밟은 것)
1. GLB rebuild: 새 PNG는 BIN 끝에 4바이트 정렬 append + bufferView 신설. VRM 확장 JSON 무수정.
2. VRM0은 -Z 정면 → `VRMUtils.rotateVRM0()` 필수 (계약은 +Z 정면).
3. 스크린샷: Chrome `--virtual-time-budget`은 15MB VRM 로드와 교착 → CDP로 title==='READY' 폴링
   (이미 scripts/screenshot.mjs에 반영).
4. 거울 매핑/손바닥 법선 외적 부호는 계약 v2 주석이 진실 — 임의 변경 금지.
5. 판정관 점수만 믿지 말 것 — 최종 샷은 반드시 오케스트레이터가 직접 Read (후드 개구부 사건).
6. 다중 아바타: 지금은 경로 상수 1개. 여러 개 병행하려면 PR#2(전신 리그) 머지 후
   `src/model/config.ts`에 {slug → vrm경로+헤드기어모듈+튜닝상수} 레지스트리로 리팩터 권장.
