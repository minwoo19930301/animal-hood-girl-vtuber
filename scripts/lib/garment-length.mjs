// ---------------------------------------------------------------------------
// 의상 길이 늘리기 (v3.2) — 컷(짧게)의 반대 방향 연산.
//
// hair-trim.mjs의 fraction 컷은 밑단을 잘라 짧게만 만들 수 있다. 도너보다 긴 스커트를
// 쓰려면 지오메트리를 늘려야 한다. 여기서는 대상 재질 버텍스를 허리선(최상단) 앵커로
// y축 스케일한다 — 허리 위치와 웨이스트 밴드는 고정되고 밑단만 내려간다.
//
// 플리츠 주름은 같은 비율로 늘어나므로 세로 스케일 1.2 정도까지는 룩이 유지된다.
// 버텍스 수가 바뀌지 않아 accessor 구조는 그대로고 POSITION min/max만 갱신한다.
// 대상 재질이 다른 재질과 버텍스를 공유하면(도너 Body는 Tops/Bottoms가 accessor를
// 공유한다) 공유 버텍스는 건드리지 않고 즉시 실패한다 — 상의가 함께 늘어나면 안 된다.
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
  return { accessor, array: new ArrayType(bin.buffer, byteOffset, accessor.count * components) };
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
 * 대상 재질을 허리선 앵커로 y축 스케일해 길이를 늘린다(또는 줄인다).
 *
 * @param {Buffer|Uint8Array} glbBytes
 * @param {object} options
 * @param {number} options.scaleY      1보다 크면 길어진다 (1.2 = 20% 길게)
 * @param {number} options.imageIndex  대상 재질의 알베도 이미지 인덱스
 * @returns {{ bytes: Buffer, stats: object }}
 */
export function stretchGarmentGlb(glbBytes, { scaleY, imageIndex, label = 'GLB' } = {}) {
  if (!(scaleY > 0.5 && scaleY < 2)) throw new Error(`${label}: scaleY must be inside (0.5, 2)`);
  const source = parseGlb(glbBytes, label);
  const json = JSON.parse(JSON.stringify(source.json));
  const bin = Buffer.from(source.bin);
  const materials = materialsUsingImage(json, imageIndex, label);

  const targetVertices = new Map(); // POSITION accessor -> Set(vertex)
  const otherVertices = new Map();
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const positionIndex = prim.attributes?.POSITION;
      if (positionIndex === undefined || prim.indices === undefined) continue;
      const { array } = accessorArray(json, bin, prim.indices, label);
      const bucket = materials.has(prim.material) ? targetVertices : otherVertices;
      if (!bucket.has(positionIndex)) bucket.set(positionIndex, new Set());
      const set = bucket.get(positionIndex);
      for (const v of array) set.add(v);
    }
  }
  if (targetVertices.size === 0) throw new Error(`${label}: no primitive uses image ${imageIndex}`);

  let moved = 0;
  let hemBefore = Infinity;
  let hemAfter = Infinity;
  for (const [positionIndex, vertices] of targetVertices) {
    const shared = otherVertices.get(positionIndex);
    if (shared) {
      for (const v of vertices) {
        if (shared.has(v)) throw new Error(`${label}: vertex ${v} is shared with another material`);
      }
    }
    const { array } = accessorArray(json, bin, positionIndex, label);
    let waistY = -Infinity;
    for (const v of vertices) {
      const y = array[v * 3 + 1];
      if (y > waistY) waistY = y;
      if (y < hemBefore) hemBefore = y;
    }
    for (const v of vertices) {
      const y = array[v * 3 + 1];
      array[v * 3 + 1] = waistY - (waistY - y) * scaleY;
      if (array[v * 3 + 1] < hemAfter) hemAfter = array[v * 3 + 1];
      moved++;
    }
  }

  for (const positionIndex of targetVertices.keys()) {
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

  return {
    bytes: writeGlb(json, bin),
    stats: { scaleY, movedVertices: moved, hemBefore, hemAfter, hemDelta: hemAfter - hemBefore },
  };
}
