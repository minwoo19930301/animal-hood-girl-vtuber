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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_COUNT = 12;
const EDITED_IMAGE_INDICES = [0, 5, 7, 8, 9, 11, 15, 17, 19, 20, 21];

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
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (['--catalog', '--source', '--work-root', '--output-root', '--concurrency'].includes(arg)) {
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      index++;
      if (arg === '--catalog') options.catalog = path.resolve(value);
      if (arg === '--source') options.source = path.resolve(value);
      if (arg === '--work-root') options.workRoot = path.resolve(value);
      if (arg === '--output-root') options.outputRoot = path.resolve(value);
      if (arg === '--concurrency') options.concurrency = Number(value);
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
  const hair = Array.isArray(hairOverride) && hairOverride.length >= 2
    ? hairOverride
    : hairOverride && typeof hairOverride === 'object' && hairOverride.base && hairOverride.shade
      ? [hairOverride.base, hairOverride.shade]
      : base.hair;
  const patternBySlug = {
    bear: 'varsity',
    monkey: 'diagonal',
    turtle: 'shell',
    rabbit: 'dots',
    fox: 'chevron',
    panda: 'check',
    penguin: 'sailor',
    owl: 'argyle',
    lion: 'pinstripe',
    tiger: 'tiger',
    elephant: 'rugby',
    giraffe: 'dots',
  };
  const sharpen = Number(entry.eyeSharpen);
  const eye = Number.isFinite(sharpen)
    ? {
      lift: Math.round(1 + sharpen * 10),
      weight: Math.max(1, Math.round(1 + sharpen * 2.4)),
      lash: Math.max(1, Math.round(0.5 + sharpen * 4.2)),
      brow: Math.round(-2 + sharpen * 9),
    }
    : base.eye;
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
    pattern: String(paletteValue(
      entry,
      ['pattern', 'outfitPattern'],
      patternBySlug[entry.slug] ?? base.pattern,
    )),
    eye,
    lip: LIP_PROFILES[index % LIP_PROFILES.length],
    variantIndex: index,
  };
}

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
  return pngBuffer(canvas);
}

function columnShift(x, width, role, eye, variantIndex) {
  const half = width / 2;
  const local = x < half ? x / half : (width - 1 - x) / half;
  const outer = Math.pow(clamp(1 - local * 2.25), 1.35);
  if (role === 'brow') {
    const withinHalf = x < half ? x / half : (x - half) / half;
    const arch = Math.sin(Math.PI * withinHalf);
    return eye.brow * arch + outer * Math.max(0, eye.lift - 4) * 0.20;
  }
  const roleScale = role === 'lash' ? 0.72 : 1;
  const signature = ((variantIndex % 3) - 1) * Math.sin(Math.PI * local) * 0.7;
  return eye.lift * outer * roleScale + signature;
}

async function editEyeLine(bytes, style, role) {
  const source = await canvasFrom(bytes);
  const shifted = createCanvas(source.width, source.height);
  const shiftedContext = shifted.getContext('2d');
  shiftedContext.imageSmoothingEnabled = true;
  for (let x = 0; x < source.width; x++) {
    const dy = columnShift(x, source.width, role, style.eye, style.variantIndex);
    shiftedContext.drawImage(source, x, 0, 1, source.height, x, -dy, 1, source.height);
  }

  const output = createCanvas(source.width, source.height);
  const outputContext = output.getContext('2d');
  const thickness = role === 'line'
    ? style.eye.weight
    : role === 'lash'
      ? style.eye.lash
      : Math.max(0, Math.round(style.eye.weight / 2));
  for (let offset = thickness; offset >= 1; offset--) {
    outputContext.globalAlpha = 0.42 + 0.45 * (1 - offset / (thickness + 1));
    outputContext.drawImage(shifted, 0, -offset);
    if (role === 'lash') outputContext.drawImage(shifted, offset * 0.25, 0);
  }
  outputContext.globalAlpha = 1;
  outputContext.drawImage(shifted, 0, 0);

  const image = outputContext.getImageData(0, 0, output.width, output.height);
  const data = image.data;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue;
    const luminance = (data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114) / 255;
    const amount = 0.38 + luminance * 0.62;
    for (let channel = 0; channel < 3; channel++) {
      data[offset + channel] = Math.round(style.line[channel] * amount);
    }
    data[offset + 3] = Math.round(255 * Math.pow(data[offset + 3] / 255, 0.72));
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

  for (let y = 0; y < canvas.height; y++) {
    const v = (y + 0.5) / canvas.height;
    for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      if (data[offset + 3] === 0) continue;
      const source = [data[offset], data[offset + 1], data[offset + 2]];
      const [hue, saturation, lightness] = rgbHsl(...source);
      const u = (x + 0.5) / canvas.width;
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

function patternMask(type, x, y, width, height, variantIndex) {
  const u = x / width;
  const v = y / height;
  switch (type) {
    case 'varsity':
      return Math.abs(((u * 12) % 1) - 0.5) > 0.44 && v > 0.52 ? 0.72 : 0;
    case 'diagonal':
      return ((x + y * 0.72) % Math.max(24, width / 18)) < Math.max(4, width / 150) ? 0.55 : 0;
    case 'shell': {
      const cells = Math.sin(u * Math.PI * 18) * Math.sin(v * Math.PI * 12);
      return cells > 0.82 ? 0.48 : 0;
    }
    case 'chevron':
      return Math.abs(((Math.abs(u - 0.5) * 2 + v * 1.7) * 9) % 1 - 0.5) > 0.43 ? 0.52 : 0;
    case 'dots': {
      const gx = ((x + (Math.floor(y / 48) % 2) * 24) % 48) - 24;
      const gy = (y % 48) - 24;
      return gx * gx + gy * gy < 16 ? 0.55 : 0;
    }
    case 'pinstripe':
      return x % Math.max(18, Math.round(width / 72)) < Math.max(2, Math.round(width / 430)) ? 0.56 : 0;
    case 'rugby':
      return Math.abs((v * 8) % 1 - 0.5) < 0.08 ? 0.48 : 0;
    case 'check': {
      const cell = Math.max(18, Math.round(width / 40));
      return (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 0.28 : 0;
    }
    case 'tiger':
      return Math.sin(u * 55 + Math.sin(v * 18) * 2.5) > 0.78 ? 0.72 : 0;
    case 'argyle': {
      const diamond = Math.abs(((u * 10) % 1) - 0.5) + Math.abs(((v * 10) % 1) - 0.5);
      return Math.abs(diamond - 0.5) < 0.045 ? 0.48 : 0;
    }
    case 'sailor':
      return (v > 0.82 && v < 0.86) || (v > 0.90 && v < 0.925) ? 0.68 : 0;
    case 'wave':
      return Math.abs(Math.sin(u * Math.PI * 12 + Math.sin(v * Math.PI * 8)) - 0.92) < 0.055 ? 0.45 : 0;
    default:
      return ((x * 13 + y * 7 + variantIndex * 17) % 211) === 0 ? 0.2 : 0;
  }
}

async function editOutfit(bytes, style, imageIndex) {
  const canvas = await canvasFrom(bytes);
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const [primary, secondary, accent] = style.outfit;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      if (data[offset + 3] === 0) continue;
      const source = [data[offset], data[offset + 1], data[offset + 2]];
      const [, sourceSaturation, sourceLightness] = rgbHsl(...source);
      let target;
      if (imageIndex === 19) target = accent;
      else if (imageIndex === 20) target = primary;
      else if (imageIndex === 21) target = sourceLightness > 0.54 ? secondary : accent;
      else if (sourceLightness > 0.63 && sourceSaturation < 0.48) target = secondary;
      else if (sourceSaturation > 0.28 && sourceLightness > 0.34) target = accent;
      else target = primary;
      let colour = tintKeepingDetail(source, target, sourceLightness, 0.88);
      const pattern = patternMask(
        style.pattern,
        x,
        y,
        canvas.width,
        canvas.height,
        style.variantIndex,
      );
      if (pattern > 0 && sourceLightness > 0.07) {
        const currentLightness = rgbHsl(...colour)[2];
        const accentHsl = rgbHsl(...accent);
        const patternColour = hslRgb(accentHsl[0], accentHsl[1], currentLightness);
        colour = colour.map((value, channel) => mix(value, patternColour[channel], pattern));
      }
      data[offset] = Math.round(clamp(colour[0], 0, 255));
      data[offset + 1] = Math.round(clamp(colour[1], 0, 255));
      data[offset + 2] = Math.round(clamp(colour[2], 0, 255));
    }
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
  return {
    meta: { title: entry.title },
    materials: [
      { match: 'HairBack', vectorProperties },
      { match: 'HAIR_01', vectorProperties },
      { match: 'HAIR_02', vectorProperties },
    ],
  };
}

async function writeAvatarEdits(entry, style, sourceGlb, workDir) {
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
    [17, (bytes) => editOutfit(bytes, style, 17)],
    [19, (bytes) => editOutfit(bytes, style, 19)],
    [20, (bytes) => editOutfit(bytes, style, 20)],
    [21, (bytes) => editOutfit(bytes, style, 21)],
  ]);
  const textures = [];
  for (const imageIndex of EDITED_IMAGE_INDICES) {
    const sourceBytes = embeddedImageBytes(sourceGlb, imageIndex, 'base VRM');
    const sourceMime = sourceGlb.json.images[imageIndex].mimeType ?? sniffImageMime(sourceBytes);
    const expected = imageDimensions(sourceBytes, sourceMime);
    const output = await generators.get(imageIndex)(sourceBytes);
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

async function buildOne(entry, index, options, source, sourceBytes, sourceGlb) {
  const style = styleFor(entry, index);
  const workDir = path.resolve(options.workRoot, entry.slug);
  const workPrefix = `${path.resolve(options.workRoot)}${path.sep}`;
  if (!workDir.startsWith(workPrefix)) throw new Error(`unsafe work path for ${entry.slug}`);
  fs.mkdirSync(workDir, { recursive: true });

  const { editedDir, patchPath, textures } = await writeAvatarEdits(entry, style, sourceGlb, workDir);
  const output = path.resolve(options.outputRoot, `${entry.slug}.vrm`);
  const outputPrefix = `${path.resolve(options.outputRoot)}${path.sep}`;
  if (!output.startsWith(outputPrefix)) throw new Error(`unsafe output path for ${entry.slug}`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporaryOutput = `${output}.building`;
  fs.rmSync(temporaryOutput, { force: true });
  await runRebuild(source, temporaryOutput, editedDir, patchPath);
  fs.renameSync(temporaryOutput, output);
  const outputBytes = fs.readFileSync(output);

  const manifest = {
    schemaVersion: 1,
    slug: entry.slug,
    title: entry.title,
    catalogIndex: index,
    source: path.relative(ROOT, source),
    sourceSha256: sha256(sourceBytes),
    model: path.relative(ROOT, output),
    modelSha256: sha256(outputBytes),
    pattern: style.pattern,
    editedImageIndices: EDITED_IMAGE_INDICES,
    textures,
  };
  fs.writeFileSync(path.join(workDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[${index + 1}/${REQUIRED_COUNT}] built ${entry.slug} (${entry.title})`);
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const entries = loadAvatarCatalog(options.catalog);
  if (entries.length !== REQUIRED_COUNT) {
    throw new Error(`avatar catalog must contain exactly ${REQUIRED_COUNT} entries; found ${entries.length}`);
  }
  const source = resolveBaseModel(ROOT, options.source);
  const sourceBytes = fs.readFileSync(source);
  const sourceGlb = parseGlb(sourceBytes, source);
  for (const imageIndex of EDITED_IMAGE_INDICES) {
    const bytes = embeddedImageBytes(sourceGlb, imageIndex, source);
    imageDimensions(bytes, sourceGlb.json.images[imageIndex].mimeType ?? sniffImageMime(bytes));
  }
  fs.mkdirSync(options.workRoot, { recursive: true });
  fs.mkdirSync(options.outputRoot, { recursive: true });
  console.log(
    `building ${entries.length} avatars from ${path.relative(ROOT, source)} `
    + `(concurrency ${options.concurrency})`,
  );
  await runPool(
    entries,
    options.concurrency,
    (entry, index) => buildOne(entry, index, options, source, sourceBytes, sourceGlb),
  );
  console.log(`built ${entries.length} deterministic avatar VRMs`);
}

main().catch((error) => {
  console.error(`avatar build failed: ${error.stack ?? error.message}`);
  process.exit(1);
});
