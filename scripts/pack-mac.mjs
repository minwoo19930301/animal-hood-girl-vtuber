#!/usr/bin/env node
/**
 * macOS 앱 번들 만들기: release/Animal Hood VTuber.app
 *
 *   npm run app                 빌드 → (번들이 없으면 생성) → 실행
 *   npm run pack                빌드 → 번들 확인
 *   npm run pack -- --standalone  코드를 번들 안에 복사한 단독 실행본 (배포용, 빌드마다 재서명)
 *
 * 기본은 "런처 번들"이다. 번들 안에는 이 저장소의 electron/main.mjs를 불러오는 작은 런처만 들어가고,
 * 렌더러는 저장소의 dist/를 그대로 쓴다. 코드를 고쳐도 번들 내용이 안 바뀌어 서명(cdhash)이 그대로고,
 * 그래서 macOS 카메라 권한을 빌드할 때마다 다시 묻지 않는다. 저장소 경로를 옮기면 --rebuild로 다시 만든다.
 *
 * 왜 번들이 필요한가: `electron .`을 다른 앱(Claude, IDE 등)의 셸에서 띄우면 macOS 카메라 권한(TCC)이
 * 그 부모 앱에 묶여 권한 창이 뜨지 않고 프레임이 0인 채로 멈춘다. 자기 번들 ID를 가진 앱이어야
 * "Animal Hood VTuber"로 권한을 묻고 시스템 설정 > 카메라 목록에도 따로 생긴다.
 *
 * electron-builder 없이 node_modules의 Electron.app을 복사해 Info.plist만 바꾸고 ad-hoc 서명한다.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { VITE_BIN } from './lib/platform.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const NAME = 'Animal Hood VTuber'
const BUNDLE_ID = 'com.minwokim.animal-hood-vtuber'
const SRC_APP = join(ROOT, 'node_modules/electron/dist/Electron.app')
const OUT_DIR = join(ROOT, 'release')
const APP = join(OUT_DIR, `${NAME}.app`)
const ICON = join(ROOT, 'build/icon.icns')
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })

if (process.platform !== 'darwin') {
  console.error('[pack] macOS 전용입니다 (Windows 앱은 npm run pack:win)')
  process.exit(1)
}
if (!existsSync(SRC_APP)) {
  console.error('[pack] Electron 바이너리가 없습니다. npm install 을 먼저 실행하세요')
  process.exit(1)
}

const standalone = process.argv.includes('--standalone')
const rebuild = process.argv.includes('--rebuild') || standalone

// 1) 렌더러 빌드 (하네스 전용 빌드가 남아 있을 수 있어 항상 다시 빌드)
run(process.execPath, [VITE_BIN, 'build'], { cwd: ROOT })

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const appDir = join(APP, 'Contents/Resources/app')
const launcherMain = join(appDir, 'launcher.mjs')
const launcherTarget = pathToFileURL(join(ROOT, 'electron/main.mjs')).href
const launcherSrc = `// 런처: 저장소의 Electron 메인을 그대로 불러온다 (scripts/pack-mac.mjs가 생성)\nawait import(${JSON.stringify(launcherTarget)})\n`

// 런처 번들이 이미 있고 같은 저장소를 가리키면 번들은 건드리지 않는다 → 서명·카메라 권한 유지
if (!rebuild && existsSync(launcherMain) && readFileSync(launcherMain, 'utf8') === launcherSrc) {
  console.log(`[pack] 런처 번들 그대로 사용 (렌더러만 갱신됨): ${APP}`)
  process.exit(0)
}

// 2) Electron.app 복사 — 심볼릭 링크·확장 속성을 보존하려면 ditto
rmSync(APP, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })
run('ditto', [SRC_APP, APP])

// 3) 앱 코드: Resources/app (Electron은 default_app.asar보다 app/를 먼저 읽는다)
mkdirSync(appDir, { recursive: true })
if (standalone) {
  writeFileSync(
    join(appDir, 'package.json'),
    JSON.stringify({ name: pkg.name, productName: NAME, version: pkg.version, type: 'module', main: 'electron/main.mjs' }, null, 2),
  )
  cpSync(join(ROOT, 'electron'), join(appDir, 'electron'), { recursive: true })
  cpSync(join(ROOT, 'dist'), join(appDir, 'dist'), { recursive: true })
  rmSync(join(appDir, 'dist/harness.html'), { force: true })
} else {
  writeFileSync(
    join(appDir, 'package.json'),
    JSON.stringify({ name: pkg.name, productName: NAME, version: pkg.version, type: 'module', main: 'launcher.mjs' }, null, 2),
  )
  writeFileSync(launcherMain, launcherSrc)
}

// 4) Info.plist — 이름·번들 ID·카메라 사용 설명
const plist = join(APP, 'Contents/Info.plist')
const set = (key, type, value) => {
  try {
    run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist], { stdio: 'ignore' })
  } catch {
    run('/usr/libexec/PlistBuddy', ['-c', `Add :${key} ${type} ${value}`, plist], { stdio: 'ignore' })
  }
}
set('CFBundleName', 'string', NAME)
set('CFBundleDisplayName', 'string', NAME)
set('CFBundleIdentifier', 'string', BUNDLE_ID)
set('CFBundleShortVersionString', 'string', pkg.version)
set('NSCameraUsageDescription', 'string', '아바타가 표정과 몸짓을 따라 하려면 카메라가 필요합니다. 영상은 이 Mac 안에서만 처리하고 저장하거나 전송하지 않습니다.')
set('LSApplicationCategoryType', 'string', 'public.app-category.entertainment')
if (existsSync(ICON)) {
  cpSync(ICON, join(APP, 'Contents/Resources/electron.icns'))
}

// 5) ad-hoc 서명 — Info.plist를 바꾸면 원래 서명이 깨져 Apple Silicon에서 실행이 막힌다
run('codesign', ['--force', '--deep', '--sign', '-', APP])
console.log(`[pack] ${standalone ? '단독' : '런처'} 번들 생성: ${APP}`)
