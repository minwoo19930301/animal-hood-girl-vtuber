#!/usr/bin/env node
/**
 * 결정적 스크린샷: vite build → vite preview → Chrome headless 캡처
 *
 * 사용:  npm run shot -- harness.html shots/front.png "pitch=0.2&bg=1"
 *        SKIP_BUILD=1 npm run shot -- ...   (직전 빌드 재사용)
 * 기본 크기 750x1000 (2400x3200 시트 비율). SIZE=WxH 로 변경.
 */
import { spawn, execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const [page = 'harness.html', out = 'shots/shot.png', query = ''] = process.argv.slice(2)
const [W, H] = (process.env.SIZE ?? '750x1000').split('x').map(Number)
const PORT = 5199
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
try {
  execSync(
    `"${CHROME}" --headless=new --disable-gpu --enable-unsafe-swiftshader ` +
    `--window-size=${W},${H} --hide-scrollbars --force-device-scale-factor=1 ` +
    `--virtual-time-budget=8000 --screenshot="${resolve(out)}" "${url}"`,
    { stdio: 'pipe', timeout: 60000 },
  )
  console.log(`OK ${out}  (${url})`)
} finally {
  preview.kill('SIGTERM')
}
