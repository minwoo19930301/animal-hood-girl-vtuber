import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { createCameraSession } from '../src/camera.ts'
import { hasAvatarModifier, hasExtraModifier } from '../src/keys.ts'
import { modLabel, osFromPlatform } from '../src/platform.ts'
import { isCameraRequest, isTrustedAppUrl } from '../electron/policy.mjs'

const flush = () => new Promise((resolve) => setImmediate(resolve))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fixture({ media, play, start } = {}) {
  const states = [], trackers = [], tracks = []
  const video = { srcObject: null, play: play ?? (async () => {}), pause() {} }
  const newStream = () => {
    const track = { stops: 0, stop() { this.stops++ }, addEventListener(_name, cb) { this.ended = cb } }
    tracks.push(track)
    return { getTracks: () => [track], getVideoTracks: () => [track] }
  }
  const session = createCameraSession({
    video,
    getUserMedia: media ?? (async () => newStream()),
    createTracker: () => {
      const tracker = { stops: 0, starts: 0, async start() { this.starts++; await start?.() }, stop() { this.stops++ }, latest: () => ({ tracked: 1 }) }
      trackers.push(tracker)
      return tracker
    },
    onState: (state) => states.push(state),
  })
  return { session, video, tracks, trackers, states, newStream }
}

test('successful camera, manual stop and restart release the previous stream', async () => {
  const f = fixture()
  f.session.setActive(true)
  await flush()
  assert.equal(f.states.at(-1), 'tracking')
  assert.equal(f.session.latest().tracked, 1)
  f.session.setActive(false)
  assert.equal(f.tracks[0].stops, 1)
  assert.equal(f.video.srcObject, null)
  assert.equal(f.session.latest(), null)
  f.session.setActive(true)
  await flush()
  assert.equal(f.states.at(-1), 'tracking')
  assert.equal(f.trackers.length, 2)
  f.session.setActive(false)
})

for (const failure of ['play', 'start']) {
  test(`${failure} failure turns off the camera and allows retry`, async () => {
    let fail = true
    const f = fixture({ [failure]: async () => { if (fail) throw new Error('simulated failure') } })
    f.session.setActive(true)
    await flush()
    assert.equal(f.states.at(-1), 'error')
    assert.equal(f.tracks[0].stops, 1)
    assert.equal(f.video.srcObject, null)
    assert.equal(f.session.latest(), null)
    fail = false
    f.session.setActive(true)
    await flush()
    assert.equal(f.states.at(-1), 'tracking')
    f.session.setActive(false)
  })
}

test('permission rejection stays idle without a retry loop', async () => {
  let requests = 0
  const f = fixture({ media: async () => { requests++; throw new Error('denied') } })
  f.session.setActive(true)
  await flush()
  await flush()
  assert.equal(f.states.at(-1), 'error')
  assert.equal(requests, 1)
  assert.equal(f.video.srcObject, null)
})

test('late permission approval after hide closes the returned stream', async () => {
  const pending = deferred()
  const f = fixture({ media: () => pending.promise })
  f.session.setActive(true)
  f.session.setActive(false)
  pending.resolve(f.newStream())
  await flush()
  assert.equal(f.states.at(-1), 'off')
  assert.equal(f.tracks[0].stops, 1)
  assert.equal(f.trackers[0].starts, 0)
})

test('hide/show while tracking initializes drains the old attempt and restarts', async () => {
  const pending = deferred()
  let calls = 0
  const f = fixture({ start: () => ++calls === 1 ? pending.promise : Promise.resolve() })
  f.session.setActive(true)
  await flush()
  f.session.setActive(false)
  f.session.setActive(true)
  assert.equal(f.tracks[0].stops, 1)
  pending.resolve()
  await flush()
  assert.equal(f.states.at(-1), 'tracking')
  assert.equal(f.trackers.length, 2)
  assert.equal(f.tracks[0].stops, 1)
  assert.equal(f.tracks[1].stops, 0)
  f.session.setActive(false)
})

test('disconnect releases camera and tracker and exposes retry state', async () => {
  const f = fixture()
  f.session.setActive(true)
  await flush()
  f.tracks[0].ended()
  assert.equal(f.states.at(-1), 'error')
  assert.equal(f.video.srcObject, null)
  assert.equal(f.session.latest(), null)
})

test('detector cleanup failure cannot keep a camera stream alive', async (t) => {
  const f = fixture()
  f.session.setActive(true)
  await flush()
  t.mock.method(console, 'warn', () => {})
  f.trackers[0].stop = () => { throw new Error('detector already closed') }
  f.session.setActive(false)
  assert.equal(f.tracks[0].stops, 1)
  assert.equal(f.video.srcObject, null)
  assert.equal(f.states.at(-1), 'off')
})

test('only the actual app document is trusted, with avatar query changes allowed', () => {
  for (const appUrl of ['file:///app/dist/index.html', 'http://localhost:5183/index.html']) {
    assert.ok(isTrustedAppUrl(appUrl + '?avatar=fox', appUrl))
    for (const url of ['https://evil.example/index.html', 'file:///tmp/index.html', 'http://localhost:5183/other.html', 'javascript:alert(1)', 'bad url']) {
      assert.equal(isTrustedAppUrl(url, appUrl), false, url)
    }
  }
})

test('media policy rejects microphones, mixed requests and missing media types', () => {
  assert.equal(isCameraRequest('media', ['video']), true)
  for (const types of [undefined, [], ['audio'], ['audio', 'video'], ['unknown']]) {
    assert.equal(isCameraRequest('media', types), false)
  }
  assert.equal(isCameraRequest('geolocation', ['video']), false)
})

test('launcher bundle: file:// app URL built from the repo path (spaces, Korean) stays trusted', () => {
  // electron/main.mjs 는 런처가 file:// 로 import 해도 __dirname 이 저장소의 electron/ 이라 같은 식으로 appUrl 을 만든다
  for (const repo of ['/Users/dev/animal-hood-girl-vtuber', '/Users/김 민우/Documents/버튜버 repo']) {
    const appUrl = pathToFileURL(join(repo, 'electron', '../dist/index.html')).href
    assert.ok(isTrustedAppUrl(appUrl, appUrl))
    assert.ok(isTrustedAppUrl(appUrl + '?avatar=fox#x', appUrl))
    assert.equal(isTrustedAppUrl(pathToFileURL(join(repo, 'dist/harness.html')).href, appUrl), false)
    assert.equal(isTrustedAppUrl(pathToFileURL('/tmp/dist/index.html').href, appUrl), false)
  }
})

test('launcher/portable bundle on Windows: file:///C:/… app URL (spaces, drive letter) stays trusted', () => {
  // pack:win 결과물은 C:\Users\김 민우\Animal Hood VTuber-win32-x64\resources\app\dist\index.html 을 file:// 로 연다 — pathToFileURL 이 Windows 에서 만드는 모양
  const appUrl = 'file:///C:/Users/%EA%B9%80%20%EB%AF%BC%EC%9A%B0/Animal%20Hood%20VTuber-win32-x64/resources/app/dist/index.html'
  assert.ok(isTrustedAppUrl(appUrl, appUrl))
  assert.ok(isTrustedAppUrl(appUrl + '?avatar=fox', appUrl))
  assert.equal(isTrustedAppUrl(appUrl.replace('index.html', 'harness.html'), appUrl), false)
  assert.equal(isTrustedAppUrl('file:///C:/Windows/Temp/index.html', appUrl), false)
  assert.equal(isTrustedAppUrl(appUrl.replace('C:', 'D:'), appUrl), false)
})

test('platform: process.platform / navigator 문자열을 mac·win·other 로 가른다', () => {
  assert.equal(osFromPlatform('darwin'), 'mac') // 'darwin' 안의 'win' 에 속지 않는다
  assert.equal(osFromPlatform('MacIntel'), 'mac')
  assert.equal(osFromPlatform('win32'), 'win')
  assert.equal(osFromPlatform('Win32'), 'win')
  assert.equal(osFromPlatform('Windows'), 'win')
  assert.equal(osFromPlatform('linux'), 'other')
  assert.equal(osFromPlatform('Linux x86_64'), 'other')
  assert.equal(osFromPlatform(undefined), 'other')
  assert.equal(modLabel('mac'), '⌘')
  assert.equal(modLabel('win'), 'Ctrl+')
})

test('캐릭터 전환 수식키: 맥은 ⌘ 만, Windows 는 Ctrl 만 — 다른 수식키가 섞이면 전역·메뉴 단축키 몫', () => {
  const none = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }
  const e = (patch) => ({ ...none, ...patch })
  // 맥 (기존 동작 그대로)
  assert.equal(hasAvatarModifier('mac', e({ metaKey: true })), true)
  assert.equal(hasAvatarModifier('mac', e({ ctrlKey: true })), false) // Ctrl+Option+숫자 전역 단축키가 캐릭터를 바꾸면 안 된다
  assert.equal(hasExtraModifier('mac', e({ metaKey: true })), false)
  for (const extra of ['ctrlKey', 'altKey', 'shiftKey']) assert.equal(hasExtraModifier('mac', e({ metaKey: true, [extra]: true })), true, extra)
  // Windows
  assert.equal(hasAvatarModifier('win', e({ ctrlKey: true })), true)
  assert.equal(hasAvatarModifier('win', e({ metaKey: true })), false)
  assert.equal(hasExtraModifier('win', e({ ctrlKey: true })), false)
  for (const extra of ['metaKey', 'altKey', 'shiftKey']) assert.equal(hasExtraModifier('win', e({ ctrlKey: true, [extra]: true })), true, extra)
  // Ctrl+Alt+숫자(전역 리액션, AltGr 자판)는 전환으로 읽히지 않는다
  const ctrlAlt = e({ ctrlKey: true, altKey: true })
  assert.ok(hasAvatarModifier('win', ctrlAlt) && hasExtraModifier('win', ctrlAlt))
  // 그 밖(Linux)은 Windows 와 같은 규칙
  assert.equal(hasAvatarModifier('other', e({ ctrlKey: true })), true)
})
