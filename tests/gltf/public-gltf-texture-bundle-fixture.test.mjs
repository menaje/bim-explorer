import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  loadPublicGltfJpegTextureBundleManifest,
  acquirePublicGltfTextureBundle,
  loadPublicGltfTextureBundleManifest,
} from "../../scripts/public-gltf-resource-bundle-fixture.mjs";

test("public textured glTF manifest pins exact cache-only inputs", async () => {
  const manifest = await loadPublicGltfTextureBundleManifest();
  assert.equal(manifest.document.byteLength, 3_695);
  assert.equal(
    manifest.document.sha256,
    "1e9003a4a2a8822ff60da529357bd8e4dec4a59b1a479017993e7e2ad5fcebef",
  );
  assert.deepEqual(
    manifest.resources.map((resource) => ({
      name: resource.name,
      mediaType: resource.mediaType,
      byteLength: resource.byteLength,
      sha256: resource.sha256,
    })),
    [{
      name: "BoxTextured0.bin",
      mediaType: "application/octet-stream",
      byteLength: 840,
      sha256:
        "2e8c0483fa6665c686ec345f89dcbb2a694a587442584d09f8a83a59633327bc",
    }, {
      name: "CesiumLogoFlat.png",
      mediaType: "image/png",
      byteLength: 3_750,
      sha256:
        "9c22b05c5b136d03c5621a8765e50a8322be6c35b9de53e9fe22685840d7f469",
    }],
  );
  assert.equal(manifest.expected.aggregateSourceBytes, 8_285);
  assert.equal(manifest.expected.geometryRangeBytes, 4_756);
  assert.equal(manifest.expected.textureDecodedBytes, 262_144);
  assert.equal(manifest.expected.textureGpuBytes, 349_524);
  assert.equal(
    manifest.license.spdx,
    "LicenseRef-CC-BY-TM AND LicenseRef-LegalMark-Cesium",
  );
  assert.equal(manifest.tracking.artifactsTracked, false);
  assert.equal(manifest.tracking.releaseBundled, false);
});

test("public textured glTF acquisition verifies all bundle entries", async () => {
  const manifest = structuredClone(
    await loadPublicGltfTextureBundleManifest(),
  );
  const inputs = [
    new TextEncoder().encode("bounded textured glTF JSON"),
    Uint8Array.from([1, 2, 3, 4]),
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 5, 6]),
  ];
  const entries = [manifest.document, ...manifest.resources];
  const digest = (bytes) =>
    createHash("sha256").update(bytes).digest("hex");
  for (let index = 0; index < entries.length; index += 1) {
    entries[index].byteLength = inputs[index].byteLength;
    entries[index].sha256 = digest(inputs[index]);
  }
  manifest.expected.externalResourceBytes =
    inputs[1].byteLength + inputs[2].byteLength;
  manifest.expected.aggregateSourceBytes = inputs.reduce(
    (total, bytes) => total + bytes.byteLength,
    0,
  );
  const inputByUrl = new Map(
    entries.map((entry, index) => [entry.rawUrl, inputs[index]]),
  );
  let requests = 0;
  const fetchImpl = async (url) => {
    requests += 1;
    const bytes = inputByUrl.get(url);
    return {
      ok: true,
      headers: {
        get: (name) => name.toLowerCase() === "content-length"
          ? String(bytes.byteLength)
          : null,
      },
      arrayBuffer: async () => bytes.slice().buffer,
    };
  };
  const temporary = await mkdtemp(
    path.join(tmpdir(), "bex-gltf-texture-bundle-"),
  );
  try {
    const manifestPath = path.join(temporary, "manifest.json");
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    const first = await acquirePublicGltfTextureBundle({
      cacheRoot: path.join(temporary, "cache"),
      fetchImpl,
      manifestPath,
    });
    assert.equal(first.receipt.cacheHit, false);
    assert.equal(requests, 3);
    assert.deepEqual(
      first.resources.map((resource) => resource.uri),
      ["BoxTextured0.bin", "CesiumLogoFlat.png"],
    );
    first.document.bytes.fill(0);
    for (const resource of first.resources) {
      resource.bytes.fill(0);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("public JPEG textured glTF manifest pins the exact derivation", async () => {
  const manifest = await loadPublicGltfJpegTextureBundleManifest();
  assert.equal(manifest.document.derived, true);
  assert.equal(manifest.document.byteLength, 2_685);
  assert.equal(
    manifest.document.sha256,
    "2abddfe7399b2ee9c8b911c1f6b2ba82a2af0c7df31b256fa2082333a6b41155",
  );
  assert.equal(manifest.derivation.sourceDocument.byteLength, 3_695);
  assert.equal(
    manifest.derivation.sourceDocument.sha256,
    "1e9003a4a2a8822ff60da529357bd8e4dec4a59b1a479017993e7e2ad5fcebef",
  );
  assert.deepEqual(
    manifest.resources.map((resource) => ({
      name: resource.name,
      mediaType: resource.mediaType,
      byteLength: resource.byteLength,
      sha256: resource.sha256,
    })),
    [{
      name: "BoxTextured0.bin",
      mediaType: "application/octet-stream",
      byteLength: 840,
      sha256:
        "2e8c0483fa6665c686ec345f89dcbb2a694a587442584d09f8a83a59633327bc",
    }, {
      name: "Compare_Dispersion_img1.jpg",
      mediaType: "image/jpeg",
      byteLength: 749,
      sha256:
        "6074b0780e45a9c32a727e29aed7d45413cdd807d3157ea9413fd828ac0676b1",
    }],
  );
  assert.equal(manifest.expected.aggregateSourceBytes, 4_274);
  assert.equal(
    manifest.expected.geometryRangeMediaType,
    "application/vnd.bim-explorer.geometry-range.v3",
  );
  assert.equal(manifest.expected.geometryRangeBytes, 1_756);
  assert.equal(
    manifest.expected.geometryRangeSha256,
    "19193a36e4f5773d6d8dc6fa0729669ec25b983877b163f1f7b65ee89cec8dc5",
  );
  assert.equal(manifest.expected.textureDecodedBytes, 16_384);
  assert.equal(manifest.expected.textureGpuBytes, 21_844);
  assert.equal(
    manifest.expected.appearanceProfile,
    "base-color-texture-opaque-v0.2",
  );
  assert.equal(manifest.expected.imageMediaType, "image/jpeg");
  assert.equal(manifest.tracking.artifactsTracked, false);
  assert.equal(manifest.tracking.releaseBundled, false);
});
