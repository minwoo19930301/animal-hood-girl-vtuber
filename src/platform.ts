/** 실행 OS 감지 — Electron은 preload가 준 process.platform, 브라우저(npm run dev를 브라우저로 열 때)는 navigator에서 읽는다 */
export type Os = 'mac' | 'win' | 'other'

interface NavigatorWithUAData extends Navigator {
  userAgentData?: { platform?: string }
}

/** 문자열 하나(process.platform 또는 navigator 플랫폼)를 Os로 — 순수 함수라 Node 테스트에서도 쓴다 */
export function osFromPlatform(raw: string | undefined | null): Os {
  const p = (raw ?? '').toLowerCase()
  if (p === 'darwin' || p.includes('mac')) return 'mac' // 'darwin'에도 'win'이 들어 있어 맥을 먼저 거른다
  if (p === 'win32' || p.includes('win')) return 'win'
  return 'other'
}

export function detectOs(): Os {
  if (typeof window === 'undefined') return 'other' // 브라우저 밖(Node 테스트)에서 import돼도 터지지 않게
  const electron = window.mingo?.platform
  if (electron) return osFromPlatform(electron)
  const nav = navigator as NavigatorWithUAData
  return osFromPlatform(nav.userAgentData?.platform ?? navigator.platform)
}

export const os: Os = detectOs()

/** 캐릭터 전환 수식키 표기 — 맥은 ⌘, 그 밖은 Ctrl+ (키 라벨 앞에 붙인다: `${modLabel(os)}1`) */
export function modLabel(forOs: Os): string {
  return forOs === 'mac' ? '⌘' : 'Ctrl+'
}
