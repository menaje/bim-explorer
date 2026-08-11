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
export const PUBLIC_GLTF_BOX_MANIFEST = path.join(
  ROOT,
  "fixtures",
  "gltf",
  "public-khronos-box",
  "manifest.json",
);
export const PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST = path.join(
  ROOT,
  "fixtures",
  "gltf",
  "public-khronos-a-beautiful-game",
  "manifest.json",
);
export const PUBLIC_GLTF_EMBEDDED_TEXTURE_MANIFEST = path.join(
  ROOT,
  "fixtures",
  "gltf",
  "public-khronos-box-textured-embedded",
  "manifest.json",
);
const DEFAULT_MANIFEST = PUBLIC_GLTF_BOX_MANIFEST;
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const FIXTURE_ID = /^[a-z0-9][a-z0-9-]+$/u;
const RENDERER_LIMITS = new Set([
  "maximumFirstFrameRanges",
  "maximumRangeBytes",
  "maximumSourceReadBytes",
  "maximumReadBytes",
  "maximumGeometryRecords",
  "maximumGeometryPayloadBytes",
  "maximumInstances",
  "maximumInstancedTriangles",
  "maximumDrawCalls",
  "maximumCpuStagingBytes",
  "maximumGpuCacheBytes",
]);

function plainRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function validateBrowserQualification(value) {
  if (value === undefined) {
    return;
  }
  const qualification = plainRecord(
    value,
    "public glTF Browser qualification",
  );
  const rendererLimits = plainRecord(
    qualification.rendererLimits,
    "public glTF renderer limits",
  );
  if (
    !["bounded-smoke", "product-scale-reference"].includes(
      qualification.classification,
    ) ||
    typeof qualification.requireCenterPick !== "boolean"
  ) {
    throw new Error(
      "public glTF Browser qualification policy is invalid",
    );
  }
  positiveInteger(
    qualification.maximumRequestBytes,
    "public glTF maximumRequestBytes",
  );
  positiveInteger(
    qualification.timeoutMs,
    "public glTF timeoutMs",
  );
  for (const [name, limit] of Object.entries(rendererLimits)) {
    if (!RENDERER_LIMITS.has(name)) {
      throw new TypeError(
        `public glTF renderer limit ${name} is unsupported`,
      );
    }
    positiveInteger(limit, `public glTF renderer limit ${name}`);
  }
}

function validateProductScaleManifest(manifest) {
  if (
    manifest.browserQualification?.classification !==
      "product-scale-reference"
  ) {
    return;
  }
  const expected = plainRecord(
    manifest.expected,
    "public product-scale glTF expected values",
  );
  const scale = plainRecord(
    manifest.scale,
    "public product-scale glTF thresholds",
  );
  const node = plainRecord(
    manifest.nodeQualification,
    "public product-scale glTF Node budget",
  );
  for (const field of [
    "drawCalls",
    "vertices",
    "triangles",
    "materials",
    "geometryRecords",
    "instances",
    "instancedTriangles",
    "geometryRangeBytes",
  ]) {
    positiveInteger(expected[field], `public glTF expected.${field}`);
  }
  for (const field of [
    "minimumSourceBytes",
    "minimumVertices",
    "minimumTriangles",
    "minimumGeometryRangeBytes",
  ]) {
    positiveInteger(scale[field], `public glTF scale.${field}`);
  }
  for (const field of [
    "maximumSourceMs",
    "maximumMountMs",
    "maximumResidentSetSizeBytes",
  ]) {
    positiveInteger(node[field], `public glTF Node budget.${field}`);
  }
  const readmeUrl = new URL(manifest.provenance.readmeUrl ?? "");
  if (
    expected.gltfVersion !== "2.0" ||
    typeof expected.generator !== "string" ||
    expected.generator.length === 0 ||
    typeof expected.textures !== "boolean" ||
    typeof expected.skins !== "boolean" ||
    expected.animations !== 0 ||
    !Array.isArray(expected.extensionsUsed) ||
    expected.extensionsUsed.some((name) =>
      typeof name !== "string" || name.length === 0) ||
    scale.classification !== "product-scale-reference" ||
    manifest.entry.byteLength < scale.minimumSourceBytes ||
    expected.vertices < scale.minimumVertices ||
    expected.triangles < scale.minimumTriangles ||
    expected.geometryRangeBytes <
      scale.minimumGeometryRangeBytes ||
    expected.geometryRangeBytes >
      manifest.browserQualification.rendererLimits
        .maximumRangeBytes ||
    manifest.browserQualification.maximumRequestBytes >
      expected.geometryRangeBytes ||
    readmeUrl.protocol !== "https:" ||
    readmeUrl.hostname !== "github.com" ||
    !readmeUrl.pathname.startsWith(
      "/KhronosGroup/glTF-Sample-Assets/blob/" +
        `${manifest.provenance.commit}/Models/`,
    ) ||
    manifest.license.url !==
      "https://creativecommons.org/licenses/by/4.0/legalcode"
  ) {
    throw new Error("public product-scale glTF manifest is invalid");
  }
}

function validateEmbeddedTextureManifest(manifest) {
  if (
    manifest.fixtureId !==
      "khronos-gltf-sample-assets-box-textured-embedded-png-glb"
  ) {
    return;
  }
  const expected = plainRecord(
    manifest.expected,
    "public embedded texture glTF expected values",
  );
  if (
    manifest.provenance.path !==
      "Models/BoxTextured/glTF-Binary/BoxTextured.glb" ||
    manifest.license.spdx !==
      "LicenseRef-CC-BY-TM AND LicenseRef-LegalMark-Cesium" ||
    manifest.license.url !==
      "https://github.com/KhronosGroup/glTF-Sample-Assets/" +
        `blob/${manifest.provenance.commit}/LICENSES/` +
        "LicenseRef-CC-BY-TM.txt" ||
    manifest.license.trademarkUrl !==
      "https://github.com/KhronosGroup/glTF-Sample-Assets/" +
        `blob/${manifest.provenance.commit}/LICENSES/` +
        "LicenseRef-LegalMark-Cesium.txt" ||
    expected.gltfVersion !== "2.0" ||
    expected.generator !== "COLLADA2GLTF" ||
    expected.drawCalls !== 1 ||
    expected.vertices !== 24 ||
    expected.triangles !== 12 ||
    expected.materials !== 1 ||
    expected.textures !== 1 ||
    expected.skins !== false ||
    expected.animations !== 0 ||
    expected.geometryRecords !== 1 ||
    expected.instances !== 1 ||
    expected.ranges !== 1 ||
    expected.geometryRangeMediaType !==
      "application/vnd.bim-explorer.geometry-range.v2" ||
    expected.geometryRangeBytes !== 4_756 ||
    !SHA256.test(expected.geometryRangeSha256 ?? "") ||
    expected.geometryPayloadBytes !== 912 ||
    expected.externalResourceBytes !== 0 ||
    expected.externalResources !== 0 ||
    expected.embeddedImageBytes !== 3_750 ||
    expected.embeddedImageResources !== 1 ||
    expected.imageStorageProfile !== "glb-buffer-view" ||
    expected.textureSourceBytes !== 3_750 ||
    expected.textureDecodedBytes !== 262_144 ||
    expected.textureGpuBytes !== 349_524 ||
    expected.imageMediaType !== "image/png" ||
    expected.textureCoordinateSet !== 0 ||
    expected.gpuUploadBytes !== 350_516 ||
    expected.networkAtRuntime !== false
  ) {
    throw new Error("public embedded texture glTF manifest is invalid");
  }
}

function validateManifest(value) {
  const manifest = plainRecord(value, "public glTF manifest");
  const provenance = plainRecord(
    manifest.provenance,
    "public glTF provenance",
  );
  const entry = plainRecord(
    manifest.entry,
    "public glTF entry",
  );
  const license = plainRecord(
    manifest.license,
    "public glTF license",
  );
  const tracking = plainRecord(
    manifest.tracking,
    "public glTF tracking",
  );
  const expectedName = path.posix.basename(
    provenance.path ?? "",
  );
  const expectedRawUrl =
    "https://raw.githubusercontent.com/KhronosGroup/" +
    "glTF-Sample-Assets/" +
    `${provenance.commit}/${provenance.path}`;
  if (
    manifest.schema !== "bim-explorer-public-gltf-fixture/1" ||
    !FIXTURE_ID.test(manifest.fixtureId ?? "") ||
    typeof manifest.purpose !== "string" ||
    manifest.purpose.length === 0 ||
    provenance.repository !==
      "https://github.com/KhronosGroup/glTF-Sample-Assets" ||
    !COMMIT.test(provenance.commit ?? "") ||
    typeof provenance.path !== "string" ||
    !provenance.path.endsWith(".glb") ||
    entry.name !== expectedName ||
    entry.mediaType !== "model/gltf-binary" ||
    !Number.isSafeInteger(entry.byteLength) ||
    entry.byteLength <= 0 ||
    entry.byteLength > 64 * 1024 * 1024 ||
    !SHA256.test(entry.sha256 ?? "") ||
    entry.rawUrl !== expectedRawUrl ||
    (
      manifest.fixtureId !==
        "khronos-gltf-sample-assets-box-textured-embedded-png-glb" &&
      license.spdx !== "CC-BY-4.0"
    ) ||
    typeof license.attribution !== "string" ||
    license.attribution.length === 0 ||
    tracking.cacheRoot !== ".gltf-cache/public-gltf" ||
    tracking.artifactTracked !== false ||
    tracking.releaseBundled !== false ||
    tracking.networkAtRuntime !== false
  ) {
    throw new Error("public glTF manifest is invalid");
  }
  validateBrowserQualification(manifest.browserQualification);
  validateProductScaleManifest(manifest);
  validateEmbeddedTextureManifest(manifest);
  return Object.freeze(structuredClone(manifest));
}

export async function loadPublicGltfFixtureManifest(
  manifestPath = DEFAULT_MANIFEST,
) {
  return validateManifest(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
}

async function verifiedCache(cachePath, manifest) {
  try {
    const bytes = new Uint8Array(await readFile(cachePath));
    if (
      bytes.byteLength === manifest.entry.byteLength &&
      sha256(bytes) === manifest.entry.sha256
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

export async function acquirePublicGltfFixture({
  cacheRoot,
  fetchImpl = globalThis.fetch,
  force = false,
  manifestPath = DEFAULT_MANIFEST,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("public glTF acquisition requires fetch");
  }
  const manifest = await loadPublicGltfFixtureManifest(
    manifestPath,
  );
  const root = cacheRoot ?? path.join(
    ROOT,
    manifest.tracking.cacheRoot,
  );
  const cachePath = path.join(
    root,
    `${manifest.entry.sha256}.glb`,
  );
  if (!force) {
    const cached = await verifiedCache(cachePath, manifest);
    if (cached !== null) {
      return {
        manifest,
        bytes: cached,
        cachePath,
        receipt: Object.freeze({
          schema: "bim-explorer-public-gltf-acquisition/1",
          fixtureId: manifest.fixtureId,
          byteLength: cached.byteLength,
          sha256: manifest.entry.sha256,
          cacheHit: true,
          artifactTracked: false,
          releaseBundled: false,
        }),
      };
    }
  }
  const response = await fetchImpl(manifest.entry.rawUrl, {
    redirect: "follow",
  });
  if (
    response === null ||
    response.ok !== true ||
    typeof response.arrayBuffer !== "function"
  ) {
    throw new Error("public glTF download failed");
  }
  const contentLength = response.headers?.get?.("content-length");
  if (
    contentLength !== null &&
    contentLength !== undefined &&
    Number(contentLength) !== manifest.entry.byteLength
  ) {
    throw new RangeError(
      "public glTF Content-Length does not match manifest",
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.byteLength !== manifest.entry.byteLength ||
    sha256(bytes) !== manifest.entry.sha256
  ) {
    bytes.fill(0);
    throw new Error("public glTF digest does not match manifest");
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
  return {
    manifest,
    bytes,
    cachePath,
    receipt: Object.freeze({
      schema: "bim-explorer-public-gltf-acquisition/1",
      fixtureId: manifest.fixtureId,
      byteLength: bytes.byteLength,
      sha256: manifest.entry.sha256,
      cacheHit: false,
      artifactTracked: false,
      releaseBundled: false,
    }),
  };
}
