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

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const PUBLIC_GLTF_RESOURCE_BUNDLE_MANIFEST = path.join(
  ROOT,
  "fixtures",
  "gltf",
  "public-khronos-box-external",
  "manifest.json",
);
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const RESOURCE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.bin$/u;

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

function validateEntry(entry, expectedName, expectedMediaType, rawBase) {
  if (
    entry.name !== expectedName ||
    entry.mediaType !== expectedMediaType ||
    !Number.isSafeInteger(entry.byteLength) ||
    entry.byteLength <= 0 ||
    entry.byteLength > 64 * 1024 * 1024 ||
    !SHA256.test(entry.sha256 ?? "") ||
    entry.rawUrl !== `${rawBase}/${expectedName}`
  ) {
    throw new Error("public glTF resource bundle entry is invalid");
  }
}

function validateManifest(value) {
  const manifest = record(value, "public glTF resource bundle manifest");
  const provenance = record(manifest.provenance, "bundle provenance");
  const document = record(manifest.document, "bundle document");
  const license = record(manifest.license, "bundle license");
  const expected = record(manifest.expected, "bundle expected values");
  const tracking = record(manifest.tracking, "bundle tracking");
  const rawBase =
    "https://raw.githubusercontent.com/KhronosGroup/" +
    `glTF-Sample-Assets/${provenance.commit}/${provenance.directory}`;
  if (
    manifest.schema !==
      "bim-explorer-public-gltf-resource-bundle-fixture/1" ||
    manifest.fixtureId !==
      "khronos-gltf-sample-assets-box-external-buffer" ||
    provenance.repository !==
      "https://github.com/KhronosGroup/glTF-Sample-Assets" ||
    !COMMIT.test(provenance.commit ?? "") ||
    provenance.directory !== "Models/Box/glTF" ||
    !Array.isArray(manifest.resources) ||
    manifest.resources.length !== 1 ||
    !RESOURCE_NAME.test(manifest.resources[0]?.name ?? "") ||
    manifest.resources[0].name.includes("..") ||
    license.spdx !== "CC-BY-4.0" ||
    license.url !==
      "https://creativecommons.org/licenses/by/4.0/legalcode" ||
    tracking.cacheRoot !== ".gltf-cache/public-gltf" ||
    tracking.artifactsTracked !== false ||
    tracking.releaseBundled !== false ||
    tracking.networkAtRuntime !== false ||
    expected.gltfVersion !== "2.0" ||
    expected.externalResources !== 1 ||
    expected.externalResourceBytes !== manifest.resources[0].byteLength ||
    expected.aggregateSourceBytes !==
      document.byteLength + manifest.resources[0].byteLength ||
    !SHA256.test(expected.sourceFingerprint ?? "") ||
    !SHA256.test(expected.geometryRangeSha256 ?? "") ||
    !Number.isSafeInteger(expected.geometryRangeBytes) ||
    expected.geometryRangeBytes <= 0 ||
    !Number.isSafeInteger(expected.gpuUploadBytes) ||
    expected.gpuUploadBytes <= expected.geometryRangeBytes ||
    expected.networkAtRuntime !== false
  ) {
    throw new Error("public glTF resource bundle manifest is invalid");
  }
  validateEntry(document, "Box.gltf", "model/gltf+json", rawBase);
  validateEntry(
    manifest.resources[0],
    "Box0.bin",
    "application/octet-stream",
    rawBase,
  );
  return Object.freeze(structuredClone(manifest));
}

export async function loadPublicGltfResourceBundleManifest(
  manifestPath = PUBLIC_GLTF_RESOURCE_BUNDLE_MANIFEST,
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

async function acquireEntry(entry, root, fetchImpl) {
  const cachePath = path.join(root, entry.name);
  const cached = await verifiedCache(cachePath, entry);
  if (cached !== null) {
    return { bytes: cached, cacheHit: true, cachePath };
  }
  const response = await fetchImpl(entry.rawUrl, { redirect: "follow" });
  if (response?.ok !== true) {
    throw new Error("public glTF resource bundle download failed");
  }
  const contentLength = response.headers?.get?.("content-length");
  const contentEncoding = response.headers?.get?.("content-encoding");
  if (
    contentLength !== null &&
    contentLength !== undefined &&
    (contentEncoding === null ||
      contentEncoding === undefined ||
      contentEncoding === "identity") &&
    Number(contentLength) !== entry.byteLength
  ) {
    throw new RangeError(
      "public glTF resource Content-Length does not match manifest",
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.byteLength !== entry.byteLength ||
    sha256(bytes) !== entry.sha256
  ) {
    bytes.fill(0);
    throw new Error("public glTF resource digest does not match manifest");
  }
  await mkdir(root, { recursive: true });
  const temporary = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    await rename(temporary, cachePath);
  } finally {
    await rm(temporary, { force: true });
  }
  return { bytes, cacheHit: false, cachePath };
}

export async function acquirePublicGltfResourceBundle({
  cacheRoot,
  fetchImpl = globalThis.fetch,
  manifestPath = PUBLIC_GLTF_RESOURCE_BUNDLE_MANIFEST,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("public glTF resource bundle requires fetch");
  }
  const manifest = await loadPublicGltfResourceBundleManifest(manifestPath);
  const root = cacheRoot ?? path.join(ROOT, manifest.tracking.cacheRoot);
  const bundleRoot = path.join(root, manifest.fixtureId);
  const document = await acquireEntry(
    manifest.document,
    bundleRoot,
    fetchImpl,
  );
  const resources = [];
  try {
    for (const entry of manifest.resources) {
      const acquired = await acquireEntry(entry, bundleRoot, fetchImpl);
      resources.push({
        uri: entry.name,
        bytes: acquired.bytes,
        cacheHit: acquired.cacheHit,
        cachePath: acquired.cachePath,
      });
    }
    return {
      manifest,
      document: {
        bytes: document.bytes,
        cacheHit: document.cacheHit,
        cachePath: document.cachePath,
      },
      resources,
      receipt: Object.freeze({
        schema: "bim-explorer-public-gltf-resource-bundle-acquisition/1",
        fixtureId: manifest.fixtureId,
        aggregateSourceBytes: manifest.expected.aggregateSourceBytes,
        cacheHit:
          document.cacheHit && resources.every((item) => item.cacheHit),
        artifactsTracked: false,
        releaseBundled: false,
        networkAtRuntime: false,
      }),
    };
  } catch (error) {
    document.bytes.fill(0);
    for (const resource of resources) {
      resource.bytes.fill(0);
    }
    throw error;
  }
}
