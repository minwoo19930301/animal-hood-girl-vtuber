import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

export const GLB_MAGIC = 0x46546c67;
export const CHUNK_JSON = 0x4e4f534a;
export const CHUNK_BIN = 0x004e4942;

export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function parseGlb(bytes, label = 'GLB') {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length < 20) throw new Error(`${label}: file is too small for a GLB`);
  const magic = bytes.readUInt32LE(0);
  const version = bytes.readUInt32LE(4);
  const declaredLength = bytes.readUInt32LE(8);
  if (magic !== GLB_MAGIC) throw new Error(`${label}: bad GLB magic`);
  if (version !== 2) throw new Error(`${label}: expected glTF 2, got ${version}`);
  if (declaredLength !== bytes.length) {
    throw new Error(`${label}: header length ${declaredLength} != file size ${bytes.length}`);
  }

  let offset = 12;
  let json = null;
  let bin = null;
  const chunks = [];
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error(`${label}: truncated chunk header at ${offset}`);
    const byteLength = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + byteLength;
    if (end > bytes.length) throw new Error(`${label}: chunk at ${offset} exceeds file size`);
    if (byteLength % 4 !== 0) throw new Error(`${label}: chunk at ${offset} is not 4-byte aligned`);
    const data = bytes.subarray(start, end);
    chunks.push({ type, byteLength, start, end });
    if (type === CHUNK_JSON) {
      if (json) throw new Error(`${label}: more than one JSON chunk`);
      try {
        json = JSON.parse(data.toString('utf8').trimEnd());
      } catch (error) {
        throw new Error(`${label}: invalid JSON chunk: ${error.message}`);
      }
    } else if (type === CHUNK_BIN) {
      if (bin) throw new Error(`${label}: more than one BIN chunk`);
      bin = data;
    }
    offset = end;
  }
  if (!json) throw new Error(`${label}: missing JSON chunk`);
  if (!bin) bin = Buffer.alloc(0);

  const declaredBinLength = json.buffers?.[0]?.byteLength;
  if (typeof declaredBinLength === 'number') {
    if (declaredBinLength > bin.length) {
      throw new Error(`${label}: buffers[0].byteLength exceeds BIN chunk`);
    }
    bin = bin.subarray(0, declaredBinLength);
  }

  for (const [index, view] of (json.bufferViews ?? []).entries()) {
    if ((view.buffer ?? 0) !== 0) continue;
    const start = view.byteOffset ?? 0;
    const end = start + view.byteLength;
    if (start < 0 || view.byteLength < 0 || end > bin.length) {
      throw new Error(`${label}: bufferView ${index} is outside the BIN buffer`);
    }
  }
  return { json, bin, chunks };
}

export function embeddedImageBytes(glb, imageIndex, label = 'GLB') {
  const image = glb.json.images?.[imageIndex];
  if (!image) throw new Error(`${label}: image ${imageIndex} does not exist`);
  if (image.bufferView === undefined) {
    throw new Error(`${label}: image ${imageIndex} is external; embedded image required`);
  }
  const view = glb.json.bufferViews?.[image.bufferView];
  if (!view) throw new Error(`${label}: image ${imageIndex} has invalid bufferView`);
  const start = view.byteOffset ?? 0;
  return glb.bin.subarray(start, start + view.byteLength);
}

export function sniffImageMime(bytes) {
  if (
    bytes.length >= 24
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
  ) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  return 'application/octet-stream';
}

export function imageDimensions(bytes, mime = sniffImageMime(bytes)) {
  if (mime === 'image/png') {
    if (bytes.length < 24 || sniffImageMime(bytes) !== 'image/png') {
      throw new Error('invalid PNG');
    }
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mime === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      if (
        marker >= 0xc0 && marker <= 0xcf
        && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      ) {
        return {
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7),
        };
      }
      if (offset + 4 > bytes.length) break;
      const segmentLength = bytes.readUInt16BE(offset + 2);
      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }
    throw new Error('cannot determine JPEG dimensions');
  }
  throw new Error(`unsupported image mime ${mime}`);
}

function asciiSlug(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function loadAvatarCatalog(catalogPath) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  } catch (error) {
    throw new Error(`cannot load avatar catalog ${catalogPath}: ${error.message}`);
  }
  const records = Array.isArray(raw) ? raw : raw?.entries;
  if (!Array.isArray(records)) {
    throw new Error(`${catalogPath}: expected a top-level array or an object with entries[]`);
  }
  const entries = records.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`${catalogPath}: entry ${index} must be an object`);
    }
    const requestedSlug = record.slug ?? record.id ?? record.key ?? record.animal ?? record.name;
    const slug = asciiSlug(requestedSlug) || `avatar-${String(index + 1).padStart(2, '0')}`;
    const title = String(
      record.title
      ?? record.displayName
      ?? record.label
      ?? record.name
      ?? record.animal
      ?? slug,
    ).trim();
    if (!title) throw new Error(`${catalogPath}: entry ${index} has an empty title`);
    return { ...record, slug, title, catalogIndex: index };
  });
  const duplicate = entries.find((entry, index) => entries.findIndex((other) => other.slug === entry.slug) !== index);
  if (duplicate) throw new Error(`${catalogPath}: duplicate slug "${duplicate.slug}"`);
  return entries;
}

export function resolveBaseModel(root, explicitPath = null) {
  if (explicitPath) {
    const absolute = path.resolve(explicitPath);
    if (!fs.existsSync(absolute)) throw new Error(`base VRM not found: ${absolute}`);
    return absolute;
  }
  const avatar = path.join(root, 'public', 'models', 'avatar.vrm');
  if (fs.existsSync(avatar)) return avatar;
  const placeholder = path.join(root, 'public', 'models', 'placeholder.vrm');
  if (fs.existsSync(placeholder)) return placeholder;
  throw new Error('neither public/models/avatar.vrm nor public/models/placeholder.vrm exists');
}

export function jsonFingerprint(value) {
  return sha256(Buffer.from(JSON.stringify(value ?? null)));
}
