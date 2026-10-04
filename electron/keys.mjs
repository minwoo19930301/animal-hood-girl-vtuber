// 단축키 규약 — electron/main.mjs 와 scripts/test-reactions.mjs 가 같이 쓴다 (Electron 없이도 import 가능한 순수 모듈).
//
//  - 캐릭터 전환: ⌘+카탈로그 키 (1..9, 0, -, =, `, [)  — 메뉴 바 accelerator (창이 앱 포커스일 때) + 렌더러 keydown
//  - 리액션 재생: 창 포커스면 숫자 1..9, 0 (렌더러 keydown), 다른 앱이 포커스여도 전역 Ctrl+Option+숫자
//  - 리액션 취소: Esc (렌더러) / 전역 Ctrl+Option+Esc

/** 캐릭터 메뉴 accelerator: 카탈로그 키 그대로 + ⌘ */
export function avatarAccelerator(key) {
  return `Cmd+${key}`
}

/** 리액션 전역 단축키 (Electron accelerator 문법: Alt = macOS Option) */
export function reactionAccelerator(reaction) {
  return `Ctrl+Alt+${reaction.key}`
}

/** 리액션 전역 취소 단축키 — 0 이 리액션이라 숫자를 쓰지 않는다 */
export const REACTION_CANCEL_ACCELERATOR = 'Ctrl+Alt+Escape'

/** 렌더러로 보내는 명령 문자열 (src/main.ts handleCommand 와 같은 규약) */
export function reactionCommand(reaction) {
  return `reaction-${reaction.id}`
}
export const REACTION_CANCEL_COMMAND = 'reaction-cancel'
