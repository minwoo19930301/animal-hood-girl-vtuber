#!/usr/bin/env node
/**
 * Windows 포터블 앱 만들기 (맥·리눅스·Windows 어디서든 실행, wine 불필요)
 *
 *   npm run pack:win                      빌드 → release/Animal Hood VTuber-win32-x64/ → release/Animal-Hood-VTuber-win32-x64.zip
 *   npm run pack:win -- --arch=arm64      Windows on ARM (arm64)
 *   npm run pack:win -- --arch=all        x64 + arm64
 *   npm run pack:win -- --no-zip          zip 없이 폴더만
 *   npm run pack:win -- --skip-build      dist/ 를 다시 빌드하지 않고 그대로 사용
 *
 * pack-mac.mjs의 기본(런처 번들)과 달리 코드를 앱 안에 복사한 단독 실행본이다
 * (resources/app/ = package.json + electron/ + shared/ + dist/). Windows에는 카메라 권한(TCC)이 앱 서명에 묶이는
 * 문제가 없고, 받는 사람은 저장소 없이 zip만 풀어 쓰기 때문이다.
 * 아바타 VRM 14종(약 280 MB)이 dist/models 에 들어 있어 폴더도 zip도 크다 (zip ≈ 500 MB).
 *
 * @electron/packager 가 Electron의 win32 바이너리를 GitHub 릴리스(@electron/get)에서 받아 와
 * (설치된 electron 과 같은 버전) 앱 코드를 얹고, 아이콘·버전 정보는 순수 JS(resedit)로 exe에 써 넣는다.
 * 서명하지 않는다 — 처음 실행하면 SmartScreen이 막으니 "추가 정보 > 실행" (README의 Windows 절 참고).
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packager } from '@electron/packager'
import { VITE_BIN } from './lib/platform.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const NAME = 'Animal Hood VTuber'
const EXE_NAME = 'AnimalHoodVTuber'
const ZIP_BASENAME = 'Animal-Hood-VTuber'
const AUTHOR = 'minwokim' // exe 파일 속성의 회사 이름 (packager가 필수로 요구한다)
const OUT_DIR = join(ROOT, 'release')
const ICON = join(ROOT, 'build/icon.ico')
// 아바타 팩의 입력(빌드 도우미)일 뿐 앱이 열지 않는 VRM — 배포본에서 뺀다 (각 약 15 MB).
// 아래 3)의 점검이 "앱이 참조하는 모델은 빠짐없이 들어 있다"는 것을 확인한다.
const BUILD_ONLY_MODELS = ['models/placeholder.vrm', 'models/flamingo_motion.vrm']

const args = process.argv.slice(2)
const archArg = (args.find((a) => a.startsWith('--arch=')) ?? '--arch=x64').slice('--arch='.length)
const archs = archArg === 'all' ? ['x64', 'arm64'] : archArg.split(',')
for (const a of archs) {
  if (a !== 'x64' && a !== 'arm64') {
    console.error(`[pack:win] 지원하지 않는 --arch=${a} (x64, arm64, all)`)
    process.exit(1)
  }
}
const makeZip = !args.includes('--no-zip')
const skipBuild = args.includes('--skip-build')

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const electronPkgPath = join(ROOT, 'node_modules/electron/package.json')
if (!existsSync(electronPkgPath)) {
  console.error('[pack:win] node_modules/electron 이 없습니다. npm install 을 먼저 실행하세요')
  process.exit(1)
}
// 앱 스테이징 폴더에는 node_modules가 없어 packager가 버전을 추론하지 못한다 → 설치된 electron 버전을 명시
// (package.json 은 ^43.1.1 같은 범위라 정확한 버전이 아니다)
const electronVersion = JSON.parse(readFileSync(electronPkgPath, 'utf8')).version

// 1) 렌더러 빌드 (npm run shot 같은 하네스 전용 빌드가 dist/를 덮어쓴 채 남아 있을 수 있어 기본은 항상 다시 빌드.
//    npx 대신 vite를 직접 불러 Windows에서도 돈다)
if (!skipBuild) {
  execFileSync(process.execPath, [VITE_BIN, 'build'], { cwd: ROOT, stdio: 'inherit' })
}
if (!existsSync(join(ROOT, 'dist/index.html'))) {
  console.error('[pack:win] dist/index.html 이 없습니다 (하네스 전용 빌드만 남아 있다면 --skip-build 없이 다시 실행)')
  process.exit(1)
}

// 2) 앱 코드 스테이징: package.json(최소) + electron/ + shared/ + dist/
//    electron/main.mjs 가 ../shared/*.json (아바타 카탈로그·리액션 표)을 __dirname 기준으로 읽으므로 shared/ 도 같이 간다.
const stage = mkdtempSync(join(tmpdir(), 'animal-hood-pack-win-'))
try {
  writeFileSync(
    join(stage, 'package.json'),
    JSON.stringify({ name: pkg.name, productName: NAME, version: pkg.version, description: pkg.description, author: AUTHOR, type: 'module', main: 'electron/main.mjs' }, null, 2),
  )
  cpSync(join(ROOT, 'electron'), join(stage, 'electron'), { recursive: true })
  cpSync(join(ROOT, 'shared'), join(stage, 'shared'), { recursive: true })
  // 트레이·창 아이콘 (electron/main.mjs 가 electron/icon.ico 를 먼저 찾는다)
  if (existsSync(ICON)) cpSync(ICON, join(stage, 'electron/icon.ico'))
  cpSync(join(ROOT, 'dist'), join(stage, 'dist'), { recursive: true })

  // 하네스 페이지와 그 전용 청크는 뺀다 (공유 청크는 index.html도 쓰므로 그대로 둔다)
  const harnessHtml = join(stage, 'dist/harness.html')
  if (existsSync(harnessHtml)) {
    const entry = /src="\.\/assets\/(harness-[^"]+\.js)"/.exec(readFileSync(harnessHtml, 'utf8'))?.[1]
    rmSync(harnessHtml, { force: true })
    if (entry) rmSync(join(stage, 'dist/assets', entry), { force: true })
  }
  for (const m of BUILD_ONLY_MODELS) rmSync(join(stage, 'dist', m), { force: true })

  // 3) 점검: 앱이 열 파일(카탈로그의 modelUrl + 번들 JS 안의 ./models/* 참조)이 스테이징에 다 있어야 한다
  const wanted = new Set()
  for (const entry of JSON.parse(readFileSync(join(stage, 'shared/avatar-catalog.json'), 'utf8'))) {
    if (typeof entry.modelUrl === 'string') wanted.add(entry.modelUrl.replace(/^\.\//, ''))
  }
  const assetsDir = join(stage, 'dist/assets')
  for (const f of readdirSync(assetsDir)) {
    if (!f.endsWith('.js')) continue
    for (const m of readFileSync(join(assetsDir, f), 'utf8').matchAll(/\.\/(models\/[\w.-]+\.(?:vrm|task))/g)) wanted.add(m[1])
  }
  const missing = [...wanted].filter((rel) => !existsSync(join(stage, 'dist', rel)))
  if (missing.length > 0 || !existsSync(join(stage, 'dist/wasm'))) {
    console.error(`[pack:win] 앱이 쓰는 파일이 빠졌습니다: ${[...missing, ...(existsSync(join(stage, 'dist/wasm')) ? [] : ['wasm/'])].join(', ')}`)
    process.exit(1)
  }
  console.log(`[pack:win] 모델·wasm 점검 통과 (참조 ${wanted.size}개, 빌드 전용 ${BUILD_ONLY_MODELS.length}개 제외)`)

  // 4) Windows 앱 만들기
  mkdirSync(OUT_DIR, { recursive: true })
  const created = await packager({
    dir: stage,
    out: OUT_DIR,
    name: NAME,
    executableName: EXE_NAME,
    appVersion: pkg.version,
    platform: 'win32',
    arch: archs,
    electronVersion,
    ...(existsSync(ICON) ? { icon: ICON } : {}),
    win32metadata: { CompanyName: AUTHOR, FileDescription: NAME, ProductName: NAME, InternalName: NAME },
    asar: false, // resources/app/ 그대로 — 압축 파일 안에 숨기지 않는다
    prune: false, // 스테이징에는 node_modules가 없다
    overwrite: true,
    quiet: false,
  })

  // 5) zip — 압축 폴더 안에 "Animal Hood VTuber-win32-x64/" 한 겹이 들어가 풀면 폴더 하나만 생긴다
  for (const appDir of created) {
    const folder = basename(appDir)
    const arch = folder.slice(folder.lastIndexOf('-') + 1)
    const exe = join(appDir, `${EXE_NAME}.exe`)
    console.log(`[pack:win] ${existsSync(exe) ? 'OK' : 'exe 없음!'}  ${appDir}`)
    if (!makeZip) continue
    const zipName = `${ZIP_BASENAME}-win32-${arch}.zip`
    rmSync(join(OUT_DIR, zipName), { force: true })
    if (process.platform === 'win32') {
      // Windows 10+ 에 들어 있는 bsdtar는 -a 로 확장자(.zip)를 보고 zip을 만든다
      execFileSync('tar', ['-a', '-c', '-f', zipName, folder], { cwd: OUT_DIR, stdio: 'inherit' })
    } else {
      // VRM은 이미 압축된 데이터라 -9 로 올려도 이득이 없다 → 기본 압축
      execFileSync('zip', ['-r', '-q', '-X', zipName, folder, '-x', '*.DS_Store'], { cwd: OUT_DIR, stdio: 'inherit' })
    }
    console.log(`[pack:win] zip: ${join(OUT_DIR, zipName)}`)
  }
} finally {
  rmSync(stage, { recursive: true, force: true })
}
