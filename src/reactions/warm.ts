/**
 * 셰이더 프리워밍 — 리액션 FX 스프라이트와 볼 홍조는 처음 눈에 보이는 프레임에 셰이더 프로그램이 컴파일된다
 * (three.js 는 프로그램을 렌더 때 지연 생성한다). 처음 누른 키의 등장 한가운데서 그 컴파일이 돌면 프레임이 뚝 끊긴다.
 *
 * 그래서 시작할 때 한 번, 숨어 있는 객체까지 보이게 한 채로 컴파일을 걸고 (같은 틱에 바로 다시 숨긴다 — 화면엔 한 프레임도 안 그린다)
 * 컴파일이 끝나기를 기다린다. 한 번만 드는 비용이고 평소(idle) 경로는 건드리지 않는다.
 */
import type * as THREE from 'three'

/** 컴파일에 필요한 렌더러 일부 (테스트에서 가짜로 바꿔 끼우기 쉽게) */
export interface CompileTarget {
  compileAsync(scene: THREE.Object3D, camera: THREE.Camera): Promise<unknown>
}

/**
 * scene 안의 모든 재질 프로그램(숨은 FX·홍조 포함)을 미리 컴파일한다. 끝나면 resolve.
 * three 가 숨은 객체를 건너뛰는 버전이어도 되도록 컴파일을 거는 동안만 잠깐 전부 보이게 하고, 걸자마자(같은 틱) 되돌린다.
 */
export function prewarmShaders(renderer: CompileTarget, scene: THREE.Object3D, camera: THREE.Camera): Promise<void> {
  const hidden: THREE.Object3D[] = []
  scene.traverse((o) => {
    if (!o.visible) {
      o.visible = true
      hidden.push(o)
    }
  })
  let pending: Promise<unknown>
  try {
    pending = renderer.compileAsync(scene, camera)
  } finally {
    for (let i = 0; i < hidden.length; i++) hidden[i].visible = false
  }
  return pending.then(() => undefined)
}
