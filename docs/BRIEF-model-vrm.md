# BRIEF v2: VRM 휴머노이드 모델 + 플라밍고 후드 (src/model/**)

## 미션
`src/model/`을 **VRM 로더 기반**으로 전면 재작성한다. 최종 캐릭터는
`refs/target-human.png` — **플라밍고 후드(키구루미)를 쓴 네이비 헤어 아니메 여성**.
지금은 개발용 대역 VRM(`public/models/placeholder.vrm`, VRoid 샘플 Sendagaya Shino)을 쓰고,
사용자가 나중에 자기 VRoid 모델로 교체한다. 따라서 **의상·머리 차이는 무시**하고
①파이프라인 품질 ②프로시저럴 플라밍고 후드 ③모션 무결성 에 집중한다.

## 절대 규칙
- `src/model/` 안만 수정 (기존 파일 전부 교체 가능). contract.ts/palette.ts/harness.ts 수정 금지.
- 의존성: `three`, `@pixiv/three-vrm`(설치됨)만. 새 설치 금지.
- 결정적: Math.random 금지. 스프링은 dt 기반.
- `createMingo(): MingoModel` 시그니처 유지 — **동기 반환 + `ready: Promise<void>`**로 비동기 로드
  (계약에 ready 필드 추가됨). 로드 전 apply()는 no-op. 로드 후 height/hitMeshes 갱신.

## 구현 스펙
### 1. VRM 로드
- GLTFLoader + VRMLoaderPlugin(three-vrm) 으로 `./models/placeholder.vrm` 로드
  (경로는 상수로 분리 — 사용자 모델 교체 지점 명시 주석).
- `VRMUtils.rotateVRM0()` 적용 (VRM0은 -Z 정면 → 계약은 +Z 정면).
- 로드 후: root에 add, height = 바운딩 실측, hitMeshes 채움(메시들).
- 매 프레임 `vrm.update(dt)` (스프링본·expression 반영).

### 2. 룩 (v1: MToon 튜닝 + 고정 조명; 커스텀 SDF는 다음 라운드)
- 씬 조명: 고정 DirectionalLight(TOON.lightDir) + 낮은 Ambient만. 절대 안 움직임.
- MToon 머티리얼 파라미터 순회 튜닝: shadeColorFactor를 어둡게가 아니라 hue-shift 방향으로,
  shadingShift/Toony로 셀 경계 크리스프하게, outline은 MToon 자체 아웃라인 활성/두께 조정.
- renderer.toneMapping 없음(NoToneMapping), sRGB 출력 확인.

### 3. 프로시저럴 플라밍고 후드 (이 라운드의 스타 — target-human.png 참조)
- head 본에 어태치, 머리 바운딩에서 스케일 자동 산출.
- 구성: 핑크 후드 셸(머리를 감싸는 두건形, 얼굴 개구부는 앞머리 안 가리게), 후드 위 플라밍고
  얼굴 — 흰자+검은 눈동자 눈 2개(속눈썹 3가닥, 노란 눈물점), **이마 위로 드리우는 큰 부리**
  (연핑크→끝 1/3 검정 딥), 후드 안감은 진핑크.
- 색은 target-human.png에서 샘플: 후드 겉 ~#f2799e 근사, 안감 ~#d94f6f, 부리 살몬핑크+black.
- 툰 머티리얼(간단 2톤) + 검보라 아웃라인(inverted hull).
- 2차 모션: 후드 부리·셸에 가벼운 스프링 — 고개 pitch/yaw를 지연 추종(출렁임). 과하지 않게.

### 4. apply() 리그 매핑 (계약 RigFrame → VRM)
- head: pitch/yaw/roll → neck 40% + head 60% 분배 (부호: +pitch=위 보기, three 좌표 주의).
- gaze → `vrm.lookAt` (있으면) + 실패 시 무시.
- blinkL/R → expressionManager 'blinkLeft'/'blinkRight' (없으면 'blink'에 max값).
- mouthOpen → 'aa'. mouthSmile>0 → 'happy'×0.6, <0 → 'sad'×0.4. fx.happy → 'happy' 1.0.
- brow: 'surprised'(browRaise>0)×0.3 시도, 없으면 skip.
- **팔 = WingPose intents (FK 포즈 블렌드, IK 금지)**:
  - present=0: 차렷 idle(자연스러운 팔 내림 — VRM T포즈이므로 upperArm z 내려서 A포즈化 필수)
  - raise → shoulder+upperArm 들기, out → 옆으로 벌리기, wave → upperArm z 사인 진동
  - **curl → 손가락 본 전체 말림** (VRM humanoid finger 본 15개/손: proximal/intermediate/distal
    × thumb/index/middle/ring/little — curl 하나로 전 관절 비례 회전, thumb은 축 다름 주의)
  - spread → 손가락 벌림(proximal y 미세)
- breath → chest 본 미세 scale/rotation + 어깨 들썩.
- fx.heart/sweat/anger → 프로시저럴 빌보드(하트 2개는 눈앞, 땀은 관자놀이, 분노는 이마) —
  head 본 어태치, 토글 visible.

### 5. 검증 루프 (스크린샷 필수, 최소 4라운드)
```bash
npm run shot -- harness.html shots/v2-front.png "bg=1"
npm run shot -- harness.html shots/v2-face.png "cam=face&bg=1"        # 후드 디테일 확인
npm run shot -- harness.html shots/v2-pitch.png "pitch=0.4&bg=1"      # 후드 출렁임 포함
npm run shot -- harness.html shots/v2-yaw.png "yaw=0.5&bg=1"
npm run shot -- harness.html shots/v2-blink-mouth.png "blink=1&mouth=0.8&bg=1"
npm run shot -- harness.html shots/v2-arms.png "wingRaiseL=1&wingOutL=0.6&wingCurlR=1&bg=1"  # 오른손 주먹!
npm run shot -- harness.html shots/v2-fx.png "heart=1&sweat=1&bg=1"
```
각 라운드 Read로 확인: T포즈 잔재 없나, 후드가 머리에 맞나, 부리가 얼굴 안 가리나,
팔 올릴 때 어깨 관통 없나, 주먹에서 손가락 다 말리나, 표정 적용되나.

## 완료 기준
- typecheck/전체 build 통과, 위 7샷 전부 정상
- `src/model/README.md` 갱신: VRM 교체 방법(파일 경로), 후드 구조, 팔 포즈 튜닝 상수
