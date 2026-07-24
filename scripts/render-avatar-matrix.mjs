#!/usr/bin/env node
/**
 * Render the complete avatar QA matrix through the deterministic look-dev
 * harness. One Vite preview and one Chrome/CDP session are reused, and all
 * captures are serial, so concurrent dev servers cannot collide with fixed
 * screenshot ports.
 *
 * Default output:
 *   shots/avatar-pack/<slug>/
 *     {front,face,pitch,blink-mouth,hands-fingers,body-legs,orbit}.png
 *
 * Useful integration checks:
 *   npm run avatars:shots -- --plan
 *   npm run avatars:shots -- --scenes front,face
 *   npm run avatars:shots -- --only bear --skip-build
 *   npm run avatars:shots -- --skip-existing
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadAvatarCatalog } from './lib/avatar-pack-common.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
// Do not replace the application's normal dist/ with a harness-only build.
// Keeping this cache also makes --skip-build useful across iterative runs.
const RENDER_DIST = path.join(ROOT, 'node_modules', '.cache', 'mingo-avatar-render-dist');
const READY_TIMEOUT_MS = 45_000;

const SCENES = Object.freeze([
  {
    name: 'front',
    query: { cam: 'full', bg: '1', t: '1.25', smile: '0.15' },
  },
  {
    name: 'face',
    query: {
      cam: 'face', bg: '1', t: '1.25', smile: '0.3', gazeX: '0.1', browL: '0.08', browR: '0.08',
    },
  },
  {
    name: 'pitch',
    query: {
      cam: 'face', bg: '1', t: '1.5', pitch: '0.34', yaw: '-0.18', gazeY: '-0.16', smile: '0.12',
    },
  },
  {
    name: 'blink-mouth',
    query: {
      cam: 'face', bg: '1', t: '1.25', blink: '1', mouth: '0.72', smile: '0.55', browL: '0.24', browR: '0.24',
    },
  },
  {
    name: 'hands-fingers',
    query: {
      cam: 'face',
      bg: '1',
      t: '1.35',
      armL: 'fwd',
      // elbowL/R: 0.78/0.68 → 0.55/0.50 — 도너 소매 리깅 한계 안으로 완화해
      // 검은 소매 백페이스 링 노출을 최소화 (손가락 포즈 판독성은 유지).
      elbowL: '0.55',
      palmL: 'front',
      fingersL: '0.1,0.88,0.22,0.72,0.36',
      spreadL: '0.78',
      armR: 'fwd',
      elbowR: '0.50',
      palmR: 'front',
      fingersR: '0.84,0.16,0.74,0.28,0.62',
      spreadR: '0.62',
    },
  },
  {
    name: 'body-legs',
    query: {
      cam: 'full',
      bg: '1',
      t: '1.5',
      // kneeL 0.68→0.30, hipShift 0.32→0.18 — 도너 스커트 리깅 한계 안으로 완화.
      // 스커트 밑단이 힙 크레스트 아래를 유지하고 손 관통이 사라지는 범위.
      kneeL: '0.30',
      kneeR: '0.14',
      hipShift: '0.18',
      twist: '-0.12',
      lean: '0.06',
    },
  },
  {
    name: 'orbit',
    query: {
      cam: 'full', bg: '1', t: '1.5', orbit: '0.95', yaw: '-0.24', smile: '0.12',
    },
  },
]);

function parseSize(value) {
  const match = /^(\d+)x(\d+)$/i.exec(String(value));
  if (!match) throw new Error(`invalid size "${value}"; expected WIDTHxHEIGHT`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 320 || height < 320 || width > 4096 || height > 4096) {
    throw new Error(`size ${width}x${height} is outside 320..4096`);
  }
  return { width, height };
}

function parseArgs(argv) {
  const options = {
    catalog: path.join(ROOT, 'shared', 'avatar-catalog.json'),
    outDir: path.join(ROOT, 'shots', 'avatar-pack'),
    size: parseSize(process.env.SIZE ?? '750x1000'),
    only: null,
    scenes: null,
    plan: false,
    skipBuild: process.env.SKIP_BUILD === '1',
    skipExisting: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--plan') {
      options.plan = true;
      continue;
    }
    if (arg === '--skip-build') {
      options.skipBuild = true;
      continue;
    }
    if (arg === '--skip-existing') {
      options.skipExisting = true;
      continue;
    }
    if (['--catalog', '--out-dir', '--size', '--only', '--scenes'].includes(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      if (arg === '--catalog') options.catalog = path.resolve(value);
      if (arg === '--out-dir') options.outDir = path.resolve(value);
      if (arg === '--size') options.size = parseSize(value);
      if (arg === '--only') {
        options.only = new Set(value.split(',').map((part) => part.trim()).filter(Boolean));
      }
      if (arg === '--scenes') {
        options.scenes = new Set(value.split(',').map((part) => part.trim()).filter(Boolean));
      }
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error('Chrome/Chromium not found; set CHROME_BIN to the browser executable');
  }
  return found;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function reservePorts(count) {
  const servers = [];
  try {
    for (let index = 0; index < count; index++) {
      const server = net.createServer();
      servers.push(server);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
    }
    return servers.map((server) => server.address().port);
  } finally {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  }
}

function runBuild() {
  if (!fs.existsSync(VITE_BIN)) throw new Error(`Vite executable not found: ${VITE_BIN}`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      VITE_BIN,
      'build',
      '--outDir',
      RENDER_DIST,
      '--emptyOutDir',
    ], {
      cwd: ROOT,
      env: { ...process.env, HARNESS_ONLY: '1' },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Vite build failed (${signal ?? `exit ${code}`})`));
    });
  });
}

async function waitForPreview(url, preview) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (preview.exitCode !== null) {
      throw new Error(`Vite preview exited early with code ${preview.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The TCP listener may exist a few frames before HTTP is ready.
    }
    await sleep(150);
  }
  throw new Error(`Vite preview did not become ready: ${url}`);
}

async function waitForCdp(port, chrome) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) {
      throw new Error(`Chrome exited early with code ${chrome.exitCode}`);
    }
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = tabs.find((tab) => tab.type === 'page' && tab.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    await sleep(150);
  }
  throw new Error('Chrome DevTools endpoint did not become ready');
}

class CdpClient {
  constructor(webSocketUrl) {
    this.url = webSocketUrl;
    this.socket = null;
    this.nextId = 0;
    this.pending = new Map();
    this.pageErrors = [];
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = () => reject(new Error('Chrome DevTools WebSocket failed'));
    });
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`CDP ${message.error.code}: ${message.error.message}`));
        else resolve(message.result ?? {});
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params?.exceptionDetails;
        this.pageErrors.push(details?.exception?.description ?? details?.text ?? 'unknown page exception');
      }
    };
    this.socket.onclose = () => {
      for (const { reject } of this.pending.values()) reject(new Error('CDP socket closed'));
      this.pending.clear();
    };
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('CDP socket is not open'));
    }
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      // no-op
    }
  }
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    sleep(2_000).then(() => false),
  ]);
  if (!exited && child.exitCode === null) child.kill('SIGKILL');
}

function sceneUrl(baseUrl, slug, scene) {
  const query = new URLSearchParams({ avatar: slug, ...scene.query });
  return `${baseUrl}/harness.html?${query.toString()}`;
}

async function waitForReady(cdp, expectedUrl) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastEvaluationError = null;
  while (Date.now() < deadline) {
    let result;
    try {
      result = await cdp.send('Runtime.evaluate', {
        expression: `location.href === ${JSON.stringify(expectedUrl)} && document.title === 'READY'`,
        returnByValue: true,
      });
      lastEvaluationError = null;
    } catch (error) {
      // A navigation can invalidate the previous execution context for a few
      // milliseconds after Page.navigate resolves. That CDP error is transient;
      // keep polling and report it only if the new document never becomes ready.
      lastEvaluationError = error;
      await sleep(150);
      continue;
    }
    if (result.result?.value === true) {
      if (cdp.pageErrors.length) {
        throw new Error(`page exceptions:\n${cdp.pageErrors.join('\n')}`);
      }
      return;
    }
    await sleep(150);
  }
  throw new Error(
    `page did not reach READY in ${READY_TIMEOUT_MS}ms: ${expectedUrl}`
    + (cdp.pageErrors.length ? `\n${cdp.pageErrors.join('\n')}` : '')
    + (lastEvaluationError ? `\nlast CDP evaluation error: ${lastEvaluationError.message}` : ''),
  );
}

async function validatePng(file, expectedSize) {
  if (!fs.existsSync(file)) throw new Error(`missing output: ${file}`);
  const bytes = fs.readFileSync(file);
  if (
    bytes.length < 1024
    || bytes[0] !== 0x89
    || bytes[1] !== 0x50
    || bytes[2] !== 0x4e
    || bytes[3] !== 0x47
  ) {
    throw new Error(`invalid or suspiciously small PNG: ${file}`);
  }
  const image = await loadImage(bytes);
  if (image.width !== expectedSize.width || image.height !== expectedSize.height) {
    throw new Error(
      `${file}: expected ${expectedSize.width}x${expectedSize.height}, `
      + `got ${image.width}x${image.height}`,
    );
  }
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, image.width, image.height).data;
  const background = [data[0], data[1], data[2], data[3]];
  let samples = 0;
  let visible = 0;
  let different = 0;
  let minLight = 255;
  let maxLight = 0;
  const step = Math.max(1, Math.floor(Math.min(image.width, image.height) / 250));
  for (let y = 0; y < image.height; y += step) {
    for (let x = 0; x < image.width; x += step) {
      const offset = (y * image.width + x) * 4;
      const alpha = data[offset + 3];
      const light = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
      const colourDistance = Math.abs(data[offset] - background[0])
        + Math.abs(data[offset + 1] - background[1])
        + Math.abs(data[offset + 2] - background[2])
        + Math.abs(alpha - background[3]);
      samples++;
      if (alpha > 8) visible++;
      if (colourDistance > 24) different++;
      minLight = Math.min(minLight, light);
      maxLight = Math.max(maxLight, light);
    }
  }
  if (
    visible / samples < 0.01
    || different / samples < 0.005
    || maxLight - minLight < 8
  ) {
    throw new Error(
      `blank/uniform capture: ${file} `
      + `(visible=${visible}/${samples}, different=${different}/${samples}, `
      + `range=${(maxLight - minLight).toFixed(1)})`,
    );
  }
  return { bytes: bytes.length, differentRatio: different / samples };
}

async function writeContactSheet(sceneJobs, sceneName, outDir, sourceSize) {
  const columns = Math.min(4, sceneJobs.length);
  const rows = Math.ceil(sceneJobs.length / columns);
  const cellWidth = 240;
  const imageHeight = Math.round(cellWidth * sourceSize.height / sourceSize.width);
  const labelHeight = 28;
  const canvas = createCanvas(columns * cellWidth, rows * (imageHeight + labelHeight));
  const context = canvas.getContext('2d');
  context.fillStyle = '#0e0b14';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = '600 15px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  for (const [index, job] of sceneJobs.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cellWidth;
    const y = row * (imageHeight + labelHeight);
    const image = await loadImage(fs.readFileSync(job.output));
    context.drawImage(image, x, y, cellWidth, imageHeight);
    context.fillStyle = '#0e0b14';
    context.fillRect(x, y + imageHeight, cellWidth, labelHeight);
    context.fillStyle = '#f4edf8';
    context.fillText(job.entry.slug, x + cellWidth / 2, y + imageHeight + labelHeight / 2);
  }

  const contactDir = path.join(outDir, '_contact');
  const output = path.join(contactDir, `${sceneName}.png`);
  fs.mkdirSync(contactDir, { recursive: true });
  fs.writeFileSync(output, canvas.toBuffer('image/png'));
  return output;
}

function assertSceneCapturesAreDistinct(sceneJobs) {
  const seen = new Map();
  for (const job of sceneJobs) {
    const digest = crypto.createHash('sha256').update(fs.readFileSync(job.output)).digest('hex');
    const duplicate = seen.get(digest);
    if (duplicate) {
      throw new Error(
        `identical ${job.scene.name} captures for "${duplicate}" and "${job.entry.slug}"; `
        + 'the avatar query may be falling back to one model',
      );
    }
    seen.set(digest, job.entry.slug);
  }
}

async function renderOne(cdp, url, output, size) {
  cdp.pageErrors.length = 0;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.rmSync(output, { force: true });
  const navigation = await cdp.send('Page.navigate', { url });
  if (navigation.errorText) {
    throw new Error(`navigation failed (${navigation.errorText}): ${url}`);
  }
  await waitForReady(cdp, url);
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  if (!result.data) throw new Error(`captureScreenshot returned no bytes: ${url}`);
  const temporary = `${output}.building`;
  fs.writeFileSync(temporary, Buffer.from(result.data, 'base64'));
  await validatePng(temporary, size);
  fs.renameSync(temporary, output);
  return validatePng(output, size);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const catalog = loadAvatarCatalog(options.catalog);
  // Pack size is defined by the catalog itself (v3: 12 species + flamingo).
  if (catalog.length === 0) {
    throw new Error(`catalog must contain at least one avatar: ${options.catalog}`);
  }
  if (options.only?.size === 0) throw new Error('--only must name at least one avatar');
  if (options.scenes?.size === 0) throw new Error('--scenes must name at least one scene');
  if (options.only) {
    const unknown = [...options.only].filter((slug) => !catalog.some((entry) => entry.slug === slug));
    if (unknown.length) throw new Error(`--only contains unknown avatar(s): ${unknown.join(', ')}`);
  }
  if (options.scenes) {
    const unknown = [...options.scenes].filter((name) => !SCENES.some((scene) => scene.name === name));
    if (unknown.length) throw new Error(`--scenes contains unknown scene(s): ${unknown.join(', ')}`);
  }
  const entries = options.only
    ? catalog.filter((entry) => options.only.has(entry.slug))
    : catalog;
  const scenes = options.scenes
    ? SCENES.filter((scene) => options.scenes.has(scene.name))
    : SCENES;
  const jobs = entries.flatMap((entry) => scenes.map((scene) => ({
    entry,
    scene,
    output: path.join(options.outDir, entry.slug, `${scene.name}.png`),
  })));

  if (options.plan) {
    for (const job of jobs) {
      console.log(`${job.entry.slug}/${job.scene.name} -> ${path.relative(ROOT, job.output)}`);
    }
    console.log(`planned ${jobs.length} captures (${entries.length} avatars × ${scenes.length} scenes)`);
    return;
  }

  if (!options.skipBuild) await runBuild();
  if (!fs.existsSync(path.join(RENDER_DIST, 'harness.html'))) {
    throw new Error(
      `render harness build not found: ${RENDER_DIST}; `
      + 'run without --skip-build once before reusing the cached build',
    );
  }
  const chromeBin = findChrome();
  const [previewPort, cdpPort] = await reservePorts(2);
  const baseUrl = `http://127.0.0.1:${previewPort}`;
  const preview = spawn(process.execPath, [
    VITE_BIN,
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    String(previewPort),
    '--strictPort',
    '--outDir',
    RENDER_DIST,
  ], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let previewLog = '';
  preview.stdout.on('data', (chunk) => { previewLog += chunk; });
  preview.stderr.on('data', (chunk) => { previewLog += chunk; });

  const profile = fs.mkdtempSync(path.join(tmpdir(), 'mingo-avatar-shots-'));
  let chrome = null;
  let cdp = null;
  try {
    await waitForPreview(`${baseUrl}/harness.html`, preview);
    chrome = spawn(chromeBin, [
      '--headless=new',
      '--disable-gpu',
      '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--remote-debugging-port=${cdpPort}`,
      `--window-size=${options.size.width},${options.size.height}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ], { stdio: 'ignore' });
    const webSocketUrl = await waitForCdp(cdpPort, chrome);
    cdp = new CdpClient(webSocketUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: options.size.width,
      height: options.size.height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    for (const [index, job] of jobs.entries()) {
      if (options.skipExisting && fs.existsSync(job.output)) {
        try {
          const result = await validatePng(job.output, options.size);
          console.log(
            `[${index + 1}/${jobs.length}] reuse ${job.entry.slug}/${job.scene.name}.png `
            + `${Math.round(result.bytes / 1024)} KiB`,
          );
          continue;
        } catch {
          // A stale, corrupt, wrong-sized, or blank output is rendered again.
        }
      }
      const url = sceneUrl(baseUrl, job.entry.slug, job.scene);
      const result = await renderOne(cdp, url, job.output, options.size);
      console.log(
        `[${index + 1}/${jobs.length}] ${job.entry.slug}/${job.scene.name}.png `
        + `${Math.round(result.bytes / 1024)} KiB`,
      );
    }

    // Final pass proves the requested matrix is complete even if a later edit
    // deletes or replaces a file while a long render is in progress.
    for (const job of jobs) await validatePng(job.output, options.size);
    if (entries.length > 1) {
      for (const scene of scenes) {
        assertSceneCapturesAreDistinct(jobs.filter((job) => job.scene.name === scene.name));
      }
    }
    // A per-scene contact sheet makes visual comparison of the whole pack
    // practical while retaining the full-resolution per-avatar captures.
    if (entries.length === catalog.length) {
      for (const scene of scenes) {
        const output = await writeContactSheet(
          jobs.filter((job) => job.scene.name === scene.name),
          scene.name,
          options.outDir,
          options.size,
        );
        console.log(`contact sheet: ${path.relative(ROOT, output)}`);
      }
    }
    console.log(`avatar screenshot matrix passed: ${jobs.length} non-blank PNGs`);
  } catch (error) {
    if (previewLog.trim()) error.message += `\nVite preview log:\n${previewLog.trim()}`;
    throw error;
  } finally {
    cdp?.close();
    await stopProcess(chrome);
    await stopProcess(preview);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`avatar screenshot matrix failed: ${error.stack ?? error.message}`);
  process.exit(1);
});
