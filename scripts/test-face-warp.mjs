#!/usr/bin/env node
/**
 * test-face-warp.mjs — face-warp.mjs 자체 검증 (렌더 없이 바이트/기하 수준).
 *
 * 사용: node scripts/test-face-warp.mjs [--model public/models/bear.vrm]
 *
 * 검증 항목
 *  1. 결정성: 같은 입력·프로필 2회 → sha256 동일
 *  2. 진폭 상한: 초과 프로필 reject, 최대 이동량이 상한 이하
 *  3. 금지 영역: 눈알 계열(EyeIris/EyeHighlight/EyeWhite/EyeExtra) 버텍스 바이트 불변
 *  4. 모프타깃: 모든 morph target accessor 바이트 불변
 *  5. 심 일관성: 서로 다른 메시의 동일 위치 버텍스가 동일 변위 (Face/Body 목 경계 등)
 *  6. NORMAL/UV/인덱스/스킨 웨이트 바이트 불변 (POSITION min/max 외 JSON 구조 불변)
 *  7. 제로 프로필: 이동 0, BIN 바이트 불변
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGlb, sha256 } from './lib/avatar-pack-common.mjs';
import { warpFaceGlb, FACE_WARP_PROFILES, LOCKED_MATERIAL_PATTERN } from './lib/face-warp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const modelArg = args.includes('--model') ? args[args.indexOf('--model') + 1] : null;
const MODEL = path.resolve(modelArg ?? path.join(ROOT, 'public', 'models', 'bear.vrm'));

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

const input = fs.readFileSync(MODEL);
const profile = FACE_WARP_PROFILES.bear;

// ---- 1. 결정성 ----
const a = warpFaceGlb(input, profile, { label: 'runA' });
const b = warpFaceGlb(input, profile, { label: 'runB' });
check('deterministic output (same input -> identical bytes)', sha256(a.bytes) === sha256(b.bytes));
check('input buffer untouched', sha256(input) === sha256(fs.readFileSync(MODEL)));

// ---- 2. 진폭 상한 ----
let rejected = false;
try {
  warpFaceGlb(input, { width: 0.05 }, { label: 'cap' });
} catch {
  rejected = true;
}
check('over-limit profile rejected (width 5% > 4%)', rejected);
let cheekRejected = false;
try {
  warpFaceGlb(input, { cheek: 0.007 }, { label: 'cap' });
} catch {
  cheekRejected = true;
}
check('over-limit profile rejected (cheek 7mm > 6mm)', cheekRejected);
const [mx, my, mz] = a.stats.maxAbsDisplacement;
check('max |dx| plausible (<= width*maxX + jaw + cheek ~ 12mm)', mx <= 0.012, `dx=${(mx * 1000).toFixed(2)}mm`);
check('max |dy| plausible (<= 5% of face spans ~ 12mm)', my <= 0.012, `dy=${(my * 1000).toFixed(2)}mm`);
check('max |dz| within chin z limit 4mm', mz <= 0.004, `dz=${(mz * 1000).toFixed(2)}mm`);

// ---- 3~6: 원본/워프 GLB 구조 비교 ----
const before = parseGlb(input, 'before');
const after = parseGlb(a.bytes, 'after');

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function accBytes(glb, index) {
  const acc = glb.json.accessors[index];
  const view = glb.json.bufferViews[acc.bufferView];
  const Type = COMP[acc.componentType];
  const size = NCOMP[acc.type] * Type.BYTES_PER_ELEMENT * acc.count;
  const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  return glb.bin.subarray(start, start + size);
}
function accFloats(glb, index) {
  const acc = glb.json.accessors[index];
  const view = glb.json.bufferViews[acc.bufferView];
  const start = glb.bin.byteOffset + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  return new Float32Array(glb.bin.buffer, start, acc.count * NCOMP[acc.type]);
}

// 3. 눈알 버텍스 불변
const matName = (glb, prim) => glb.json.materials?.[prim.material]?.name ?? '';
let eyeMoved = 0;
let eyeVerts = 0;
for (const mesh of before.json.meshes) {
  for (const prim of mesh.primitives) {
    if (!LOCKED_MATERIAL_PATTERN.test(matName(before, prim))) continue;
    const idx = accBytes(before, prim.indices);
    const IdxType = COMP[before.json.accessors[prim.indices].componentType];
    const indices = new IdxType(idx.buffer, idx.byteOffset, before.json.accessors[prim.indices].count);
    const p0 = accFloats(before, prim.attributes.POSITION);
    const p1 = accFloats(after, prim.attributes.POSITION);
    for (const v of new Set(indices)) {
      eyeVerts++;
      for (let c = 0; c < 3; c++) if (p0[v * 3 + c] !== p1[v * 3 + c]) { eyeMoved++; break; }
    }
  }
}
check('eye-mesh vertices locked (EyeIris/Highlight/White/Extra)', eyeMoved === 0, `${eyeVerts} verts checked`);

// 4. 모프타깃 델타 불변
let targetAccessors = 0;
let targetChanged = 0;
for (const [mi, mesh] of before.json.meshes.entries()) {
  for (const [pi, prim] of mesh.primitives.entries()) {
    for (const [ti, target] of (prim.targets ?? []).entries()) {
      for (const attr of Object.values(target)) {
        targetAccessors++;
        const b0 = accBytes(before, attr);
        const b1 = accBytes(after, attr);
        if (Buffer.compare(b0, b1) !== 0) {
          targetChanged++;
          if (targetChanged === 1) console.log(`  first changed target: mesh${mi} prim${pi} target${ti}`);
        }
      }
    }
  }
}
check('morph target deltas byte-identical', targetChanged === 0, `${targetAccessors} target accessors`);

// 5. 심 일관성: 모든 POSITION accessor의 버텍스를 원좌표 키로 묶어 변위 비교
const posSet = new Set();
for (const mesh of before.json.meshes) for (const prim of mesh.primitives) posSet.add(prim.attributes.POSITION);
const byPos = new Map(); // "x,y,z" -> Set of "dx,dy,dz"
for (const pi of posSet) {
  const p0 = accFloats(before, pi);
  const p1 = accFloats(after, pi);
  const count = before.json.accessors[pi].count;
  for (let v = 0; v < count; v++) {
    const key = `${p0[v * 3]},${p0[v * 3 + 1]},${p0[v * 3 + 2]}`;
    const delta = `${p1[v * 3] - p0[v * 3]},${p1[v * 3 + 1] - p0[v * 3 + 1]},${p1[v * 3 + 2] - p0[v * 3 + 2]}`;
    if (!byPos.has(key)) byPos.set(key, new Set());
    byPos.get(key).add(delta);
  }
}
let seamViolations = 0;
let coLocated = 0;
for (const deltas of byPos.values()) {
  if (deltas.size > 1) {
    // 눈알 락 버텍스와 스킨 버텍스가 정확히 같은 좌표에 겹치는 경우만 예외 허용 없음 — 전수 위반으로 계산
    seamViolations++;
  } else {
    coLocated++;
  }
}
check('co-located vertices displace identically (seam safety)', seamViolations === 0, `${byPos.size} unique positions, ${seamViolations} violations`);

// 6. NORMAL/TEXCOORD/JOINTS/WEIGHTS/인덱스 불변
let attrChanged = 0;
let attrChecked = 0;
for (const mesh of before.json.meshes) {
  for (const prim of mesh.primitives) {
    for (const [name, accIndex] of Object.entries(prim.attributes)) {
      if (name === 'POSITION') continue;
      attrChecked++;
      if (Buffer.compare(accBytes(before, accIndex), accBytes(after, accIndex)) !== 0) attrChanged++;
    }
    if (prim.indices !== undefined) {
      attrChecked++;
      if (Buffer.compare(accBytes(before, prim.indices), accBytes(after, prim.indices)) !== 0) attrChanged++;
    }
  }
}
check('non-POSITION attributes byte-identical (NORMAL/UV/JOINTS/WEIGHTS/indices)', attrChanged === 0, `${attrChecked} accessors`);

// JSON 구조: accessors min/max 외 변경 없음
const stripMinMax = (json) => {
  const clone = JSON.parse(JSON.stringify(json));
  for (const acc of clone.accessors ?? []) { delete acc.min; delete acc.max; }
  return JSON.stringify(clone);
};
check('JSON unchanged except POSITION min/max', stripMinMax(before.json) === stripMinMax(after.json));

// 7. 제로 프로필
const zero = warpFaceGlb(input, {}, { label: 'zero' });
check('zero profile moves nothing', zero.stats.movedVertices === 0, `moved=${zero.stats.movedVertices}`);
check('zero profile BIN byte-identical', Buffer.compare(parseGlb(zero.bytes, 'z').bin, before.bin) === 0);

// ---- 요약 ----
console.log('\nstats (bear round profile):');
console.log(`  locked eye vertices: ${a.stats.lockedVertices}`);
console.log(`  moved vertices: ${a.stats.movedVertices}`);
console.log(`  max |d| mm: ${a.stats.maxAbsDisplacement.map((v) => (v * 1000).toFixed(2)).join(' / ')}`);
for (const m of a.stats.meshes) console.log(`  mesh "${m.mesh}" acc${m.accessor}: ${m.moved}/${m.vertices} moved`);
const L = a.stats.landmarks;
console.log(`  landmarks: headY=${L.headY.toFixed(4)} neckY=${L.neckY.toFixed(4)} mouthY=${L.mouthY.toFixed(4)} eyeBotY=${L.eyeBottomY.toFixed(4)}`);
console.log(`  sockets: ${L.sockets.map((s) => `c=(${s.center.map((v) => v.toFixed(3)).join(',')}) rIn=${s.rIn.toFixed(3)} rOut=${s.rOut.toFixed(3)}`).join('  ')}`);
console.log(`  cheek: x=±${L.cheek.centerX.toFixed(3)} y=${L.cheek.y.toFixed(3)} z=${L.cheek.z.toFixed(3)} R=${L.cheek.radius.toFixed(3)}`);

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nall checks passed');
