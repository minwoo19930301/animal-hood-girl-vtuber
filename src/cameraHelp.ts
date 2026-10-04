import type { Os } from './platform'

/** 카메라가 막힌 때의 상태 줄 문구 (기본 — 맥·브라우저·그 밖의 오류) */
export const CAMERA_FAILED_STATUS = '카메라 연결 실패 · 자동 모션으로 동작 중'

// Windows에는 앱별 권한 창이 없고 "설정 > 개인 정보 및 보안 > 카메라"의 전역 스위치만 있다.
// 꺼져 있으면 getUserMedia가 NotAllowedError, 다른 앱이 쓰는 중이거나 드라이버가 막으면 NotReadableError로 실패한다.
const WIN_BLOCKED =
  '카메라를 쓸 수 없어요 · 설정 > 개인 정보 및 보안 > 카메라에서 "데스크톱 앱이 카메라에 액세스하도록 허용"을 켜거나, 다른 앱이 카메라를 쓰는 중인지 확인하세요 · 자동 모션으로 동작 중'
const WIN_MISSING = '카메라를 찾을 수 없어요 · 카메라가 연결돼 있는지 확인하세요 · 자동 모션으로 동작 중'

/**
 * 카메라 시작이 실패했을 때 상태 줄에 보여 줄 문구.
 * Windows 데스크톱 앱(Electron)에서만 원인별 안내를 준다 — 브라우저의 거부는 브라우저 권한이고,
 * 맥은 시작할 때 TCC 안내 창(electron/main.mjs)이 따로 있어 기존 문구 그대로다.
 */
export function cameraErrorStatus(os: Os, desktopApp: boolean, error: unknown): string {
  if (os !== 'win' || !desktopApp) return CAMERA_FAILED_STATUS
  const name = (error as { name?: unknown } | null | undefined)?.name
  if (name === 'NotAllowedError' || name === 'NotReadableError') return WIN_BLOCKED
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return WIN_MISSING
  return CAMERA_FAILED_STATUS
}
