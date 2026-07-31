#!/usr/bin/env node
// Deterministic, offline 12-avatar texture pipeline.
//
// The humanoid mesh, bones and expressions stay byte-for-byte represented by
// the source VRM JSON. Only embedded albedo/mask textures and selected VRM0
// MToon hair material colours are changed.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import {
  embeddedImageBytes,
  imageDimensions,
  loadAvatarCatalog,
  parseGlb,
  resolveBaseModel,
  sha256,
  sniffImageMime,
} from './lib/avatar-pack-common.mjs';
import { getOutfitDesign } from './lib/outfit-designs.mjs';
import { warpFaceGlb, FACE_WARP_PROFILES } from './lib/face-warp.mjs';
import { getEyeProfile } from './lib/eye-profiles.mjs';
import { trimHairGlb } from './lib/hair-trim.mjs';
import { shapeHairpinGlb } from './lib/hairpin-shape.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDITED_IMAGE_INDICES = [0, 5, 7, 8, 9, 11, 15, 17, 19, 20, 21, 28];
// 헤어 길이 컷(img25)은 design.hairCut이 있는 슬러그에서만 편집된다 — 나머지는
// img25 무편집(베이스 바이트 그대로). audit도 같은 규칙으로 슬러그별 검증한다.
const HAIR_IMAGE_INDEX = 25;
// 눈 하이라이트(img10)는 eyeProfile.highlightScale !== 1 인 슬러그만 편집한다
// (v3.1 눈매 표: rabbit/owl/panda 확대, fox/tiger 축소 — 나머지는 무편집).
const HIGHLIGHT_IMAGE_INDEX = 10;
// 스커트(Bottoms) 알베도 — skirtCut 지오메트리 컷의 대상 재질을 찾는 데 쓴다.
const SKIRT_IMAGE_INDEX = 20;
// 헤어핀(HAIR_02) 알베도 — hairpinShape 지오메트리 변형의 대상 재질.
const HAIRPIN_IMAGE_INDEX = 28;

function editedImageIndicesFor(design, eyeProfile) {
  const indices = [...EDITED_IMAGE_INDICES];
  if (design.hairCut != null) indices.push(HAIR_IMAGE_INDEX);
  if (eyeProfile.highlightScale !== 1) indices.push(HIGHLIGHT_IMAGE_INDEX);
  return indices.sort((a, b) => a - b);
}

const DEFAULT_STYLES = [
  {
    species: ['bear', '곰'],
    iris: ['#130f12', '#513023', '#a9683f', '#efbd76', '#fff0c9'],
    hair: ['#4b251e', '#190e13'], skin: '#f2c5ae', blush: '#d97872', lips: '#a64f58',
    line: '#3e252a', eye: { lift: 3, weight: 2, lash: 2, brow: 2 },
    outfit: ['#174c3a', '#f1e2bd', '#d39b3d'], pattern: 'varsity',
  },
  {
    species: ['monkey', '원숭이'],
    iris: ['#17100c', '#603116', '#b76624', '#f2a33b', '#ffe0a0'],
    hair: ['#382016', '#120a08'], skin: '#eeb99d', blush: '#db7665', lips: '#9f4651',
    line: '#4b2521', eye: { lift: 6, weight: 1, lash: 3, brow: -1 },
    outfit: ['#b47716', '#f1c15c', '#6d1f32'], pattern: 'diagonal',
  },
  {
    species: ['turtle', '거북이'],
    iris: ['#061a20', '#0b4a50', '#16928b', '#65d4ba', '#d4fff1'],
    hair: ['#184d4c', '#071f28'], skin: '#edc3ab', blush: '#d47f76', lips: '#a85260',
    line: '#173b3d', eye: { lift: 1, weight: 2, lash: 1, brow: 3 },
    outfit: ['#2b8876', '#c7ead7', '#ef7d3d'], pattern: 'shell',
  },
  {
    species: ['fox', '여우'],
    iris: ['#190d05', '#6d260d', '#c75b19', '#ffae2e', '#fff0a5'],
    hair: ['#9d3d20', '#351018'], skin: '#f3c4ab', blush: '#df716b', lips: '#ad4456',
    line: '#512126', eye: { lift: 9, weight: 2, lash: 4, brow: 4 },
    outfit: ['#b84225', '#f3d3a2', '#342a4f'], pattern: 'chevron',
  },
  {
    species: ['rabbit', 'bunny', '토끼'],
    iris: ['#170d22', '#4e2b75', '#8a67be', '#c2a6ef', '#f5eaff'],
    hair: ['#bfa8c8', '#4d395d'], skin: '#f5c9b8', blush: '#e78391', lips: '#b5516c',
    line: '#513348', eye: { lift: 2, weight: 1, lash: 4, brow: 1 },
    outfit: ['#a98fc4', '#f7e7ef', '#df7696'], pattern: 'dots',
  },
  {
    species: ['cat', '고양이'],
    iris: ['#071221', '#163b66', '#2878ab', '#70c9db', '#e5ffff'],
    hair: ['#26365d', '#0a1028'], skin: '#efc1ad', blush: '#d77c80', lips: '#a34e68',
    line: '#25294c', eye: { lift: 10, weight: 2, lash: 5, brow: 4 },
    outfit: ['#283b70', '#c9d6ef', '#65b8d0'], pattern: 'pinstripe',
  },
  {
    species: ['dog', 'puppy', '개', '강아지'],
    iris: ['#17110b', '#4d331d', '#8a6737', '#d6ae68', '#fff0c0'],
    hair: ['#79563b', '#281b18'], skin: '#efbea4', blush: '#d98272', lips: '#9f4c57',
    line: '#442f2d', eye: { lift: 0, weight: 3, lash: 1, brow: -3 },
    outfit: ['#416594', '#e4ddc9', '#c95e4b'], pattern: 'rugby',
  },
  {
    species: ['red-panda', 'raccoon', '레서판다', '너구리'],
    iris: ['#071a15', '#0d503e', '#238662', '#6cc894', '#d9ffe0'],
    hair: ['#6d2e25', '#201016'], skin: '#eebaa3', blush: '#d8756d', lips: '#a34555',
    line: '#482629', eye: { lift: 7, weight: 3, lash: 3, brow: 5 },
    outfit: ['#702b31', '#d6a46f', '#233d37'], pattern: 'check',
  },
  {
    species: ['tiger', '호랑이'],
    iris: ['#180d02', '#6b3707', '#c1780f', '#f6bd2c', '#fff2a3'],
    hair: ['#b45e22', '#31130c'], skin: '#f0bd9f', blush: '#d77964', lips: '#a8494f',
    line: '#3e211c', eye: { lift: 8, weight: 3, lash: 3, brow: 6 },
    outfit: ['#c7651b', '#241f28', '#f0b42c'], pattern: 'tiger',
  },
  {
    species: ['deer', '사슴'],
    iris: ['#111208', '#3b4a1d', '#70813c', '#b3ba69', '#f4edb0'],
    hair: ['#68503a', '#221817'], skin: '#edbca2', blush: '#d27c71', lips: '#984a57',
    line: '#40302c', eye: { lift: 4, weight: 1, lash: 3, brow: 2 },
    outfit: ['#5d6840', '#d9c6a0', '#9c5b42'], pattern: 'argyle',
  },
  {
    species: ['penguin', '펭귄'],
    iris: ['#07131d', '#123654', '#2f7295', '#80bad0', '#e8fbff'],
    hair: ['#1e2940', '#070b14'], skin: '#f1c6b3', blush: '#df8990', lips: '#ae5267',
    line: '#202b43', eye: { lift: 5, weight: 2, lash: 2, brow: 0 },
    outfit: ['#17283c', '#e9eef2', '#e9a53a'], pattern: 'sailor',
  },
  {
    species: ['otter', '수달'],
    iris: ['#071718', '#124b51', '#287f86', '#6bc0bc', '#dbfff3'],
    hair: ['#554034', '#191617'], skin: '#efbea5', blush: '#d27b70', lips: '#9e4b57',
    line: '#373031', eye: { lift: 2, weight: 2, lash: 2, brow: -2 },
    outfit: ['#28686e', '#c7ded8', '#c78148'], pattern: 'wave',
  },
];

// 헤어 틴트 곱셈 감쇠 보상 (스펙 대비 렌더가 어두운 슬러그만, styleFor에서 적용).
// v3.1 자유 컬러(DESIGN-PACK-V3.1.md 3절) 기준 렌더 실측 보상값 — MToon _Color가
// 그레이스케일 스트랜드(p50 휘도 ≈0.84)에 곱해져 밝은 헤어일수록 한 단계 어둡게
// 렌더되므로, face 샷 하이라이트 밴드가 스펙 hex 근처로 읽히도록 상향한다.
// 다크 컬러(bear/penguin/lion/tiger/owl)는 감쇠가 시각적으로 무시 가능해 무보상.
// 값이 문자열이면 base만 보상, 객체면 { base, shade } 각각 보상한다 — 밝은 셰이드
// 스펙은 _ShadeColor 곱 감쇠도 시각적으로 두드러진다 (panda orbit 뒷머리 실측).
const HAIR_TINT_COMPENSATION = Object.freeze({
  rabbit: '#FBE7B8', // 페일 골드 블론드 #E8D3A4 — 실측 렌더 게인 ≈0.73, 상향 보상
  fox: '#F6F8FC', // 플래티넘 실버 #D9DCE3 — 실측 게인 ≈0.79, 상향 보상 (그레이 잠김 방지)
  // panda: 밀크티 베이지 #C7AD8E 실측 게인 ≈0.78 — base 상향 보상.
  // shade: v3.1 판정 — 스펙 #A9805C(orbit 뒷머리가 초콜릿으로 잠기던 #996E4C 상향)를
  // 렌더 실측 게인 ≈0.80으로 나눠 보상 (#A9805C/0.8 ≈ #D0A072).
  panda: { base: '#DFC9AB', shade: '#D0A072' },
  monkey: '#877873', // 쿨 애시브라운 #6E5F58 — 실측 게인 ≈0.83, 상향 보상
  turtle: '#9A6863', // 로즈 브라운 #8A5A55 — 소폭 상향
  owl: '#6B6C77', // 다크 그레이 애시 #55565E — 실측 순흑 잠김, 그레이로 상향 보상
  elephant: '#B27F4E', // 허니 브라운 #9A6B3F — 실측 게인 ≈0.79, 상향 보상
  giraffe: '#A59B8F', // 그레이지 #8D8378 — 실측 게인 ≈0.80, 상향 보상
});

// The closed-mouth lip paint lives in the face albedo (image 11), while image
// 0 is the mouth interior used by the open-mouth blend shapes. These profiles
// deliberately alter silhouette as well as colour so the twelve faces do not
// inherit the same donor mouth.
const LIP_PROFILES = [
  { width: 0.047, upper: 0.0085, lower: 0.0105, cupid: 0.52, curve: 0.0005, gloss: 0.46, tone: 0.96 },
  { width: 0.055, upper: 0.0075, lower: 0.0110, cupid: 0.32, curve: 0.0018, gloss: 0.34, tone: 0.90 },
  { width: 0.045, upper: 0.0090, lower: 0.0095, cupid: 0.67, curve: -0.0006, gloss: 0.38, tone: 0.86 },
  { width: 0.050, upper: 0.0105, lower: 0.0140, cupid: 0.72, curve: 0.0012, gloss: 0.68, tone: 1.06 },
  { width: 0.052, upper: 0.0080, lower: 0.0110, cupid: 0.86, curve: 0.0002, gloss: 0.42, tone: 1.03 },
  { width: 0.046, upper: 0.0080, lower: 0.0120, cupid: 0.45, curve: 0.0010, gloss: 0.54, tone: 0.88 },
  { width: 0.048, upper: 0.0075, lower: 0.0100, cupid: 0.60, curve: -0.0002, gloss: 0.58, tone: 0.94 },
  { width: 0.049, upper: 0.0100, lower: 0.0110, cupid: 0.93, curve: -0.0008, gloss: 0.30, tone: 0.89 },
  { width: 0.054, upper: 0.0105, lower: 0.0145, cupid: 0.61, curve: 0.0008, gloss: 0.64, tone: 1.02 },
  { width: 0.051, upper: 0.0090, lower: 0.0125, cupid: 0.82, curve: -0.0005, gloss: 0.44, tone: 1.10 },
  { width: 0.047, upper: 0.0085, lower: 0.0150, cupid: 0.40, curve: 0.0013, gloss: 0.60, tone: 0.92 },
  { width: 0.057, upper: 0.0080, lower: 0.0115, cupid: 0.56, curve: 0.0020, gloss: 0.50, tone: 0.98 },
];

function parseArgs(argv) {
  const options = {
    catalog: path.join(ROOT, 'shared', 'avatar-catalog.json'),
    source: null,
    workRoot: path.join(ROOT, 'work', 'avatar-pack'),
    outputRoot: path.join(ROOT, 'public', 'models'),
    concurrency: 3,
    only: null,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (['--catalog', '--source', '--work-root', '--output-root', '--concurrency', '--only'].includes(arg)) {
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      index++;
      if (arg === '--catalog') options.catalog = path.resolve(value);
      if (arg === '--source') options.source = path.resolve(value);
      if (arg === '--work-root') options.workRoot = path.resolve(value);
      if (arg === '--output-root') options.outputRoot = path.resolve(value);
      if (arg === '--concurrency') options.concurrency = Number(value);
      if (arg === '--only') options.only = String(value);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error('--concurrency must be a positive integer');
  }
  options.concurrency = Math.min(3, options.concurrency);
  return options;
}

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function rgbHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return [hue, max === 0 ? 0 : delta / max, max];
}

function hsvRgb(hue, saturation, value) {
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - chroma;
  let rgb;
  if (hue < 60) rgb = [chroma, x, 0];
  else if (hue < 120) rgb = [x, chroma, 0];
  else if (hue < 180) rgb = [0, chroma, x];
  else if (hue < 240) rgb = [0, x, chroma];
  else if (hue < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return rgb.map((part) => 255 * (part + m));
}

function hexRgb(value, fallback) {
  if (Array.isArray(value) && value.length >= 3) {
    const scale = value.every((part) => Number(part) <= 1) ? 255 : 1;
    return value.slice(0, 3).map((part) => clamp(Number(part) * scale, 0, 255));
  }
  const text = String(value ?? fallback ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(text)) {
    return [...text].map((digit) => Number.parseInt(digit + digit, 16));
  }
  if (/^[0-9a-f]{6}$/i.test(text)) {
    return [0, 2, 4].map((offset) => Number.parseInt(text.slice(offset, offset + 2), 16));
  }
  throw new Error(`invalid colour: ${value}`);
}

function rgbHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (!delta) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  if (hue < 0) hue += 360;
  return [hue, saturation, lightness];
}

function hslRgb(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  let rgb;
  if (hue < 60) rgb = [chroma, x, 0];
  else if (hue < 120) rgb = [x, chroma, 0];
  else if (hue < 180) rgb = [0, chroma, x];
  else if (hue < 240) rgb = [0, x, chroma];
  else if (hue < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return rgb.map((value) => 255 * (value + m));
}

function paletteValue(entry, keys, fallback) {
  const containers = [
    entry.palette,
    entry.style?.palette,
    entry.appearance?.palette,
    entry.style,
    entry.appearance,
    entry,
  ].filter(Boolean);
  for (const container of containers) {
    for (const key of keys) {
      if (container[key] !== undefined) return container[key];
    }
  }
  return fallback;
}

function styleFor(entry, index) {
  const searchable = [
    entry.slug,
    entry.animal,
    entry.species,
    entry.name,
    entry.title,
  ].filter(Boolean).join(' ').toLowerCase();
  const matched = DEFAULT_STYLES.find((style) => style.species.some((alias) => searchable.includes(alias)));
  const base = matched ?? DEFAULT_STYLES[index % DEFAULT_STYLES.length];
  const irisOverride = paletteValue(entry, ['iris', 'irisGradient', 'eyeGradient'], base.iris);
  const iris = Array.isArray(irisOverride) && irisOverride.length >= 2
    ? irisOverride
    : irisOverride && typeof irisOverride === 'object'
      ? [
        irisOverride.dark,
        irisOverride.mid,
        irisOverride.light,
      ].filter(Boolean)
      : base.iris;
  const outfitOverride = paletteValue(entry, ['outfit', 'outfitColors'], null);
  const outfit = Array.isArray(outfitOverride) && outfitOverride.length >= 3
    ? outfitOverride
    : entry.palette?.primary && entry.palette?.secondary && entry.palette?.accent
      ? [entry.palette.primary, entry.palette.secondary, entry.palette.accent]
      : base.outfit;
  const hairOverride = paletteValue(entry, ['hair', 'hairColors'], base.hair);
  let hair = Array.isArray(hairOverride) && hairOverride.length >= 2
    ? hairOverride
    : hairOverride && typeof hairOverride === 'object' && hairOverride.base && hairOverride.shade
      ? [hairOverride.base, hairOverride.shade]
      : base.hair;
  // MToon _Color는 그레이스케일 스트랜드(img25, 최대 휘도 <1)에 곱해지므로 렌더는
  // 스펙 hex보다 한 단계 어둡다. 카탈로그 스펙은 그대로 두고 밝은 헤어에서 감쇠가
  // 두드러지는 슬러그만 여기서 틴트를 상향 보상한다(rabbit 애시라벤더 #B7A8C0가
  // 슬레이트로 렌더되던 지적 → #C8BCD2).
  const tintCompensation = HAIR_TINT_COMPENSATION[entry.slug];
  if (typeof tintCompensation === 'string') {
    hair = [tintCompensation, hair[1]];
  } else if (tintCompensation) {
    hair = [tintCompensation.base ?? hair[0], tintCompensation.shade ?? hair[1]];
  }
  // v3.1: 눈매는 eyeSharpen 파생이 아니라 슬러그별 프로필(DESIGN-PACK-V3.1 1절 표).
  // eyeSharpen은 이제 런타임 표정(angry) 전용 아트 스코어로만 남는다.
  const eyeProfile = getEyeProfile(entry.slug);
  // 눈썹 틴트: 새 헤어색(스펙, 보상 전) 동조 — img8은 그레이스케일로 유지하고
  // FaceBrow materialPatch가 색을 소유한다 (work/NOTES.md 틴트 규약).
  const hairSpec = Array.isArray(hairOverride) && hairOverride.length >= 2
    ? hairOverride[0]
    : hairOverride?.base ?? base.hair[0];
  const [browHue, browSat, browLight] = rgbHsl(...hexRgb(hairSpec));
  const browTint = hslRgb(browHue, clamp(browSat * 0.85, 0, 1), clamp(browLight * 0.72, 0.08, 0.60));
  const browShade = hslRgb(browHue - 6, clamp(browSat * 0.85, 0, 1), clamp(browLight * 0.45, 0.05, 0.42));
  return {
    ...base,
    iris: iris.map((colour) => hexRgb(colour)),
    hair: hair.slice(0, 2).map((colour) => hexRgb(colour)),
    skin: hexRgb(paletteValue(entry, ['skin', 'skinColor', 'skinTone'], base.skin)),
    blush: hexRgb(paletteValue(entry, ['blush', 'blushColor'], base.blush)),
    lips: hexRgb(paletteValue(entry, ['lips', 'lip', 'lipColor'], base.lips)),
    line: hexRgb(paletteValue(
      entry,
      ['line', 'eyeLine', 'eyeline'],
      entry.palette?.dark ?? base.line,
    )),
    outfit: outfit.slice(0, 3).map((colour) => hexRgb(colour)),
    design: getOutfitDesign(entry),
    eyeProfile,
    browTint,
    browShade,
    lip: LIP_PROFILES[index % LIP_PROFILES.length],
    variantIndex: index,
  };
}

/** 디자인 hex → HSV 타깃. */
const hsvOf = (hex) => rgbHsv(...hexRgb(hex));

async function canvasFrom(bytes) {
  const image = await loadImage(bytes);
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  return canvas;
}

function pngBuffer(canvas) {
  return canvas.encodeSync('png');
}

function rampColour(stops, amount) {
  const scaled = clamp(amount) * (stops.length - 1);
  const left = Math.min(stops.length - 2, Math.floor(scaled));
  const fraction = scaled - left;
  return [0, 1, 2].map((channel) => mix(stops[left][channel], stops[left + 1][channel], fraction));
}

/** 좌/우 반쪽을 각자 앵커(cx, cy) 기준으로 스케일 — 반쪽 경계 클립으로 침범 방지. */
function scaleHalves(canvas, scale, anchors) {
  const output = createCanvas(canvas.width, canvas.height);
  const context = output.getContext('2d');
  context.imageSmoothingEnabled = true;
  const half = canvas.width / 2;
  for (let side = 0; side < 2; side++) {
    const [cx, cy] = anchors[side];
    context.save();
    context.beginPath();
    context.rect(side * half, 0, half, canvas.height);
    context.clip();
    context.drawImage(
      canvas,
      side * half, 0, half, canvas.height,
      cx + (side * half - cx) * scale,
      cy * (1 - scale),
      half * scale,
      canvas.height * scale,
    );
    context.restore();
  }
  return output;
}

async function editIris(bytes, style) {
  const canvas = await canvasFrom(bytes);
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const centres = [
    [canvas.width * 0.25, canvas.height * 0.50],
    [canvas.width * 0.75, canvas.height * 0.50],
  ];
  const radiusX = canvas.width * 0.122;
  const radiusY = canvas.height * 0.274;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      if (data[offset + 3] === 0) continue;
      const luminance = clamp(
        (data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114) / 255,
      );
      const centre = centres[x < canvas.width / 2 ? 0 : 1];
      const radius = Math.hypot((x - centre[0]) / radiusX, (y - centre[1]) / radiusY);
      const rim = clamp((radius - 0.72) / 0.28);
      const pupil = clamp((0.38 - radius) / 0.25);
      const verticalGlow = clamp((y / canvas.height - 0.35) / 0.48);
      const mapped = clamp(luminance * 0.72 + verticalGlow * 0.24 - rim * 0.22 - pupil * 0.12);
      const colour = rampColour(style.iris, mapped);
      for (let channel = 0; channel < 3; channel++) {
        const preserved = data[offset + channel] * 0.08;
        data[offset + channel] = Math.round(clamp(colour[channel] * 0.92 + preserved, 0, 255));
      }
    }
  }
  context.putImageData(image, 0, 0);
  // v3.1 irisScale: 재색칠 후 홍채 중심 기준 스케일 (동공은 중심에 있어 위치 불변).
  const irisScale = style.eyeProfile.irisScale;
  if (irisScale !== 1) return pngBuffer(scaleHalves(canvas, irisScale, centres));
  return pngBuffer(canvas);
}

// 하이라이트(img10): 종별 확대/축소 — rabbit/owl/panda 대형 원형 유지·소폭 확대,
// fox/tiger 축소 샤프(v3.1 표). 각 반쪽의 알파 중심(무게중심)을 앵커로 스케일해
// 하이라이트 위치(홍채 대비 오프셋)는 유지한다. highlightScale 1.0이면 호출되지 않는다.
async function editHighlight(bytes, style) {
  const canvas = await canvasFrom(bytes);
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const half = canvas.width / 2;
  const anchors = [];
  for (let side = 0; side < 2; side++) {
    let sumX = 0;
    let sumY = 0;
    let sumAlpha = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = side * half; x < (side + 1) * half; x++) {
        const alpha = data[(y * canvas.width + x) * 4 + 3];
        if (alpha === 0) continue;
        sumX += x * alpha;
        sumY += y * alpha;
        sumAlpha += alpha;
      }
    }
    if (sumAlpha === 0) throw new Error('editHighlight: half image has no opaque pixels');
    anchors.push([sumX / sumAlpha, sumY / sumAlpha]);
  }
  return pngBuffer(scaleHalves(canvas, style.eyeProfile.highlightScale, anchors));
}

// ---------------------------------------------------------------------------
// 눈매 (5 아이라인 / 7 속눈썹 / 8 눈썹) — v3.1 프로필 기반 (scripts/lib/eye-profiles.mjs).
// 텍스처 1024x256, 좌우 눈이 나란히, 눈꼬리가 텍스처 좌우 가장자리(work/NOTES.md).
// 알파가 형태를 결정하므로 모든 변형은 캔버스 변환(알파 동반)으로 수행한다.
// ---------------------------------------------------------------------------

// 아랫라인/애교살 블롭 실측 존 (1024 기준: 좌 x240~410, 우 x615~785, y108~145) —
// 눈꼬리 윙 하단(x<150, x>890)은 제외해 윙 실루엣을 보존한다.
const LOWER_LID_ZONES = [[0.195, 0.43], [0.57, 0.805]]; // x/width
const LOWER_LID_TOP = 0.42; // y/height (108/256)
const DONOR_LOWER_PRESENCE = 0.4; // 도너 아랫라인 존재감의 프로필 축 상 위치
const BROW_CENTER_Y = 132 / 256; // 눈썹 획 세로 스케일 앵커
const LASH_BASELINE_Y = 130 / 256; // 속눈썹 가닥 길이 스케일 앵커 (눈꺼풀 라인)

/** 컬럼별 수직 시프트 (+값 = 위로). 눈꼬리 가중은 텍스처 가장자리에서 최대. */
function columnShift(x, width, role, profile) {
  const half = width / 2;
  const withinHalf = x < half ? x / half : (x - half) / half;
  if (role === 'brow') {
    const brow = profile.brow;
    // 좌 반쪽은 x=0 이 눈꼬리(바깥), 우 반쪽은 x=width-1 이 눈꼬리.
    const signedOuter = x < half ? 1 - 2 * withinHalf : 2 * withinHalf - 1;
    return brow.arch * Math.sin(Math.PI * withinHalf)
      + brow.tilt * Math.max(0, signedOuter)
      + brow.raise;
  }
  // 눈꼬리 가중: 실측 콘텐츠 기준 윙(좌 x≈85..140, local 0.17..0.27)에서 ≈1.0,
  // 눈 중앙(local ≥0.52)에서 0 — 표의 lift px가 눈꼬리에서 실제 px로 읽히게 한다.
  const local = x < half ? x / half : (width - 1 - x) / half;
  const outer = Math.pow(clamp((0.52 - local) / 0.35), 1.25);
  const roleScale = role === 'lash' ? 0.72 : 1;
  return profile.lift * outer * roleScale - profile.drop;
}

/** 아이라인(5) 전처리: 아랫라인/애교살 알파 게인 (lower 0..1, 도너 ≈0.4). */
function applyLowerLidPresence(canvas, lower) {
  const gain = clamp(lower / DONOR_LOWER_PRESENCE, 0, 1.6);
  if (Math.abs(gain - 1) < 0.01) return;
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const top = Math.round(canvas.height * LOWER_LID_TOP);
  for (const [left, right] of LOWER_LID_ZONES) {
    const x0 = Math.round(canvas.width * left);
    const x1 = Math.round(canvas.width * right);
    for (let y = top; y < canvas.height; y++) {
      for (let x = x0; x <= x1; x++) {
        const offset = (y * canvas.width + x) * 4;
        if (data[offset + 3] === 0) continue;
        data[offset + 3] = Math.round(clamp(data[offset + 3] * gain, 0, 255));
      }
    }
  }
  context.putImageData(image, 0, 0);
}

/** 속눈썹(7) 전처리: 가닥 길이 스케일 (베이스라인 앵커, 위로 성장). */
function applyLashLength(canvas, length) {
  if (Math.abs(length - 1) < 0.01) return canvas;
  const baseline = Math.round(canvas.height * LASH_BASELINE_Y);
  const output = createCanvas(canvas.width, canvas.height);
  const context = output.getContext('2d');
  context.imageSmoothingEnabled = true;
  // 베이스라인 아래(눈꺼풀 접합부)는 원본 유지, 위(가닥)만 세로 스케일.
  context.drawImage(
    canvas,
    0, 0, canvas.width, baseline,
    0, baseline - baseline * length, canvas.width, baseline * length,
  );
  context.drawImage(
    canvas,
    0, baseline, canvas.width, canvas.height - baseline,
    0, baseline, canvas.width, canvas.height - baseline,
  );
  // 최장 가닥이 캔버스 상단에 클립될 때 잘린 단면이 아니라 팁으로 읽히게 페이드.
  const image = context.getImageData(0, 0, output.width, output.height);
  const data = image.data;
  const fadeRows = 6;
  for (let y = 0; y < fadeRows; y++) {
    const factor = y / fadeRows;
    for (let x = 0; x < output.width; x++) {
      const offset = (y * output.width + x) * 4;
      data[offset + 3] = Math.round(data[offset + 3] * factor);
    }
  }
  context.putImageData(image, 0, 0);
  return output;
}

/** 눈썹(8) 전처리: 획 두께(세로 스케일) + 길이(눈썹 중심 가로 스케일). */
function applyBrowShape(canvas, brow) {
  if (Math.abs(brow.thick - 1) < 0.01 && Math.abs(brow.length - 1) < 0.01) return canvas;
  const output = createCanvas(canvas.width, canvas.height);
  const context = output.getContext('2d');
  context.imageSmoothingEnabled = true;
  const half = canvas.width / 2;
  const centerY = canvas.height * BROW_CENTER_Y;
  for (let side = 0; side < 2; side++) {
    const cx = canvas.width * (0.25 + 0.5 * side);
    context.save();
    context.beginPath();
    context.rect(side * half, 0, half, canvas.height);
    context.clip();
    context.drawImage(
      canvas,
      side * half, 0, half, canvas.height,
      cx + (side * half - cx) * brow.length,
      centerY * (1 - brow.thick),
      half * brow.length,
      canvas.height * brow.thick,
    );
    context.restore();
  }
  return output;
}

async function editEyeLine(bytes, style, role) {
  const profile = style.eyeProfile;
  let source = await canvasFrom(bytes);

  // --- 역할별 전처리 (시프트 전, 원본 좌표계에서) ---
  if (role === 'line') {
    applyLowerLidPresence(source, profile.lower);
    // 반개 직선화 (turtle): 눈꺼풀 라인 앵커로 윗라인만 세로 압축 — 아치가 눌려
    // 직선에 가까워진다. applyLashLength가 같은 앵커(y≈130) 세로 스케일을 소유.
    const lineSquash = profile.lineSquash ?? 1;
    if (Math.abs(lineSquash - 1) >= 0.01) source = applyLashLength(source, lineSquash);
  }
  if (role === 'lash') source = applyLashLength(source, profile.lash.length);
  if (role === 'brow') source = applyBrowShape(source, profile.brow);

  // --- 컬럼 수직 시프트 (눈꼬리 lift/처짐, 눈썹 아치/틸트/레이즈) ---
  const shifted = createCanvas(source.width, source.height);
  const shiftedContext = shifted.getContext('2d');
  shiftedContext.imageSmoothingEnabled = true;
  for (let x = 0; x < source.width; x++) {
    const dy = columnShift(x, source.width, role, profile);
    shiftedContext.drawImage(source, x, 0, 1, source.height, x, -dy, 1, source.height);
  }

  // --- 두께 (위 방향 프랙셔널 딜레이션; brow는 전처리 세로 스케일이 두께 소유) ---
  const output = createCanvas(source.width, source.height);
  const outputContext = output.getContext('2d');
  const thickness = role === 'line'
    ? 2 * profile.thick
    : role === 'lash'
      ? clamp(1 + profile.thick * 1.6 + Math.max(0, profile.lift) * 0.10, 1, 5)
      : 0;
  for (let offset = Math.ceil(thickness); offset >= 1; offset--) {
    const partial = clamp(thickness - (offset - 1));
    outputContext.globalAlpha = (0.42 + 0.45 * (1 - offset / (thickness + 1))) * partial;
    outputContext.drawImage(shifted, 0, -offset);
    if (role === 'lash') outputContext.drawImage(shifted, offset * 0.25, 0);
  }
  outputContext.globalAlpha = 1;
  outputContext.drawImage(shifted, 0, 0);

  // --- 재색칠: line/lash 는 팔레트 라인색 (머티리얼 틴트 113,41,41 곱 전제),
  //     brow 는 그레이스케일 유지 — 색은 FaceBrow materialPatch(헤어 동조)가 소유.
  //     알파 감마 0.72 부스트는 공통 (알파가 형태를 결정 — work/NOTES.md).
  const image = outputContext.getImageData(0, 0, output.width, output.height);
  const data = image.data;
  const half = output.width / 2;
  const outerBoost = role === 'lash' ? profile.lash.outerBoost : 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue;
    const luminance = (data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114) / 255;
    const amount = 0.38 + luminance * 0.62;
    for (let channel = 0; channel < 3; channel++) {
      data[offset + channel] = Math.round(
        (role === 'brow' ? 255 : style.line[channel]) * amount,
      );
    }
    let alpha = 255 * Math.pow(data[offset + 3] / 255, 0.72);
    if (outerBoost > 0) {
      // 폭스아이/캣아이: 눈꼬리 존 가닥 강조 (알파 게인).
      const x = (offset / 4) % output.width;
      const local = x < half ? x / half : (output.width - 1 - x) / half;
      alpha *= 1 + outerBoost * 0.55 * smoothstep(0.62, 1, 1 - local);
    }
    data[offset + 3] = Math.round(clamp(alpha, 0, 255));
  }
  outputContext.putImageData(image, 0, 0);
  return pngBuffer(output);
}

function tintKeepingDetail(source, target, sourceLuminance, strength = 1) {
  const targetHsl = rgbHsl(...target);
  const detailLightness = clamp(
    targetHsl[2] * 0.66 + sourceLuminance * 0.42 - 0.04,
    0.025,
    0.985,
  );
  const colour = hslRgb(targetHsl[0], targetHsl[1], detailLightness);
  return colour.map((value, channel) => mix(source[channel], value, strength));
}

function paintFaceLips(canvas, style) {
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const profile = style.lip;
  const [lipHue, lipSaturation, lipLightness] = rgbHsl(...style.lips);
  const saturation = clamp(lipSaturation * profile.tone, 0.18, 0.92);
  const upperColour = hslRgb(
    lipHue,
    saturation,
    clamp(lipLightness * 0.80 - 0.018, 0.12, 0.78),
  );
  const lowerColour = hslRgb(
    lipHue,
    clamp(saturation * 0.91),
    clamp(lipLightness * 1.08 + 0.018, 0.18, 0.86),
  );
  const seamColour = hslRgb(
    lipHue,
    clamp(saturation * 0.94),
    clamp(lipLightness * 0.49, 0.08, 0.48),
  );
  const centreV = 0.757 + ((style.variantIndex % 3) - 1) * 0.00055;
  const minX = Math.max(0, Math.floor(canvas.width * (0.5 - profile.width - 0.004)));
  const maxX = Math.min(canvas.width - 1, Math.ceil(canvas.width * (0.5 + profile.width + 0.004)));
  const minY = Math.max(0, Math.floor(canvas.height * (centreV - profile.upper - 0.004)));
  const maxY = Math.min(canvas.height - 1, Math.ceil(canvas.height * (centreV + profile.lower + 0.004)));

  for (let y = minY; y <= maxY; y++) {
    const v = (y + 0.5) / canvas.height;
    for (let x = minX; x <= maxX; x++) {
      const u = (x + 0.5) / canvas.width;
      const dx = (u - 0.5) / profile.width;
      const absX = Math.abs(dx);
      if (absX >= 1) continue;

      // Twin upper peaks and a shallow centre cleft form the cupid bow.
      const peaks = Math.exp(-(((absX - 0.29) / 0.19) ** 2));
      const cleft = Math.exp(-((absX / 0.105) ** 2));
      const taper = Math.max(0, 1 - absX ** 1.58);
      const upperFactor = clamp(
        taper * (0.58 + peaks * (0.33 + profile.cupid * 0.18) - cleft * profile.cupid * 0.20),
        0,
        1.18,
      );
      const lowerFactor = clamp(
        (1 - absX ** 1.72) * (0.92 + Math.cos(dx * Math.PI) * 0.08),
        0,
        1,
      );
      const seamV = centreV + profile.curve * (1 - dx * dx);
      const topV = seamV - profile.upper * upperFactor;
      const bottomV = seamV + profile.lower * lowerFactor;
      const edgeX = clamp((1 - absX) * profile.width * canvas.width / 1.35);
      let coverage = 0;
      let target = null;
      if (v >= topV && v <= seamV) {
        coverage = clamp((v - topV) * canvas.height / 1.35) * edgeX;
        target = upperColour;
      } else if (v > seamV && v <= bottomV) {
        coverage = clamp((bottomV - v) * canvas.height / 1.35) * edgeX;
        target = lowerColour;
      }
      const offset = (y * canvas.width + x) * 4;
      if (coverage > 0 && target) {
        const vertical = clamp((v - topV) / Math.max(0.00001, bottomV - topV));
        const strength = coverage * (0.68 + 0.12 * Math.sin(vertical * Math.PI));
        for (let channel = 0; channel < 3; channel++) {
          data[offset + channel] = Math.round(mix(data[offset + channel], target[channel], strength));
        }
      }

      // Keep a soft mouth seam even at low output resolution.
      const seamDistance = Math.abs(v - seamV) * canvas.height;
      const seamAlpha = Math.exp(-((seamDistance / 0.78) ** 2))
        * clamp((1 - absX) * 4.5)
        * (0.56 + profile.cupid * 0.10);
      if (seamAlpha > 0.015) {
        for (let channel = 0; channel < 3; channel++) {
          data[offset + channel] = Math.round(
            mix(data[offset + channel], seamColour[channel], seamAlpha),
          );
        }
      }

      // A restrained lower-lip highlight supplies the 2.5D glossy volume.
      const glossX = (dx + 0.11 - (style.variantIndex % 2) * 0.08) / 0.42;
      const glossV = (
        v - (seamV + profile.lower * (0.38 + (style.variantIndex % 3) * 0.035))
      ) / Math.max(0.001, profile.lower * 0.20);
      const gloss = Math.exp(-(glossX * glossX * 1.8 + glossV * glossV * 2.4))
        * profile.gloss
        * coverage;
      if (gloss > 0.01) {
        const highlight = hslRgb(lipHue, saturation * 0.40, clamp(lipLightness + 0.32));
        for (let channel = 0; channel < 3; channel++) {
          data[offset + channel] = Math.round(
            mix(data[offset + channel], highlight[channel], gloss * 0.58),
          );
        }
      }
    }
  }
  context.putImageData(image, 0, 0);
}

async function editFaceSkin(bytes, style) {
  const canvas = await canvasFrom(bytes);
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const cheeks = [
    [canvas.width * 0.30, canvas.height * 0.665],
    [canvas.width * 0.70, canvas.height * 0.665],
  ];
  const blushWidth = canvas.width * (0.115 + (style.variantIndex % 3) * 0.008);
  const blushHeight = canvas.height * (0.052 + (style.variantIndex % 2) * 0.008);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      if (data[offset + 3] === 0) continue;
      const source = [data[offset], data[offset + 1], data[offset + 2]];
      const luminance = (source[0] * 0.299 + source[1] * 0.587 + source[2] * 0.114) / 255;
      let colour = tintKeepingDetail(source, style.skin, luminance, 0.68);
      let blushAmount = 0;
      for (const [cx, cy] of cheeks) {
        const radius = ((x - cx) / blushWidth) ** 2 + ((y - cy) / blushHeight) ** 2;
        blushAmount = Math.max(blushAmount, Math.exp(-radius * 2.2));
      }
      blushAmount *= 0.10 + (style.variantIndex % 4) * 0.015;
      colour = colour.map((value, channel) => mix(value, style.blush[channel], blushAmount));
      data[offset] = Math.round(clamp(colour[0], 0, 255));
      data[offset + 1] = Math.round(clamp(colour[1], 0, 255));
      data[offset + 2] = Math.round(clamp(colour[2], 0, 255));
    }
  }
  context.putImageData(image, 0, 0);

  // A few variants get subtle, UV-stable freckles. They are deliberately
  // painted onto the face albedo, never onto the rig or geometry.
  if ([0, 3, 7, 9, 11].includes(style.variantIndex)) {
    context.fillStyle = `rgba(${style.line.map(Math.round).join(',')},0.22)`;
    const freckleRows = [
      [-0.105, 0.645], [-0.075, 0.651], [-0.045, 0.646],
      [0.045, 0.646], [0.075, 0.651], [0.105, 0.645],
    ];
    for (const [dx, y] of freckleRows) {
      context.beginPath();
      context.arc(
        canvas.width * (0.5 + dx),
        canvas.height * y,
        1.25 + (style.variantIndex % 2) * 0.5,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }
  paintFaceLips(canvas, style);
  return pngBuffer(canvas);
}

async function editMouth(bytes, style) {
  const canvas = await canvasFrom(bytes);
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const lipHsl = rgbHsl(...style.lips);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      const [hue, saturation, lightness] = rgbHsl(
        data[offset],
        data[offset + 1],
        data[offset + 2],
      );
      const isMouthSurface = saturation > 0.18 && (hue <= 34 || hue >= 320);
      if (!isMouthSurface) continue;
      const cavity = y > canvas.height * 0.50
        || (x > canvas.width * 0.50 && y < canvas.height * 0.28 && lightness < 0.52);
      const lightnessScale = cavity
        ? 0.50 + (style.variantIndex % 3) * 0.035
        : 0.74 + (style.variantIndex % 4) * 0.025;
      const tinted = hslRgb(
        lipHsl[0],
        clamp(lipHsl[1] * style.lip.tone * (0.76 + saturation * 0.30)),
        clamp(lightness * lightnessScale + lipHsl[2] * (cavity ? 0.10 : 0.22)),
      );
      data[offset] = Math.round(tinted[0]);
      data[offset + 1] = Math.round(tinted[1]);
      data[offset + 2] = Math.round(tinted[2]);
    }
  }
  context.putImageData(image, 0, 0);
  return pngBuffer(canvas);
}

async function editBodySkin(bytes, style) {
  const canvas = await canvasFrom(bytes);
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const donorReplacement = tintKeepingDetail([240, 198, 176], style.skin, 0.78, 0.70);
  const replacementHsl = rgbHsl(...donorReplacement);
  const wristbandTarget = hsvOf(style.design.wristband);
  const sleevesTarget = style.design.sleeves ? hsvOf(style.design.sleeves) : null;
  const socksHsl = rgbHsl(...hexRgb(style.design.socks));
  // 도너 니삭스: 다리 스트립 하단의 다크그레이 블록 (실측 y>=1555, x0~489 / x1558~2047).
  // 아래 중화 휴리스틱이 피부로 지우던 영역 — 대신 팔레트 socks 색으로 재염색한다.
  // 경계는 재작도하지 않는다: 무채색 판정에 걸리는 픽셀만 색을 바꿔 원본 실루엣 유지.
  const sockZoneTop = canvas.height * 0.7300; // 1495/2048 — 삭스 상단 에지(1555)보다 위
  const sockStripLeft = canvas.width * 0.2417; // 495/2048
  const sockStripRight = canvas.width * 0.7578; // 1552/2048
  // 발등/뒤꿈치/발목 로브 상단 (중앙 존, 본-웨이트 UV 실측: 풋 본 정점 V 1152~1645).
  const footSockZoneTop = canvas.height * 0.5615; // 1150/2048
  // avatar.vrm 유래 페인트 좌표 (placeholder↔avatar img15 픽셀 diff 실측):
  // 팔 스트립 x<=455 / x>=1465, 소매 화이트 y<945, 손목 밴드 코랄 y952~1000.
  const armStripLimit = { left: canvas.width * 0.2222, right: canvas.width * 0.7154 };
  const bandTop = Math.round(canvas.height * 0.4614); // 945/2048
  const bandBottom = Math.round(canvas.height * 0.4932); // 1010/2048

  for (let y = 0; y < canvas.height; y++) {
    const v = (y + 0.5) / canvas.height;
    for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      if (data[offset + 3] === 0) continue;
      const source = [data[offset], data[offset + 1], data[offset + 2]];
      const [hue, saturation, lightness] = rgbHsl(...source);
      const u = (x + 0.5) / canvas.width;

      // 팔 스트립의 소매/손목밴드 페인트는 피부 분류기에 넘기지 않는다:
      // 흰 긴팔 페인트는 유지(선택 재염색), 코랄 밴드는 디자인 색으로 재염색.
      const inArmStrip = x <= armStripLimit.left || x >= armStripLimit.right;
      if (inArmStrip && y <= bandBottom) {
        if (y >= bandTop) {
          const [hsvHue, hsvSat, hsvVal] = rgbHsv(...source);
          if ((hsvHue > 330 || hsvHue < 12) && hsvSat > 0.28 && hsvVal > 0.40) {
            const [r, g, b] = hsvRgb(
              wristbandTarget[0],
              wristbandTarget[1],
              clamp(wristbandTarget[2] * (0.50 + 0.58 * hsvVal), 0.02, 0.99),
            );
            data[offset] = Math.round(r);
            data[offset + 1] = Math.round(g);
            data[offset + 2] = Math.round(b);
          }
          continue; // 밴드 존의 나머지(소매 가장자리 등)는 그대로
        }
        if (sleevesTarget && saturation < 0.15 && lightness > 0.70) {
          const [, , hsvVal] = rgbHsv(...source);
          const [r, g, b] = hsvRgb(
            sleevesTarget[0],
            sleevesTarget[1],
            clamp(sleevesTarget[2] * (0.45 + 0.60 * hsvVal), 0.02, 0.99),
          );
          data[offset] = Math.round(r);
          data[offset + 1] = Math.round(g);
          data[offset + 2] = Math.round(b);
        }
        continue; // 소매 존: 화이트 페인트/컬링 검정 유지
      }

      // 니삭스: 다리 스트립의 무채색(그레이) 픽셀만 재염색. 채도가 있는 피부와
      // 안티에일리어스 경계 픽셀은 건드리지 않아 원본 삭스 실루엣이 그대로 남는다.
      const inSockZone = y >= sockZoneTop && (x <= sockStripLeft || x >= sockStripRight);
      // 발등/뒤꿈치/발목: 풋 본에 가중된 정점은 중앙 존 y1150~1650의 다크그레이
      // 로브(#382F31 계열)를 샘플한다. 스트립만 재염색하면 이 로브가 아래 중화
      // 휴리스틱에 걸려 피부색이 되어 삭스와 로퍼 사이 맨살 밴드가 노출된다
      // (monkey/fox 지적). 도너/플라밍고처럼 삭스색으로 이어 신발 안까지 연속시킨다.
      // lightness<0.46 게이트가 속옷 연블루 에지(#98A1B9, l≈0.66)를 보호한다.
      const inFootSockZone = y >= footSockZoneTop
        && x > sockStripLeft && x < sockStripRight
        && lightness < 0.46;
      if ((inSockZone || inFootSockZone) && saturation < 0.32 && lightness > 0.04 && lightness < 0.72) {
        const sockLightness = clamp(socksHsl[2] + (lightness - 0.21) * 0.35, 0.03, 0.97);
        const [r, g, b] = hslRgb(socksHsl[0], socksHsl[1], sockLightness);
        data[offset] = Math.round(r);
        data[offset + 1] = Math.round(g);
        data[offset + 2] = Math.round(b);
        continue;
      }
      const skinLike = lightness > 0.16
        && saturation > 0.075
        && (hue < 48 || hue > 338)
        && source[0] > source[2] + 4;

      // The donor body material bakes grey briefs and nearly neutral dark
      // hosiery/glove blocks into its albedo. Those are part of the skin mesh,
      // not the removable Tops/Bottoms materials. Neutralising them prevents
      // underwear flashes when procedural shorts or skirts move.
      const neutralDonorWear = (saturation < 0.24 && lightness < 0.42)
        || (
          lightness > 0.05
          && source[2] >= source[0] - 12
          && source[1] >= source[0] - 12
        );
      const underwearUv = u > 0.225 && u < 0.775 && v > 0.445 && v < 0.625;
      const coolBrief = underwearUv
        && source[2] > source[0] - 38
        && source[1] > source[0] - 42;
      if (!skinLike && !neutralDonorWear && !coolBrief) continue;

      let colour;
      if (skinLike && !neutralDonorWear && !coolBrief) {
        // The face uses the same target and detail transfer. Matching its blend
        // strength keeps neck seams small while retaining knuckle/collarbone
        // shading from this much larger 2K body map.
        colour = tintKeepingDetail(source, style.skin, lightness, 0.70);
      } else {
        // Donor garment pixels contain no usable skin chroma. Compress their
        // luminance rather than copying black/blue into the target skin, then
        // add only a broad UV-stable modulation to avoid a flat patch.
        const broadShade = Math.sin((u * 1.7 + v * 0.8) * Math.PI) * 0.010
          - Math.abs(u - 0.5) * 0.012;
        const detailLightness = clamp(
          replacementHsl[2] + (lightness - 0.55) * 0.035 + broadShade,
          0.08,
          0.94,
        );
        colour = hslRgb(
          replacementHsl[0],
          clamp(replacementHsl[1] * 0.90, 0.08, 0.72),
          detailLightness,
        );
      }
      data[offset] = Math.round(clamp(colour[0], 0, 255));
      data[offset + 1] = Math.round(clamp(colour[1], 0, 255));
      data[offset + 2] = Math.round(clamp(colour[2], 0, 255));
    }
  }
  context.putImageData(image, 0, 0);
  return pngBuffer(canvas);
}

// ---------------------------------------------------------------------------
// 헤어 길이 컷 (img25, Hair_01 스트랜드 512x1024) — DESIGN-PACK-V3 "헤어 길이" 레시피.
// 텍스처 하단(v 큼) = 머리끝(실측 corr(v,y)=-0.866). design.hairCut(row) 이하 알파 0,
// 컬럼별 사인 합성 지터 ±10px(결정적 — 시드는 기존 스타일 규칙대로 variantIndex),
// 컷 위 90px RGB 곱 램프 팁 재음영(잘린 면이 아니라 머리끝으로 읽히는 핵심).
// Hair_01 머티리얼은 이미 cutout(_Cutoff 0.5) — 패치 불필요.
//
// v3.1 판정 라운드 수정 3건 (증거샷 실측 기반):
// ① 컷 알파는 하드 에지 — 이전의 22px 페더 램프는 cutout에서 어차피 0.5 미만 구간이
//    보이지 않고, 씬(thin) 스트랜드 밉 축소에서만 컷오프를 넘나들며 대시/점선 조각을
//    만들었다. 지터가 에지 변주를 소유한다.
// ② 팁 재음영 하한은 헤어 base 휘도 연동 — 단 방향은 판정 실측이 결정했다.
//    '눈썹/아이라인 스케치 잔흔'(이마 대시·눈꼬리→귀 점선)의 실제 원인은 눈 텍스처가
//    아니라 이 팁 재음영이다: 5/7/8/14/25 개별 소거 대조 렌더로 실증 — 모든
//    스트랜드가 UV v 전장을 쓰므로 재음영 밴드가 앞머리/베이비헤어 중간(이마 높이)을
//    지나고, 다크 헤어 x 0.38 스텁이 피부 위에서 스케치 선으로 읽혔다(재음영 0 대조
//    렌더에서 잔선 완전 소멸). 따라서 어두운 헤어일수록 하한을 '높게'(스텁이 피부와
//    대비되는 케이스), 밝은 헤어는 ≈0.6(줄무늬가 헤어 위에 얹히는 케이스)으로 완화.
// ③ 팁 재음영은 균등 곱이 아니라 '셰이드 방향' 곱 — 균등 곱은 블론드를 올리브로
//    회전시킨다. 채널별 계수를 카탈로그 hair.shade/base 비율(휘도 정규화)로 기울여
//    렌더 팁이 그 헤어의 셰이드 색으로 읽히게 한다.
// ---------------------------------------------------------------------------

const HAIR_CUT_JITTER = 10; // 컬럼별 컷 라인 변주 진폭(px)
const HAIR_CUT_DARKEN = 64; // 팁 재음영 밴드 높이(px) — 90은 잔선을 이마까지 끌었다
const HAIR_CUT_DARKEN_MIN_DARK = 0.80; // 어두운 헤어 최말단 곱 계수 (v3.1 ②)
const HAIR_CUT_DARKEN_MIN_BRIGHT = 0.62; // 밝은 헤어 최말단 곱 계수 (v3.1 ②)

/** 컬럼별 컷 라인 지터: 사인 합성(진폭 0.5/0.35/0.15), 위상은 variantIndex 시드. */
function hairCutJitter(x, amplitude, seed) {
  return amplitude * (
    0.5 * Math.sin(x * 0.055 + seed * 0.9)
    + 0.35 * Math.sin(x * 0.13 + 1.7 + seed * 1.3)
    + 0.15 * Math.sin(x * 0.31 + 4.2 + seed * 2.1)
  );
}

// v3.2 (버그 수정): 알파 컷을 텍스처에서 제거하고 지오메트리 클리핑으로 옮겼다.
// 실측 근거 — img25 커버리지 99.2%, 텍셀당 world Y 폭 중앙값 0.192(헤어 전체 높이
// 0.570의 34%)로 모든 스트랜드 카드가 같은 UV를 공유한다. 따라서 "행 이하 알파 0"은
// 턱 높이의 롱 스트랜드와 이마를 지나는 베이비헤어를 같은 행에서 동시에 자르고,
// 그 절단면이 이마 중앙에 수평 대시로 남아 '1자 눈썹'처럼 읽혔다.
// 어블레이션(bear): 알파 컷만 끄면 이마 대시가 완전히 소멸하고, 재음영만 끄면
// 그대로 남는다 → 원인은 팁 재음영이 아니라 알파 컷이었다(v3.1 진단 정정).
// 실제 컷은 scripts/lib/hair-trim.mjs가 컷 평면 y = yCut + 지터(x)로 수행하며,
// 이마 위 카드는 y가 평면보다 높아 자동 보존된다. 여기 남은 편집은 팁 재음영뿐이다.
async function editHair(bytes, style) {
  const spec = style.design.hairCut;
  const cutRow = Array.isArray(spec) ? spec[0]?.row : spec;
  if (!Number.isInteger(cutRow) || cutRow <= 0) {
    throw new Error(`editHair called without a valid design.hairCut (${cutRow})`);
  }
  const canvas = await canvasFrom(bytes);
  const width = canvas.width;
  const height = canvas.height;
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  // 팁 재음영 하한(②): 렌더는 그레이스케일 스트랜드 x _Color(base 틴트) 곱이므로
  // base 휘도가 곧 팁 줄무늬의 대비를 결정한다 — 밝을수록 하한을 완화(≈0.58).
  const [hairR, hairG, hairB] = style.hair[0];
  const hairLuminance = (hairR * 0.299 + hairG * 0.587 + hairB * 0.114) / 255;
  const darkenMin = mix(
    HAIR_CUT_DARKEN_MIN_DARK,
    HAIR_CUT_DARKEN_MIN_BRIGHT,
    smoothstep(0.35, 0.85, hairLuminance),
  );
  // 셰이드 방향 계수(③): shade/base 채널 비율을 휘도 정규화(순수 색조 기울기)해
  // 밴드 하한에만 싣는다 — 밝기 감쇠는 darkenMin이, 색조는 이 벡터가 소유한다.
  const [shadeR, shadeG, shadeB] = style.hair[1];
  const ratio = [
    shadeR / Math.max(hairR, 1),
    shadeG / Math.max(hairG, 1),
    shadeB / Math.max(hairB, 1),
  ];
  const ratioLuminance = ratio[0] * 0.299 + ratio[1] * 0.587 + ratio[2] * 0.114;
  const shadeTilt = ratio.map((part) => clamp(part / Math.max(ratioLuminance, 0.01), 0.75, 1.30));
  for (let x = 0; x < width; x++) {
    const edge = cutRow + Math.round(hairCutJitter(x, HAIR_CUT_JITTER, style.variantIndex));
    for (let y = 0; y < height; y++) {
      const offset = (y * width + x) * 4;
      // 알파 컷은 v3.2에서 지오메트리(hair-trim.mjs)로 이동했다 — 텍스처는 팁
      // 재음영만 담당한다. 컷 라인 아래 텍셀은 클리핑으로 렌더에서 사라진다.
      if (y >= edge - HAIR_CUT_DARKEN && y < edge) {
        const t = (edge - y) / HAIR_CUT_DARKEN; // 0 = 컷 라인, 1 = 밴드 상단
        for (let channel = 0; channel < 3; channel++) {
          const factor = mix(darkenMin * shadeTilt[channel], 1, t);
          data[offset + channel] = Math.round(clamp(data[offset + channel] * factor, 0, 255));
        }
      }
    }
  }
  context.putImageData(image, 0, 0);
  return pngBuffer(canvas);
}

// ---------------------------------------------------------------------------
// Tops (img17) v2 — 휘도 휴리스틱 대신 work/NOTES.md UV 좌표 영역 마스크 컬러 블로킹.
// 입력은 반드시 placeholder 원본 니트(다크네이비) 텍스처: 명도 보존 치환으로
// 주름·리브 디테일을 유지하고, 트림/지퍼/모티프는 UV 심을 넘지 않는 위치에 직접 드로잉.
// V 개구부 외곽선 좌표는 scripts/repaint-outfit.mjs(플라밍고 검증 수법)의 실측값.
// ---------------------------------------------------------------------------

const V_CX = 1023;
const V_TIP_Y = 1058;
const V_LEFT = [[862, 745], [893, 860], [933, 955], [1013, 1058]];
const V_RIGHT = [[1188, 745], [1178, 860], [1122, 955], [1038, 1058]];

function lerpPoints(points, y) {
  if (y <= points[0][1]) return points[0][0];
  for (let index = 1; index < points.length; index++) {
    if (y <= points[index][1]) {
      const [x0, y0] = points[index - 1];
      const [x1, y1] = points[index];
      return x0 + (x1 - x0) * (y - y0) / (y1 - y0);
    }
  }
  return points[points.length - 1][0];
}

const vEdges = (y) => [lerpPoints(V_LEFT, y), lerpPoints(V_RIGHT, y)];

function inVInterior(x, y) {
  if (y < 683 || y > V_TIP_Y + 4) return false;
  const [xl, xr] = vEdges(y);
  return x >= xl - 8 && x <= xr + 8;
}

/** 정규 육각형(포인티톱) 포함 판정 — 거북이 헥사 플레이트용. */
function inHex(dx, dy, size) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return ax <= 0.866 * size && ay <= size && (0.866 * ax + 0.5 * ay) <= 0.866 * size;
}

async function editTops(bytes, style) {
  const design = style.design;
  const canvas = await canvasFrom(bytes);
  const width = canvas.width;
  const height = canvas.height;
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;

  // 입력 무결성 가드: 몸판이 원본 다크네이비 니트가 아니면(이미 트랙탑화된 17 등)
  // 명도 리매핑 전제가 무너지므로 즉시 실패한다.
  const probeOffset = (1500 * width + V_CX) * 4;
  if (Math.max(data[probeOffset], data[probeOffset + 1], data[probeOffset + 2]) > 96) {
    throw new Error(
      'editTops: Tops source is not the original placeholder knit '
      + '(vest probe pixel is too bright) — feed placeholder img17',
    );
  }

  const backgroundOffset = (1200 * width + 20) * 4;
  const background = [data[backgroundOffset], data[backgroundOffset + 1], data[backgroundOffset + 2]];
  const isBackground = (offset) => (
    Math.abs(data[offset] - background[0])
    + Math.abs(data[offset + 1] - background[1])
    + Math.abs(data[offset + 2] - background[2])
  ) < 3;

  const vestTarget = hsvOf(design.vest);
  const collarTarget = hsvOf(design.collar);
  const placketTarget = hsvOf(design.placket);
  const trimTarget = hsvOf(design.trim);
  const cuffTarget = design.cuff ? hsvOf(design.cuff) : null;
  const hemTarget = hsvOf(design.hem);
  const zipperTarget = hsvOf(design.zipper);
  const sleevesTarget = design.sleeves ? hsvOf(design.sleeves) : null;

  // 원본 명도 보존용 스냅샷 + 조끼 마스크 (지퍼/밑단/모티프 클리핑).
  const sourceValue = new Float32Array(width * height);
  const vestMask = new Uint8Array(width * height);

  const paintHsv = (offset, target, valueScale, strength) => {
    const [r, g, b] = hsvRgb(target[0], target[1], clamp(valueScale, 0.02, 0.98));
    data[offset] = Math.round(mix(data[offset], r, strength));
    data[offset + 1] = Math.round(mix(data[offset + 1], g, strength));
    data[offset + 2] = Math.round(mix(data[offset + 2], b, strength));
  };
  /** 니트 명도(v0 0.06..0.40)를 타깃 명도 톤 커브로 옮긴다. */
  const knitValue = (target, v0) => target[2] * (0.55 + 0.55 * clamp((v0 - 0.06) / 0.34));
  /** 셔츠 명도(v0 0.15..0.90)를 타깃 명도 톤 커브로 옮긴다. */
  const shirtValue = (target, v0) => target[2] * (0.45 + 0.65 * clamp((v0 - 0.15) / 0.70));

  // --- pass 1: 영역 마스크 컬러 블로킹 (배경 제외, 명도 보존) ---
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const mask = y * width + x;
      const [, saturation, value] = rgbHsv(data[offset], data[offset + 1], data[offset + 2]);
      sourceValue[mask] = value;
      if (isBackground(offset)) continue;

      if (y >= 690) {
        // V 개구부 안쪽 = 셔츠 플래킷 (단추 포함) — 셔츠색으로.
        if (inVInterior(x, y)) {
          paintHsv(offset, placketTarget, shirtValue(placketTarget, value), 0.92);
          continue;
        }
        // 조끼 몸판/밑단/암홀 (y700~1970 니트 + 최하단 컬링 보호) — 플라밍고 검증 게이트.
        const strength = smoothstep(0.03, 0.055, value) * Math.max(
          1 - smoothstep(0.62, 0.72, value),
          smoothstep(0.20, 0.30, saturation) * (1 - smoothstep(0.82, 0.90, value)),
        );
        if (strength > 0.01) {
          paintHsv(offset, vestTarget, knitValue(vestTarget, value), strength);
          if (strength > 0.4) vestMask[mask] = 1;
        }
        continue;
      }

      // 카라 밴드 (상단 중앙 x644~1356, y<300).
      if (y < 300 && x >= 644 && x <= 1356) {
        if (value > 0.12) paintHsv(offset, collarTarget, shirtValue(collarTarget, value), 0.92);
        continue;
      }
      // 플래킷 상부 (중앙 세로 스트립 y296~690).
      if (y >= 296 && y < 690 && x >= 795 && x <= 1205) {
        if (value > 0.12) paintHsv(offset, placketTarget, shirtValue(placketTarget, value), 0.92);
        continue;
      }
      // 카라 안감/그림자 라이트블루 밴드 (실측 #5277CE 계열, y296~600 x612~1408):
      // 카라 마스크(y<300) 밖에 남아 목선 위 가는 하늘색 라인으로 렌더되던 부분
      // (bear 지적). 블루 우세 픽셀만 카라색으로 재도색해 소매 화이트/배경은 보존.
      if (y < 600 && x >= 600 && x <= 1420
        && data[offset + 2] > data[offset] + 20 && data[offset + 2] > 128) {
        paintHsv(offset, collarTarget, shirtValue(collarTarget, value), 0.92);
        continue;
      }
      // 셔츠 소매 2장 (상단 좌/우): 기본은 원본 화이트 유지, 지정 시 재염색.
      if (sleevesTarget && y < 720 && (x < 640 || x >= 1408)) {
        if (value > 0.30 && saturation < 0.40) {
          paintHsv(offset, sleevesTarget, shirtValue(sleevesTarget, value), 0.90);
        }
      }
    }
  }

  // --- pass 2: 소매 커프 밴드 (고정 세로 밴드, 밝은 원단 위만) ---
  if (cuffTarget) {
    const cuffBand = (x0, x1) => {
      for (let y = 60; y <= 680; y++) {
        for (let x = x0; x <= x1; x++) {
          const offset = (y * width + x) * 4;
          if (isBackground(offset)) continue;
          const v0 = sourceValue[y * width + x];
          const [, saturation] = rgbHsv(data[offset], data[offset + 1], data[offset + 2]);
          if (saturation > 0.40) continue; // 보라 아웃라인 보호
          const strength = smoothstep(0.32, 0.48, v0)
            * smoothstep(x0, x0 + 4, x) * (1 - smoothstep(x1 - 4, x1, x));
          if (strength <= 0.01) continue;
          paintHsv(offset, cuffTarget, shirtValue(cuffTarget, v0), strength);
        }
      }
    };
    cuffBand(335, 428);
    cuffBand(1620, 1713);
  }

  // --- pass 3: V넥 리브 트림 (개구부 가장자리 바깥 밴드 + 팁 랩) ---
  const trimAt = (x, y, strength) => {
    if (strength <= 0.01 || x < 0 || x >= width) return;
    const offset = (y * width + x) * 4;
    if (isBackground(offset)) return;
    const v0 = sourceValue[y * width + x];
    if (v0 < 0.045) return; // 짙은 외곽 라인은 남겨 깊이 유지
    paintHsv(offset, trimTarget, knitValue(trimTarget, v0), strength);
  };
  for (let y = 738; y <= V_TIP_Y - 4; y++) {
    const [xl, xr] = vEdges(y);
    for (let x = Math.round(xl) - 44; x <= Math.round(xl) - 8; x++) {
      trimAt(x, y, smoothstep(xl - 44, xl - 38, x) * (1 - smoothstep(xl - 13, xl - 8, x)));
    }
    for (let x = Math.round(xr) + 8; x <= Math.round(xr) + 44; x++) {
      trimAt(x, y, smoothstep(xr + 8, xr + 13, x) * (1 - smoothstep(xr + 38, xr + 44, x)));
    }
  }
  for (let y = V_TIP_Y - 4; y <= V_TIP_Y + 48; y++) {
    for (let x = V_CX - 48; x <= V_CX + 48; x++) {
      const distance = Math.hypot(x - (V_CX + 2), y - (V_TIP_Y - 4));
      if (distance > 48) continue;
      trimAt(x, y, 1 - smoothstep(42, 48, distance));
    }
  }

  // --- pass 4: 밑단 골지 밴드 (리브 전체 y~1782..최하단 컬링 직전) ---
  // 리브 하단부는 vest 게이트가 부분 강도로만 잡으므로 원본 니트 명도 범위로 보강한다.
  for (let y = 1782; y <= 2044; y++) {
    const band = smoothstep(1782, 1790, y);
    if (band <= 0.01) continue;
    for (let x = 0; x < width; x++) {
      const mask = y * width + x;
      const v0 = sourceValue[mask];
      if (!vestMask[mask]) {
        if (isBackground(mask * 4)) continue;
        if (v0 < 0.042 || v0 > 0.62) continue; // 컬링 검정/비니트 보호
      }
      paintHsv(mask * 4, hemTarget, knitValue(hemTarget, v0), band);
    }
  }

  // --- pass 5: 종별 모티프 (전부 몸판 중앙부 x640~1360 — UV 심을 넘지 않는다) ---
  const motif = design.motif;
  if (motif) {
    const motifTarget = hsvOf(motif.color);
    const motifAt = (x, y, strength) => {
      const mask = y * width + x;
      if (!vestMask[mask] || strength <= 0.01) return;
      paintHsv(mask * 4, motifTarget, knitValue(motifTarget, sourceValue[mask]), strength);
    };
    if (motif.type === 'bibPanel') {
      // 가슴 빕 패널: 지퍼가 위에 다시 그려져 좌우 패널로 읽힌다.
      for (let y = 1110; y <= 1470; y++) {
        for (let x = 878; x <= 1170; x++) {
          let inside = false;
          if (y <= 1340) inside = true;
          else {
            const nx = (x - 1024) / 146;
            const ny = (y - 1340) / 130;
            inside = nx * nx + ny * ny <= 1;
          }
          if (!inside) continue;
          const edge = Math.min(
            smoothstep(1110, 1116, y),
            smoothstep(878, 884, x) * (1 - smoothstep(1164, 1170, x)),
          );
          motifAt(x, y, 0.96 * edge);
        }
      }
    } else if (motif.type === 'pawPatch') {
      // 왼가슴 발바닥 패치: 메인 패드 + 발가락 3개.
      const pads = [
        [1150, 1240, 38, 30],
        [1103, 1186, 14, 14],
        [1150, 1172, 14, 14],
        [1197, 1186, 14, 14],
      ];
      for (const [cx, cy, rx, ry] of pads) {
        for (let y = cy - ry - 2; y <= cy + ry + 2; y++) {
          for (let x = cx - rx - 2; x <= cx + rx + 2; x++) {
            const radius = Math.hypot((x - cx) / rx, (y - cy) / ry);
            motifAt(x, y, 0.92 * (1 - smoothstep(0.88, 1, radius)));
          }
        }
      }
    } else if (motif.type === 'hexPlates') {
      // 밑단 헥사 플레이트: 밴드 중앙 y1830, 앞판 x704~1280.
      for (let cx = 704; cx <= 1280; cx += 96) {
        for (let y = 1816; y <= 1880; y++) {
          for (let x = cx - 28; x <= cx + 28; x++) {
            if (!inHex(x - cx, y - 1848, 30)) continue;
            motifAt(x, y, 0.88);
          }
        }
      }
    } else if (motif.type === 'argyleBand') {
      // 밑단 아가일 다이아: 밴드 중앙 y1830, 앞판 x700~1300.
      for (let cx = 700; cx <= 1300; cx += 100) {
        for (let y = 1804; y <= 1892; y++) {
          for (let x = cx - 36; x <= cx + 36; x++) {
            const diamond = Math.abs(x - cx) / 34 + Math.abs(y - 1848) / 44;
            motifAt(x, y, 0.85 * (1 - smoothstep(0.92, 1, diamond)));
          }
        }
      }
    } else if (motif.type === 'roundPatches') {
      // 밑단 라운드 패치 2열 스태거.
      const rows = [[1826, 700], [1870, 748]];
      for (const [cy, x0] of rows) {
        for (let cx = x0; cx <= 1300; cx += 96) {
          for (let y = cy - 22; y <= cy + 22; y++) {
            for (let x = cx - 22; x <= cx + 22; x++) {
              const radius = Math.hypot(x - cx, y - cy) / 22;
              motifAt(x, y, 0.88 * (1 - smoothstep(0.85, 1, radius)));
            }
          }
        }
      }
    } else if (motif.type === 'regimentalCollar') {
      // 카라 밴드 위 사선 레지멘털 스트라이프 (양끝 심은 보타이가 가린다).
      for (let y = 8; y < 300; y++) {
        for (let x = 644; x <= 1356; x++) {
          const mask = y * width + x;
          const offset = mask * 4;
          if (isBackground(offset)) continue;
          const v0 = sourceValue[mask];
          if (v0 < 0.30) continue; // 어두운 목 안쪽 그라데이션 보호
          const phase = ((x - 2 * y) % 88 + 88) % 88;
          if (phase >= 16) continue;
          const edge = smoothstep(0, 3, phase) * (1 - smoothstep(13, 16, phase));
          paintHsv(offset, motifTarget, shirtValue(motifTarget, v0), 0.9 * edge);
        }
      }
    }
  }

  // --- pass 6: 중앙 지퍼 (트림 팁 아래 → 밑단 관통, 마지막에 그려 모티프 위를 지난다) ---
  for (let y = V_TIP_Y + 4; y <= 2044; y++) {
    for (let x = V_CX - 15; x <= V_CX + 15; x++) {
      const mask = y * width + x;
      const v0 = sourceValue[mask];
      const ribRow = y > 1782 && v0 >= 0.042 && v0 <= 0.62 && !isBackground(mask * 4);
      if (!vestMask[mask] && !ribRow) continue;
      const dx = Math.abs(x - V_CX);
      if (dx > 14) continue;
      const groove = dx <= 3 ? 0.62 : 1; // 중앙 3px 지퍼 이빨 홈
      paintHsv(
        mask * 4,
        zipperTarget,
        knitValue(zipperTarget, sourceValue[mask]) * groove,
        1 - smoothstep(11, 14, dx),
      );
    }
  }

  context.putImageData(image, 0, 0);
  return pngBuffer(canvas);
}

// 스커트(20): 본체 명도 보존 재염색 + 밑단 스트라이프(없으면 스커트색으로 중화해
// avatar.vrm 유래 코랄 밴드를 지운다) + 선택 도트(가로 64px 격자 = 1024 UV 랩 무결).
async function editSkirt(bytes, style) {
  const design = style.design;
  const canvas = await canvasFrom(bytes);
  const width = canvas.width;
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, width, canvas.height);
  const data = image.data;
  const skirtTarget = hsvOf(design.skirt);
  const stripeTarget = hsvOf(design.skirtStripe ?? design.skirt);

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const [, , value] = rgbHsv(data[offset], data[offset + 1], data[offset + 2]);
      const strength = smoothstep(0.035, 0.06, value); // 컬링 검정/주름 골 유지
      if (strength < 0.01) continue;
      const normalised = clamp((value - 0.05) / 0.40);
      const [r, g, b] = hsvRgb(
        skirtTarget[0],
        skirtTarget[1],
        clamp(skirtTarget[2] * (0.55 + 0.55 * normalised), 0.02, 0.98),
      );
      data[offset] = Math.round(mix(data[offset], r, strength));
      data[offset + 1] = Math.round(mix(data[offset + 1], g, strength));
      data[offset + 2] = Math.round(mix(data[offset + 2], b, strength));
    }
  }

  for (let y = 474; y <= 510; y++) {
    const band = smoothstep(474, 480, y) * (1 - smoothstep(504, 510, y));
    if (band <= 0.01) continue;
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const [, , value] = rgbHsv(data[offset], data[offset + 1], data[offset + 2]);
      const strength = band * smoothstep(0.04, 0.08, value);
      if (strength < 0.01) continue;
      const normalised = clamp((value - 0.08) / 0.70);
      const [r, g, b] = hsvRgb(
        stripeTarget[0],
        stripeTarget[1],
        clamp(stripeTarget[2] * (0.60 + 0.50 * normalised), 0.02, 0.98),
      );
      data[offset] = Math.round(mix(data[offset], r, strength));
      data[offset + 1] = Math.round(mix(data[offset + 1], g, strength));
      data[offset + 2] = Math.round(mix(data[offset + 2], b, strength));
    }
  }

  if (design.skirtDots) {
    const dotTarget = hexRgb(design.skirtDots);
    for (let row = 0; row < 4; row++) {
      const cy = 252 + row * 56;
      const offsetX = row % 2 ? 32 : 0;
      for (let y = cy - 7; y <= cy + 7; y++) {
        for (let x = 0; x < width; x++) {
          const wrapped = ((x - offsetX) % 64 + 64) % 64;
          const dx = wrapped > 32 ? wrapped - 64 : wrapped;
          const radius = Math.hypot(dx, y - cy);
          const strength = 0.55 * (1 - smoothstep(4.5, 6.5, radius));
          if (strength <= 0.01) continue;
          const offset = (y * width + x) * 4;
          const [, , value] = rgbHsv(data[offset], data[offset + 1], data[offset + 2]);
          if (value < 0.06) continue; // 주름 골 유지
          data[offset] = Math.round(mix(data[offset], dotTarget[0], strength));
          data[offset + 1] = Math.round(mix(data[offset + 1], dotTarget[1], strength));
          data[offset + 2] = Math.round(mix(data[offset + 2], dotTarget[2], strength));
        }
      }
    }
  }

  context.putImageData(image, 0, 0);
  return pngBuffer(canvas);
}

// 신발(21): 도너 휘도 '곱' 대신 밴드 치환. 도너 로퍼는 전부 다크브라운
// (실측 v 0.10~0.32, v>0.5 픽셀 0개 — 기존 밝은 밑창 분기(v>0.54)는 사문)이라
// 휘도 곱은 화이트 로퍼(#F3EFE7 등)를 미드그레이로 끌어내렸다. 도너 명도 대역을
// 타깃 명도 램프(0.78~1.00x)로 정규화하고, 홈/옆면 셰이드는 타깃 hue의 채도를
// 보강해 칠한다 — monkey 화이트+라이트그레이 셰이드, giraffe 웜 크림 셰이드
// (#D8CDB2 근사)가 무채색 그레이로 읽히지 않게 하는 핵심.
async function editShoes(bytes, style) {
  const design = style.design;
  const canvas = await canvasFrom(bytes);
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const mainTarget = hsvOf(design.shoes);
  const soleTarget = design.shoesSole ? hsvOf(design.shoesSole) : null;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue;
    const [, , value] = rgbHsv(data[offset], data[offset + 1], data[offset + 2]);
    if (value < 0.055) continue; // 컬링/봉제 검정 유지
    // 도너 명도 정규화: 홈(0.13)≈0, 발등/스트랩·안창(0.27~0.32)≈1.
    const t = clamp((value - 0.11) / 0.20);
    const target = soleTarget && value > 0.24 ? soleTarget : mainTarget;
    const [r, g, b] = hsvRgb(
      target[0],
      clamp(target[1] * (1 + 0.7 * (1 - t)), 0, 0.95),
      clamp(target[2] * (0.78 + 0.22 * t), 0.02, 0.98),
    );
    data[offset] = Math.round(r);
    data[offset + 1] = Math.round(g);
    data[offset + 2] = Math.round(b);
  }
  context.putImageData(image, 0, 0);
  return pngBuffer(canvas);
}

// 목 보타이(19): 전체 재염색 — 소스 채도/명도를 스케일해 하이라이트를 살린다.
async function editBow(bytes, style) {
  const canvas = await canvasFrom(bytes);
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const target = hsvOf(style.design.bow);
  for (let offset = 0; offset < data.length; offset += 4) {
    const [, saturation, value] = rgbHsv(data[offset], data[offset + 1], data[offset + 2]);
    const [r, g, b] = hsvRgb(
      target[0],
      target[1] * clamp(saturation * 1.4),
      clamp(target[2] * (0.50 + 0.58 * value), 0.02, 0.99),
    );
    data[offset] = Math.round(r);
    data[offset + 1] = Math.round(g);
    data[offset + 2] = Math.round(b);
  }
  context.putImageData(image, 0, 0);
  return pngBuffer(canvas);
}

// 헤어핀/액센트 스트랜드(28): 도너(밝은 시안 막대 실측 v≈0.93 / 네이비 홈 v≈0.42)를
// accent 램프로 '치환'한다 — 밝은 면=hairpin 원색, 홈=hairpin 셰이드(명도 0.62x,
// 채도 소폭 강화). 도너 명도/채도 스케일 곱을 버려 hue·명도 표류를 막는다.
// HAIR_02 머티리얼 틴트는 materialPatch에서 화이트로 고정한다 — 헤어 _Color 곱이
// 재염색된 핀을 거의 검정으로 렌더하던 원인(penguin/lion/tiger/elephant 지적).
async function editHairpin(bytes, style) {
  const canvas = await canvasFrom(bytes);
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const target = hsvOf(style.design.hairpin);
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue;
    const [, , value] = rgbHsv(data[offset], data[offset + 1], data[offset + 2]);
    const t = smoothstep(0.40, 0.90, value); // 홈(0.42) -> 밝은 막대(0.93)
    const [r, g, b] = hsvRgb(
      target[0],
      clamp(target[1] * (1 + 0.10 * (1 - t)), 0, 1),
      clamp(target[2] * (0.62 + 0.38 * t), 0.02, 0.99),
    );
    data[offset] = Math.round(r);
    data[offset + 1] = Math.round(g);
    data[offset + 2] = Math.round(b);
  }
  context.putImageData(image, 0, 0);
  return pngBuffer(canvas);
}

function vectorColour(rgb) {
  return [...rgb.map((channel) => Number((channel / 255).toFixed(6))), 1];
}

function materialPatch(entry, style) {
  const [hairColour, hairShade] = style.hair;
  const vectorProperties = {
    _Color: vectorColour(hairColour),
    _ShadeColor: vectorColour(hairShade),
  };
  // HAIR_02(img28 헤어핀/액센트 스트랜드)는 editHairpin이 텍스처를 accent 원색으로
  // 직접 치환하므로 틴트를 도너와 같은 화이트로 고정한다(work/NOTES.md 틴트표).
  // 헤어 _Color를 곱하면 accent x 다크 헤어 = 거의 검정으로 붕괴한다.
  const whiteTint = {
    _Color: [1, 1, 1, 1],
    _ShadeColor: [1, 1, 1, 1],
  };
  // v3.1: 눈썹 틴트 헤어 동조 — img8은 그레이스케일로 빌드하고(editEyeLine brow)
  // 색은 FaceBrow _Color/_ShadeColor가 소유한다 (도너 네이비 틴트 대체).
  const browTintPatch = {
    _Color: vectorColour(style.browTint),
    _ShadeColor: vectorColour(style.browShade),
  };
  return {
    meta: { title: entry.title },
    materials: [
      { match: 'HairBack', vectorProperties },
      { match: 'HAIR_01', vectorProperties },
      { match: 'HAIR_02', vectorProperties: whiteTint },
      { match: 'FaceBrow', vectorProperties: browTintPatch },
    ],
  };
}

async function writeAvatarEdits(entry, style, sourceGlb, workDir, topsSourceBytes) {
  const editedDir = path.join(workDir, 'edited');
  fs.rmSync(editedDir, { recursive: true, force: true });
  fs.mkdirSync(editedDir, { recursive: true });
  const generators = new Map([
    [0, (bytes) => editMouth(bytes, style)],
    [5, (bytes) => editEyeLine(bytes, style, 'line')],
    [7, (bytes) => editEyeLine(bytes, style, 'lash')],
    [8, (bytes) => editEyeLine(bytes, style, 'brow')],
    [9, (bytes) => editIris(bytes, style)],
    [11, (bytes) => editFaceSkin(bytes, style)],
    [15, (bytes) => editBodySkin(bytes, style)],
    [17, (bytes) => editTops(bytes, style)],
    [19, (bytes) => editBow(bytes, style)],
    [20, (bytes) => editSkirt(bytes, style)],
    [21, (bytes) => editShoes(bytes, style)],
    [HAIR_IMAGE_INDEX, (bytes) => editHair(bytes, style)],
    [HIGHLIGHT_IMAGE_INDEX, (bytes) => editHighlight(bytes, style)],
    [28, (bytes) => editHairpin(bytes, style)],
  ]);
  const textures = [];
  for (const imageIndex of editedImageIndicesFor(style.design, style.eyeProfile)) {
    const sourceBytes = embeddedImageBytes(sourceGlb, imageIndex, 'base VRM');
    const sourceMime = sourceGlb.json.images[imageIndex].mimeType ?? sniffImageMime(sourceBytes);
    const expected = imageDimensions(sourceBytes, sourceMime);
    // Tops(17)만 디테일 휘도 소스를 placeholder 원본 니트에서 취한다 — 베이스가
    // 이미 트랙탑화된 avatar.vrm이면 휘도 분포가 달라 컬러 블로킹이 무너지기 때문.
    const inputBytes = imageIndex === 17 ? topsSourceBytes : sourceBytes;
    const output = await generators.get(imageIndex)(inputBytes);
    const actual = imageDimensions(output, 'image/png');
    if (actual.width !== expected.width || actual.height !== expected.height) {
      throw new Error(
        `${entry.slug}: image ${imageIndex} changed dimensions `
        + `${expected.width}x${expected.height} -> ${actual.width}x${actual.height}`,
      );
    }
    const filename = `${imageIndex}.png`;
    fs.writeFileSync(path.join(editedDir, filename), output);
    textures.push({
      imageIndex,
      file: `edited/${filename}`,
      width: actual.width,
      height: actual.height,
      sha256: sha256(output),
    });
  }
  const patch = materialPatch(entry, style);
  const patchPath = path.join(workDir, 'material-patch.json');
  fs.writeFileSync(patchPath, `${JSON.stringify(patch, null, 2)}\n`);
  return { editedDir, patchPath, textures };
}

function runRebuild(source, output, editedDir, patchPath) {
  const script = path.join(ROOT, 'scripts', 'vrm-tex.mjs');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      script,
      'rebuild',
      source,
      output,
      '--edited-dir',
      editedDir,
      '--material-patch',
      patchPath,
    ], {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`vrm-tex rebuild exited ${code}\n${stdout}${stderr}`));
    });
  });
}

async function buildOne(entry, position, total, options, source, sourceBytes, sourceGlb, topsSourceBytes) {
  // 스타일 시드는 필터(--only)와 무관하게 카탈로그 인덱스로 고정 — 부분 재빌드가
  // 전체 빌드와 바이트 단위로 동일한 결과를 내야 한다.
  const style = styleFor(entry, entry.catalogIndex);
  const workDir = path.resolve(options.workRoot, entry.slug);
  const workPrefix = `${path.resolve(options.workRoot)}${path.sep}`;
  if (!workDir.startsWith(workPrefix)) throw new Error(`unsafe work path for ${entry.slug}`);
  fs.mkdirSync(workDir, { recursive: true });

  const { editedDir, patchPath, textures } = await writeAvatarEdits(entry, style, sourceGlb, workDir, topsSourceBytes);
  const output = path.resolve(options.outputRoot, `${entry.slug}.vrm`);
  const outputPrefix = `${path.resolve(options.outputRoot)}${path.sep}`;
  if (!output.startsWith(outputPrefix)) throw new Error(`unsafe output path for ${entry.slug}`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporaryOutput = `${output}.building`;
  fs.rmSync(temporaryOutput, { force: true });
  await runRebuild(source, temporaryOutput, editedDir, patchPath);
  // 얼굴형 워프 (DESIGN-PACK-V3.1 2절): 프로필 있는 슬러그만, 결정적 버텍스 변형.
  // 눈알 인덱스 하드락·진폭 상한은 face-warp.mjs가 강제한다. flamingo는 프로필 없음.
  const warpProfile = FACE_WARP_PROFILES[entry.slug];
  if (warpProfile) {
    const warped = warpFaceGlb(fs.readFileSync(temporaryOutput), warpProfile, { label: entry.slug });
    fs.writeFileSync(temporaryOutput, warped.bytes);
  }
  // 헤어 길이 컷 (v3.2): 텍스처 알파 컷 대신 컷 평면 지오메트리 클리핑.
  // 이마를 지나는 베이비헤어는 평면보다 높아 보존되므로 '1자 눈썹' 잔흔이 없다.
  if (style.design.hairCut != null) {
    const spec = style.design.hairCut;
    const cuts = Array.isArray(spec) ? spec : [{ row: spec }];
    const trimmed = trimHairGlb(fs.readFileSync(temporaryOutput), {
      cuts,
      jitterPx: HAIR_CUT_JITTER,
      seed: style.variantIndex,
      imageIndex: HAIR_IMAGE_INDEX,
      label: entry.slug,
    });
    fs.writeFileSync(temporaryOutput, trimmed.bytes);
  }
  // 스커트 밑단 컷 (v3.2): 도너 스커트 하나로 전 캐릭터가 같은 실루엣이던 문제 완화.
  // 밑단은 이미 열린 경계라 평면 클리핑이 내부 면을 드러내지 않는다.
  if (style.design.skirtCut != null) {
    const trimmedSkirt = trimHairGlb(fs.readFileSync(temporaryOutput), {
      cuts: [{ fraction: style.design.skirtCut }],
      jitterPx: 0,
      seed: style.variantIndex,
      imageIndex: SKIRT_IMAGE_INDEX,
      label: `${entry.slug}:skirt`,
    });
    fs.writeFileSync(temporaryOutput, trimmedSkirt.bytes);
  }
  // 헤어핀 형태 (v3.2): 도너 X자 클립 하나를 종별 실루엣으로 변형 (색만 다르던 문제).
  if (style.design.hairpinShape != null) {
    const shaped = shapeHairpinGlb(fs.readFileSync(temporaryOutput), {
      ...style.design.hairpinShape,
      imageIndex: HAIRPIN_IMAGE_INDEX,
      label: `${entry.slug}:hairpin`,
    });
    fs.writeFileSync(temporaryOutput, shaped.bytes);
  }
  fs.renameSync(temporaryOutput, output);
  const outputBytes = fs.readFileSync(output);

  const manifest = {
    schemaVersion: 1,
    slug: entry.slug,
    title: entry.title,
    catalogIndex: entry.catalogIndex,
    source: path.relative(ROOT, source),
    sourceSha256: sha256(sourceBytes),
    model: path.relative(ROOT, output),
    modelSha256: sha256(outputBytes),
    editedImageIndices: editedImageIndicesFor(style.design, style.eyeProfile),
    textures,
  };
  fs.writeFileSync(path.join(workDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[${position + 1}/${total}] built ${entry.slug} (${entry.title})`);
}

async function runPool(entries, limit, worker) {
  let nextIndex = 0;
  let failure = null;
  async function runner() {
    while (!failure) {
      const index = nextIndex++;
      if (index >= entries.length) return;
      try {
        await worker(entries[index], index);
      } catch (error) {
        failure = error;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, entries.length) }, () => runner()));
  if (failure) throw failure;
}

// Tops(17)의 디테일 휘도 소스: placeholder.vrm 임베디드 원본(니트 음영 무결) 우선,
// 없으면 work/textures 의 placeholder dump 를 사용한다. (editTops가 픽셀 프로브로
// 트랙탑화된 입력을 재차 거른다.)
function resolveTopsDetailSource() {
  const placeholder = path.join(ROOT, 'public', 'models', 'placeholder.vrm');
  if (fs.existsSync(placeholder)) {
    const glb = parseGlb(fs.readFileSync(placeholder), placeholder);
    return { bytes: Buffer.from(embeddedImageBytes(glb, 17, placeholder)), origin: path.relative(ROOT, placeholder) };
  }
  const textureDir = path.join(ROOT, 'work', 'textures');
  if (fs.existsSync(textureDir)) {
    const dumpFile = fs.readdirSync(textureDir).find((name) => /^17_.*\.png$/.test(name));
    if (dumpFile) {
      return { bytes: fs.readFileSync(path.join(textureDir, dumpFile)), origin: path.join('work', 'textures', dumpFile) };
    }
  }
  throw new Error(
    'Tops detail source not found: need public/models/placeholder.vrm '
    + 'or a work/textures/17_*.png placeholder dump (node scripts/vrm-tex.mjs dump)',
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const entries = loadAvatarCatalog(options.catalog);
  // authored 엔트리(예: flamingo → avatar.vrm)는 손작업 산출물 — 재생성 대상이 아니다.
  let targets = entries.filter((entry) => entry.authored !== true);
  if (targets.length === 0) throw new Error('avatar catalog has no buildable (non-authored) entries');
  if (options.only) {
    targets = targets.filter((entry) => entry.slug === options.only);
    if (targets.length === 0) {
      throw new Error(`--only ${options.only} does not match any buildable catalog slug`);
    }
  }
  const source = resolveBaseModel(ROOT, options.source);
  const sourceBytes = fs.readFileSync(source);
  const sourceGlb = parseGlb(sourceBytes, source);
  for (const imageIndex of [...EDITED_IMAGE_INDICES, HAIR_IMAGE_INDEX, HIGHLIGHT_IMAGE_INDEX]) {
    const bytes = embeddedImageBytes(sourceGlb, imageIndex, source);
    imageDimensions(bytes, sourceGlb.json.images[imageIndex].mimeType ?? sniffImageMime(bytes));
  }
  const topsSource = resolveTopsDetailSource();
  fs.mkdirSync(options.workRoot, { recursive: true });
  fs.mkdirSync(options.outputRoot, { recursive: true });
  console.log(
    `building ${targets.length}/${entries.length} avatars from ${path.relative(ROOT, source)} `
    + `(tops detail: ${topsSource.origin}, concurrency ${options.concurrency})`,
  );
  await runPool(
    targets,
    options.concurrency,
    (entry, position) => buildOne(
      entry,
      position,
      targets.length,
      options,
      source,
      sourceBytes,
      sourceGlb,
      topsSource.bytes,
    ),
  );
  console.log(`built ${targets.length} deterministic avatar VRMs`);
}

main().catch((error) => {
  console.error(`avatar build failed: ${error.stack ?? error.message}`);
  process.exit(1);
});
