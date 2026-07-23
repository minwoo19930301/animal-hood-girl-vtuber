# BRIEF v3: 전신 골격 트래킹 (계약 v2 — ArmPose/BodyPose)

## 미션 (사용자 요구 원문 기반)
"손만 트래킹하던데 → 팔·다리·어깨 등 **골격 위주** 트래킹. 팔을 옆으로만 말고 **앞으로** 들기,
**팔꿈치·손목 굽힘**, 손가락 전체 말기 말고 **각 손가락 개별** 움직임, 손도 **입체적으로**
(손바닥이 앞/옆/밑을 향하게) 움직이게."

contract.ts v2가 이미 반영됨: `ArmPose`(upperDir/lowerDir/palmNormal/handDir 방향벡터 +
fingers[5] 개별), `BodyPose`(shrug/lean/twist/hipShift/knee), `neutralArm/neutralBody`.
**설계 원칙: 트래킹은 캐릭터 공간의 기하학적 사실(방향벡터)을 출력하고, 모델이 자기 rest pose
기준 FK 솔브로 본 회전을 계산한다.** "raise/out 의도" 방식은 폐기.

## 좌표 규약 (전 모듈 공통 — 계약 주석과 동일)
캐릭터 공간: x=캐릭터 왼쪽+, y=위+, z=앞(카메라 방향)+. 거울 매핑: 사용자 오른팔→캐릭터 왼팔,
사용자가 화면상 왼쪽으로 팔 뻗으면 캐릭터도 화면상 왼쪽으로(= 캐릭터 공간 +x). 모든 Dir3 정규화.

## 트래킹 (src/tracking/**)
1. **Pose Landmarker 추가**: `./models/pose_landmarker.task` (다운로드됨, full), VIDEO 모드,
   GPU delegate, numPoses 1, **worldLandmarks**(미터 단위 3D) 사용 — 화면좌표 아님.
   33점 중 사용: 어깨(11,12) 팔꿈치(13,14) 손목(15,16) 엉덩이(23,24) 무릎(25,26) 발목(27,28).
2. **케이던스**: 얼굴 매 프레임, 손/포즈는 교차(격프레임) 허용. 타임스탬프 단조 증가 유지.
3. **팔 방향 계산**: 캐릭터 공간 기저 = 어깨라인(12→11)을 x축, 월드 위(-y_mp)를 y축 근사로
   그람-슈미트 직교화(몸통 기울어도 안정). upperDir=(어깨→팔꿈치), lowerDir=(팔꿈치→손목)를
   이 기저로 변환+정규화+거울 매핑.
4. **손 3D 자세**: Hand Landmarker의 worldLandmarks로 손바닥 기저 구성:
   handDir=(0 손목→9 중지MCP), palmRef=(5 검지MCP→17 새끼MCP), palmNormal=handDir×palmRef
   (왼/오른손 외적 순서 주의 — 법선이 손바닥 쪽을 향하게 부호 통일). 캐릭터 공간 변환+거울.
   손목 위치는 pose(15/16)와 hand(0)가 다를 수 있음 — 팔 체인은 pose 기준, 손 자세는 hand 기준.
5. **손가락 개별 curl**: 각 손가락 관절 각도 합산 — 예: 검지 curl = angle(5→6,6→7)+angle(6→7,7→8)
   정규화. 엄지는 (1→2,2→3)+(2→3,3→4). 5개 각각 0..1. spread = 검지MCP~새끼MCP 부채각 정규화.
6. **BodyPose**: shrug=어깨y-귀y 거리 변화 정규화(기준선 EMA 캘리브레이션), lean.x=어깨라인 기울기,
   lean.z=어깨중심 vs 엉덩이중심 z차, twist=어깨라인 vs 엉덩이라인 y회전차, hipShift=엉덩이중심
   x 편차, 다리: visibility(25,26)>0.5 일 때 legsPresent, knee=angle(엉덩이→무릎, 무릎→발목).
7. **필터**: 방향벡터는 성분별 One Euro 후 재정규화. fingers는 살짝 느리게. present는
   visibility 기반 히스테리시스 + 0.4s 감쇠.
8. `latest()` 반환 프레임에 armL/armR/body 채움. 얼굴만 잡히고 포즈 실패 시 arm.present=0.

## 모델 (src/model/**)
1. **FK 솔버** (`src/model/armSolver.ts` 신규 권장): 캐릭터 공간 목표 방향 → VRM 본 로컬 회전.
   - VRM 휴머노이드 rest pose에서 각 본의 "기본 방향"(예: VRM0 T포즈 상완=±x)을 로드 시 1회 계산.
   - upperArm: setFromUnitVectors(restDir→upperDir(부모 공간 변환)) + 팔꿈치 힌지축 정렬을 위한
     스윙-트위스트 분해로 롤 안정화 (팔을 앞으로 들어도 겨드랑이 뒤틀림 없게).
   - lowerArm: 팔꿈치는 힌지 — upperDir/lowerDir 사이 각으로 굽힘, 힌지축은 두 벡터 외적.
   - hand(손목): palmNormal+handDir 기저 → 손목 본 회전 (전완 기준 상대). 클램프: 손목 굽힘
     ±80°, 비틀림 ±90° (인체 한계로 지오메트리 파손 방지).
   - 매 프레임 할당 금지 — 쿼터니언/벡터 스크래치 재사용.
2. **손가락**: fingers[5] 각각 → 해당 손가락 본 체인(proximal/intermediate/distal 비례 회전,
   엄지 축 별도). spread → proximal 벌림. 기존 단일 curl 코드 대체.
3. **BodyPose 적용**: shrug→shoulder 본 y올림 소량, lean/twist→spine/chest 분배, hipShift→hips
   x이동+미세 roll, knee→legs (legsPresent 게이팅, 발바닥 접지 유지 — 루트 y 보정).
4. present 크로스페이드: 팔별로 idle(neutralArm)↔트래킹 부드럽게 (스냅 금지).
5. 후드/드로스트링/손목밴드 어태치 유지 — 손목밴드는 손목 본을 따라 회전.

## 생명감 (src/aliveness/**)
- idle 팔 생성을 ArmPose 방향벡터로 재작성 (neutralArm 기반 + 호흡 미세 sway + 가끔 스트레치).
- 랜덤 idle 모션에 "팔 앞으로 뻗어 기지개" 1종 추가 (새 능력 과시).
- 트래킹 융합 로직은 채널만 갱신 (arm 방향벡터는 성분 lerp 후 재정규화).

## 하네스 (src/harness.ts — 통합 담당이 수정 가능)
새 파라미터: armL/armR 프리셋 `?armL=fwd|side|up|down` (+ `elbowL=0..1` 굽힘 오버라이드),
`palmL=front|down|in`, 손가락 `fingersL=1,0,0,0,1` (콤마 5값), `shrug=`, `lean=`, `twist=`,
`knee=`. 프리셋→ArmPose 변환은 contract의 neutralArm 변형으로 구현.

## 검증 (판정관 필수 샷)
```
armL=fwd (팔 앞으로 나란히 — 카메라 쪽, 원근으로 짧아 보여야 정상)
armL=side&elbowL=0.9 (T자로 들고 팔꿈치 직각 접기)
armL=up (만세)
palmL=front / palmL=down (손바닥 방향 변화가 손 메시 회전으로 보임)
fingersL=1,0,1,1,1 (검지만 펴기 = 포인팅 — 계약 순서 [엄지,검지,중지,약지,새끼], 0=펴짐)
fingersL=1,0,1,1,0 (개별 손가락 조합)
shrug=1 / lean=0.15 / twist=0.2 / knee=0.5&legsPresent
```
합격: 팔 앞으로 들 때 어깨 뒤틀림·메시 파손 없음, 손가락 5개 독립 동작, 손바닥 방향 3종 구분
가능, 팔꿈치 힌지 자연스러움, 다리 굽힘 시 발 접지.
