#!/usr/bin/env node
/**
 * Render a looping idle GIF per avatar through the deterministic look-dev
 * harness. One Vite preview and one Chrome/CDP session are reused, and each
 * avatar page is loaded once — frames are produced by re-posing in place via
 * `window.__pose(query, seconds)`, so a 19 MiB VRM is parsed once per avatar
 * instead of once per frame.
 *
 * Default output: docs/gif/<slug>.gif
 *
 * Usage:
 *   node scripts/render-avatar-gifs.mjs
 *   node scripts/render-avatar-gifs.mjs --only bear,fox --size 360x480
 *   node scripts/render-avatar-gifs.mjs --cam full --fps 12
 */

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadAvatarCatalog } from './lib/avatar-pack-common.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const RENDER_DIST = path.join(ROOT, 'node_modules', '.cache', 'mingo-avatar-render-dist');
const READY_TIMEOUT_MS = 60_000;

// 아이들 루프 키프레임 — 좌우 스웨이 + 눈깜빡임 + 짧은 발화.
// pingpong으로 뒤집어 이어붙이므로 마지막 프레임이 첫 프레임으로 자연히 돌아온다.
const FRAMES = Object.freeze([
  { yaw: 0.00, pitch: 0.02, roll: 0.00, blink: 0, mouth: 0.00, smile: 0.18, gazeX: 0.00, breath: 0.2 },
  { yaw: -0.06, pitch: 0.04, roll: -0.01, blink: 0, mouth: 0.10, smile: 0.20, gazeX: -0.05, breath: 0.3 },
  { yaw: -0.11, pitch: 0.05, roll: -0.02, blink: 0, mouth: 0.34, smile: 0.24, gazeX: -0.10, breath: 0.4 },
  { yaw: -0.14, pitch: 0.03, roll: -0.03, blink: 0.6, mouth: 0.52, smile: 0.28, gazeX: -0.12, breath: 0.5 },
  { yaw: -0.12, pitch: 0.00, roll: -0.02, blink: 1, mouth: 0.30, smile: 0.30, gazeX: -0.10, breath: 0.5 },
  { yaw: -0.07, pitch: -0.02, roll: -0.01, blink: 0.4, mouth: 0.08, smile: 0.28, gazeX: -0.04, breath: 0.4 },
  { yaw: 0.00, pitch: -0.03, roll: 0.00, blink: 0, mouth: 0.00, smile: 0.24, gazeX: 0.00, breath: 0.3 },
  { yaw: 0.07, pitch: -0.01, roll: 0.01, blink: 0, mouth: 0.16, smile: 0.26, gazeX: 0.06, breath: 0.2 },
  { yaw: 0.12, pitch: 0.02, roll: 0.02, blink: 0, mouth: 0.44, smile: 0.30, gazeX: 0.11, breath: 0.3 },
  { yaw: 0.14, pitch: 0.04, roll: 0.03, blink: 0.5, mouth: 0.24, smile: 0.32, gazeX: 0.12, breath: 0.4 },
  { yaw: 0.09, pitch: 0.05, roll: 0.02, blink: 1, mouth: 0.06, smile: 0.28, gazeX: 0.07, breath: 0.4 },
  { yaw: 0.04, pitch: 0.03, roll: 0.01, blink: 0.3, mouth: 0.00, smile: 0.22, gazeX: 0.03, breath: 0.3 },
]);

function parseSize(value) {
  const match = /^(\d+)x(\d+)$/i.exec(String(value));
  if (!match) throw new Error(`invalid size "${value}"; expected WIDTHxHEIGHT`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 160 || height < 160 || width > 2048 || height > 2048) {
    throw new Error(`size ${width}x${height} is outside 160..2048`);
  }
  return { width, height };
}

function parseArgs(argv) {
  const options = {
    catalog: path.join(ROOT, 'shared', 'avatar-catalog.json'),
    outDir: path.join(ROOT, 'docs', 'gif'),
    size: parseSize(process.env.SIZE ?? '420x560'),
    cam: 'face',
    fps: 12,
    colors: 128,
    only: null,
    keepFrames: false,
    skipBuild: process.env.SKIP_BUILD === '1',
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--skip-build') { options.skipBuild = true; continue; }
    if (arg === '--keep-frames') { options.keepFrames = true; continue; }
    if (['--catalog', '--out-dir', '--size', '--only', '--cam', '--fps', '--colors'].includes(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      if (arg === '--catalog') options.catalog = path.resolve(value);
      if (arg === '--out-dir') options.outDir = path.resolve(value);
      if (arg === '--size') options.size = parseSize(value);
      if (arg === '--cam') options.cam = value;
      if (arg === '--fps') options.fps = Number(value);
      if (arg === '--colors') options.colors = Number(value);
      if (arg === '--only') {
        options.only = new Set(value.split(',').map((part) => part.trim()).filter(Boolean));
      }
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (!['face', 'full'].includes(options.cam)) throw new Error(`--cam must be face or full`);
  if (!Number.isFinite(options.fps) || options.fps < 4 || options.fps > 30) {
    throw new Error('--fps must be between 4 and 30');
  }
  if (!Number.isInteger(options.colors) || options.colors < 32 || options.colors > 256) {
    throw new Error('--colors must be an integer between 32 and 256');
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
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('Chrome/Chromium not found; set CHROME_BIN');
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function run(command, args, { cwd = ROOT, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${signal ?? `exit ${code}`})\n${stderr.slice(-4000)}`));
    });
  });
}

async function waitForPreview(url, preview) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (preview.exitCode !== null) throw new Error(`Vite preview exited (${preview.exitCode})`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* listener not ready */ }
    await sleep(150);
  }
  throw new Error(`Vite preview did not become ready: ${url}`);
}

async function waitForCdp(port, chrome) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited (${chrome.exitCode})`);
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = tabs.find((tab) => tab.type === 'page' && tab.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* starting */ }
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
      this.socket.onerror = () => reject(new Error('CDP WebSocket failed'));
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
        this.pageErrors.push(details?.exception?.description ?? details?.text ?? 'page exception');
      }
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
    try { this.socket?.close(); } catch { /* no-op */ }
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

async function waitForReady(cdp, expectedUrl) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `location.href === ${JSON.stringify(expectedUrl)}`
          + ` && document.title === 'READY' && typeof window.__pose === 'function'`,
        returnByValue: true,
      });
      if (result.result?.value === true) {
        if (cdp.pageErrors.length) throw new Error(`page exceptions:\n${cdp.pageErrors.join('\n')}`);
        return;
      }
    } catch (error) {
      if (String(error.message).includes('page exceptions')) throw error;
    }
    await sleep(150);
  }
  throw new Error(`page did not reach READY: ${expectedUrl}`);
}

function frameQuery(frame, options) {
  return new URLSearchParams({
    cam: options.cam,
    ...Object.fromEntries(Object.entries(frame).map(([key, value]) => [key, String(value)])),
  }).toString();
}

async function captureFrames(cdp, slug, baseUrl, options, framesDir) {
  const settleQuery = new URLSearchParams({
    avatar: slug, cam: options.cam, bg: '1', t: '1.25', smile: '0.18',
  });
  const url = `${baseUrl}/harness.html?${settleQuery.toString()}`;
  await cdp.send('Page.navigate', { url });
  await waitForReady(cdp, url);

  const files = [];
  const step = 1 / options.fps;
  for (let index = 0; index < FRAMES.length; index++) {
    const query = frameQuery(FRAMES[index], options);
    await cdp.send('Runtime.evaluate', {
      expression: `window.__pose(${JSON.stringify(query)}, ${step})`,
      awaitPromise: true,
    });
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(framesDir, `${String(index).padStart(3, '0')}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    if (fs.statSync(file).size < 1024) throw new Error(`${slug}: frame ${index} is suspiciously small`);
    files.push(file);
  }
  if (cdp.pageErrors.length) throw new Error(`${slug}: page exceptions\n${cdp.pageErrors.join('\n')}`);
  return files;
}

/** 프레임을 ping-pong으로 이어 GIF로 인코딩 (팔레트 2패스). */
async function encodeGif(framesDir, files, output, options) {
  const listDir = path.join(framesDir, 'loop');
  fs.mkdirSync(listDir, { recursive: true });
  const order = [...files, ...files.slice(1, -1).reverse()];
  order.forEach((file, index) => {
    fs.copyFileSync(file, path.join(listDir, `${String(index).padStart(3, '0')}.png`));
  });
  const palette = path.join(framesDir, 'palette.png');
  const input = path.join(listDir, '%03d.png');
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(options.fps), '-i', input,
    '-vf', `palettegen=max_colors=${options.colors}:stats_mode=diff`,
    palette,
  ]);
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(options.fps), '-i', input, '-i', palette,
    '-lavfi', 'paletteuse=dither=bayer:bayer_scale=3',
    '-loop', '0',
    output,
  ]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const catalog = loadAvatarCatalog(options.catalog);
  const entries = catalog.filter((entry) => !options.only || options.only.has(entry.slug));
  if (entries.length === 0) throw new Error('no catalog slug matched --only');

  if (!options.skipBuild) {
    await run(process.execPath, [VITE_BIN, 'build', '--outDir', RENDER_DIST, '--emptyOutDir'], {
      env: { ...process.env, HARNESS_ONLY: '1' },
    });
  }
  fs.mkdirSync(options.outDir, { recursive: true });

  const [previewPort, cdpPort] = await reservePorts(2);
  const baseUrl = `http://127.0.0.1:${previewPort}`;
  const preview = spawn(process.execPath, [
    VITE_BIN, 'preview', '--outDir', RENDER_DIST,
    '--port', String(previewPort), '--strictPort', '--host', '127.0.0.1',
  ], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mingo-gif-chrome-'));
  let chrome = null;
  let cdp = null;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mingo-gif-frames-'));
  try {
    await waitForPreview(`${baseUrl}/harness.html`, preview);
    chrome = spawn(findChrome(), [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profileDir}`,
      `--window-size=${options.size.width},${options.size.height}`,
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--use-gl=angle',
      '--enable-unsafe-swiftshader',
      '--disable-extensions',
      '--no-first-run',
      'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'] });
    cdp = new CdpClient(await waitForCdp(cdpPort, chrome));
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: options.size.width, height: options.size.height, deviceScaleFactor: 1, mobile: false,
    });

    const results = [];
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const framesDir = path.join(workDir, entry.slug);
      fs.rmSync(framesDir, { recursive: true, force: true });
      fs.mkdirSync(framesDir, { recursive: true });
      cdp.pageErrors.length = 0;
      const files = await captureFrames(cdp, entry.slug, baseUrl, options, framesDir);
      const output = path.join(options.outDir, `${entry.slug}.gif`);
      await encodeGif(framesDir, files, output, options);
      const bytes = fs.statSync(output).size;
      if (bytes < 4096) throw new Error(`${entry.slug}: GIF is suspiciously small (${bytes} B)`);
      results.push({ slug: entry.slug, bytes });
      console.log(`[${index + 1}/${entries.length}] ${entry.slug}.gif `
        + `${(bytes / 1024).toFixed(0)} KiB (${files.length} frames)`);
      if (!options.keepFrames) fs.rmSync(framesDir, { recursive: true, force: true });
    }
    const total = results.reduce((sum, item) => sum + item.bytes, 0);
    console.log(`avatar GIF render passed: ${results.length} loops, `
      + `${(total / 1024 / 1024).toFixed(2)} MiB total, out=${path.relative(ROOT, options.outDir)}`);
  } finally {
    cdp?.close();
    await stopProcess(chrome);
    await stopProcess(preview);
    fs.rmSync(profileDir, { recursive: true, force: true });
    if (!options.keepFrames) fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
