#!/usr/bin/env node
// Structural and visual-input audit for the deterministic avatar VRM pack.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  embeddedImageBytes,
  imageDimensions,
  jsonFingerprint,
  loadAvatarCatalog,
  parseGlb,
  resolveBaseModel,
  sha256,
  sniffImageMime,
} from './lib/avatar-pack-common.mjs';
import { getOutfitDesign } from './lib/outfit-designs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDITED_IMAGE_INDICES = [0, 5, 7, 8, 9, 11, 15, 17, 19, 20, 21, 28];
// 헤어 길이 컷(img25)은 design.hairCut이 있는 슬러그만 편집한다 — 편집 인덱스는
// 전 슬러그 동일이 아니라 슬러그별로 검증한다 (build-avatar-pack.mjs와 같은 규칙).
const HAIR_IMAGE_INDEX = 25;

function expectedImageIndicesFor(entry) {
  const design = getOutfitDesign(entry);
  if (design.hairCut == null) return EDITED_IMAGE_INDICES;
  return [...EDITED_IMAGE_INDICES, HAIR_IMAGE_INDEX].sort((a, b) => a - b);
}

function parseArgs(argv) {
  const options = {
    catalog: path.join(ROOT, 'shared', 'avatar-catalog.json'),
    source: null,
    workRoot: path.join(ROOT, 'work', 'avatar-pack'),
    outputRoot: path.join(ROOT, 'public', 'models'),
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (['--catalog', '--source', '--work-root', '--output-root'].includes(arg)) {
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      index++;
      if (arg === '--catalog') options.catalog = path.resolve(value);
      if (arg === '--source') options.source = path.resolve(value);
      if (arg === '--work-root') options.workRoot = path.resolve(value);
      if (arg === '--output-root') options.outputRoot = path.resolve(value);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label}: cannot read ${file}: ${error.message}`);
  }
}

function vrmRigParts(json, label) {
  const vrm0 = json.extensions?.VRM;
  if (vrm0) {
    const humanoid = vrm0.humanoid?.humanBones;
    const expressions = vrm0.blendShapeMaster?.blendShapeGroups;
    if (!Array.isArray(humanoid) || humanoid.length === 0) {
      throw new Error(`${label}: VRM0 humanoid.humanBones is missing`);
    }
    if (!Array.isArray(expressions) || expressions.length === 0) {
      throw new Error(`${label}: VRM0 blendShapeGroups is missing`);
    }
    return { kind: 'VRM0', humanoid, expressions };
  }
  const vrm1 = json.extensions?.VRMC_vrm;
  if (vrm1) {
    const humanoid = vrm1.humanoid?.humanBones;
    const expressions = vrm1.expressions;
    if (!humanoid || typeof humanoid !== 'object') {
      throw new Error(`${label}: VRM1 humanoid.humanBones is missing`);
    }
    if (!expressions || typeof expressions !== 'object') {
      throw new Error(`${label}: VRM1 expressions are missing`);
    }
    return { kind: 'VRM1', humanoid, expressions };
  }
  throw new Error(`${label}: no VRM0 or VRM1 extension`);
}

function auditAppliedMaterialPatch(modelJson, patch, slug) {
  const vrm0 = modelJson.extensions?.VRM;
  if (!vrm0) throw new Error(`${slug}: material patch audit currently requires VRM0`);
  const rules = Array.isArray(patch.materials)
    ? patch.materials
    : Object.entries(patch.materials ?? {}).map(([name, value]) => ({ name, ...value }));
  if (rules.length < 3) throw new Error(`${slug}: material patch has fewer than three hair rules`);
  const properties = vrm0.materialProperties ?? [];
  for (const rule of rules) {
    const matches = properties.filter((material) => (
      rule.name ? material.name === rule.name : String(material.name ?? '').includes(String(rule.match))
    ));
    if (matches.length === 0) throw new Error(`${slug}: material patch rule matched nothing`);
    for (const material of matches) {
      for (const [property, expected] of Object.entries(rule.vectorProperties ?? {})) {
        const actual = material.vectorProperties?.[property];
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(`${slug}: ${material.name}.${property} does not match material patch`);
        }
      }
    }
  }
  for (const token of ['HairBack', 'HAIR_01', 'HAIR_02']) {
    if (!rules.some((rule) => String(rule.name ?? rule.match ?? '').includes(token))) {
      throw new Error(`${slug}: material patch does not cover ${token}`);
    }
  }
}

// authored 엔트리(손작업 VRM, 예: flamingo → avatar.vrm)는 파이프라인 재생성 대상이
// 아니므로 존재 + GLB/VRM 구조 검증만 한다.
function auditAuthoredAvatar(entry, options) {
  const modelFile = path.basename(String(entry.modelUrl ?? `${entry.slug}.vrm`));
  const modelPath = path.join(options.outputRoot, modelFile);
  if (!fs.existsSync(modelPath)) throw new Error(`${entry.slug}: missing authored model ${modelPath}`);
  const modelBytes = fs.readFileSync(modelPath);
  const model = parseGlb(modelBytes, modelPath);
  vrmRigParts(model.json, entry.slug);
  return {
    slug: entry.slug,
    title: entry.title,
    authored: true,
    modelHash: sha256(modelBytes),
    bytes: modelBytes.length,
  };
}

function auditAvatar(entry, options, sourceGlb, sourceRig) {
  const modelPath = path.join(options.outputRoot, `${entry.slug}.vrm`);
  const workDir = path.join(options.workRoot, entry.slug);
  const editedDir = path.join(workDir, 'edited');
  const patchPath = path.join(workDir, 'material-patch.json');
  const manifestPath = path.join(workDir, 'manifest.json');
  if (!fs.existsSync(modelPath)) throw new Error(`${entry.slug}: missing ${modelPath}`);
  if (!fs.existsSync(patchPath)) throw new Error(`${entry.slug}: missing material-patch.json`);
  if (!fs.existsSync(manifestPath)) throw new Error(`${entry.slug}: missing manifest.json`);

  const modelBytes = fs.readFileSync(modelPath);
  const model = parseGlb(modelBytes, modelPath);
  const rig = vrmRigParts(model.json, entry.slug);
  if (rig.kind !== sourceRig.kind) throw new Error(`${entry.slug}: VRM version changed`);
  if (jsonFingerprint(rig.humanoid) !== jsonFingerprint(sourceRig.humanoid)) {
    throw new Error(`${entry.slug}: humanoid mapping changed`);
  }
  if (jsonFingerprint(rig.expressions) !== jsonFingerprint(sourceRig.expressions)) {
    throw new Error(`${entry.slug}: expression definitions changed`);
  }

  const title = model.json.extensions?.VRM?.meta?.title
    ?? model.json.extensions?.VRMC_vrm?.meta?.name;
  if (title !== entry.title) {
    throw new Error(`${entry.slug}: meta title "${title}" != catalog title "${entry.title}"`);
  }

  const expectedIndices = expectedImageIndicesFor(entry);
  const textureHashes = [];
  for (const imageIndex of expectedIndices) {
    const editedPath = path.join(editedDir, `${imageIndex}.png`);
    if (!fs.existsSync(editedPath)) throw new Error(`${entry.slug}: missing edited/${imageIndex}.png`);
    const editedBytes = fs.readFileSync(editedPath);
    if (sniffImageMime(editedBytes) !== 'image/png') {
      throw new Error(`${entry.slug}: edited/${imageIndex}.png is not a PNG`);
    }
    const sourceBytes = embeddedImageBytes(sourceGlb, imageIndex, 'base VRM');
    const outputBytes = embeddedImageBytes(model, imageIndex, entry.slug);
    const sourceDimensions = imageDimensions(
      sourceBytes,
      sourceGlb.json.images[imageIndex].mimeType ?? sniffImageMime(sourceBytes),
    );
    const editedDimensions = imageDimensions(editedBytes, 'image/png');
    const outputDimensions = imageDimensions(
      outputBytes,
      model.json.images[imageIndex].mimeType ?? sniffImageMime(outputBytes),
    );
    if (
      sourceDimensions.width !== editedDimensions.width
      || sourceDimensions.height !== editedDimensions.height
      || sourceDimensions.width !== outputDimensions.width
      || sourceDimensions.height !== outputDimensions.height
    ) {
      throw new Error(`${entry.slug}: image ${imageIndex} dimensions differ from the base texture`);
    }
    const editedHash = sha256(editedBytes);
    const outputHash = sha256(outputBytes);
    if (editedHash !== outputHash) {
      throw new Error(`${entry.slug}: embedded image ${imageIndex} is not the audited edited PNG`);
    }
    textureHashes.push([imageIndex, outputHash]);
  }

  const patch = readJson(patchPath, entry.slug);
  auditAppliedMaterialPatch(model.json, patch, entry.slug);
  const manifest = readJson(manifestPath, entry.slug);
  const modelHash = sha256(modelBytes);
  if (manifest.slug !== entry.slug || manifest.title !== entry.title) {
    throw new Error(`${entry.slug}: manifest identity does not match catalog`);
  }
  if (manifest.modelSha256 !== modelHash) {
    throw new Error(`${entry.slug}: manifest model hash is stale`);
  }
  const manifestIndices = [...(manifest.editedImageIndices ?? [])].sort((a, b) => a - b);
  if (JSON.stringify(manifestIndices) !== JSON.stringify(expectedIndices)) {
    throw new Error(`${entry.slug}: manifest editedImageIndices does not match the design`);
  }
  // hairCut이 없는 슬러그의 img25는 무편집이어야 한다 — 베이스 바이트와 동일 검증.
  if (!expectedIndices.includes(HAIR_IMAGE_INDEX)) {
    const sourceHair = embeddedImageBytes(sourceGlb, HAIR_IMAGE_INDEX, 'base VRM');
    const outputHair = embeddedImageBytes(model, HAIR_IMAGE_INDEX, entry.slug);
    if (sha256(sourceHair) !== sha256(outputHair)) {
      throw new Error(`${entry.slug}: image ${HAIR_IMAGE_INDEX} was edited but design.hairCut is null`);
    }
  }
  return {
    slug: entry.slug,
    title: entry.title,
    modelHash,
    textureFingerprint: sha256(Buffer.from(JSON.stringify(textureHashes))),
    irisHash: textureHashes.find(([index]) => index === 9)[1],
    outfitHash: textureHashes.find(([index]) => index === 17)[1],
    bytes: modelBytes.length,
  };
}

function assertUnique(rows, field, label) {
  const values = rows.map((row) => row[field]);
  if (new Set(values).size !== rows.length) {
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    throw new Error(`${label} are not unique (${[...new Set(duplicates)].join(', ')})`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const entries = loadAvatarCatalog(options.catalog);
  if (entries.length === 0) throw new Error('avatar catalog is empty');
  const generated = entries.filter((entry) => entry.authored !== true);
  const authored = entries.filter((entry) => entry.authored === true);
  if (generated.length === 0) throw new Error('avatar catalog has no generated (non-authored) entries');
  const sourcePath = resolveBaseModel(ROOT, options.source);
  const sourceBytes = fs.readFileSync(sourcePath);
  const sourceGlb = parseGlb(sourceBytes, sourcePath);
  const sourceRig = vrmRigParts(sourceGlb.json, 'base VRM');
  const generatedRows = generated.map((entry) => auditAvatar(entry, options, sourceGlb, sourceRig));
  const authoredRows = authored.map((entry) => auditAuthoredAvatar(entry, options));
  const rows = [...generatedRows, ...authoredRows];

  assertUnique(rows, 'modelHash', 'model hashes');
  assertUnique(generatedRows, 'textureFingerprint', 'edited texture bundles');
  assertUnique(generatedRows, 'irisHash', 'iris textures');
  assertUnique(generatedRows, 'outfitHash', 'top textures');

  console.table(rows.map((row) => ({
    avatar: row.slug,
    title: row.title,
    MiB: (row.bytes / (1024 * 1024)).toFixed(1),
    model: row.modelHash.slice(0, 12),
    textures: row.authored ? '(authored)' : row.textureFingerprint.slice(0, 12),
  })));
  console.log(
    `avatar audit passed: ${rows.length}/${entries.length} valid GLBs `
    + `(${generatedRows.length} generated + ${authoredRows.length} authored); `
    + 'humanoid + expressions preserved; dimensions preserved; model/iris/outfit hashes unique',
  );
}

try {
  main();
} catch (error) {
  console.error(`avatar audit failed: ${error.stack ?? error.message}`);
  process.exit(1);
}
