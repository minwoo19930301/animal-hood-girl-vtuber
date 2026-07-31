/**
 * face-warp.mjs — VRM(GLB) 얼굴형 워프(성형) 라이브러리.
 *
 * DESIGN-PACK-V3.1.md 2절 구현: Face/Body/Hair 메시의 POSITION 버텍스를
 * head 본 기준 얼굴 영역에서만 부드러운 falloff(스무스스텝) 필드로 이동한다.
 *
 * 핵심 성질
 *  - 결정적: 같은 입력(GLB 바이트 + 프로필) → 바이트 동일 출력. Math.random 없음.
 *  - 필드는 순수 "월드 위치의 함수" — 메시/토폴로지와 무관하므로 Face·Body(목),
 *    Body의 HairBack(두피 캡)·Hair 스트랜드처럼 서로 다른 메시에 중복된 경계
 *    버텍스도 동일하게 이동해 심(seam)이 생기지 않는다. 헤어 뿌리(관자놀이)도
 *    같은 필드로 자동 추종한다.
 *  - 금지 영역 2중 방어:
 *    (1) EyeIris/EyeHighlight/EyeWhite/EyeExtra 머티리얼 프리미티브가 참조하는
 *        버텍스는 인덱스 단위로 하드 락(이동 0) — lookAt·홍채 정렬 보존.
 *    (2) 눈 소켓(EyeWhite 실측 중심+반경) 주변은 방사 스무스스텝 배제 필드로
 *        모든 성분을 0으로 감쇠 — 눈꺼풀/아이라인이 안구에서 이탈하지 않는다.
 *  - 모프타깃(blink/aa 등)은 델타 어트리뷰트라 베이스 이동과 독립 — 바이트 불변.
 *  - NORMAL 재계산 안 함(기본): 진폭 상한(≤6mm, 5% 스케일)에서 노멀 회전은
 *    3~5° 수준이고 MToon 툰 램프/아웃라인에는 실측상 영향이 없다(파일럿 렌더로
 *    검증). 재계산은 UV 심에서 버텍스 웰딩이 필요해 오히려 심 리스크가 크다.
 *
 * 진폭 상한 (초과 시 throw):
 *   width/jawWidth ±4% · cheek ±0.006 m · chinLen/faceLen ±5% · (턱 z ±0.004 m)
 *
 * 필드 수식 (v = 버텍스 월드 위치, 도너 좌표계: 정면 -Z)
 *   m(y)  = smoothstep(neckY, headY, y)               — 목 아래 0, 머리 1
 *   g(v)  = min_side smoothstep(rIn, rOut, |v-S±|)     — 눈 소켓 배제(0)→통과(1)
 *   f(z)  = smoothstep(headZ, headZ-0.04, z)           — 얼굴 전면 1, 후두부 0
 *   jaw(y)= 1 - smoothstep(mouthY, eyeBotY, y)         — 입 이하 1, 눈 밑 0
 *   bump±(v) = (1 - smoothstep(0, R, |v - C±|))²       — 볼 중심 가우시안형 범프
 *   dx = m·g·( x·width + x·jawWidth·jaw + sgn(x)·cheek·bump )
 *   dy = m·g·( (y-headY)·faceLen + (y-eyeBotY)·chinLen·jaw·f )
 *   dz = 0
 *
 * 사용:
 *   import { warpFaceGlb, FACE_WARP_PROFILES } from './lib/face-warp.mjs';
 *   const { bytes, stats } = warpFaceGlb(fs.readFileSync(in), { cheek: 0.005, ... });
 */

import { parseGlb } from './avatar-pack-common.mjs';

export const GLB_MAGIC = 0x46546c67;
export const CHUNK_JSON = 0x4e4f534a;
export const CHUNK_BIN = 0x004e4942;

/** 진폭 상한 (DESIGN-PACK-V3.1.md 2절). 비율은 무차원, cheek/chinZ는 미터. */
export const AMPLITUDE_LIMITS = Object.freeze({
  width: 0.04,
  jawWidth: 0.04,
  faceLen: 0.05,
  chinLen: 0.05,
  cheek: 0.006,
  chinZ: 0.004,
});

/** 이동 금지 메시(머티리얼) — 눈알 계열. lookAt·홍채 정렬 보존. */
export const LOCKED_MATERIAL_PATTERN = /eyeiris|eyehighlight|eyewhite|eyeextra/i;

/**
 * 디자인 표 4계열 → slug별 프로필 (2절 표 그대로).
 * 뉴트럴 계열은 "width ±1% 이내 개성 소폭" — 아래 값은 파일럿 이후 조정 가능.
 */
export const FACE_WARP_PROFILES = Object.freeze({
  // 라운드 (볼 통통, 턱 짧게)
  bear: { cheek: +0.006, chinLen: -0.045, width: +0.035 },
  panda: { cheek: +0.006, chinLen: -0.045, width: +0.035 },
  rabbit: { cheek: +0.006, chinLen: -0.045, width: +0.035 },
  // 샤프 (턱선 좁게, 턱 살짝 길게)
  fox: { jawWidth: -0.04, chinLen: +0.04, cheek: -0.002 },
  tiger: { jawWidth: -0.04, chinLen: +0.04, cheek: -0.002 },
  cat: { jawWidth: -0.04, chinLen: +0.04, cheek: -0.002 },
  // 롱 소프트 (갸름·온화)
  elephant: { faceLen: +0.03, width: -0.02, cheek: 0 },
  giraffe: { faceLen: +0.03, width: -0.02, cheek: 0 },
  // 뉴트럴 (미세 개성)
  monkey: { width: +0.01 },
  turtle: { width: -0.006 },
  penguin: { width: +0.006 },
  owl: { width: +0.01 },
});

const COMPONENT_ARRAYS = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function normaliseProfile(profile, label) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error(`${label}: profile must be an object`);
  }
  const known = ['cheek', 'jawWidth', 'chinLen', 'faceLen', 'width'];
  for (const key of Object.keys(profile)) {
    if (!known.includes(key)) throw new Error(`${label}: unknown profile key "${key}"`);
  }
  const out = {};
  for (const key of known) {
    const value = profile[key] ?? 0;
    if (!Number.isFinite(value)) throw new Error(`${label}: profile.${key} must be a finite number`);
    const limit = AMPLITUDE_LIMITS[key];
    if (Math.abs(value) > limit + 1e-9) {
      throw new Error(`${label}: profile.${key}=${value} exceeds amplitude limit ±${limit}`);
    }
    out[key] = value;
  }
  return out;
}

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
    throw new Error(`${label}: interleaved accessor ${accessorIndex} unsupported (stride ${view.byteStride})`);
  }
  const byteOffset = bin.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return {
    accessor,
    array: new ArrayType(bin.buffer, byteOffset, accessor.count * components),
    components,
  };
}

function nodeWorldTranslation(json, nodeIndex, parents, label) {
  let position = [0, 0, 0];
  let current = nodeIndex;
  while (current !== undefined) {
    const node = json.nodes[current];
    if (!node) throw new Error(`${label}: node ${current} does not exist`);
    const rotation = node.rotation;
    if (rotation && rotation.slice(0, 3).some((v) => Math.abs(v) > 1e-6)) {
      throw new Error(`${label}: node ${current} has a rest rotation; translation-only rig expected`);
    }
    if (node.scale && node.scale.some((v) => Math.abs(v - 1) > 1e-6)) {
      throw new Error(`${label}: node ${current} has a rest scale; translation-only rig expected`);
    }
    const t = node.translation ?? [0, 0, 0];
    position = [position[0] + t[0], position[1] + t[1], position[2] + t[2]];
    current = parents.get(current);
  }
  return position;
}

function humanBoneNode(json, boneName, label) {
  const vrm0 = json.extensions?.VRM?.humanoid?.humanBones;
  if (Array.isArray(vrm0)) {
    const bone = vrm0.find((entry) => entry.bone === boneName);
    if (bone) return bone.node;
  }
  const vrm1 = json.extensions?.VRMC_vrm?.humanoid?.humanBones;
  if (vrm1?.[boneName]?.node !== undefined) return vrm1[boneName].node;
  throw new Error(`${label}: humanoid bone "${boneName}" not found`);
}

function materialNameOf(json, prim) {
  return json.materials?.[prim.material]?.name ?? '';
}

/**
 * 얼굴 랜드마크 실측 — 모든 값은 입력 GLB에서 유도(하드코딩 좌표 없음).
 * 반환 좌표계는 도너 원공간(VRM0: 정면 -Z).
 */
export function measureFaceLandmarks(glb, label = 'GLB') {
  const { json, bin } = glb;
  const parents = new Map();
  json.nodes.forEach((node, index) => (node.children ?? []).forEach((child) => parents.set(child, index)));

  const head = nodeWorldTranslation(json, humanBoneNode(json, 'head', label), parents, label);
  const neck = nodeWorldTranslation(json, humanBoneNode(json, 'neck', label), parents, label);
  if (!(head[1] > neck[1])) throw new Error(`${label}: head bone must be above neck bone`);

  // Face 메시: FaceMouth와 EyeWhite 프리미티브를 모두 가진 메시.
  let faceMesh = null;
  for (const mesh of json.meshes ?? []) {
    const names = mesh.primitives.map((prim) => materialNameOf(json, prim));
    if (names.some((n) => /facemouth/i.test(n)) && names.some((n) => /eyewhite/i.test(n))) {
      faceMesh = mesh;
      break;
    }
  }
  if (!faceMesh) throw new Error(`${label}: face mesh (FaceMouth+EyeWhite) not found`);

  const positionIndex = faceMesh.primitives[0].attributes?.POSITION;
  const { array: pos } = accessorView(json, bin, positionIndex, label);

  const vertsOf = (prim) => {
    const { array } = accessorView(json, bin, prim.indices, label);
    return new Set(array);
  };
  const bboxOf = (vertexSet) => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const v of vertexSet) {
      for (let c = 0; c < 3; c++) {
        const value = pos[v * 3 + c];
        if (value < min[c]) min[c] = value;
        if (value > max[c]) max[c] = value;
      }
    }
    return { min, max };
  };

  const primsByPattern = (pattern) => faceMesh.primitives.filter((prim) => pattern.test(materialNameOf(json, prim)));

  const mouthPrims = primsByPattern(/facemouth/i);
  const eyeWhitePrims = primsByPattern(/eyewhite/i);
  const skinPrims = primsByPattern(/face_\d*_?skin|_skin$/i);
  if (skinPrims.length === 0) throw new Error(`${label}: face skin primitives not found`);

  const mouthVerts = new Set();
  for (const prim of mouthPrims) for (const v of vertsOf(prim)) mouthVerts.add(v);
  const mouthBox = bboxOf(mouthVerts);
  const mouthY = (mouthBox.min[1] + mouthBox.max[1]) / 2;

  // 눈 소켓: EyeWhite 버텍스를 좌우로 나눠 중심·반경 실측.
  const eyeWhiteVerts = new Set();
  for (const prim of eyeWhitePrims) for (const v of vertsOf(prim)) eyeWhiteVerts.add(v);
  const sides = [[], []]; // [x<0, x>=0]
  for (const v of eyeWhiteVerts) sides[pos[v * 3] < 0 ? 0 : 1].push(v);
  const sockets = sides.map((verts) => {
    if (verts.length < 8) throw new Error(`${label}: eye-white side has too few vertices`);
    const center = [0, 0, 0];
    for (const v of verts) for (let c = 0; c < 3; c++) center[c] += pos[v * 3 + c];
    for (let c = 0; c < 3; c++) center[c] /= verts.length;
    let radius = 0;
    for (const v of verts) {
      const dx = pos[v * 3] - center[0];
      const dy = pos[v * 3 + 1] - center[1];
      const dz = pos[v * 3 + 2] - center[2];
      radius = Math.max(radius, Math.hypot(dx, dy, dz));
    }
    return { center, rIn: radius * 1.05 + 0.002, rOut: radius * 1.05 + 0.002 + radius * 0.9 };
  });
  const eyeBottomY = Math.min(...[...eyeWhiteVerts].map((v) => pos[v * 3 + 1]));

  // 볼 중심: 입~눈밑 중간 높이 슬라이스에서 전면(z<headZ-0.025) 스킨의 측면 극값.
  const cheekY = (mouthY + eyeBottomY) / 2;
  const skinVerts = new Set();
  for (const prim of skinPrims) for (const v of vertsOf(prim)) skinVerts.add(v);
  let cheekX = 0;
  let cheekZSum = 0;
  let cheekZCount = 0;
  for (const v of skinVerts) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    if (Math.abs(y - cheekY) > 0.014 || z > head[2] - 0.025) continue;
    cheekX = Math.max(cheekX, Math.abs(x));
    if (Math.abs(x) > cheekX * 0.6) {
      cheekZSum += z;
      cheekZCount++;
    }
  }
  if (!(cheekX > 0.02)) throw new Error(`${label}: cheek slice measurement failed (cheekX=${cheekX})`);
  const cheekZ = cheekZCount ? cheekZSum / cheekZCount : head[2] - 0.05;
  const cheekCenterX = cheekX * 0.92;
  const cheekRadius = cheekX * 0.55;

  if (!(eyeBottomY > mouthY && mouthY > neck[1])) {
    throw new Error(`${label}: landmark sanity failed (eyeBottomY=${eyeBottomY}, mouthY=${mouthY}, neckY=${neck[1]})`);
  }

  return {
    headY: head[1],
    headZ: head[2],
    neckY: neck[1],
    mouthY,
    eyeBottomY,
    sockets,
    cheek: { centerX: cheekCenterX, y: cheekY, z: cheekZ, radius: cheekRadius },
  };
}

/** 워프 필드 — 위치의 순수 함수. 반환 [dx, dy, dz]. */
export function displacementAt(x, y, z, profile, marks) {
  const m = smoothstep(marks.neckY, marks.headY, y);
  if (m <= 0) return null;

  let g = 1;
  for (const socket of marks.sockets) {
    const dx = x - socket.center[0];
    const dy = y - socket.center[1];
    const dz = z - socket.center[2];
    g = Math.min(g, smoothstep(socket.rIn, socket.rOut, Math.hypot(dx, dy, dz)));
    if (g <= 0) return null;
  }

  const jaw = 1 - smoothstep(marks.mouthY, marks.eyeBottomY, y);
  const front = smoothstep(marks.headZ, marks.headZ - 0.04, z);

  let dx = x * profile.width + x * profile.jawWidth * jaw;
  if (profile.cheek !== 0) {
    const cx = x < 0 ? -marks.cheek.centerX : marks.cheek.centerX;
    const dcx = x - cx;
    const dcy = y - marks.cheek.y;
    const dcz = z - marks.cheek.z;
    const fall = 1 - smoothstep(0, marks.cheek.radius, Math.hypot(dcx, dcy, dcz));
    dx += Math.sign(x) * profile.cheek * fall * fall;
  }
  const dy = (y - marks.headY) * profile.faceLen
    + (y - marks.eyeBottomY) * profile.chinLen * jaw * front;

  const gm = g * m;
  return [dx * gm, dy * gm, 0];
}

/**
 * GLB(VRM) 얼굴형 워프 — 메인 엔트리.
 * @param {Buffer|Uint8Array} glbBytes 입력 GLB
 * @param {object} profile {cheek, jawWidth, chinLen, faceLen, width}
 * @returns {{ bytes: Buffer, stats: object }}
 */
export function warpFaceGlb(glbBytes, profile, { label = 'GLB' } = {}) {
  const p = normaliseProfile(profile, label);
  const source = parseGlb(glbBytes, label);

  // BIN 사본 위에서 작업 (입력 버퍼 불변 보장).
  const bin = Buffer.from(source.bin);
  const json = JSON.parse(JSON.stringify(source.json));
  const glb = { json, bin };

  const marks = measureFaceLandmarks(glb, label);

  // 락 버텍스: 눈알 계열 프리미티브가 참조하는 인덱스 (POSITION accessor별).
  const locks = new Map(); // positionAccessorIndex -> Set(vertexIndex)
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      if (!LOCKED_MATERIAL_PATTERN.test(materialNameOf(json, prim))) continue;
      const posIndex = prim.attributes?.POSITION;
      if (posIndex === undefined || prim.indices === undefined) continue;
      if (!locks.has(posIndex)) locks.set(posIndex, new Set());
      const lockSet = locks.get(posIndex);
      const { array } = accessorView(json, bin, prim.indices, label);
      for (const v of array) lockSet.add(v);
    }
  }

  // 모든 메시의 POSITION accessor를 중복 없이 워프.
  const seen = new Set();
  const stats = {
    landmarks: marks,
    meshes: [],
    lockedVertices: 0,
    movedVertices: 0,
    maxAbsDisplacement: [0, 0, 0],
  };
  for (const lockSet of locks.values()) stats.lockedVertices += lockSet.size;

  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const posIndex = prim.attributes?.POSITION;
      if (posIndex === undefined || seen.has(posIndex)) continue;
      seen.add(posIndex);

      const { accessor, array } = accessorView(json, bin, posIndex, label);
      if (accessor.componentType !== 5126 || accessor.type !== 'VEC3') {
        throw new Error(`${label}: POSITION accessor ${posIndex} must be float VEC3`);
      }
      const lockSet = locks.get(posIndex);
      let moved = 0;
      for (let v = 0; v < accessor.count; v++) {
        if (lockSet?.has(v)) continue;
        const x = array[v * 3];
        const y = array[v * 3 + 1];
        const z = array[v * 3 + 2];
        const d = displacementAt(x, y, z, p, marks);
        if (!d) continue;
        if (d[0] === 0 && d[1] === 0 && d[2] === 0) continue;
        if (Math.abs(d[2]) > AMPLITUDE_LIMITS.chinZ + 1e-9) {
          throw new Error(`${label}: dz=${d[2]} exceeds chin z limit ±${AMPLITUDE_LIMITS.chinZ}`);
        }
        array[v * 3] = x + d[0];
        array[v * 3 + 1] = y + d[1];
        array[v * 3 + 2] = z + d[2];
        moved++;
        for (let c = 0; c < 3; c++) {
          const abs = Math.abs(d[c]);
          if (abs > stats.maxAbsDisplacement[c]) stats.maxAbsDisplacement[c] = abs;
        }
      }
      stats.movedVertices += moved;
      stats.meshes.push({ mesh: mesh.name ?? '', accessor: posIndex, vertices: accessor.count, moved });

      // 이동이 있었던 accessor만 min/max 갱신 (무이동 워프는 JSON 원값 유지).
      if (moved > 0 && Array.isArray(accessor.min) && Array.isArray(accessor.max)) {
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
    }
  }

  return { bytes: writeGlb(json, bin), stats };
}

/** GLB 컨테이너 재조립 (vrm-tex.mjs 관례: JSON 스페이스 패딩, BIN 제로 패딩). */
export function writeGlb(json, bin) {
  const pad4 = (n) => (4 - (n % 4)) % 4;
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = pad4(jsonBuf.length);
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  let binBuf = bin;
  const binPad = pad4(binBuf.length);
  if (binPad) binBuf = Buffer.concat([binBuf, Buffer.alloc(binPad, 0x00)]);

  const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.writeUInt32LE(CHUNK_JSON, 16);
  jsonBuf.copy(out, 20);
  out.writeUInt32LE(binBuf.length, 20 + jsonBuf.length);
  out.writeUInt32LE(CHUNK_BIN, 24 + jsonBuf.length);
  binBuf.copy(out, 28 + jsonBuf.length);
  return out;
}
