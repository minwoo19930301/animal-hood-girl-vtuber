// QA·개발 스크립트가 같이 쓰는 OS 분기 (맥 경로를 하드코딩하지 않고 Windows에서도 돌게)
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

/** vite CLI 진입점. `npx vite`는 Windows에서 npx.cmd 라 spawn이 바로 못 부른다 → node로 직접 실행한다 */
export const VITE_BIN = join(ROOT, 'node_modules/vite/bin/vite.js')

/**
 * 헤드리스 QA에 쓰는 Chrome 후보를 우선순위대로. CHROME(또는 옛 이름 CHROME_BIN) 환경변수가 맨 앞이다.
 * Windows는 설치 위치를 차례로 찾고, 없으면 같은 Chromium인 Edge를 쓴다.
 */
export function chromeCandidates() {
  const list = [process.env.CHROME, process.env.CHROME_BIN]
  list.push(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  )
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
    const rels = ['Google/Chrome/Application/chrome.exe', 'Microsoft/Edge/Application/msedge.exe']
    for (const rel of rels) for (const r of roots) list.push(join(r, rel))
  }
  list.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser')
  return list.filter(Boolean)
}

/** 첫 번째로 실제 있는 Chrome. 하나도 없으면 PATH에서 찾아 주길 바라며 OS별 기본 이름을 돌려준다 (spawn이 ENOENT로 알려 준다) */
export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME
  const found = chromeCandidates().find((p) => existsSync(p))
  if (found) return found
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (process.platform === 'win32') return 'chrome.exe'
  return 'google-chrome'
}
