import type { Os } from './platform'

/** keydown 이벤트에서 수식키 상태만 본 최소 모양 (테스트에서 객체 리터럴로 넘긴다) */
export interface Mods {
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/**
 * 캐릭터 전환 수식키: 맥은 ⌘, 그 밖(Windows·Linux)은 Ctrl.
 * 메뉴 accelerator(`CommandOrControl+키`, electron/keys.mjs)와 같은 키다.
 */
export function hasAvatarModifier(os: Os, e: Mods): boolean {
  return os === 'mac' ? e.metaKey : e.ctrlKey
}

/**
 * 전환 수식키 말고 다른 수식키가 같이 눌렸는지 — 그 조합은 이 핸들러의 몫이 아니다.
 * 맥의 ⌘⇧… 는 메뉴(아바타 크기 등), Windows의 Ctrl+Alt+숫자는 전역 리액션 단축키이고
 * 일부 자판(AltGr = Ctrl+Alt)은 글자를 만드는 키라 캐릭터 전환으로 읽으면 안 된다.
 */
export function hasExtraModifier(os: Os, e: Mods): boolean {
  return os === 'mac' ? e.ctrlKey || e.altKey || e.shiftKey : e.metaKey || e.altKey || e.shiftKey
}
