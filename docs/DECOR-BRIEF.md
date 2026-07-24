# 후드 장식 단계 — 에이전트 공용 브리프 (Pack v3 Phase 2)

담당 동물 2종의 `src/model/animals/<slug>.ts` 스텁에 장식을 구현한다. 디자인 정본은
docs/DESIGN-PACK-V3.md 12종 표의 "후드 셸/안감"·"후드 장식" 열. 각 스텁 파일 상단
주석에 해당 종 계약이 복사되어 있다. 레퍼런스 구현은 src/model/hood.ts(플라밍고 —
눈판/부리/속눈썹 등 장식 배치의 정석)와 refs/avatar-pack/*.png(비주얼 무드).

## hoodKit API (src/model/animals/hoodKit.ts)

- `buildHoodBase(crownH, hw, face, colors)` → `{ pivot, shellPivot, C, rx, ry, rz, shellMesh, hitMeshes }`
- `surfacePoint(base, azimuth, elevation, radial=0.99)` → 셸 표면 앵커 Group(이미
  shellPivot 자식, 로컬 +Z=바깥/+Y=수직·롤 없음). 장식은 이 앵커의 자식으로.
- `muzzleAnchor(base)` → 상단 림 중앙 앵커 (muzzleFollow 용도)
- 재export: toonMat/unlitMat/addOutline/taperedTube/unitSphereLo/mergeShapes
- 상수: TILT 0.22, SHELL_AP {ax:0.98, ayUp:0.52, ayDown:1.05}, LINING_AP

## 필수 함정 (전부 실제 사고 이력)

1. **장식은 SHELL_AP 개구부 콘 밖에만** — 검증 좌표: 플라밍고 눈 azimuth ±0.54 /
   elevation 0.30. 얼굴(눈·볼·입) 위에 어떤 장식도 드리우면 P0.
2. `setFromUnitVectors(z, dir)` 금지 — surfacePoint 앵커가 makeBasis로 이미 안전.
3. `addOutline`은 mesh.scale 확정 **후** 호출 (폭이 스케일 평균 보정).
4. muzzleFollow의 rotation은 index.ts 스프링이 매 프레임 덮어쓴다 — 장식은 반드시
   **자식으로 add**, rotation 직접 세팅 금지. (elephant: 코 밑동을 muzzleAnchor
   자식으로 달고 앵커 position만 조정 가능)
5. elevation ≈ π/2(정수리)는 롤 방향이 임의 — 정수리 장식은 렌더로 방향 확인.
6. 대형 장식(귀·갈기·코 등)은 base.hitMeshes에 push (클릭 히트).
7. 색은 toonMat(색, 셰이드) 2단 — 셰이드는 명도 -20%p에 hue를 살짝 돌린 값
   (hood.ts HOOD_COL 패턴). 아웃라인은 PALETTE.nightPurple 계열 유지.
8. 출렁이는 파츠(토끼 귀, 코끼리 코 등)는 `Follower`(src/model/springs.ts)로
   2차 모션 — rig.update 안에서 step (dt 기반, Math.random 금지).

## 액세서리 (전 종 공통 — 의상 완성 요소)

`buildAccessories(bones, S, colors)` (src/model/accessories.ts) 를 빌더에서 호출해
손목밴드+드로스트링을 부착하고 `update`에서 `acc.sway(...)` 호출 (flamingo.ts 참조 —
bones 매핑 포함). AccessoryColors 지정: bandBase=밝은 중립(팔레트 secondary 계열),
bandStripe=카라/트림색, bandLine·cord=보타이색, tip=다크. 정확 값은 과제 지시문의
색표에서. 셰이드는 각 색 명도 -18~22%.

## 개발 루프 (워크트리 전용 규약)

```bash
ln -s /Users/hyemini/repos/mingo-mate/node_modules node_modules   # 최초 1회
VITE_CACHE_DIR=$PWD/.vite-cache HARNESS_ONLY=1 npx vite build      # 코드 수정마다
PORT=<지정> CDP_PORT=<지정> SKIP_BUILD=1 npm run shot -- harness.html shots/dev/<slug>-face.png "avatar=<slug>&cam=face&bg=1"
```
필수 확인샷 5종(슬러그별): face / front(`bg=1`) / pitch(`pitch=0.4&bg=1`) /
orbit(`orbit=1.2&bg=1`) / blink(`blink=1&mouth=0.6&cam=face&bg=1`).
**모든 샷은 Read로 직접 보고 판정** — 통과까지 수정 반복.

## 자가 게이트 (전부 충족 시에만 완료 보고)

1. 동물 정체성이 1초 안에 읽힌다 (귀/부리/갈기/패턴).
2. 얼굴 개구부 침범 0 — 정면·pitch 0.4·blink 어디서도 눈썹~턱 가림 없음.
3. 헤어/VRM 메시 관통 없음 (orbit 샷으로 측·후면 확인).
4. 팔레트가 의상과 조화 (전신 front 샷 기준).
5. blink+mouth 표정 무결, 액세서리 정상 부착.

## 완료 절차

1. 담당 2종의 docs/specs/<slug>.md 를 v3 실제 계약으로 재작성 (기존 코덱스 스펙의
   달성 불가 항목 제거, 실제 구현된 헤어컷/의상/후드/액세서리/판정샷 기준 기술).
2. 워크트리 브랜치에 커밋 (메시지: `feat(<slug1>,<slug2>): hood decorations v3`).
3. 보고: 브랜치명 + 슬러그별 최종 샷 경로 + 게이트 판정 + 남긴 이슈.

## 금지

- 자기 담당 파일 외 수정 금지: `src/model/animals/<자기 slug>.ts`, `docs/specs/<자기 slug>.md`만.
  hoodKit/registry/index/accessories/카탈로그/scripts 수정 금지 (문제 발견 시 보고만).
- vite build에 VITE_CACHE_DIR 누락 금지 (공유 node_modules 캐시 레이스).
- 지정 PORT/CDP_PORT 외 사용 금지.
