# BRIEF: 생명감 레이어 (src/aliveness/**)

## 미션
트래킹이 있든 없든 밍고가 **항상 살아 있게** 만든다. 데스크톱 마스코트는 하루 종일 화면에 떠
있으므로, 미트래킹 idle이 사실상 기본 상태다. 리서치 결론: "트래킹은 레이어일 뿐, 생명감 스택이
본체" (Desktop Mate/봉고캣 교훈).

## 절대 규칙
- `src/aliveness/` 안만 생성/수정. 진입점: `createAliveness(): Aliveness` (계약: `src/contract.ts`).
- 새 npm 의존성 금지. `Math.random()` 직접 사용 금지 — **시드 고정 RNG**(mulberry32 등 자체 구현)로
  결정적 동작 보장(t 시퀀스가 같으면 결과 동일).

## 구현 스펙
### idle 스택 (tracked≈0)
- **호흡**: 3.6s 주기 사인 → `breath` (이미 스텁에 있음, 유지).
- **깜빡임**: 평균 2~6s 랜덤 간격, 10%는 더블 블링크, 닫힘 80ms/열림 180ms 비대칭 커브.
- **무게중심 sway**: 아주 느린 리사주(주기 7s/11s) → head.roll ±0.03, head.yaw ±0.04, 몸 흔들림은
  head에만(모델이 목 체인에 분배).
- **시선**: 커서 팔로우(CursorInfo nx/ny → gaze, 지연 스프링 ~0.15s) + 마이크로 사카드(0.5~2s마다
  ±0.05 점프) + 가끔(8~20s) 커서 무시하고 다른 곳 한눈팔기 1~2s.
- **랜덤 idle 모션**: 20~60s마다 하나 — 고개 갸웃(roll 0.25, 1.2s), 목 스트레치(pitch 0.3→-0.1),
  날개 들썩(raise 0.3, 0.6s), 행복눈 ∪∪ 1s(fx.happy). 이징 부드럽게, 동시 발동 금지.
### 트래킹 융합 (tracked>0)
- 채널별 크로스페이드: 트래킹 획득 attack 0.25s / 소실 release 1.2s (스냅 금지).
- 트래킹 중에도 breath는 항상 레이어. 깜빡임은 트래킹값 존중하되 0.7 초과 시 1.0으로 스냅
  가속(자연스러운 완전 감김).
- **미소 반응**: mouthSmile > 0.7이 0.3s 지속되면 fx.happy 발동(지속 중 유지 + 0.5s 릴리즈).
- 트래킹 소실 → idle 복귀 시 현재 포즈에서 idle 포즈로 1.2s 부드럽게 귀환.
### 구조
- 내부 상태 머신(IDLE / TRACKED / RETURNING)과 채널별 스프링/이징 유틸을 별도 파일로 분리.
- `compose()`는 입력 raw를 변형하지 말고 새 프레임 반환(structuredClone 대신 명시적 복사 —
  60fps에서 structuredClone은 GC 압박).

## 검증
- `npm run typecheck`(내 파일 기준) 통과.
- 결정성 자가 검증: 동일 (dt,t) 시퀀스 2회 재생 → 동일 출력 (간단한 콘솔 assert 스크립트를
  주석/README에 남기기).
- `src/aliveness/README.md`에 상태 머신 다이어그램(텍스트)·타이밍 상수표 기록.
