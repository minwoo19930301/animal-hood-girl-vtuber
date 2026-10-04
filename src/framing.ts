/**
 * 카메라 프레이밍 — main.ts 와 하네스가 같은 식을 쓴다 (스크린샷이 실제 앱 구도와 일치하도록).
 *
 * 전신 + 동물 후드/귀 여유. zoom↑ = 더 작게. pull 은 리액션이 카메라를 뒤로 빼는 정도(0..0.25):
 * 만세·점프가 창 밖으로 잘리지 않게 엔벨로프만큼 멀어지고, 점프 공간을 위해 시선을 살짝 올린다.
 */
export interface Framing {
  /** 화면 세로로 담을 월드 높이 */
  fitH: number
  /** 카메라가 바라보는 월드 y */
  lookY: number
}

export function framing(bodyH: number, zoom = 1, pull = 0): Framing {
  const h = Math.max(0.5, bodyH)
  return {
    fitH: h * 1.35 * zoom * (1 + pull),
    lookY: h * (0.52 + 0.35 * pull),
  }
}
