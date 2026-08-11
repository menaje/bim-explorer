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
export const PUBLIC_GLTF_TEXTURE_BUNDLE_MANIFEST = path.join(
  ROOT,
  "fixtures",
  "gltf",
  "public-khronos-box-textured",
  "manifest.json",
);
export const PUBLIC_GLTF_JPEG_TEXTURE_BUNDLE_MANIFEST = path.join(
  ROOT,
  "fixtures",
  "gltf",
  "public-khronos-box-textured-jpeg",
  "manifest.json",
);
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const RESOURCE_NAME =
  /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:bin|jpe?g|png)$/u;

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

function validateEntry(
  entry,
  expectedName,
  expectedMediaType,
  rawBase,
  rawUrl = `${rawBase}/${expectedName}`,
) {
  if (
    entry.name !== expectedName ||
    entry.mediaType !== expectedMediaType ||
    !Number.isSafeInteger(entry.byteLength) ||
    entry.byteLength <= 0 ||
    entry.byteLength > 64 * 1024 * 1024 ||
    !SHA256.test(entry.sha256 ?? "") ||
    entry.rawUrl !== rawUrl
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
  const fixture = manifest.fixtureId ===
      "khronos-gltf-sample-assets-box-external-buffer"
    ? {
        directory: "Models/Box/glTF",
        documentName: "Box.gltf",
        resources: [["Box0.bin", "application/octet-stream"]],
        licenseSpdx: "CC-BY-4.0",
        licenseUrl:
          "https://creativecommons.org/licenses/by/4.0/legalcode",
      }
    : manifest.fixtureId ===
        "khronos-gltf-sample-assets-box-textured-external-png"
      ? {
          directory: "Models/BoxTextured/glTF",
          documentName: "BoxTextured.gltf",
          resources: [
            ["BoxTextured0.bin", "application/octet-stream"],
            ["CesiumLogoFlat.png", "image/png"],
          ],
          licenseSpdx:
            "LicenseRef-CC-BY-TM AND LicenseRef-LegalMark-Cesium",
          licenseUrl:
            "https://github.com/KhronosGroup/glTF-Sample-Assets/" +
            `blob/${provenance.commit}/LICENSES/LicenseRef-CC-BY-TM.txt`,
        }
      : manifest.fixtureId ===
          "khronos-gltf-sample-assets-box-textured-derived-external-jpeg"
        ? {
            derived: true,
            directory:
              "Models/BoxTextured/glTF + " +
              "Models/CompareDispersion/glTF",
            documentName: "BoxTexturedJpeg.gltf",
            resources: [
              [
                "BoxTextured0.bin",
                "application/octet-stream",
                "Models/BoxTextured/glTF/BoxTextured0.bin",
              ],
              [
                "Compare_Dispersion_img1.jpg",
                "image/jpeg",
                "Models/CompareDispersion/glTF/" +
                  "Compare_Dispersion_img1.jpg",
              ],
            ],
            licenseSpdx:
              "(LicenseRef-CC-BY-TM AND " +
              "LicenseRef-LegalMark-Cesium) AND " +
              "(CC0-1.0 AND LicenseRef-LegalMark-Khronos)",
            licenseUrl: null,
          }
      : null;
  const externalResourceBytes = Array.isArray(manifest.resources)
    ? manifest.resources.reduce(
        (total, resource) => total + (resource?.byteLength ?? 0),
        0,
      )
    : -1;
  if (
    manifest.schema !==
      "bim-explorer-public-gltf-resource-bundle-fixture/1" ||
    fixture === null ||
    provenance.repository !==
      "https://github.com/KhronosGroup/glTF-Sample-Assets" ||
    !COMMIT.test(provenance.commit ?? "") ||
    provenance.directory !== fixture.directory ||
    !Array.isArray(manifest.resources) ||
    manifest.resources.length !== fixture.resources.length ||
    manifest.resources.some((resource) =>
      !RESOURCE_NAME.test(resource?.name ?? "") ||
      resource.name.includes("..")) ||
    license.spdx !== fixture.licenseSpdx ||
    (
      fixture.licenseUrl === null
        ? (
            license.boxUrl !==
              "https://github.com/KhronosGroup/glTF-Sample-Assets/" +
              `blob/${provenance.commit}/Models/BoxTextured/LICENSE.md` ||
            license.jpegUrl !==
              "https://github.com/KhronosGroup/glTF-Sample-Assets/" +
              `blob/${provenance.commit}/Models/CompareDispersion/LICENSE.md`
          )
        : license.url !== fixture.licenseUrl
    ) ||
    tracking.cacheRoot !== ".gltf-cache/public-gltf" ||
    tracking.artifactsTracked !== false ||
    tracking.releaseBundled !== false ||
    tracking.networkAtRuntime !== false ||
    expected.gltfVersion !== "2.0" ||
    expected.externalResources !== manifest.resources.length ||
    expected.externalResourceBytes !== externalResourceBytes ||
    expected.aggregateSourceBytes !==
      document.byteLength + externalResourceBytes ||
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
  if (fixture.derived === true) {
    const sourceDocument = manifest.derivation?.sourceDocument;
    if (
      document.name !== fixture.documentName ||
      document.mediaType !== "model/gltf+json" ||
      document.derived !== true ||
      !Number.isSafeInteger(document.byteLength) ||
      document.byteLength <= 0 ||
      !SHA256.test(document.sha256 ?? "") ||
      manifest.derivation?.profile !==
        "bim-explorer-cache-only-box-textured-jpeg/1" ||
      sourceDocument?.name !== "BoxTextured.gltf" ||
      sourceDocument?.mediaType !== "model/gltf+json" ||
      sourceDocument?.byteLength !== 3_695 ||
      sourceDocument?.sha256 !==
        "1e9003a4a2a8822ff60da529357bd8e4dec4a59b1a479017993e7e2ad5fcebef" ||
      sourceDocument?.rawUrl !==
        "https://raw.githubusercontent.com/KhronosGroup/" +
        `glTF-Sample-Assets/${provenance.commit}/` +
        "Models/BoxTextured/glTF/BoxTextured.gltf"
    ) {
      throw new Error("derived public glTF document manifest is invalid");
    }
  } else {
    validateEntry(
      document,
      fixture.documentName,
      "model/gltf+json",
      rawBase,
    );
  }
  for (let index = 0; index < fixture.resources.length; index += 1) {
    validateEntry(
      manifest.resources[index],
      fixture.resources[index][0],
      fixture.resources[index][1],
      rawBase,
      fixture.resources[index][2] === undefined
        ? `${rawBase}/${fixture.resources[index][0]}`
        : "https://raw.githubusercontent.com/KhronosGroup/" +
          `glTF-Sample-Assets/${provenance.commit}/` +
          fixture.resources[index][2],
    );
  }
  if (
    [
      "khronos-gltf-sample-assets-box-textured-external-png",
      "khronos-gltf-sample-assets-box-textured-derived-external-jpeg",
    ].includes(manifest.fixtureId) &&
    (
      (
        fixture.derived !== true &&
        license.trademarkUrl !==
          "https://github.com/KhronosGroup/glTF-Sample-Assets/" +
          `blob/${provenance.commit}/LICENSES/LicenseRef-LegalMark-Cesium.txt`
      ) ||
      expected.externalBufferResources !== 1 ||
      expected.externalImageResources !== 1 ||
      expected.geometryRangeMediaType !==
        (fixture.derived === true
          ? "application/vnd.bim-explorer.geometry-range.v3"
          : "application/vnd.bim-explorer.geometry-range.v2") ||
      expected.imageMediaType !==
        (fixture.derived === true ? "image/jpeg" : "image/png") ||
      expected.appearanceProfile !==
        (fixture.derived === true
          ? "base-color-texture-opaque-v0.2"
          : undefined) ||
      expected.textureCoordinateSet !== 0 ||
      expected.textures !== 1 ||
      !Number.isSafeInteger(expected.textureSourceBytes) ||
      !Number.isSafeInteger(expected.textureDecodedBytes) ||
      expected.textureDecodedBytes <= expected.textureSourceBytes ||
      !Number.isSafeInteger(expected.textureGpuBytes) ||
      expected.textureGpuBytes < expected.textureDecodedBytes ||
      expected.gpuUploadBytes !==
        expected.geometryPayloadBytes + 80 + expected.textureGpuBytes
    )
  ) {
    throw new Error("public textured glTF bundle manifest is invalid");
  }
  return Object.freeze(structuredClone(manifest));
}

export async function loadPublicGltfTextureBundleManifest() {
  return await loadPublicGltfResourceBundleManifest(
    PUBLIC_GLTF_TEXTURE_BUNDLE_MANIFEST,
  );
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

async function deriveJpegDocument(manifest, root, source) {
  const cachePath = path.join(root, manifest.document.name);
  const cached = await verifiedCache(cachePath, manifest.document);
  if (cached !== null) {
    return { bytes: cached, cacheHit: true, cachePath };
  }
  let document;
  try {
    document = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(source),
    );
  } catch {
    throw new Error("public glTF JPEG source document is invalid");
  }
  if (
    document?.asset?.generator !== "COLLADA2GLTF" ||
    document?.asset?.version !== "2.0" ||
    document?.buffers?.[0]?.uri !== "BoxTextured0.bin" ||
    document?.images?.length !== 1 ||
    document.images[0]?.uri !== "CesiumLogoFlat.png"
  ) {
    throw new Error("public glTF JPEG derivation input is unexpected");
  }
  document.asset.generator =
    "COLLADA2GLTF; BIM Explorer cache-only JPEG derivation";
  document.images = [{
    uri: "Compare_Dispersion_img1.jpg",
    mimeType: "image/jpeg",
  }];
  const bytes = new TextEncoder().encode(
    `${JSON.stringify(document, null, 2)}\n`,
  );
  if (
    bytes.byteLength !== manifest.document.byteLength ||
    sha256(bytes) !== manifest.document.sha256
  ) {
    bytes.fill(0);
    throw new Error("public glTF JPEG derivation is not reproducible");
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
  let document;
  if (manifest.derivation === undefined) {
    document = await acquireEntry(
      manifest.document,
      bundleRoot,
      fetchImpl,
    );
  } else {
    const source = await acquireEntry(
      manifest.derivation.sourceDocument,
      bundleRoot,
      fetchImpl,
    );
    try {
      document = await deriveJpegDocument(
        manifest,
        bundleRoot,
        source.bytes,
      );
    } finally {
      source.bytes.fill(0);
    }
  }
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

export async function acquirePublicGltfTextureBundle(options = {}) {
  return await acquirePublicGltfResourceBundle({
    ...options,
    manifestPath:
      options.manifestPath ?? PUBLIC_GLTF_TEXTURE_BUNDLE_MANIFEST,
  });
}

export async function loadPublicGltfJpegTextureBundleManifest() {
  return await loadPublicGltfResourceBundleManifest(
    PUBLIC_GLTF_JPEG_TEXTURE_BUNDLE_MANIFEST,
  );
}

export async function acquirePublicGltfJpegTextureBundle(options = {}) {
  return await acquirePublicGltfResourceBundle({
    ...options,
    manifestPath:
      options.manifestPath ??
      PUBLIC_GLTF_JPEG_TEXTURE_BUNDLE_MANIFEST,
  });
}
