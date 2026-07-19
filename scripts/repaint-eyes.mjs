#!/usr/bin/env node
// repaint-eyes.mjs — 눈매 강화 텍스처 편집 (@napi-rs/canvas, 스크립트 전용)
//
// 대역 모델의 순한 눈 → refs/target-human.png 의 어른스럽고 또렷한 눈매.
//   5 (FaceEyeline 1024x256): 윗 아이라인 두껍게 + 눈꼬리 리프트(치켜뜸) + 대비 강화
//   7 (FaceEyelash 1024x256): 속눈썹 대비 강화 + 눈꼬리 쪽 소폭 리프트
//   9 (EyeIris    1024x512): 앰버/네이비 홍채 → 회청-네이비(#4a5578 기준) 듀오톤 재염색
//                            + 림벌 링(홍채 테두리 어둡게)으로 또렷함. 하이라이트는
//                            별도 텍스처(10)라 유지됨.
//
// 사용법:
//   node scripts/repaint-eyes.mjs [--preview <dir>]
// 출력: work/edited/5.png, 7.png, 9.png  (원본과 동일 크기, rebuild가 교체)
// --preview <dir>: _Color 틴트를 곱한 근사 렌더 프리뷰 PNG를 <dir>에 생성 (검수용).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEX = path.join(ROOT, 'work', 'textures');
const OUT = path.join(ROOT, 'work', 'edited');

// ---------------- 튜닝 상수 ----------------
// "차분한데 강단 있는" 선 — 과하면 사나워지므로 리프트/암화는 소폭.
const TUNE = {
  eyeline: {
    tailLift: 7,    // px — 눈꼬리(바깥) 최대 상승. 1024폭 기준
    tailZone: 240,  // px — 바깥 가장자리에서 리프트가 0으로 줄어드는 램프 길이
    tailEdge: 60,   // px — 램프 시작(바깥쪽) x
    thicken: 2.5,   // px — 윗라인을 위로 두껍게 (아래 경계는 고정)
    darkV: 80,      // v <= darkV 는 완전 강화
    liteV: 140,     // v >= liteV 는 원본 유지 (애교살/연회색 아래라인 보호)
    valueMul: 0.72, // 어두운 획 암화 배율
    alphaGamma: 0.62, // 알파 감마 (<1 = 불투명度↑, 경계 크리스프)
  },
  eyelash: {
    tailLift: 5, tailZone: 240, tailEdge: 60, thicken: 1.5,
    darkV: 90, liteV: 160, valueMul: 0.70, alphaGamma: 0.68,
  },
  iris: {
    // 밝기(luma) → 회청-네이비 그라데이션 (sRGB). 0.55 지점이 #4a5578.
    stops: [
      [0.00, [15, 19, 32]],
      [0.22, [52, 61, 94]],
      [0.42, [74, 85, 120]],
      [0.70, [122, 136, 172]],
      [1.00, [196, 208, 232]],
    ],
    // 홍채 원판 (dump 실측: 알파 bbox 기준)
    disks: [
      { cx: 255.5, cy: 256.5, rx: 121, ry: 136 },
      { cx: 767.5, cy: 256.5, rx: 121, ry: 136 },
    ],
    ring: { start: 0.80, end: 1.03, maxDarken: 0.28 }, // 림벌 링
  },
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

function findTex(idx) {
  const f = fs.readdirSync(TEX).find((n) => n.startsWith(`${idx}_`) && n.endsWith('.png'));
  if (!f) throw new Error(`work/textures/${idx}_*.png not found`);
  return path.join(TEX, f);
}

async function loadToCanvas(file) {
  const img = await loadImage(file);
  const c = createCanvas(img.width, img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

/** 눈꼬리 리프트: 좌우 대칭 램프. 바깥 가장자리(x=tailEdge / W-tailEdge)에서 최대. */
function tailShift(x, W, t) {
  const xm = x < W / 2 ? x : W - 1 - x; // 바깥 가장자리로부터의 거리 좌표
  const s = clamp01((t.tailEdge + t.tailZone - xm) / t.tailZone);
  return t.tailLift * Math.pow(s, 1.4);
}

/** 아이라인/속눈썹 공통: 눈꼬리 시어 리프트 → 위로 두껍게 → 대비 강화 */
function sharpenLine(srcCanvas, t) {
  const W = srcCanvas.width;
  const H = srcCanvas.height;

  // 1) 컬럼 단위 시어: 눈꼬리 쪽 컬럼을 위로 (아랫라인 훅의 처짐도 함께 올라감)
  const sheared = createCanvas(W, H);
  const sc = sheared.getContext('2d');
  sc.imageSmoothingEnabled = true;
  for (let x = 0; x < W; x++) {
    const s = tailShift(x, W, t);
    sc.drawImage(srcCanvas, x, 0, 1, H, x, -s, 1, H);
  }

  // 2) 위로만 두껍게: 위로 밀어올린 사본을 아래층에 깔고 원본을 위에 (아래 경계 고정)
  const out = createCanvas(W, H);
  const oc = out.getContext('2d');
  oc.drawImage(sheared, 0, -t.thicken);
  oc.drawImage(sheared, 0, 0);

  // 3) 대비: 어두운 획만 암화 + 알파 감마 (연회색 애교살은 보호)
  const id = oc.getImageData(0, 0, W, H);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) continue;
    const v = d[i]; // 그레이스케일: r=g=b
    const wDark = 1 - smoothstep(t.darkV, t.liteV, v); // 1=어두운 획, 0=연회색
    if (wDark <= 0) continue;
    const nv = Math.round(v * lerp(1, t.valueMul, wDark));
    d[i] = d[i + 1] = d[i + 2] = nv;
    const boosted = 255 * Math.pow(a / 255, t.alphaGamma);
    d[i + 3] = Math.round(lerp(a, boosted, wDark));
  }
  oc.putImageData(id, 0, 0);
  return out;
}

/** 홍채 재염색: luma → 회청-네이비 그라데이션 + 림벌 링. 알파·형태 보존. */
function repaintIris(srcCanvas, t) {
  const W = srcCanvas.width;
  const H = srcCanvas.height;
  const ctx = srcCanvas.getContext('2d');
  const id = ctx.getImageData(0, 0, W, H);
  const d = id.data;

  const ramp = (L) => {
    const s = t.stops;
    if (L <= s[0][0]) return s[0][1];
    for (let k = 1; k < s.length; k++) {
      if (L <= s[k][0]) {
        const u = (L - s[k - 1][0]) / (s[k][0] - s[k - 1][0]);
        return [0, 1, 2].map((c) => lerp(s[k - 1][1][c], s[k][1][c], u));
      }
    }
    return s[s.length - 1][1];
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] === 0) continue;
      const L = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      let [r, g, b] = ramp(L);
      // 림벌 링: 홍채 가장자리를 살짝 어둡게 → 또렷한 인상
      const disk = t.disks[x < W / 2 ? 0 : 1];
      const rr = Math.hypot((x - disk.cx) / disk.rx, (y - disk.cy) / disk.ry);
      const ringW = smoothstep(t.ring.start, t.ring.end, rr);
      const mul = 1 - t.ring.maxDarken * ringW;
      d[i] = Math.round(r * mul);
      d[i + 1] = Math.round(g * mul);
      d[i + 2] = Math.round(b * mul);
    }
  }
  ctx.putImageData(id, 0, 0);
  return srcCanvas;
}

/** 프리뷰: 그레이스케일+알파 텍스처에 _Color 틴트를 곱해 살색 배경 위에 근사 렌더 */
function tintPreview(canvas, tint, bg) {
  const W = canvas.width;
  const H = canvas.height;
  const src = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const out = createCanvas(W, H);
  const oc = out.getContext('2d');
  const id = oc.createImageData(W, H);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = src[i + 3] / 255;
    for (let c = 0; c < 3; c++) {
      const lit = (src[i + c] / 255) * tint[c];
      d[i + c] = Math.round(lerp(bg[c], lit, a));
    }
    d[i + 3] = 255;
  }
  oc.putImageData(id, 0, 0);
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const pi = args.indexOf('--preview');
  const previewDir = pi >= 0 ? args[pi + 1] : null;
  fs.mkdirSync(OUT, { recursive: true });
  if (previewDir) fs.mkdirSync(previewDir, { recursive: true });

  const skin = [249, 219, 208];
  const lineTint = [113, 41, 41]; // FaceEyeline/FaceEyelash _Color

  // 5 — 아이라인
  const eyeline = sharpenLine(await loadToCanvas(findTex(5)), TUNE.eyeline);
  fs.writeFileSync(path.join(OUT, '5.png'), eyeline.encodeSync('png'));

  // 7 — 속눈썹
  const eyelash = sharpenLine(await loadToCanvas(findTex(7)), TUNE.eyelash);
  fs.writeFileSync(path.join(OUT, '7.png'), eyelash.encodeSync('png'));

  // 9 — 홍채
  const iris = repaintIris(await loadToCanvas(findTex(9)), TUNE.iris);
  fs.writeFileSync(path.join(OUT, '9.png'), iris.encodeSync('png'));

  if (previewDir) {
    fs.writeFileSync(path.join(previewDir, 'preview-5-eyeline.png'),
      tintPreview(eyeline, lineTint, skin).encodeSync('png'));
    fs.writeFileSync(path.join(previewDir, 'preview-7-eyelash.png'),
      tintPreview(eyelash, lineTint, skin).encodeSync('png'));
    // 홍채는 틴트 흰색 — 살색 배경에 알파 합성만
    fs.writeFileSync(path.join(previewDir, 'preview-9-iris.png'),
      tintPreview(iris, [255, 255, 255], skin).encodeSync('png'));
  }

  console.log('wrote work/edited/5.png, 7.png, 9.png');
}

main().catch((e) => { console.error(e); process.exit(1); });
