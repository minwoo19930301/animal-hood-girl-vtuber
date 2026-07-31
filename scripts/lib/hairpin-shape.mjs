// ---------------------------------------------------------------------------
// 헤어핀 형태 변형 (v3.2) — 도너 X자 클립 하나를 종별로 다른 실루엣으로 만든다.
//
// 문제: HAIR_02(img28)는 전 캐릭터가 같은 메시를 쓰고 색만 달랐다 — "머리핀도 너무
// 똑같다"의 원인. 실측하면 이 핀은 X 한 개가 아니라 교차한 바 2개(프리미티브 2개,
// 각 86 버텍스)이고 캐릭터 왼쪽 관자놀이 한 곳(centroid x≈0.097, y≈1.474)에만 있다.
// 두 바의 최장축이 각각 y·z라 플레이트 법선은 x축 — 즉 x축 회전이 '제자리에서 돌리기'다.
//
// 이 모듈은 각 바를 자기 centroid 기준으로 회전·스케일한다. 버텍스 수가 바뀌지 않으므로
// accessor/버퍼 구조는 그대로고 POSITION min/max만 갱신한다. 핀 버텍스(12660..12831)는
// 스트랜드와 공유되지 않음을 빌드 시점에 검증한다(공유가 있으면 즉시 실패).
// ---------------------------------------------------------------------------

import { parseGlb } from './avatar-pack-common.mjs';
import { writeGlb } from './face-warp.mjs';

const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const COMPONENT_ARRAYS = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

function accessorArray(json, bin, accessorIndex, label) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`${label}: accessor ${accessorIndex} missing`);
  const ArrayType = COMPONENT_ARRAYS[accessor.componentType];
  const components = TYPE_COMPONENTS[accessor.type];
  if (!ArrayType || !components) throw new Error(`${label}: unsupported accessor ${accessorIndex}`);
  const view = json.bufferViews[accessor.bufferView];
  const byteOffset = bin.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return { accessor, array: new ArrayType(bin.buffer, byteOffset, accessor.count * components), components };
}

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

/**
 * 헤어핀 바를 종별 형태로 변형한다.
 *
 * @param {Buffer|Uint8Array} glbBytes
 * @param {object} options
 * @param {number} [options.rotate]        전체 x축 회전(rad) — X 각도 변경
 * @param {number[]} [options.scale]       전체 [sx, sy, sz] 배율
 * @param {Array<{rotate?:number, scale?:number[]}>} [options.bars]
 *        바별 추가 변형(순서 = 프리미티브 순서). 한 바만 얇게/짧게 만들어
 *        '단일 바 클립'처럼 보이게 하는 용도.
 * @param {number} [options.imageIndex]    핀 알베도 이미지 인덱스(기본 28)
 * @returns {{ bytes: Buffer, stats: object }}
 */
export function shapeHairpinGlb(glbBytes, {
  rotate = 0,
  scale = [1, 1, 1],
  bars = [],
  imageIndex = 28,
  label = 'GLB',
} = {}) {
  const source = parseGlb(glbBytes, label);
  const json = JSON.parse(JSON.stringify(source.json));
  const bin = Buffer.from(source.bin);
  const materials = materialsUsingImage(json, imageIndex, label);

  const targets = [];
  const others = new Map(); // POSITION accessor -> 다른 재질이 쓰는 버텍스 집합
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const positionIndex = prim.attributes?.POSITION;
      if (positionIndex === undefined || prim.indices === undefined) continue;
      const { array } = accessorArray(json, bin, prim.indices, label);
      if (materials.has(prim.material)) {
        targets.push({ prim, positionIndex, vertices: new Set(array) });
      } else {
        if (!others.has(positionIndex)) others.set(positionIndex, new Set());
        const set = others.get(positionIndex);
        for (const v of array) set.add(v);
      }
    }
  }
  if (targets.length === 0) throw new Error(`${label}: no hairpin primitive for image ${imageIndex}`);

  // 핀 버텍스 배타성 검증 — 공유되면 다른 파츠가 함께 변형되므로 즉시 실패.
  for (const target of targets) {
    const shared = others.get(target.positionIndex);
    if (!shared) continue;
    for (const v of target.vertices) {
      if (shared.has(v)) throw new Error(`${label}: hairpin vertex ${v} is shared with another material`);
    }
  }

  let moved = 0;
  for (let index = 0; index < targets.length; index++) {
    const { prim, positionIndex, vertices } = targets[index];
    const bar = bars[index] ?? {};
    const angle = rotate + (bar.rotate ?? 0);
    const barScale = bar.scale ?? [1, 1, 1];
    const sx = scale[0] * barScale[0];
    const sy = scale[1] * barScale[1];
    const sz = scale[2] * barScale[2];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const positions = accessorArray(json, bin, positionIndex, label);
    const normals = prim.attributes.NORMAL !== undefined
      ? accessorArray(json, bin, prim.attributes.NORMAL, label)
      : null;

    // 바 자체 centroid 기준 — 머리 옆 부착 위치는 그대로 유지된다.
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const v of vertices) {
      cx += positions.array[v * 3];
      cy += positions.array[v * 3 + 1];
      cz += positions.array[v * 3 + 2];
    }
    cx /= vertices.size;
    cy /= vertices.size;
    cz /= vertices.size;

    for (const v of vertices) {
      const dx = positions.array[v * 3] - cx;
      const dy = positions.array[v * 3 + 1] - cy;
      const dz = positions.array[v * 3 + 2] - cz;
      // x축 회전 (핀 플레이트 안에서 회전) → 축별 스케일
      const ry = dy * cos - dz * sin;
      const rz = dy * sin + dz * cos;
      positions.array[v * 3] = cx + dx * sx;
      positions.array[v * 3 + 1] = cy + ry * sy;
      positions.array[v * 3 + 2] = cz + rz * sz;
      if (normals) {
        const nx = normals.array[v * 3];
        const ny = normals.array[v * 3 + 1];
        const nz = normals.array[v * 3 + 2];
        // 법선은 회전만 적용하고 비균등 스케일 보정 후 재정규화
        const nry = (ny * cos - nz * sin) / (sy || 1);
        const nrz = (ny * sin + nz * cos) / (sz || 1);
        const nrx = nx / (sx || 1);
        const length = Math.hypot(nrx, nry, nrz) || 1;
        normals.array[v * 3] = nrx / length;
        normals.array[v * 3 + 1] = nry / length;
        normals.array[v * 3 + 2] = nrz / length;
      }
      moved++;
    }
  }

  // 변형된 POSITION accessor의 min/max 갱신
  const refreshed = new Set();
  for (const { positionIndex } of targets) {
    if (refreshed.has(positionIndex)) continue;
    refreshed.add(positionIndex);
    const { accessor, array } = accessorArray(json, bin, positionIndex, label);
    if (!Array.isArray(accessor.min) || !Array.isArray(accessor.max)) continue;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < accessor.count; v++) {
      for (let c = 0; c < 3; c++) {
        const value = array[v * 3 + c];
        if (value < min[c]) min[c] = value;
        if (value > max[c]) max[c] = value;
      }
    }
    accessor.min = min;
    accessor.max = max;
  }

  return { bytes: writeGlb(json, bin), stats: { primitives: targets.length, movedVertices: moved } };
}
