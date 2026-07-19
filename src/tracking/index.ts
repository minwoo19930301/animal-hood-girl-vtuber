/**
 * STUB — 트래킹 에이전트가 교체할 파일.
 * 계약: createTracker(): Tracker  (src/contract.ts 참조)
 * 지금은 항상 tracked=0 (idle 모드 유지).
 */
import type { Tracker, RigFrame } from '../contract'
import { neutralFrame } from '../contract'

export function createTracker(): Tracker {
  const frame: RigFrame = neutralFrame()
  return {
    async start(_video: HTMLVideoElement) {
      // mediapipe FaceLandmarker + HandLandmarker 초기화 예정
    },
    stop() {},
    latest() {
      return frame
    },
  }
}
