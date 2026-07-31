#!/usr/bin/env node
/**
 * test-hair-trim.mjs — hair-trim.mjs 자체 검증 (렌더 없이 기하/바이트 수준).
 *
 * 사용: node scripts/test-hair-trim.mjs [--model public/models/avatar.vrm]
 *
 * 검증 항목
 *  1. 결정성: 같은 입력·컷 2회 → sha256 동일
 *  2. 컷 유효: 제거/클리핑된 삼각형이 존재하고, 남은 헤어 버텍스가 컷 평면 아래로
 *     내려가지 않는다 (지터 진폭 + 여유 이내)
 *  3. 이마 보존: 컷 평면보다 확실히 위(+3cm)에 있는 삼각형 수가 컷 전후 동일
 *     — '1자 눈썹' 잔흔 버그의 회귀 방어선
 *  4. 스킨 웨이트: 새로 생성된 버텍스의 가중치 합이 1 (±1e-3)
 *  5. 비헤어 보존: 헤어가 아닌 프리미티브의 accessor 인덱스/카운트 불변
 *  6. 컨테이너 정합: POSITION min/max 갱신, 인덱스가 버텍스 범위 안
 *  7. 잘못된 입력 reject: cutRow 범위 밖
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGlb, sha256 } from './lib/avatar-pack-common.mjs';
import { trimHairGlb } from './lib/hair-trim.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const modelArg = args.includes('--model') ? args[args.indexOf('--model') + 1] : null;
const MODEL = path.resolve(modelArg ?? path.join(ROOT, 'public', 'models', 'avatar.vrm'));
const CUT_ROW = 799;
const HAIR_IMAGE = 25;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

const COMPONENT_ARRAYS = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function read(glb, accessorIndex) {
  const a = glb.json.accessors[accessorIndex];
  const A = COMPONENT_ARRAYS[a.componentType];
  const c = TYPE_COMPONENTS[a.type];
  const v = glb.json.bufferViews[a.bufferView];
  const off = glb.bin.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return { array: new A(glb.bin.buffer, off, a.count * c), components: c, count: a.count };
}

function hairMaterials(json) {
  const set = new Set();
  json.materials.forEach((material, index) => {
    const t = material.pbrMetallicRoughness?.baseColorTexture?.index;
    if (t !== undefined && json.textures?.[t]?.source === HAIR_IMAGE) set.add(index);
  });
  return set;
}

function hairTriangles(glb) {
  const mats = hairMaterials(glb.json);
  const out = [];
  for (const mesh of glb.json.meshes) {
    for (const prim of mesh.primitives) {
      if (!mats.has(prim.material)) continue;
      const pos = read(glb, prim.attributes.POSITION);
      const idx = read(glb, prim.indices);
      for (let t = 0; t + 2 < idx.count; t += 3) {
        const ids = [idx.array[t], idx.array[t + 1], idx.array[t + 2]];
        out.push(ids.map((i) => [pos.array[i * 3], pos.array[i * 3 + 1], pos.array[i * 3 + 2]]));
      }
    }
  }
  return out;
}

const input = fs.readFileSync(MODEL);

// ---- 1. 결정성 ----
const runA = trimHairGlb(input, { cutRow: CUT_ROW, seed: 0, label: 'runA' });
const runB = trimHairGlb(input, { cutRow: CUT_ROW, seed: 0, label: 'runB' });
check('deterministic output (same input -> identical bytes)', sha256(runA.bytes) === sha256(runB.bytes));

const before = parseGlb(input, 'before');
const after = parseGlb(runA.bytes, 'after');
const trisBefore = hairTriangles(before);
const trisAfter = hairTriangles(after);
const { yCut, jitterAmplitude } = runA.stats;

// ---- 2. 컷 유효 ----
check('cut removed geometry', runA.stats.removedTriangles > 0 && runA.stats.keptTriangles > 0,
  `kept=${runA.stats.keptTriangles} clipped=${runA.stats.clippedTriangles} removed=${runA.stats.removedTriangles}`);
const tolerance = jitterAmplitude + 1e-3;
let lowest = Infinity;
for (const tri of trisAfter) for (const [, y] of tri) if (y < lowest) lowest = y;
check('no hair vertex below the cut plane', lowest >= yCut - tolerance,
  `lowest=${lowest.toFixed(4)} yCut=${yCut.toFixed(4)} tol=${tolerance.toFixed(4)}`);

// ---- 3. 이마 보존 (회귀 방어) ----
const FOREHEAD_MARGIN = 0.03;
const aboveBefore = trisBefore.filter((tri) => tri.every(([, y]) => y > yCut + FOREHEAD_MARGIN)).length;
const aboveAfter = trisAfter.filter((tri) => tri.every(([, y]) => y > yCut + FOREHEAD_MARGIN)).length;
check('strands above the cut plane are untouched', aboveBefore === aboveAfter,
  `before=${aboveBefore} after=${aboveAfter}`);

// ---- 4. 스킨 웨이트 정규화 ----
const mats = hairMaterials(after.json);
const hairPrim = after.json.meshes.flatMap((m) => m.primitives).find((p) => mats.has(p.material));
const weights = read(after, hairPrim.attributes.WEIGHTS_0);
const originalCount = read(before, before.json.meshes.flatMap((m) => m.primitives)
  .find((p) => hairMaterials(before.json).has(p.material)).attributes.WEIGHTS_0).count;
let worstSum = 0;
for (let v = originalCount; v < weights.count; v++) {
  let sum = 0;
  for (let c = 0; c < weights.components; c++) sum += weights.array[v * weights.components + c];
  worstSum = Math.max(worstSum, Math.abs(sum - 1));
}
check('new vertex skin weights sum to 1', worstSum <= 1e-3,
  `added=${weights.count - originalCount} worst |sum-1|=${worstSum.toExponential(2)}`);

// ---- 5. 비헤어 프리미티브 보존 ----
let nonHairChanged = 0;
before.json.meshes.forEach((mesh, mi) => {
  mesh.primitives.forEach((prim, pi) => {
    if (hairMaterials(before.json).has(prim.material)) return;
    const other = after.json.meshes[mi].primitives[pi];
    if (other.indices !== prim.indices) nonHairChanged++;
    for (const [name, accessorIndex] of Object.entries(prim.attributes)) {
      if (other.attributes[name] !== accessorIndex) nonHairChanged++;
    }
  });
});
check('non-hair primitives keep their accessors', nonHairChanged === 0, `changed=${nonHairChanged}`);

// ---- 6. 컨테이너 정합 ----
const positionAccessor = after.json.accessors[hairPrim.attributes.POSITION];
const positions = read(after, hairPrim.attributes.POSITION);
let minY = Infinity;
let maxY = -Infinity;
for (let v = 0; v < positions.count; v++) {
  minY = Math.min(minY, positions.array[v * 3 + 1]);
  maxY = Math.max(maxY, positions.array[v * 3 + 1]);
}
check('POSITION min/max refreshed',
  Math.abs(positionAccessor.min[1] - minY) < 1e-5 && Math.abs(positionAccessor.max[1] - maxY) < 1e-5);
let outOfRange = 0;
for (const mesh of after.json.meshes) {
  for (const prim of mesh.primitives) {
    if (!mats.has(prim.material)) continue;
    const idx = read(after, prim.indices);
    const count = after.json.accessors[prim.attributes.POSITION].count;
    for (let i = 0; i < idx.count; i++) if (idx.array[i] >= count) outOfRange++;
  }
}
check('hair indices stay inside the vertex range', outOfRange === 0, `out=${outOfRange}`);

// ---- 7. 잘못된 입력 ----
let rejected = false;
try {
  trimHairGlb(input, { cutRow: 0, label: 'reject' });
} catch {
  rejected = true;
}
check('cutRow outside (0, height) is rejected', rejected);

console.log('\nstats:');
console.log(`  cut row ${runA.stats.cutRow} -> y=${runA.stats.yCut.toFixed(4)} `
  + `(${(runA.stats.worldPerPixel * 1000).toFixed(3)} mm/px, jitter ±${(runA.stats.jitterAmplitude * 1000).toFixed(1)} mm)`);
console.log(`  primitives=${runA.stats.primitives} added vertices=${runA.stats.addedVertices}`);
console.log(`  triangles kept=${runA.stats.keptTriangles} clipped=${runA.stats.clippedTriangles} removed=${runA.stats.removedTriangles}`);

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nall checks passed');
