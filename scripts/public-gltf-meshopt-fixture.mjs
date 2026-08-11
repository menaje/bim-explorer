import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  acquirePublicGltfFixture,
} from "./public-gltf-fixture.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const PUBLIC_GLTF_MESHOPT_MANIFEST = path.join(
  ROOT,
  "fixtures",
  "gltf",
  "derived-khronos-box-meshopt",
  "manifest.json",
);
const SOURCE_SHA256 =
  "ed52f7192b8311d700ac0ce80644e385" +
  "2cd01537e4d62241b9acba023da3d54e";
const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function record(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function aligned(value) {
  return Math.ceil(value / 4) * 4;
}

function sourceParts(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 1_664) {
    throw new Error("public Box GLB source bytes are not exact");
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  const jsonBytes = view.getUint32(12, true);
  const binaryHeader = 20 + jsonBytes;
  if (
    view.getUint32(0, true) !== GLB_MAGIC ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength ||
    view.getUint32(16, true) !== JSON_CHUNK ||
    binaryHeader + 8 > bytes.byteLength ||
    view.getUint32(binaryHeader + 4, true) !== BIN_CHUNK ||
    view.getUint32(binaryHeader, true) !== 648 ||
    binaryHeader + 8 + 648 !== bytes.byteLength
  ) {
    throw new Error("public Box GLB container is not exact");
  }
  const text = new TextDecoder("utf-8", { fatal: true })
    .decode(bytes.slice(20, binaryHeader))
    .replace(/[\u0000\u0020]+$/u, "");
  return {
    binary: bytes.slice(binaryHeader + 8),
    document: record(JSON.parse(text), "public Box document"),
  };
}

function assertSourceDocument(document) {
  if (
    document.asset?.version !== "2.0" ||
    document.scene !== 0 ||
    document.scenes?.[0]?.nodes?.[0] !== 0 ||
    document.nodes?.[0]?.children?.[0] !== 1 ||
    document.nodes?.[1]?.mesh !== 0 ||
    document.meshes?.[0]?.primitives?.[0]?.attributes?.NORMAL !== 1 ||
    document.meshes?.[0]?.primitives?.[0]?.attributes?.POSITION !== 2 ||
    document.meshes?.[0]?.primitives?.[0]?.indices !== 0 ||
    document.accessors?.[0]?.count !== 36 ||
    document.accessors?.[1]?.count !== 24 ||
    document.accessors?.[2]?.count !== 24 ||
    document.bufferViews?.[0]?.byteOffset !== 576 ||
    document.bufferViews?.[0]?.byteLength !== 72 ||
    document.bufferViews?.[1]?.byteOffset !== 0 ||
    document.bufferViews?.[1]?.byteLength !== 576 ||
    document.bufferViews?.[1]?.byteStride !== 12 ||
    document.buffers?.[0]?.byteLength !== 648 ||
    document.extensionsRequired !== undefined
  ) {
    throw new Error("public Box GLB document profile changed");
  }
}

async function compressedBinary(source) {
  const { MeshoptEncoder } = await import("meshoptimizer/encoder");
  await MeshoptEncoder.ready;
  const inputs = [
    {
      bytes: source.slice(576, 648),
      count: 36,
      mode: "TRIANGLES",
      stride: 2,
    },
    {
      bytes: source.slice(0, 576),
      count: 48,
      mode: "ATTRIBUTES",
      stride: 12,
    },
  ];
  const encoded = [];
  try {
    for (const input of inputs) {
      encoded.push(MeshoptEncoder.encodeGltfBuffer(
        input.bytes,
        input.count,
        input.stride,
        input.mode,
      ));
    }
    const offsets = [];
    let length = 0;
    for (const item of encoded) {
      length = aligned(length);
      offsets.push(length);
      length += item.byteLength;
    }
    const binary = new Uint8Array(aligned(length));
    for (let index = 0; index < encoded.length; index += 1) {
      binary.set(encoded[index], offsets[index]);
    }
    return {
      binary,
      views: encoded.map((item, index) => ({
        byteLength: item.byteLength,
        byteOffset: offsets[index],
        count: inputs[index].count,
        mode: inputs[index].mode,
        stride: inputs[index].stride,
      })),
    };
  } finally {
    for (const input of inputs) {
      input.bytes.fill(0);
    }
    for (const item of encoded) {
      item.fill(0);
    }
  }
}

function compressedDocument(source, payload) {
  const document = structuredClone(source);
  document.asset.generator =
    "BIM Explorer deterministic EXT_meshopt_compression " +
    "derivation from Khronos Box";
  document.extensionsUsed = ["EXT_meshopt_compression"];
  document.extensionsRequired = ["EXT_meshopt_compression"];
  document.bufferViews = source.bufferViews.map(
    (bufferView, index) => ({
      ...structuredClone(bufferView),
      buffer: 1,
      extensions: {
        EXT_meshopt_compression: {
          buffer: 0,
          byteOffset: payload.views[index].byteOffset,
          byteLength: payload.views[index].byteLength,
          byteStride: payload.views[index].stride,
          count: payload.views[index].count,
          mode: payload.views[index].mode,
          filter: "NONE",
        },
      },
    }),
  );
  document.buffers = [
    { byteLength: payload.binary.byteLength },
    {
      byteLength: 648,
      extensions: {
        EXT_meshopt_compression: { fallback: true },
      },
    },
  ];
  return document;
}

function encodeGlb(document, binary) {
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = aligned(json.byteLength);
  const binaryLength = aligned(binary.byteLength);
  const bytes = new Uint8Array(
    12 + 8 + jsonLength + 8 + binaryLength,
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, JSON_CHUNK, true);
  bytes.fill(0x20, 20, 20 + jsonLength);
  bytes.set(json, 20);
  const binaryHeader = 20 + jsonLength;
  view.setUint32(binaryHeader, binaryLength, true);
  view.setUint32(binaryHeader + 4, BIN_CHUNK, true);
  bytes.set(binary, binaryHeader + 8);
  return bytes;
}

export async function deriveMeshoptPublicBoxGlb(sourceBytes) {
  if (sha256(sourceBytes) !== SOURCE_SHA256) {
    throw new Error("public Box GLB digest is not exact");
  }
  const { binary, document } = sourceParts(sourceBytes);
  try {
    assertSourceDocument(document);
    const compressed = await compressedBinary(binary);
    try {
      return encodeGlb(
        compressedDocument(document, compressed),
        compressed.binary,
      );
    } finally {
      compressed.binary.fill(0);
    }
  } finally {
    binary.fill(0);
  }
}

function validateManifest(value) {
  const manifest = record(value, "meshopt glTF fixture manifest");
  const provenance = record(manifest.provenance, "fixture provenance");
  const extension = record(manifest.extension, "fixture extension");
  const codec = record(manifest.codec, "fixture codec");
  const entry = record(manifest.entry, "fixture entry");
  const license = record(manifest.license, "fixture license");
  const expected = record(manifest.expected, "fixture expected values");
  const validator = record(expected.validator, "fixture validator values");
  const tracking = record(manifest.tracking, "fixture tracking");
  if (
    manifest.schema !== "bim-explorer-derived-gltf-meshopt-fixture/1" ||
    manifest.fixtureId !== "khronos-box-derived-ext-meshopt" ||
    provenance.repository !==
      "https://github.com/KhronosGroup/glTF-Sample-Assets" ||
    !COMMIT.test(provenance.commit ?? "") ||
    provenance.sourcePath !== "Models/Box/glTF-Binary/Box.glb" ||
    provenance.sourceByteLength !== 1_664 ||
    provenance.sourceSha256 !== SOURCE_SHA256 ||
    extension.name !== "EXT_meshopt_compression" ||
    extension.status !== "ratified" ||
    extension.specificationRepository !==
      "https://github.com/KhronosGroup/glTF" ||
    !COMMIT.test(extension.specificationCommit ?? "") ||
    extension.specificationPath !==
      "extensions/2.0/Vendor/EXT_meshopt_compression/README.md" ||
    extension.specificationUrl !==
      "https://github.com/KhronosGroup/glTF/blob/" +
        `${extension.specificationCommit}/` +
        extension.specificationPath ||
    codec.package !== "meshoptimizer" ||
    codec.version !== "1.2.0" ||
    codec.license !== "MIT" ||
    codec.sourceCommit !== "9d9890c73011d75920af614485296d1e03e95448" ||
    codec.integrity !==
      "sha512-davRZeIJbxJrE24cwQle7ZDsxjdk/OphNOV83oX+" +
        "efQinyoHY9Jcyz3MHbaoG0qySZajldGztNZ1RN/T19PZsg==" ||
    codec.runtime !== "embedded-wasm-single-thread" ||
    entry.name !== "BoxMeshopt.glb" ||
    entry.mediaType !== "model/gltf-binary" ||
    !Number.isSafeInteger(entry.byteLength) ||
    entry.byteLength <= 0 ||
    !SHA256.test(entry.sha256 ?? "") ||
    license.spdx !== "CC-BY-4.0" ||
    expected.gltfVersion !== "2.0" ||
    expected.sourceFingerprint !== `sha256:${entry.sha256}` ||
    JSON.stringify(expected.extensionsUsed) !==
      '["EXT_meshopt_compression"]' ||
    JSON.stringify(expected.extensionsRequired) !==
      '["EXT_meshopt_compression"]' ||
    expected.geometryRecords !== 1 ||
    expected.instances !== 1 ||
    expected.vertices !== 24 ||
    expected.triangles !== 12 ||
    expected.geometryRangeBytes !== 756 ||
    !SHA256.test(expected.geometryRangeSha256 ?? "") ||
    expected.gpuUploadBytes !== 800 ||
    JSON.stringify(expected.bounds) !==
      JSON.stringify({
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      }) ||
    expected.meshoptBufferViews !== 2 ||
    expected.meshoptCompressedBytes !== 192 ||
    expected.meshoptDecodedBytes !== 648 ||
    JSON.stringify(expected.meshoptModes) !==
      '["ATTRIBUTES","TRIANGLES"]' ||
    JSON.stringify(expected.meshoptFilters) !== '["NONE"]' ||
    validator.errors !== 0 ||
    validator.warnings !== 0 ||
    validator.infos !== 2 ||
    validator.hints !== 0 ||
    JSON.stringify(validator.knownInfoCodes) !==
      '["UNSUPPORTED_EXTENSION","UNUSED_OBJECT"]' ||
    expected.networkAtRuntime !== false ||
    tracking.cacheRoot !== ".gltf-cache/public-gltf" ||
    tracking.sourceArtifactTracked !== false ||
    tracking.derivedArtifactTracked !== false ||
    tracking.releaseBundled !== false
  ) {
    throw new Error("meshopt glTF fixture manifest is invalid");
  }
  return Object.freeze(structuredClone(manifest));
}

export async function loadPublicMeshoptGltfManifest(
  manifestPath = PUBLIC_GLTF_MESHOPT_MANIFEST,
) {
  return validateManifest(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
}

async function verifiedCache(file, entry) {
  try {
    const bytes = new Uint8Array(await readFile(file));
    if (
      bytes.byteLength === entry.byteLength &&
      sha256(bytes) === entry.sha256
    ) {
      return bytes;
    }
    bytes.fill(0);
    return null;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function acquirePublicMeshoptGltfFixture({
  cacheRoot,
  manifestPath = PUBLIC_GLTF_MESHOPT_MANIFEST,
} = {}) {
  const manifest = await loadPublicMeshoptGltfManifest(manifestPath);
  const source = await acquirePublicGltfFixture();
  const root = cacheRoot ?? path.join(ROOT, manifest.tracking.cacheRoot);
  const cachePath = path.join(root, `${manifest.entry.sha256}.glb`);
  try {
    let bytes = await verifiedCache(cachePath, manifest.entry);
    let cacheHit = true;
    if (bytes === null) {
      cacheHit = false;
      bytes = await deriveMeshoptPublicBoxGlb(source.bytes);
      if (
        bytes.byteLength !== manifest.entry.byteLength ||
        sha256(bytes) !== manifest.entry.sha256
      ) {
        bytes.fill(0);
        throw new Error("derived meshopt glTF bytes do not match manifest");
      }
      await mkdir(root, { recursive: true });
      const temporary = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
      try {
        await writeFile(temporary, bytes, {
          flag: "wx",
          mode: 0o600,
        });
        await rename(temporary, cachePath);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    return {
      bytes,
      cachePath,
      manifest,
      receipt: Object.freeze({
        schema: "bim-explorer-derived-gltf-meshopt-acquisition/1",
        cacheHit,
        sourceCacheHit: source.receipt.cacheHit,
        sourceDigestVerified: true,
        derivedDigestVerified: true,
        sourceArtifactTracked: false,
        derivedArtifactTracked: false,
        releaseBundled: false,
        networkAtRuntime: false,
      }),
    };
  } finally {
    source.bytes.fill(0);
  }
}
