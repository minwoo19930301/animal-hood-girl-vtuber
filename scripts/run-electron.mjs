#!/usr/bin/env node
/**
 * Electron을 환경변수와 함께 띄운다 — package.json 스크립트의 `VAR=값 electron .` 은 Windows(cmd)에서 안 돈다.
 *
 *   node scripts/run-electron.mjs VITE_DEV_SERVER=http://localhost:5183
 *
 * KEY=값 인자는 환경변수로, 나머지는 electron 인자로 넘긴다 (기본은 `.`).
 */
import { spawn } from 'node:child_process'
import electronPath from 'electron' // node에서 import하면 Electron 실행 파일 경로를 돌려준다

const env = { ...process.env }
const rest = []
for (const a of process.argv.slice(2)) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(a)
  if (m) env[m[1]] = m[2]
  else rest.push(a)
}

const child = spawn(electronPath, rest.length > 0 ? rest : ['.'], { stdio: 'inherit', env })
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))
