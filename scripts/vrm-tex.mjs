#!/usr/bin/env node
// vrm-tex.mjs — VRM(GLB) texture dump / rebuild tool.
//
// Usage:
//   node scripts/vrm-tex.mjs dump <input.vrm>
//     -> extracts all images to work/textures/<idx>_<materialNames>.png
//        and writes work/manifest.json
//   node scripts/vrm-tex.mjs rebuild <input.vrm> <output.vrm>
//     -> replaces images that have work/edited/<imageIdx>.png with the edited
//        bytes (appended to BIN, 4-byte aligned, new bufferView) and writes a
//        new GLB. VRM extension JSON is preserved unless a patch is supplied.
//   node scripts/vrm-tex.mjs rebuild <input.vrm> <output.vrm>
//     [--edited-dir <dir>] [--material-patch <patch.json>]
//     -> the optional directory makes parallel/avatar-specific rebuilds safe.
//        Every replacement PNG must have exactly the original image dimensions.
//        A material patch may update VRM0 meta and materialProperties.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'work');
const TEX_DIR = path.join(WORK, 'textures');
const EDIT_DIR = path.join(WORK, 'edited');
const MANIFEST = path.join(WORK, 'manifest.json');

// ---------------- GLB parsing ----------------

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'

function parseGLB(buf) {
  if (buf.length < 12) throw new Error('file too small for GLB header');
  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  const totalLen = buf.readUInt32LE(8);
  if (magic !== GLB_MAGIC) throw new Error('bad magic: not a GLB file');
  if (version !== 2) throw new Error(`unsupported glTF version ${version}`);
  if (totalLen !== buf.length) {
    console.warn(`warn: header length ${totalLen} != file size ${buf.length}`);
  }
  let off = 12;
  let json = null;
  let bin = Buffer.alloc(0);
  while (off + 8 <= buf.length) {
    const chunkLen = buf.readUInt32LE(off);
    const chunkType = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + chunkLen);
    if (chunkType === CHUNK_JSON) json = JSON.parse(data.toString('utf8'));
    else if (chunkType === CHUNK_BIN) bin = Buffer.from(data); // copy
    off += 8 + chunkLen;
  }
  if (!json) throw new Error('no JSON chunk found');
  // BIN chunk may carry trailing 4-byte-alignment padding beyond the declared
  // buffer byteLength; trim it so rebuilds don't accumulate stray padding.
  const declared = json.buffers?.[0]?.byteLength;
  if (typeof declared === 'number' && declared <= bin.length) bin = bin.subarray(0, declared);
  return { json, bin };
}

function align4(n, pad) {
  const r = n % 4;
  return r === 0 ? 0 : 4 - r;
}

function writeGLB(json, bin, outPath) {
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = align4(jsonBuf.length);
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]); // spaces
  let binBuf = bin;
  const binPad = align4(binBuf.length);
  if (binPad) binBuf = Buffer.concat([binBuf, Buffer.alloc(binPad, 0x00)]); // zeros

  const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);

  const jsonHdr = Buffer.alloc(8);
  jsonHdr.writeUInt32LE(jsonBuf.length, 0);
  jsonHdr.writeUInt32LE(CHUNK_JSON, 4);

  const binHdr = Buffer.alloc(8);
  binHdr.writeUInt32LE(binBuf.length, 0);
  binHdr.writeUInt32LE(CHUNK_BIN, 4);

  fs.writeFileSync(outPath, Buffer.concat([header, jsonHdr, jsonBuf, binHdr, binBuf]));
  return total;
}

// ---------------- image helpers ----------------

function sniffMime(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  return 'application/octet-stream';
}

function pngSize(bytes) {
  // IHDR is first chunk: width at 16, height at 20 (big-endian)
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegSize(bytes) {
  let off = 2;
  while (off + 9 < bytes.length) {
    if (bytes[off] !== 0xff) { off++; continue; }
    const marker = bytes[off + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(off + 5), width: bytes.readUInt16BE(off + 7) };
    }
    const segLen = bytes.readUInt16BE(off + 2);
    off += 2 + segLen;
  }
  return { width: 0, height: 0 };
}

function imageSize(bytes, mime) {
  try {
    if (mime === 'image/png') return pngSize(bytes);
    if (mime === 'image/jpeg') return jpegSize(bytes);
  } catch { /* fallthrough */ }
  return { width: 0, height: 0 };
}

function sanitize(name) {
  return String(name).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'unnamed';
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read JSON ${file}: ${error.message}`);
  }
}

// ---------------- material -> image mapping ----------------

function imageBytesOf(json, bin, image) {
  if (image.bufferView === undefined) return null;
  const bv = json.bufferViews[image.bufferView];
  const start = bv.byteOffset ?? 0;
  return bin.subarray(start, start + bv.byteLength);
}

function buildImageMaterialMap(json) {
  const textures = json.textures ?? [];
  const texToImage = (ti) => {
    const t = textures[ti];
    if (!t) return undefined;
    return t.source; // KHR_texture_basisu 등은 이 모델엔 없음
  };
  const map = new Map(); // imageIdx -> Set of "matName(slot)"
  const add = (imgIdx, label) => {
    if (imgIdx === undefined || imgIdx === null) return;
    if (!map.has(imgIdx)) map.set(imgIdx, new Set());
    map.get(imgIdx).add(label);
  };

  // 1) core glTF materials
  (json.materials ?? []).forEach((mat, mi) => {
    const name = mat.name ?? `material_${mi}`;
    const pbr = mat.pbrMetallicRoughness ?? {};
    if (pbr.baseColorTexture) add(texToImage(pbr.baseColorTexture.index), `${name}`);
    if (pbr.metallicRoughnessTexture) add(texToImage(pbr.metallicRoughnessTexture.index), `${name}(mr)`);
    if (mat.normalTexture) add(texToImage(mat.normalTexture.index), `${name}(normal)`);
    if (mat.emissiveTexture) add(texToImage(mat.emissiveTexture.index), `${name}(emissive)`);
    if (mat.occlusionTexture) add(texToImage(mat.occlusionTexture.index), `${name}(ao)`);
  });

  // 2) VRM0 extension materialProperties
  const vrm0 = json.extensions?.VRM;
  (vrm0?.materialProperties ?? []).forEach((mp, mi) => {
    const name = mp.name ?? `vrmMat_${mi}`;
    const tp = mp.textureProperties ?? {};
    for (const [slot, texIdx] of Object.entries(tp)) {
      const label = slot === '_MainTex' ? name : `${name}(${slot})`;
      add(texToImage(texIdx), label);
    }
  });

  // 3) VRM thumbnail
  if (vrm0?.meta?.texture !== undefined && vrm0.meta.texture >= 0) {
    add(texToImage(vrm0.meta.texture), '(vrm_thumbnail)');
  }

  return map;
}

// ---------------- dump ----------------

function dump(inputPath) {
  const buf = fs.readFileSync(inputPath);
  const { json, bin } = parseGLB(buf);
  fs.mkdirSync(TEX_DIR, { recursive: true });

  const matMap = buildImageMaterialMap(json);
  const manifest = [];

  (json.images ?? []).forEach((image, idx) => {
    const bytes = imageBytesOf(json, bin, image);
    if (!bytes) {
      console.warn(`image ${idx}: no bufferView, skipped`);
      return;
    }
    const mime = image.mimeType ?? sniffMime(bytes);
    const { width, height } = imageSize(bytes, mime);
    const mats = [...(matMap.get(idx) ?? [])];
    const baseMats = mats.filter((m) => !m.includes('('));
    const nameParts = (baseMats.length ? baseMats : mats).slice(0, 3).map(sanitize);
    const ext = mime === 'image/jpeg' ? 'jpg' : 'png';
    const fileName = `${idx}_${nameParts.join('+') || sanitize(image.name ?? 'noref')}.${ext}`;
    const outPath = path.join(TEX_DIR, fileName);
    fs.writeFileSync(outPath, bytes);

    const bv = json.bufferViews[image.bufferView];
    manifest.push({
      imageIdx: idx,
      file: `work/textures/${fileName}`,
      imageName: image.name ?? null,
      mime,
      width,
      height,
      byteLength: bv.byteLength,
      materials: mats,
      bufferView: {
        index: image.bufferView,
        byteOffset: bv.byteOffset ?? 0,
        byteLength: bv.byteLength,
      },
    });
    console.log(`dumped ${fileName}  ${width}x${height}  ${mime}  mats=[${mats.join(', ')}]`);
  });

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`\nwrote ${manifest.length} images -> ${TEX_DIR}`);
  console.log(`manifest -> ${MANIFEST}`);
}

// ---------------- rebuild ----------------

function normaliseMaterialRules(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') {
    return Object.entries(value).map(([name, patch]) => ({ name, ...patch }));
  }
  throw new Error('material-patch.materials must be an array or object');
}

function applyMaterialPatch(json, patch, patchPath) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error(`${patchPath}: material patch must be a JSON object`);
  }

  const vrm0 = json.extensions?.VRM;
  if (!vrm0) throw new Error(`${patchPath}: input does not contain extensions.VRM`);

  const metaPatch = patch.meta ?? (patch.title !== undefined ? { title: patch.title } : null);
  if (metaPatch) {
    if (typeof metaPatch !== 'object' || Array.isArray(metaPatch)) {
      throw new Error(`${patchPath}: meta must be an object`);
    }
    vrm0.meta ??= {};
    Object.assign(vrm0.meta, metaPatch);
  }

  const rules = normaliseMaterialRules(patch.materials ?? patch.materialProperties);
  const properties = vrm0.materialProperties ?? [];
  let patched = 0;
  for (const [ruleIndex, rule] of rules.entries()) {
    if (!rule || typeof rule !== 'object') {
      throw new Error(`${patchPath}: materials[${ruleIndex}] must be an object`);
    }
    const exactName = rule.name;
    const contains = rule.match ?? rule.contains;
    if (!exactName && !contains) {
      throw new Error(`${patchPath}: materials[${ruleIndex}] needs "name" or "match"`);
    }
    const matches = properties.filter((material) => {
      const name = String(material.name ?? '');
      return exactName ? name === exactName : name.includes(String(contains));
    });
    if (matches.length === 0) {
      throw new Error(`${patchPath}: material rule ${exactName ?? contains} matched nothing`);
    }
    for (const material of matches) {
      for (const key of ['floatProperties', 'vectorProperties', 'textureProperties', 'keywordMap', 'tagMap']) {
        if (rule[key] === undefined) continue;
        if (!rule[key] || typeof rule[key] !== 'object' || Array.isArray(rule[key])) {
          throw new Error(`${patchPath}: ${key} for ${material.name} must be an object`);
        }
        material[key] ??= {};
        Object.assign(material[key], rule[key]);
      }
      if (rule.renderQueue !== undefined) material.renderQueue = rule.renderQueue;
      if (rule.shader !== undefined) material.shader = rule.shader;
      patched++;
    }
  }
  return { materialRules: rules.length, materialMatches: patched, metaPatched: Boolean(metaPatch) };
}

function rebuild(inputPath, outputPath, {
  editedDir = EDIT_DIR,
  materialPatchPath = null,
} = {}) {
  const buf = fs.readFileSync(inputPath);
  const { json, bin } = parseGLB(buf);

  let newBin = bin;
  let replaced = 0;

  const edits = fs.existsSync(editedDir)
    ? fs.readdirSync(editedDir).filter((f) => /^\d+\.png$/.test(f)).sort((a, b) => Number(a.slice(0, -4)) - Number(b.slice(0, -4)))
    : [];

  // Validate every edit before changing the GLB. A failed rebuild must never
  // leave a plausible-looking, partially edited avatar behind.
  const validated = edits.map((f) => {
    const imgIdx = Number(f.replace('.png', ''));
    const image = (json.images ?? [])[imgIdx];
    if (!image) {
      throw new Error(`${path.join(editedDir, f)}: no image at index ${imgIdx}`);
    }
    const originalBytes = imageBytesOf(json, bin, image);
    if (!originalBytes) {
      throw new Error(`${path.join(editedDir, f)}: original image ${imgIdx} is not embedded`);
    }
    const pngPath = path.join(editedDir, f);
    const pngBytes = fs.readFileSync(pngPath);
    if (sniffMime(pngBytes) !== 'image/png') {
      throw new Error(`${pngPath}: replacement is not a PNG`);
    }
    const originalMime = image.mimeType ?? sniffMime(originalBytes);
    const originalSize = imageSize(originalBytes, originalMime);
    const editedSize = imageSize(pngBytes, 'image/png');
    if (!originalSize.width || !originalSize.height) {
      throw new Error(`${pngPath}: cannot determine original image ${imgIdx} dimensions`);
    }
    if (editedSize.width !== originalSize.width || editedSize.height !== originalSize.height) {
      throw new Error(
        `${pngPath}: ${editedSize.width}x${editedSize.height} does not match original image ${imgIdx} `
        + `${originalSize.width}x${originalSize.height}`,
      );
    }
    return { f, imgIdx, image, pngBytes, editedSize };
  });

  for (const { f, imgIdx, image, pngBytes, editedSize } of validated) {
    // 4-byte align current end, then append
    const pad = align4(newBin.length);
    const offset = newBin.length + pad;
    newBin = Buffer.concat([newBin, Buffer.alloc(pad, 0), pngBytes]);

    const bvIndex = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: pngBytes.length });
    image.bufferView = bvIndex;
    image.mimeType = 'image/png';
    replaced++;
    console.log(
      `replaced image ${imgIdx} <- ${path.join(editedDir, f)} `
      + `(${editedSize.width}x${editedSize.height}, ${pngBytes.length} bytes, bufferView ${bvIndex} @ ${offset})`,
    );
  }

  let patchResult = null;
  if (materialPatchPath) {
    patchResult = applyMaterialPatch(json, readJsonFile(materialPatchPath), materialPatchPath);
    console.log(
      `patched VRM0 metadata/materials <- ${materialPatchPath} `
      + `(${patchResult.materialMatches} material match(es))`,
    );
  }

  // update buffer byteLength (writeGLB pads BIN chunk; padding is allowed to
  // exceed buffer.byteLength per spec, so record the unpadded length)
  if (json.buffers?.[0]) json.buffers[0].byteLength = newBin.length;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const total = writeGLB(json, newBin, outputPath);
  console.log(`\nwrote ${outputPath} (${total} bytes, ${replaced} image(s) replaced)`);
}

// ---------------- main ----------------

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

const args = process.argv.slice(2);
const [mode, arg1, arg2] = args;

if (mode === 'dump' && arg1) {
  dump(path.resolve(arg1));
} else if (mode === 'rebuild' && arg1 && arg2) {
  const editedDirArg = optionValue(args.slice(3), '--edited-dir');
  const materialPatchArg = optionValue(args.slice(3), '--material-patch');
  rebuild(path.resolve(arg1), path.resolve(arg2), {
    editedDir: editedDirArg ? path.resolve(editedDirArg) : EDIT_DIR,
    materialPatchPath: materialPatchArg ? path.resolve(materialPatchArg) : null,
  });
} else {
  console.error(
    'usage:\n'
    + '  node scripts/vrm-tex.mjs dump <input.vrm>\n'
    + '  node scripts/vrm-tex.mjs rebuild <input.vrm> <output.vrm> '
    + '[--edited-dir <dir>] [--material-patch <patch.json>]',
  );
  process.exit(1);
}
