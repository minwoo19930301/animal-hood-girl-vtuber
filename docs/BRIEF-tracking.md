# BRIEF: 웹캠 트래킹 (src/tracking/**)

## 미션
MediaPipe Tasks(JS/WASM)로 웹캠에서 **머리 pitch/yaw/roll(변환행렬 분해)** + 표정(52 블렌드셰이프) +
**양손 21관절**을 뽑아 `RigFrame`으로 매핑한다. 사용자가 고개를 끄덕이면 밍고가 끄덕이고,
손을 들면 날개를 든다. 핵심 요구: **pitch(상하)가 확실히 잡혀야 한다** (이 프로젝트의 존재 이유 중 하나).

## 절대 규칙
- `src/tracking/` 안만 생성/수정. `contract.ts` 등 스캐폴드 수정 금지.
- 진입점: `src/tracking/index.ts`의 `createTracker(): Tracker` (계약: `src/contract.ts`).
- 새 npm 의존성 금지 (`@mediapipe/tasks-vision`은 설치돼 있음).
- 에셋은 로컬만: wasm `./wasm` (`FilesetResolver.forVisionTasks('./wasm')`),
  모델 `./models/face_landmarker.task`, `./models/hand_landmarker.task`. 네트워크 요청 금지.

## 구현 스펙
- **FaceLandmarker**: runningMode VIDEO, delegate GPU, `outputFacialTransformationMatrixes: true`,
  `outputFaceBlendshapes: true`, numFaces 1.
  - 4×4 변환행렬에서 회전 분해 → pitch/yaw/roll. **부호 계약**(contract.ts): +pitch=위, +yaw=캐릭터
    자기 왼쪽(=화면상 뷰어 오른쪽), +roll=캐릭터 왼쪽으로 기움. **거울 모드**: 사용자가 오른쪽을 보면
    화면 속 밍고도 화면상 같은 방향을 본다.
  - 블렌드셰이프 매핑: eyeBlinkLeft/Right→blink(거울: 사용자 왼눈=캐릭터 오른눈), jawOpen→mouthOpen,
    mouthSmileLeft/Right 평균→mouthSmile(+frown 페어로 음수), browInnerUp/browDown→brow,
    eyeLookIn/Out/Up/Down 4종→gaze.
- **HandLandmarker**: numHands 2, VIDEO 모드. 부하 절감 위해 얼굴과 교차 프레임(격프레임) 실행 허용.
  - 21 랜드마크 → WingPose intents (사람 손→새 날개 의도 번역):
    raise = 손목 높이(얼굴 기준 정규화), out = 몸 중심축에서 수평 거리,
    curl = 손끝-손바닥 평균 거리 역정규화, spread = 검지-약지 벌어짐 각,
    wave = 손목 x 속도 EMA 크기(0..1), present = handedness confidence 게이팅+히스테리시스.
  - 좌우는 **거울 매핑**: 사용자 오른손 → 캐릭터 왼날개(wingL).
- **필터링**: One Euro 필터를 `src/tracking/oneEuro.ts`에 순수 클래스로 구현(채널별 인스턴스).
  기본 minCutoff 1.0 / beta 0.007, 머리는 민감하게(beta ↑), 손 intents는 부드럽게(minCutoff ↓).
  손 소실 시 present를 ~0.4s에 걸쳐 0으로 감쇠(스냅 금지).
- **루프**: `video.requestVideoFrameCallback` 기반, mediapipe 타임스탬프 단조 증가 보장.
  `latest()`는 마지막 완성 프레임 반환(락 없는 더블버퍼). 얼굴 미검출 프레임은 tracked를 ~0.5s에
  걸쳐 0으로 감쇠.
- **에러 처리**: init 실패 시 명확한 throw(호출측이 idle 폴백). 콘솔에 원인 로그.
- 디버그: `window.__mingoTracking = { fps, lastBlendshapes, lastMatrix }` 노출(개발 콘솔 확인용).

## 검증
- 웹캠은 이 환경에서 실행 불가 — 대신: `npm run typecheck`(내 파일 기준) 통과,
  행렬 분해·intent 계산·OneEuro는 **순수 함수로 분리**(`src/tracking/math.ts`)하고 코드 리뷰 가능하게.
- 분해 부호는 주석으로 검증 근거 명시 (mediapipe 행렬은 column-major, 카메라 좌표계 주의).
- `src/tracking/README.md`에 매핑 테이블·튜닝 상수·알려진 한계 기록.
