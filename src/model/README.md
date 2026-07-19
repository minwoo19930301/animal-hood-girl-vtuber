# src/model — Mingo 3D 프로시저럴 모델

`createMingo(): MingoModel` (계약: `src/contract.ts`). 텍스처/외부 에셋 없음 — 전부
three.js 프로시저럴 지오메트리 + 커스텀 셰이더. `Math.random()` 없음(결정적).

## 파일

| 파일 | 역할 |
|---|---|
| `index.ts` | 조립 + 리깅 `apply(frame, dt, t)` + 2차 모션 스프링 배선 |
| `head.ts` | 머리·눈·부리·크레스트·새우핀·블러시·FX (`buildHead`, `EYE` 상수) |
| `body.ts` | 몸통·fluff·스카프·목 체인·날개·다리·꼬리 (`buildBody`, `NECK_SEG`) |
| `materials.ts` | 툰 ShaderMaterial(hue-shift 2단 램프 + 셀 스텝 림)·홍채 그라데이션·inverted-hull 아웃라인 |
| `geo.ts` | egg/featherLobe(라운드 로브)/teardrop/taperedTube/ellipseArcTube/heart/star4 + mergeShapes(정적 형제 병합) |
| `springs.ts` | 감쇠 조화진동 `Spring` + 지연 팔로워 `Follower` |

## 셰이딩

- `toonMat(base, shade)`: 씬 라이트 무시, `TOON.lightDir` 고정 유니폼을 뷰스페이스로 변환해
  `smoothstep(shadeEdge±shadeWidth, N·L)` 2단 램프. 그림자는 hue-shift 페어(`PALETTE`).
  림라이트는 연속 pow가 아니라 실루엣 근처 **셀 스텝 밴드**(smoothstep 0.62~0.68) —
  연속 림은 목/머리에 에어브러시 그라데이션을 만들어 금지. **주의**: 커스텀 셰이더는 끝에
  `#include <colorspace_fragment>` 필수 (빠지면 sRGB 변환이 안 돼 과채도로 렌더됨).
- 아웃라인: `addOutline(mesh, width, color)` — BackSide 노멀 확장 헐. width는 월드 단위,
  mesh.scale 평균으로 나눠 보정하므로 **scale 설정 후** 호출할 것.
  몸/얼굴 = `PALETTE.outline`, 눈·부리 = `PALETTE.nightPurple`.

## 본 트리 (원점 = 발밑, 정면 +z, 캐릭터-왼쪽 = +x = 뷰어 오른쪽)

```
root
└─ body.group
   ├─ torso(0,0.35,0) + belly patch + fluff(0,0.478, 병합1메시) + scarf band/bow/tail + tail(병합)
   ├─ hipL/R(±0.056,0.212) → knee(뒤로 0.22rad, 무릎캡) → ankle → 발+발가락 스캘럽(병합)
   ├─ shoulderL/R(±0.114,0.450,0.05, 어깨캡) → upper capsule → elbow(팔꿈치캡) → paddle
   │  + featherLobe 손가락 pivot×3 (길게, 라운드 팁)
   └─ neck1(0,0.495) → neck2 → neck3 (NECK_SEG=0.058 간격, 오버랩 캡슐)
      └─ headSocket → head.group (scale 1.09 초대두 보정; 원점 = 목 꼭대기 y≈0.669)
         ├─ 머리 egg(rx.172 ry.16 rz.155, 위 넓음) + 볼 스캘럽(6개 병합)
         ├─ eyeL/R(±0.080, 0.159, 0.128): lens→iris(납작 전방 돔, gaze)→lid(블링크 셸)
         │  →lashPivot(병합)→lowerLash→closedEye(∪+플릭, blink>0.82 스왑)
         ├─ brows(블링크 시 리프트), beak(마스터 스파인 분할: 살몬+딥팁 일체), blush,
         │  crestFront(3락 병합), crestBack(라운드 로브 4장 병합), 새우핀(1.5x)
         └─ FX: sweat(관자놀이 110px급) / anger(병합) / (눈 안: heart, happy)
```

## apply() 규약

- **목 체인**: pitch 분배 `PITCH_SHARE=[0.22,0.33,0.45]`(rotation.x=-pitch·share),
  yaw `[0.20,0.28,0.27]`+머리 0.25, roll은 머리 0.85. idle S커브 `S_BASE=[0.16,-0.11,-0.07]` —
  pitch<0이면 S 증폭+본 길이 24% 수축(목 접기), pitch>0이면 S 완화+24% 신장.
- **블링크**: lid.rotation.x lerp(-0.9→1.32) + lid 메시 y/z 스케일 보간(셔터처럼 앞을 덮음),
  lashPivot 스윕 1.75rad + 0.26 수축. blink>0.82에서 굵은 ∪커브(closedEye)로 스왑하고
  홍채(전방 돔이라 하이라이트가 뚫고 나옴)를 숨김 + 눈썹 리프트. happy FX는 블링크 강제 1 + ∪아크.
- **gaze**: iris 그룹 이동, 클램프 `EYE.maxGX/maxGY` (렌즈 밖 금지). 홍채는 렌즈에 파묻는
  타원체가 아니라 **렌즈 앞면에 얹은 납작 돔** — 보이는 원 = 실루엣 전체라 카메라/머리 각도에
  따라 줄거나 밀리지 않고, gaze 0,0 = 정중앙 응시가 보장됨.
- **날개**: `WingPose.present`로 idle(몸 앞 얌전히) ↔ intent 포즈(raise/out/curl/spread) 블렌드,
  wave는 t 기반 어깨+팔꿈치 사인 진동 (진폭만 intent, 위상은 t → 결정적).
- **호흡**: `sin(breath·2π)` — fluff 스케일 ±3%, torso y ±0.8%, 머리 y ±0.003.
- **2차 모션**: `Follower`(스프링이 헤드 포즈를 지연 추종, deflect=spring-current)를
  crestFront/crestBack/scarfTail/tail 회전에 게인 적용. dt는 1/240 고정 서브스텝 → 결정적.

## 튜닝 포인트

- 눈 크기/위치: `EYE` 상수 + `makeEye()`의 g.position. 홍채 = irisR(0.052) 납작 돔
  (scale z 0.0165, z=0.020 전방 마운트) — 보이는 원 = irisR 그대로.
- 눈꺼풀 셸 커버리지: `applyEye()`의 lidMesh.scale 보간값 (closed z-스트레치 ry*1.08).
- 크레스트 실루엣: `makeCrests()`의 frontSpec(teardrop)/backSpec(featherLobe, 라운드 필수).
- 부리 곡률: `makeBeak()`의 spine/spineR — 살몬(u 0..0.70)과 딥 팁(u 0.64..1 + 0.0009 시스)이
  같은 마스터 커브를 분할 샘플하므로 스파인만 만지면 둘 다 따라옴 (팁 분리 재발 방지).
- 날개 idle 포즈: `index.ts IDLE_WING` (shX -0.55 = 앞으로 스윙해 배 위에 얹는 각).
- FX 위치: sweat(+x 관자놀이 0.152,0.172)·anger(-x 관자, z는 머리 표면 밖 0.122 필요).
- 초대두 비율: `index.ts HEAD_SCALE`(1.09) + `height`(1.12) 동기 유지.

## 드로우콜

아웃라인 inverted-hull이 파트당 콜을 2배로 만들므로 정적 형제는 `mergeShapes`로 병합:
볼 스캘럽 6, fluff 칼라+범프 8, 래시(아크+캡+플릭) 6×2, happy/closed 아크, 크레스트 앞3/뒤4,
꼬리 3, 스카프 테일 2, 블러시 스트로크 3×2, 발+발가락 4×2, 앵거 세그 4, 새우핀 팬 2.
가동 파트(본 단위)는 병합 금지. 병합 전 ~175 → 병합 후 ~120 가시 메시.

## 알려진 한계

- 목 캡슐 3개 오버랩 방식이라 큰 pitch에서 관절 실루엣이 미세하게 울퉁불퉁.
- 아웃라인 헐이 파트 오버랩 지점(무릎·목·관절 캡)에서 얇은 링으로 보일 수 있음.
- mouthSmile은 부리 전체 미세 회전 + 블러시 스케일로만 근사 (2D의 입꼬리 변형 없음).
- 하네스 face 카메라 기준 크레스트 상단이 프레임에 거의 닿음 (height=1.12로 보정됨).
