import type { Tracker } from './contract'

export type CameraState = 'off' | 'starting' | 'tracking' | 'error'

/** Own every stream and tracker for one attempt, including late async results. */
export function createCameraSession(options: {
  video: HTMLVideoElement
  createTracker: () => Tracker
  getUserMedia: () => Promise<MediaStream>
  onState: (state: CameraState, error?: unknown) => void
}) {
  let wanted = false
  let generation = 0
  let pending = false
  let active: { stream: MediaStream | null; tracker: Tracker } | null = null
  let state: CameraState = 'off'

  function publish(next: CameraState, error?: unknown) {
    state = next
    options.onState(next, error)
  }

  function release(attempt: NonNullable<typeof active>) {
    try { attempt.tracker.stop() } catch (error) {
      // Camera ownership must not depend on a third-party detector's cleanup.
      console.warn('[mingo] tracker shutdown failed', error)
    }
    attempt.stream?.getTracks().forEach((track) => track.stop())
    if (options.video.srcObject === attempt.stream && attempt.stream) {
      options.video.pause()
      options.video.srcObject = null
    }
    attempt.stream = null
    if (active === attempt) active = null
  }

  async function start() {
    if (pending || !wanted || state === 'tracking') return
    pending = true
    const epoch = generation
    const attempt = { stream: null as MediaStream | null, tracker: options.createTracker() }
    active = attempt
    let connected = false
    const current = () => wanted && epoch === generation
    publish('starting')
    try {
      attempt.stream = await options.getUserMedia()
      if (!current()) return
      options.video.srcObject = attempt.stream
      await options.video.play()
      if (!current()) return
      await attempt.tracker.start(options.video)
      if (!current()) return
      for (const track of attempt.stream.getVideoTracks()) {
        track.addEventListener('ended', () => {
          if (active !== attempt || !current()) return
          release(attempt)
          publish('error', new Error('카메라 연결이 끊어졌어요. 다시 연결해 주세요.'))
        }, { once: true })
      }
      publish('tracking')
      connected = true
    } catch (error) {
      if (current()) publish('error', error)
    } finally {
      if (!current() || !connected) release(attempt)
      pending = false
      // A hide/show during initialization must restart once the old attempt drains.
      if (wanted && epoch !== generation) void start()
    }
  }

  return {
    setActive(enabled: boolean) {
      wanted = enabled
      generation++
      if (active) release(active)
      publish('off')
      if (enabled) void start()
    },
    latest() { return state === 'tracking' ? active?.tracker.latest() ?? null : null },
  }
}
