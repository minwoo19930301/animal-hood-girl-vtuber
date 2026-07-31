// ---------------------------------------------------------------------------
// 헤어 길이 컷 v3.2 — 지오메트리 공간 클리핑.
//
// 왜 텍스처 컷을 버렸나 (실측 근거):
//   img25(Hair_01 스트랜드 아틀라스)는 커버리지 99.2%로 모든 스트랜드 카드가
//   같은 UV 영역을 공유한다. 텍셀 하나가 대응하는 world Y의 폭은 중앙값 0.192,
//   p90 0.348 — 헤어 전체 Y 높이(1.075~1.645, 0.570)의 34~61%다. 즉 "행 799 이하
//   알파 0"은 턱 높이의 롱 스트랜드와 '이마를 지나는 베이비헤어'를 동시에 자른다.
//   그 결과 이마 중앙에 수평 절단면이 대시로 남아 1자 눈썹처럼 읽혔다(v3/v3.1 버그).
//   어블레이션으로 증명: 알파 컷만 끄면(재음영 유지) 이마 대시가 완전히 사라지고,
//   재음영만 끄면(알파 컷 유지) 그대로 남는다. 원인은 재음영이 아니라 알파 컷이었다.
//
// v3.2 접근:
//   컷을 텍스처가 아니라 메시에서 수행한다. 컷 평면 y = yCut + 지터(x)를 기준으로
//   Hair_01 프리미티브의 삼각형을 Sutherland–Hodgman으로 클리핑해 위쪽만 남긴다.
//   - yCut은 하드코딩이 아니라 기존 design.hairCut(행)에서 유도한다: 그 행 근처
//     UV v를 가진 헤어 버텍스의 median y (행별 y 분포는 p10~p90 폭 0.02로 타이트).
//   - 지터 진폭도 같은 방식으로 측정한 dy/dv 기울기로 px → world 변환한다.
//   - 이마 위 카드는 y가 컷 평면보다 높으므로 자동으로 보존된다 — 절단면이 이마에
//     생기지 않는다(텍스처 컷으로는 원리적으로 불가능했던 부분).
//   - 새 버텍스는 엣지 키로 dedup해 카드 경계에 균열이 생기지 않는다.
//   - 스킨 가중치는 살아남는 쪽 엔드포인트 기준: 조인트 집합이 같으면 보간,
//     다르면 지배 엔드포인트를 복사한다(카드 내부는 동일 집합이라 사실상 보간).
// ---------------------------------------------------------------------------

import { parseGlb } from './avatar-pack-common.mjs';
import { writeGlb } from './face-warp.mjs';

const COMPONENT_ARRAYS = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const CLIP_EPSILON = 1e-6;
// 지터 공간 주파수(rad/m): 각각 파장 ≈ 14cm / 6cm / 2.5cm.
const JITTER_FREQUENCIES = [45, 106, 253];
const JITTER_WEIGHTS = [0.5, 0.35, 0.15];
const JITTER_PHASES = [0, 1.7, 4.2];
// yCut / 기울기 측정 밴드(px, img25 1024행 기준).
const SAMPLE_BAND_PX = 6;
const GRADIENT_SPAN_PX = 40;

function accessorView(json, bin, accessorIndex, label) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`${label}: accessor ${accessorIndex} does not exist`);
  if (accessor.sparse) throw new Error(`${label}: sparse accessor ${accessorIndex} unsupported`);
  const ArrayType = COMPONENT_ARRAYS[accessor.componentType];
  const components = TYPE_COMPONENTS[accessor.type];
  if (!ArrayType || !components) {
    throw new Error(`${label}: accessor ${accessorIndex} has unsupported type`);
  }
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error(`${label}: accessor ${accessorIndex} has no bufferView`);
  const packed = components * ArrayType.BYTES_PER_ELEMENT;
  if (view.byteStride !== undefined && view.byteStride !== packed) {
    throw new Error(`${label}: interleaved accessor ${accessorIndex} unsupported`);
  }
  const byteOffset = bin.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return {
    accessor,
    array: new ArrayType(bin.buffer, byteOffset, accessor.count * components),
    components,
    ArrayType,
  };
}

/** imageIndex를 baseColorTexture로 쓰는 머티리얼 인덱스 집합. */
function materialsUsingImage(json, imageIndex, label) {
  const found = new Set();
  (json.materials ?? []).forEach((material, index) => {
    const textureIndex = material.pbrMetallicRoughness?.baseColorTexture?.index;
    if (textureIndex === undefined) return;
    if (json.textures?.[textureIndex]?.source === imageIndex) found.add(index);
  });
  if (found.size === 0) throw new Error(`${label}: no material uses image ${imageIndex}`);
  return found;
}

function median(values) {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** UV 행(px) 근처 버텍스의 median y — 컷 높이/기울기 측정용. */
function medianYAtRow(positions, uvs, vertexIds, row, textureHeight, band = SAMPLE_BAND_PX) {
  const samples = [];
  for (const v of vertexIds) {
    const pixel = uvs[v * 2 + 1] * textureHeight;
    if (Math.abs(pixel - row) <= band) samples.push(positions[v * 3 + 1]);
  }
  return median(samples);
}

function jitterAt(x, amplitude, seed) {
  let sum = 0;
  for (let i = 0; i < JITTER_FREQUENCIES.length; i++) {
    sum += JITTER_WEIGHTS[i] * Math.sin(JITTER_FREQUENCIES[i] * x + JITTER_PHASES[i] + seed * (0.9 + i * 0.4));
  }
  return amplitude * sum;
}

/**
 * 컷 높이장(height field) — 여러 평면을 부드러운 영역 가중으로 합성한다.
 *
 * h(v) = yBase + Σ (yPlane_i − yBase) · w_i(v) + tiltX·x + tiltZ·z + 지터(x)
 *
 * w_i는 z(앞/뒤) · x(좌/우) 정규화 좌표의 smoothstep이라 연속이다 — 카드 사이에
 * 불연속 이음선이 생기지 않는다. yPlane_i는 하드코딩이 아니라 각 컷의 row 근처
 * UV v를 가진 버텍스 median y에서 유도한다(기존 규약과 동일).
 *
 * @typedef {object} HairCutSpec
 * @property {number} row            img25 행 (필수)
 * @property {'all'|'front'|'back'|'left'|'right'} [region] 적용 영역 (기본 all)
 * @property {number} [softness]     영역 경계 부드러움 0..1 (기본 0.35)
 * @property {number} [tiltX]        x 기울기 (world/world) — 비대칭 컷
 * @property {number} [tiltZ]        z 기울기 — 앞뒤 경사 컷
 * @property {number} [jitterPx]     이 컷의 지터 진폭(px)
 */

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 정규화 좌표(0..1)에서의 영역 가중치. */
function regionWeight(region, softness, nx, nz) {
  const s = Math.min(0.49, Math.max(0.01, softness / 2));
  switch (region) {
    case 'front': return smoothstep(0.5 + s, 0.5 - s, nz);
    case 'back': return smoothstep(0.5 - s, 0.5 + s, nz);
    case 'left': return smoothstep(0.5 - s, 0.5 + s, nx);
    case 'right': return smoothstep(0.5 + s, 0.5 - s, nx);
    default: return 1;
  }
}

/**
 * Hair_01 스트랜드를 컷 높이장 위쪽만 남기도록 클리핑한다.
 *
 * @param {Buffer|Uint8Array} glbBytes 입력 VRM(GLB)
 * @param {object} options
 * @param {number} [options.cutRow]    단일 평면 컷 (하위 호환)
 * @param {HairCutSpec[]} [options.cuts] 다평면 컷 (첫 항목이 기준 평면)
 * @param {number} [options.jitterPx]  기본 지터 진폭(px)
 * @param {number} [options.seed]      결정적 위상 시드(variantIndex)
 * @param {number} [options.imageIndex] 스트랜드 아틀라스 이미지 인덱스
 * @param {number} [options.textureHeight] 아틀라스 높이(px)
 * @returns {{ bytes: Buffer, stats: object }}
 */
export function trimHairGlb(glbBytes, {
  cutRow,
  cuts,
  jitterPx = 10,
  seed = 0,
  imageIndex = 25,
  textureHeight = 1024,
  label = 'GLB',
} = {}) {
  const specs = cuts ?? (cutRow === undefined ? [] : [{ row: cutRow }]);
  if (specs.length === 0) throw new Error(`${label}: provide cutRow or cuts`);
  for (const spec of specs) {
    const hasRow = spec.row !== undefined;
    const hasFraction = spec.fraction !== undefined;
    if (hasRow === hasFraction) {
      throw new Error(`${label}: each cut needs exactly one of row or fraction`);
    }
    if (hasRow && (!Number.isInteger(spec.row) || spec.row <= 0 || spec.row >= textureHeight)) {
      throw new Error(`${label}: cut row must be an integer inside (0, ${textureHeight})`);
    }
    if (hasFraction && !(spec.fraction > 0 && spec.fraction < 1)) {
      throw new Error(`${label}: cut fraction must be inside (0, 1)`);
    }
  }
  const source = parseGlb(glbBytes, label);
  const json = JSON.parse(JSON.stringify(source.json));
  const bin = Buffer.from(source.bin);
  const materials = materialsUsingImage(json, imageIndex, label);

  // 대상 프리미티브 수집 + 공유 버텍스 accessor 검증.
  const targets = [];
  const attributeAccessors = new Map();
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (!materials.has(prim.material)) continue;
      if (prim.targets) throw new Error(`${label}: hair primitive has morph targets; unsupported`);
      if (prim.indices === undefined) throw new Error(`${label}: hair primitive without indices`);
      if (prim.mode !== undefined && prim.mode !== 4) {
        throw new Error(`${label}: hair primitive mode ${prim.mode} is not TRIANGLES`);
      }
      for (const [name, accessorIndex] of Object.entries(prim.attributes)) {
        const previous = attributeAccessors.get(name);
        if (previous !== undefined && previous !== accessorIndex) {
          throw new Error(`${label}: hair primitives do not share the ${name} accessor`);
        }
        attributeAccessors.set(name, accessorIndex);
      }
      targets.push(prim);
    }
  }
  if (targets.length === 0) throw new Error(`${label}: no hair primitive found for image ${imageIndex}`);
  if (!attributeAccessors.has('POSITION') || !attributeAccessors.has('TEXCOORD_0')) {
    throw new Error(`${label}: hair primitives need POSITION and TEXCOORD_0`);
  }

  // 원본 버텍스 스트림 (모든 대상 프리미티브가 공유).
  const streams = new Map();
  for (const [name, accessorIndex] of attributeAccessors) {
    const view = accessorView(json, bin, accessorIndex, label);
    streams.set(name, {
      accessorIndex,
      components: view.components,
      ArrayType: view.ArrayType,
      accessor: view.accessor,
      values: Array.from(view.array),
    });
  }
  const positions = streams.get('POSITION').values;
  const uvs = streams.get('TEXCOORD_0').values;
  const vertexCount = streams.get('POSITION').accessor.count;

  // 대상 프리미티브가 실제로 참조하는 버텍스만 측정에 사용한다.
  const referenced = new Set();
  const primIndices = new Map();
  for (const prim of targets) {
    const view = accessorView(json, bin, prim.indices, label);
    const list = Array.from(view.array);
    primIndices.set(prim, list);
    for (const v of list) referenced.add(v);
  }

  // 컷 높이와 px→world 기울기를 메시에서 유도 (하드코딩 좌표 없음).
  // row 컷: 해당 UV 행 근처 버텍스의 median y (스트랜드 아틀라스처럼 v↔y 상관이 있을 때)
  // fraction 컷: 대상 재질 자체 높이 범위의 아래쪽 비율 (의상처럼 UV가 무관할 때)
  let extentMinY = Infinity;
  let extentMaxY = -Infinity;
  for (const v of referenced) {
    const y = positions[v * 3 + 1];
    if (y < extentMinY) extentMinY = y;
    if (y > extentMaxY) extentMaxY = y;
  }
  const extent = extentMaxY - extentMinY;
  const heightOf = (spec) => (spec.row !== undefined
    ? medianYAtRow(positions, uvs, referenced, spec.row, textureHeight)
    : extentMinY + extent * spec.fraction);

  const baseRow = specs[0].row;
  const yCut = heightOf(specs[0]);
  let worldPerPixel;
  if (baseRow !== undefined) {
    const yAbove = medianYAtRow(positions, uvs, referenced, baseRow - GRADIENT_SPAN_PX, textureHeight);
    const yBelow = medianYAtRow(positions, uvs, referenced, baseRow + GRADIENT_SPAN_PX, textureHeight);
    if (!Number.isFinite(yAbove) || !Number.isFinite(yBelow)) {
      throw new Error(`${label}: could not measure the cut gradient at row ${baseRow}`);
    }
    worldPerPixel = Math.abs(yAbove - yBelow) / (2 * GRADIENT_SPAN_PX);
  } else {
    // fraction 컷은 px 척도가 없다 — 지터를 재질 높이의 0.1%/px로 환산.
    worldPerPixel = extent * 0.001;
  }
  if (!Number.isFinite(yCut)) {
    throw new Error(`${label}: could not measure the cut height for ${JSON.stringify(specs[0])}`);
  }
  const jitterAmplitude = jitterPx * worldPerPixel;

  // 각 컷의 평면 높이 + 헤어 x/z 바운즈(영역 가중 정규화용).
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const v of referenced) {
    const x = positions[v * 3];
    const z = positions[v * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanZ = Math.max(maxZ - minZ, 1e-6);

  const planes = specs.map((spec, index) => {
    const y = index === 0 ? yCut : heightOf(spec);
    if (!Number.isFinite(y)) throw new Error(`${label}: could not measure cut height at row ${spec.row}`);
    return {
      delta: y - yCut,
      region: spec.region ?? 'all',
      softness: spec.softness ?? 0.35,
      tiltX: spec.tiltX ?? 0,
      tiltZ: spec.tiltZ ?? 0,
      jitter: (spec.jitterPx ?? jitterPx) * worldPerPixel,
      y,
    };
  });

  const cutAt = (x, z) => {
    const nx = (x - minX) / spanX;
    const nz = (z - minZ) / spanZ;
    let height = yCut;
    let jitter = 0;
    for (const plane of planes) {
      const weight = regionWeight(plane.region, plane.softness, nx, nz);
      if (weight <= 0) continue;
      height += plane.delta * weight;
      height += (plane.tiltX * x + plane.tiltZ * z) * weight;
      jitter += plane.jitter * weight;
    }
    return height + jitterAt(x, jitter, seed);
  };

  // --- 클리핑 -------------------------------------------------------------
  const newVertices = new Map(); // edgeKey -> new vertex index
  const appended = new Map();
  for (const name of streams.keys()) appended.set(name, []);

  const weightsStream = streams.get('WEIGHTS_0');
  const jointsStream = streams.get('JOINTS_0');

  const interpolate = (a, b, t) => {
    const key = a < b ? `${a}:${b}:${t.toFixed(6)}` : `${b}:${a}:${(1 - t).toFixed(6)}`;
    const cached = newVertices.get(key);
    if (cached !== undefined) return cached;
    const index = vertexCount + appended.get('POSITION').length / 3;
    for (const [name, stream] of streams) {
      const { components, values } = stream;
      const out = appended.get(name);
      if (name === 'JOINTS_0') {
        const dominant = t <= 0.5 ? a : b;
        for (let c = 0; c < components; c++) out.push(values[dominant * components + c]);
        continue;
      }
      if (name === 'WEIGHTS_0' && jointsStream) {
        const jc = jointsStream.components;
        let sameJoints = true;
        for (let c = 0; c < jc; c++) {
          if (jointsStream.values[a * jc + c] !== jointsStream.values[b * jc + c]) sameJoints = false;
        }
        const dominant = t <= 0.5 ? a : b;
        let sum = 0;
        const blended = [];
        for (let c = 0; c < components; c++) {
          const value = sameJoints
            ? values[a * components + c] + (values[b * components + c] - values[a * components + c]) * t
            : values[dominant * components + c];
          blended.push(value);
          sum += value;
        }
        for (const value of blended) out.push(sum > 0 ? value / sum : value);
        continue;
      }
      const blended = [];
      for (let c = 0; c < components; c++) {
        const av = values[a * components + c];
        const bv = values[b * components + c];
        blended.push(av + (bv - av) * t);
      }
      if (name === 'NORMAL' && components === 3) {
        const length = Math.hypot(blended[0], blended[1], blended[2]);
        if (length > 0) for (let c = 0; c < 3; c++) blended[c] /= length;
      }
      for (const value of blended) out.push(value);
    }
    newVertices.set(key, index);
    return index;
  };

  const signedDistance = (v) => {
    if (v < vertexCount) return positions[v * 3 + 1] - cutAt(positions[v * 3], positions[v * 3 + 2]);
    const local = (v - vertexCount) * 3;
    const appendedPositions = appended.get('POSITION');
    return appendedPositions[local + 1] - cutAt(appendedPositions[local], appendedPositions[local + 2]);
  };

  let removedTriangles = 0;
  let clippedTriangles = 0;
  for (const prim of targets) {
    const indices = primIndices.get(prim);
    const kept = [];
    for (let t = 0; t + 2 < indices.length; t += 3) {
      const tri = [indices[t], indices[t + 1], indices[t + 2]];
      const distances = tri.map((v) => positions[v * 3 + 1]
        - cutAt(positions[v * 3], positions[v * 3 + 2]));
      if (distances.every((d) => d >= -CLIP_EPSILON)) {
        kept.push(tri[0], tri[1], tri[2]);
        continue;
      }
      if (distances.every((d) => d <= CLIP_EPSILON)) {
        removedTriangles++;
        continue;
      }
      // Sutherland–Hodgman: 컷 평면 위쪽(거리 >= 0) 폴리곤만 남긴다.
      const polygon = [];
      for (let i = 0; i < 3; i++) {
        const current = tri[i];
        const next = tri[(i + 1) % 3];
        const dCurrent = distances[i];
        const dNext = distances[(i + 1) % 3];
        if (dCurrent >= 0) polygon.push(current);
        if ((dCurrent >= 0) !== (dNext >= 0)) {
          const span = dCurrent - dNext;
          if (Math.abs(span) < CLIP_EPSILON) continue;
          polygon.push(interpolate(current, next, dCurrent / span));
        }
      }
      if (polygon.length < 3) {
        removedTriangles++;
        continue;
      }
      for (let i = 1; i + 1 < polygon.length; i++) {
        kept.push(polygon[0], polygon[i], polygon[i + 1]);
      }
      clippedTriangles++;
    }
    prim._trimmedIndices = kept;
  }

  // --- 버퍼 재조립 --------------------------------------------------------
  const chunks = [bin];
  let offset = bin.length;
  const pushView = (typedArray) => {
    const padding = (4 - (offset % 4)) % 4;
    if (padding) {
      chunks.push(Buffer.alloc(padding, 0));
      offset += padding;
    }
    const buffer = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    chunks.push(buffer);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buffer.length });
    offset += buffer.length;
    return json.bufferViews.length - 1;
  };

  const newAttributeAccessors = new Map();
  for (const [name, stream] of streams) {
    const { components, ArrayType, accessor, values } = stream;
    const extra = appended.get(name);
    const merged = new ArrayType(values.length + extra.length);
    merged.set(values, 0);
    if (ArrayType === Float32Array) {
      merged.set(extra, values.length);
    } else {
      for (let i = 0; i < extra.length; i++) merged[values.length + i] = Math.round(extra[i]);
    }
    const bufferView = pushView(merged);
    const nextAccessor = {
      bufferView,
      componentType: accessor.componentType,
      count: merged.length / components,
      type: accessor.type,
    };
    if (accessor.normalized) nextAccessor.normalized = true;
    if (name === 'POSITION') {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let v = 0; v < nextAccessor.count; v++) {
        for (let c = 0; c < 3; c++) {
          const value = merged[v * 3 + c];
          if (value < min[c]) min[c] = value;
          if (value > max[c]) max[c] = value;
        }
      }
      nextAccessor.min = min;
      nextAccessor.max = max;
    }
    json.accessors.push(nextAccessor);
    newAttributeAccessors.set(name, json.accessors.length - 1);
  }

  let keptTriangles = 0;
  for (const prim of targets) {
    const indices = Uint32Array.from(prim._trimmedIndices);
    delete prim._trimmedIndices;
    keptTriangles += indices.length / 3;
    const bufferView = pushView(indices);
    json.accessors.push({
      bufferView,
      componentType: 5125,
      count: indices.length,
      type: 'SCALAR',
    });
    prim.indices = json.accessors.length - 1;
    for (const [name, accessorIndex] of newAttributeAccessors) {
      prim.attributes[name] = accessorIndex;
    }
  }

  json.buffers[0].byteLength = offset;
  const bytes = writeGlb(json, Buffer.concat(chunks));
  return {
    bytes,
    stats: {
      cutRow: baseRow,
      cuts: planes.map((p) => ({ region: p.region, y: +p.y.toFixed(4) })),
      yCut,
      worldPerPixel,
      jitterAmplitude,
      primitives: targets.length,
      addedVertices: appended.get('POSITION').length / 3,
      keptTriangles,
      clippedTriangles,
      removedTriangles,
    },
  };
}
