// repaint-outfit.mjs — 교복 텍스처를 레퍼런스 트랙탑 무드로 리페인트.
// HSV 색역 선택 + 명도 보존 치환(원본 음영/주름 유지), 지퍼·스트라이프는 UV 직접 드로잉.
// 입력: work/textures/{17,19,20}_*.png → 출력: work/edited/{17,19,20}.png (동일 크기)
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEX = (n) => join(ROOT, 'work/textures', n);
const OUT = (n) => join(ROOT, 'work/edited', n);

// ---------- 색 유틸 ----------
function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max === 0 ? 0 : d / max, max];
}
function hsv2rgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
const clamp01 = (x) => Math.min(1, Math.max(0, x));
function smoothstep(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
function mix(a, b, t) { return a + (b - a) * t; }

const CORAL_H = 342, CORAL_S = 0.50; // #f2799e

async function loadPixels(path) {
  const img = await loadImage(path);
  const cv = createCanvas(img.width, img.height);
  const cx = cv.getContext('2d');
  cx.drawImage(img, 0, 0);
  return { cv, cx, id: cx.getImageData(0, 0, img.width, img.height), w: img.width, h: img.height };
}
function save(cv, cx, id, path) {
  cx.putImageData(id, 0, 0);
  writeFileSync(path, cv.toBuffer('image/png'));
  console.log('wrote', path);
}
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = clamp01(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ---------- 17: Tops (조끼+셔츠) 2048x2048 ----------
// V 개구부(네이비로 바뀐 셔츠 카라밴드 Y 포함) 실측 외곽선 — 팁 (~1025,1055), 중심 x≈1023.
const V_CX = 1023, V_TIP_Y = 1058;
function lerpPts(pts, y) {
  if (y <= pts[0][1]) return pts[0][0];
  for (let k = 1; k < pts.length; k++) {
    if (y <= pts[k][1]) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
      return x0 + (x1 - x0) * (y - y0) / (y1 - y0);
    }
  }
  return pts[pts.length - 1][0];
}
const V_L = [[862, 745], [893, 860], [933, 955], [1013, 1058]]; // 좌측 외곽(바깥) 가장자리
const V_R = [[1188, 745], [1178, 860], [1122, 955], [1038, 1058]]; // 우측 외곽 가장자리
function vEdges(y) { return [lerpPts(V_L, y), lerpPts(V_R, y)]; }
function inVInterior(x, y) {
  if (y < 683 || y > V_TIP_Y + 4) return false;
  const [xl, xr] = vEdges(y);
  return x >= xl - 8 && x <= xr + 8;
}

async function repaintTops() {
  const { cv, cx, id, w, h } = await loadPixels(TEX('17_F00_001_01_Tops_01_CLOTH.png'));
  const d = id.data;
  const bi = (1200 * w + 20) * 4;
  const bg = [d[bi], d[bi + 1], d[bi + 2]]; // 비사용 회청색 배경

  const vestMask = new Uint8Array(w * h);
  // 배경은 단색이므로 엄격 일치만 제외 (근사 네이비 음영 블롭이 배경으로 오인되지 않게)
  const isBg = (i) => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) < 3;

  // 하늘색/파랑(+보라 테두리) → 네이비, 명도 비례 유지
  const blueToNavy = (i, r, g, b, hh, ss, vv) => {
    const st = smoothstep(195, 208, hh) * (1 - smoothstep(282, 300, hh))
      * smoothstep(0.13, 0.28, ss) * smoothstep(0.20, 0.32, vv);
    if (st <= 0.01) return;
    const [nr, ng, nb] = hsv2rgb(226, 0.55, 0.12 + vv * 0.28);
    d[i] = mix(r, nr, st); d[i + 1] = mix(g, ng, st); d[i + 2] = mix(b, nb, st);
  };

  // --- pass 1: 색역 재염색 ---
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (isBg(i)) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const [hh, ss, vv] = rgb2hsv(r, g, b);

      if (y >= 690) {
        if (inVInterior(x, y)) { blueToNavy(i, r, g, b, hh, ss, vv); continue; }
        // 조끼 네이비 → 화이트. 명도 기반 + 밝은 파랑 쉰(조끼 상단 라이닝 번짐)도 화이트로 흡수.
        const st = smoothstep(0.03, 0.055, vv) * Math.max(
          1 - smoothstep(0.62, 0.72, vv),
          smoothstep(0.20, 0.30, ss) * (1 - smoothstep(0.82, 0.90, vv))
        );
        if (st > 0.01) {
          const nv = clamp01((vv - 0.06) / (0.40 - 0.06));
          const tv = 0.66 + 0.32 * nv;
          const ts = Math.min(ss * 0.25, 0.10);
          const [nr, ng, nb] = hsv2rgb(hh, ts, tv);
          d[i] = mix(r, nr, st); d[i + 1] = mix(g, ng, st); d[i + 2] = mix(b, nb, st);
          if (st > 0.4) vestMask[y * w + x] = 1;
        }
        continue;
      }
      // 카라 + 플래킷(파란 팔 x~1176까지): 파랑 → 네이비
      const inCollar = (y < 495 && x >= 600 && x <= 1360);
      const inPlacket = (y >= 296 && y < 690 && x >= 795 && x <= 1205);
      if (inCollar || inPlacket) blueToNavy(i, r, g, b, hh, ss, vv);
    }
  }

  // --- pass 2: 소매 끝 코랄 밴드 (고정 세로 밴드, 밝은 원단 위만 — 어두운 컬링부/보라 테두리 보호) ---
  function cuffBand(x0, x1) {
    for (let y = 60; y <= 680; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * w + x) * 4;
        if (isBg(i)) continue;
        const [hh, ss, vv] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
        if (ss > 0.28) continue; // 보라 아웃라인 등 보호
        const st = smoothstep(0.32, 0.48, vv)
          * smoothstep(x0, x0 + 4, x) * (1 - smoothstep(x1 - 4, x1, x));
        if (st <= 0.01) continue;
        const [nr, ng, nb] = hsv2rgb(CORAL_H, CORAL_S, Math.min(0.97, vv * 0.93));
        d[i] = mix(d[i], nr, st); d[i + 1] = mix(d[i + 1], ng, st); d[i + 2] = mix(d[i + 2], nb, st);
      }
    }
  }
  cuffBand(335, 428);   // 왼쪽 소매 커프(바깥쪽 가장자리 근처)
  cuffBand(1620, 1713); // 오른쪽 소매 커프

  // --- pass 3: 드로잉 ---
  const paintCoral = (i, st, dark = 1) => {
    const vv = Math.max(d[i], d[i + 1], d[i + 2]) / 255;
    const [nr, ng, nb] = hsv2rgb(CORAL_H, CORAL_S + (dark < 1 ? 0.06 : 0), Math.min(0.97, vv * 1.1 * dark));
    d[i] = mix(d[i], nr, st); d[i + 1] = mix(d[i + 1], ng, st); d[i + 2] = mix(d[i + 2], nb, st);
  };
  // V넥 리브 → 코랄 트림 (개구부 가장자리 바깥 16~48px 밴드 + 팁 아래 반원 랩)
  const trimAt = (i, st) => {
    if (st <= 0.01 || isBg(i)) return;
    const vv = Math.max(d[i], d[i + 1], d[i + 2]) / 255;
    if (vv < 0.32) return; // 짙은 가장자리 라인·네이비는 남겨 깊이 유지
    paintCoral(i, st);
  };
  for (let y = 738; y <= V_TIP_Y - 4; y++) {
    const [xl, xr] = vEdges(y);
    for (let x = Math.round(xl) - 44; x <= Math.round(xl) - 8; x++)
      trimAt((y * w + x) * 4, smoothstep(xl - 44, xl - 38, x) * (1 - smoothstep(xl - 13, xl - 8, x)));
    for (let x = Math.round(xr) + 8; x <= Math.round(xr) + 44; x++)
      trimAt((y * w + x) * 4, smoothstep(xr + 8, xr + 13, x) * (1 - smoothstep(xr + 38, xr + 44, x)));
  }
  for (let y = V_TIP_Y - 4; y <= V_TIP_Y + 48; y++) { // 팁 랩 (네이비 Y 팁 아래 반원)
    for (let x = V_CX - 48; x <= V_CX + 48; x++) {
      const dist = Math.hypot(x - (V_CX + 2), y - (V_TIP_Y - 4));
      if (dist > 48) continue;
      trimAt((y * w + x) * 4, 1 - smoothstep(42, 48, dist));
    }
  }
  // 중앙 지퍼 라인 (트림 팁 아래 → 밑단, 앞판 중심 x=1023)
  for (let y = V_TIP_Y + 4; y <= 1912; y++) {
    for (let x = V_CX - 15; x <= V_CX + 15; x++) {
      const m = y * w + x; if (!vestMask[m]) continue;
      const dx = Math.abs(x - V_CX);
      if (dx > 14) continue;
      paintCoral(m * 4, 1 - smoothstep(11, 14, dx), dx <= 3 ? 0.70 : 1); // 중앙 3px는 지퍼 이빨 홈
    }
  }
  // 밑단 골지 코랄 스트라이프
  for (let y = 1795; y <= 1865; y++) {
    const st = smoothstep(1795, 1802, y) * (1 - smoothstep(1858, 1865, y));
    for (let x = 0; x < w; x++) {
      const m = y * w + x; if (!vestMask[m]) continue;
      paintCoral(m * 4, st);
    }
  }
  save(cv, cx, id, OUT('17.png'));
}

// ---------- 19: 목 리본 256x256 (하늘색 → 코랄) ----------
async function repaintRibbon() {
  const { cv, cx, id, w, h } = await loadPixels(TEX('19_F00_001_01_AccessoryNeck_01_CLOTH.png'));
  const d = id.data;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const [hh, ss, vv] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
    const [nr, ng, nb] = hsv2rgb(CORAL_H, Math.min(0.72, ss * 0.72), Math.min(1, vv * 1.06 + 0.02));
    d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
  }
  save(cv, cx, id, OUT('19.png'));
}

// ---------- 20: 스커트 1024x512 (네이비 유지 + 밑단 코랄 스트라이프 1줄) ----------
async function repaintSkirt() {
  const { cv, cx, id, w, h } = await loadPixels(TEX('20_F00_001_01_Bottoms_01_CLOTH.png'));
  const d = id.data;
  const Y0 = 478, Y1 = 506;
  for (let y = Y0; y <= Y1; y++) {
    const band = smoothstep(Y0, Y0 + 3, y) * (1 - smoothstep(Y1 - 3, Y1, y));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [hh, ss, vv] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
      const st = band * smoothstep(0.05, 0.09, vv); // 컬링 검정/짙은 주름 골 유지
      if (st < 0.01) continue;
      const nv = clamp01((vv - 0.05) / (0.30 - 0.05));
      const [nr, ng, nb] = hsv2rgb(CORAL_H, 0.52, 0.46 + 0.50 * nv); // 명도 리매핑 — 주름 음영 보존
      d[i] = mix(d[i], nr, st); d[i + 1] = mix(d[i + 1], ng, st); d[i + 2] = mix(d[i + 2], nb, st);
    }
  }
  save(cv, cx, id, OUT('20.png'));
}

await repaintTops();
await repaintRibbon();
await repaintSkirt();
console.log('done');
