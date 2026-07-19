#!/usr/bin/env node
/**
 * 결정적 스크린샷: vite build → vite preview → Chrome headless(CDP) 캡처
 *
 * 사용:  npm run shot -- harness.html shots/front.png "pitch=0.2&bg=1"
 *        SKIP_BUILD=1 npm run shot -- ...   (직전 빌드 재사용)
 * 기본 크기 750x1000 (2400x3200 시트 비율). SIZE=WxH 로 변경.
 *
 * 캡처는 --virtual-time-budget이 아니라 CDP로 title==='READY'를 폴링한다.
 * (virtual-time-budget은 15MB VRM fetch + 모듈 TLA(await mingo.ready)와
 *  교착해 READY 전에 순백 캔버스를 찍는다 — 실시간 폴링이 유일하게 결정적.)
 */
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve, join } from 'node:path'

const [page = 'harness.html', out = 'shots/shot.png', query = ''] = process.argv.slice(2)
const [W, H] = (process.env.SIZE ?? '750x1000').split('x').map(Number)
const PORT = 5199
const CDP_PORT = 9333
const READY_TIMEOUT_MS = 30000
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

if (!process.env.SKIP_BUILD) {
  // 스크린샷은 harness만 빌드 → 타 모듈 WIP 컴파일 오류와 무관하게 동작
  execSync('npx vite build', { stdio: 'inherit', env: { ...process.env, HARNESS_ONLY: '1' } })
}

mkdirSync(dirname(resolve(out)), { recursive: true })

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'pipe',
})
await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('vite preview timeout')), 15000)
  preview.stdout.on('data', (d) => {
    if (d.toString().includes(String(PORT))) { clearTimeout(to); setTimeout(res, 300) }
  })
  preview.on('exit', () => rej(new Error('vite preview exited early')))
})

const url = `http://localhost:${PORT}/${page}${query ? '?' + query : ''}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(join(tmpdir(), 'mingo-shot-'))
let chrome = null
let ws = null

try {
  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    `--remote-debugging-port=${CDP_PORT}`,
    `--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' })

  // ---- CDP 탭 웹소켓 발견 ----
  let wsUrl = null
  for (let i = 0; i < 50 && !wsUrl; i++) {
    await sleep(200)
    try {
      const tabs = await (await fetch(`http://localhost:${CDP_PORT}/json`)).json()
      wsUrl = tabs.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null
    } catch { /* chrome 기동 중 */ }
  }
  if (!wsUrl) throw new Error('CDP endpoint not found (chrome failed to start)')

  ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP ws error')) })
  let id = 0
  const pending = new Map()
  const errors = []
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
    }
  }
  const send = (method, params = {}) =>
    new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })

  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.navigate', { url })

  // ---- title==='READY' 폴링 (harness.ts가 렌더 완료 후 설정) ----
  let ready = false
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const r = await send('Runtime.evaluate', { expression: 'document.title' })
    if (r.result?.result?.value === 'READY') { ready = true; break }
    await sleep(250)
  }
  if (!ready) {
    throw new Error(
      `page never reached READY in ${READY_TIMEOUT_MS}ms (${url})` +
      (errors.length ? `\npage exceptions:\n${errors.join('\n')}` : ''),
    )
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  if (!shot.result?.data) throw new Error('captureScreenshot returned no data')
  writeFileSync(resolve(out), Buffer.from(shot.result.data, 'base64'))
  console.log(`OK ${out}  (${url})`)
} finally {
  try { ws?.close() } catch { /* noop */ }
  chrome?.kill('SIGTERM')
  preview.kill('SIGTERM')
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* noop */ }
}
