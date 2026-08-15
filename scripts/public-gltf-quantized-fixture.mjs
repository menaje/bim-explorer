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
export const PUBLIC_GLTF_QUANTIZED_MANIFEST = path.join(
  ROOT,
  "fixtures",
  "gltf",
  "derived-khronos-box-mesh-quantization",
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
    document: record(JSON.parse(text), "public Box document"),
    binary: bytes.slice(binaryHeader + 8),
  };
}

function assertSourceDocument(document) {
  const accessors = document.accessors;
  const bufferViews = document.bufferViews;
  if (
    document.asset?.version !== "2.0" ||
    document.scene !== 0 ||
    document.scenes?.[0]?.nodes?.[0] !== 0 ||
    document.nodes?.[0]?.children?.[0] !== 1 ||
    document.nodes?.[1]?.mesh !== 0 ||
    document.meshes?.[0]?.primitives?.[0]?.attributes?.NORMAL !== 1 ||
    document.meshes?.[0]?.primitives?.[0]?.attributes?.POSITION !== 2 ||
    document.meshes?.[0]?.primitives?.[0]?.indices !== 0 ||
    accessors?.[0]?.componentType !== 5123 ||
    accessors?.[0]?.count !== 36 ||
    accessors?.[1]?.componentType !== 5126 ||
    accessors?.[1]?.count !== 24 ||
    accessors?.[2]?.componentType !== 5126 ||
    accessors?.[2]?.count !== 24 ||
    bufferViews?.[0]?.byteOffset !== 576 ||
    bufferViews?.[0]?.byteLength !== 72 ||
    bufferViews?.[1]?.byteOffset !== 0 ||
    bufferViews?.[1]?.byteLength !== 576 ||
    bufferViews?.[1]?.byteStride !== 12 ||
    document.buffers?.[0]?.byteLength !== 648 ||
    document.images !== undefined ||
    document.extensionsRequired !== undefined
  ) {
    throw new Error("public Box GLB document profile changed");
  }
}

function quantizedBinary(source) {
  const result = new Uint8Array(360);
  const sourceView = new DataView(
    source.buffer,
    source.byteOffset,
    source.byteLength,
  );
  const resultView = new DataView(result.buffer);
  for (let vertex = 0; vertex < 24; vertex += 1) {
    for (let component = 0; component < 3; component += 1) {
      const normal = sourceView.getFloat32(
        vertex * 12 + component * 4,
        true,
      );
      const encodedNormal = Math.round(normal * 127);
      const decodedNormal = Math.max(encodedNormal / 127, -1);
      if (
        encodedNormal < -127 ||
        encodedNormal > 127 ||
        Math.abs(decodedNormal - normal) > 1e-7
      ) {
        throw new Error("public Box normal is not exactly quantizable");
      }
      resultView.setInt8(
        vertex * 4 + component,
        encodedNormal,
      );

      const position = sourceView.getFloat32(
        288 + vertex * 12 + component * 4,
        true,
      );
      const encodedPosition = Math.round(
        position * 2 * 32_767,
      );
      const decodedPosition =
        Math.max(encodedPosition / 32_767, -1) * 0.5;
      if (
        encodedPosition < -32_767 ||
        encodedPosition > 32_767 ||
        Math.abs(decodedPosition - position) > 1e-7
      ) {
        throw new Error(
          "public Box position is not exactly quantizable",
        );
      }
      resultView.setInt16(
        96 + vertex * 8 + component * 2,
        encodedPosition,
        true,
      );
    }
  }
  for (let index = 0; index < 36; index += 1) {
    resultView.setUint16(
      288 + index * 2,
      sourceView.getUint16(576 + index * 2, true),
      true,
    );
  }
  return result;
}

function quantizedDocument(source) {
  return {
    asset: {
      generator:
        "BIM Explorer deterministic KHR_mesh_quantization " +
        "derivation from Khronos Box",
      version: "2.0",
    },
    extensionsUsed: ["KHR_mesh_quantization"],
    extensionsRequired: ["KHR_mesh_quantization"],
    scene: source.scene,
    scenes: structuredClone(source.scenes),
    nodes: [
      structuredClone(source.nodes[0]),
      {
        ...structuredClone(source.nodes[1]),
        scale: [0.5, 0.5, 0.5],
      },
    ],
    meshes: structuredClone(source.meshes),
    accessors: [
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5123,
        count: 36,
        max: [23],
        min: [0],
        type: "SCALAR",
      },
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5120,
        normalized: true,
        count: 24,
        max: [127, 127, 127],
        min: [-127, -127, -127],
        type: "VEC3",
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5122,
        normalized: true,
        count: 24,
        max: [32_767, 32_767, 32_767],
        min: [-32_767, -32_767, -32_767],
        type: "VEC3",
      },
    ],
    materials: structuredClone(source.materials),
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: 96,
        byteStride: 4,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: 96,
        byteLength: 192,
        byteStride: 8,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: 288,
        byteLength: 72,
        target: 34963,
      },
    ],
    buffers: [{ byteLength: 360 }],
  };
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

export function deriveQuantizedPublicBoxGlb(sourceBytes) {
  if (sha256(sourceBytes) !== SOURCE_SHA256) {
    throw new Error("public Box GLB digest is not exact");
  }
  const { document, binary } = sourceParts(sourceBytes);
  try {
    assertSourceDocument(document);
    const quantized = quantizedBinary(binary);
    try {
      return encodeGlb(quantizedDocument(document), quantized);
    } finally {
      quantized.fill(0);
    }
  } finally {
    binary.fill(0);
  }
}

function validateManifest(value) {
  const manifest = record(value, "quantized glTF fixture manifest");
  const provenance = record(manifest.provenance, "fixture provenance");
  const extension = record(manifest.extension, "fixture extension");
  const entry = record(manifest.entry, "fixture entry");
  const license = record(manifest.license, "fixture license");
  const expected = record(manifest.expected, "fixture expected values");
  const tracking = record(manifest.tracking, "fixture tracking");
  if (
    manifest.schema !==
      "bim-explorer-derived-gltf-quantization-fixture/1" ||
    manifest.fixtureId !==
      "khronos-box-derived-khr-mesh-quantization" ||
    provenance.repository !==
      "https://github.com/KhronosGroup/glTF-Sample-Assets" ||
    !COMMIT.test(provenance.commit ?? "") ||
    provenance.sourcePath !== "Models/Box/glTF-Binary/Box.glb" ||
    provenance.sourceByteLength !== 1_664 ||
    provenance.sourceSha256 !== SOURCE_SHA256 ||
    extension.name !== "KHR_mesh_quantization" ||
    extension.status !== "ratified" ||
    extension.specificationRepository !==
      "https://github.com/KhronosGroup/glTF" ||
    !COMMIT.test(extension.specificationCommit ?? "") ||
    extension.specificationPath !==
      "extensions/2.0/Khronos/KHR_mesh_quantization/README.md" ||
    extension.specificationUrl !==
      "https://github.com/KhronosGroup/glTF/blob/" +
        `${extension.specificationCommit}/` +
        extension.specificationPath ||
    entry.name !== "BoxQuantized.glb" ||
    entry.mediaType !== "model/gltf-binary" ||
    !Number.isSafeInteger(entry.byteLength) ||
    entry.byteLength <= 0 ||
    entry.byteLength >= provenance.sourceByteLength ||
    !SHA256.test(entry.sha256 ?? "") ||
    license.spdx !== "CC-BY-4.0" ||
    expected.gltfVersion !== "2.0" ||
    JSON.stringify(expected.extensionsUsed) !==
      '["KHR_mesh_quantization"]' ||
    JSON.stringify(expected.extensionsRequired) !==
      '["KHR_mesh_quantization"]' ||
    expected.sourceFingerprint !== `sha256:${entry.sha256}` ||
    expected.geometryRecords !== 1 ||
    expected.instances !== 1 ||
    expected.vertices !== 24 ||
    expected.triangles !== 12 ||
    expected.ranges !== 1 ||
    expected.geometryRangeBytes !== 756 ||
    !SHA256.test(expected.geometryRangeSha256 ?? "") ||
    expected.gpuUploadBytes !== 800 ||
    JSON.stringify(expected.bounds) !==
      JSON.stringify({
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      }) ||
    expected.networkAtRuntime !== false ||
    tracking.cacheRoot !== ".gltf-cache/public-gltf" ||
    tracking.sourceArtifactTracked !== false ||
    tracking.derivedArtifactTracked !== false ||
    tracking.releaseBundled !== false ||
    tracking.networkAtRuntime !== false
  ) {
    throw new Error("quantized glTF fixture manifest is invalid");
  }
  return Object.freeze(structuredClone(manifest));
}

export async function loadPublicQuantizedGltfManifest(
  manifestPath = PUBLIC_GLTF_QUANTIZED_MANIFEST,
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

export async function acquirePublicQuantizedGltfFixture({
  cacheRoot,
  manifestPath = PUBLIC_GLTF_QUANTIZED_MANIFEST,
} = {}) {
  const manifest = await loadPublicQuantizedGltfManifest(manifestPath);
  const source = await acquirePublicGltfFixture();
  const root = cacheRoot ?? path.join(ROOT, manifest.tracking.cacheRoot);
  const cachePath = path.join(root, `${manifest.entry.sha256}.glb`);
  try {
    let bytes = await verifiedCache(cachePath, manifest.entry);
    let cacheHit = true;
    if (bytes === null) {
      cacheHit = false;
      bytes = deriveQuantizedPublicBoxGlb(source.bytes);
      if (
        bytes.byteLength !== manifest.entry.byteLength ||
        sha256(bytes) !== manifest.entry.sha256
      ) {
        bytes.fill(0);
        throw new Error(
          "derived quantized glTF bytes do not match manifest",
        );
      }
      await mkdir(root, { recursive: true });
      const temporary =
        `${cachePath}.${process.pid}.${Date.now()}.tmp`;
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
        schema:
          "bim-explorer-derived-gltf-quantization-acquisition/1",
        sourceDigestVerified: true,
        derivedDigestVerified: true,
        cacheHit,
        sourceCacheHit: source.receipt.cacheHit,
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
