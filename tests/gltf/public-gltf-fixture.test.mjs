import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";

import validator from "gltf-validator";

import {
  acquirePublicGltfFixture,
  loadPublicGltfFixtureManifest,
  PUBLIC_GLTF_EMBEDDED_TEXTURE_MANIFEST,
  PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
} from "../../scripts/public-gltf-fixture.mjs";
import {
  syntheticGlbBytes,
  syntheticGltfJsonBytes,
} from "../../scripts/generate-synthetic-gltf.mjs";

test("public Khronos Box manifest pins provenance and rights", async () => {
  const manifest = await loadPublicGltfFixtureManifest();
  assert.equal(
    manifest.provenance.commit,
    "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf",
  );
  assert.equal(manifest.entry.byteLength, 1664);
  assert.equal(
    manifest.entry.sha256,
    "ed52f7192b8311d700ac0ce80644e385" +
      "2cd01537e4d62241b9acba023da3d54e",
  );
  assert.equal(manifest.license.spdx, "CC-BY-4.0");
  assert.equal(manifest.tracking.artifactTracked, false);
  assert.equal(manifest.tracking.releaseBundled, false);
  assert.equal(manifest.tracking.networkAtRuntime, false);
});

test("public product-scale GLB manifest pins scale and rights", async () => {
  const manifest = await loadPublicGltfFixtureManifest(
    PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
  );
  assert.equal(
    manifest.fixtureId,
    "khronos-gltf-sample-assets-a-beautiful-game-glb",
  );
  assert.equal(manifest.entry.byteLength, 42_977_928);
  assert.equal(
    manifest.entry.sha256,
    "bd7133b4b322aae97c589b8839dae815" +
      "5ad2546acb35ae32a127e722a959d007",
  );
  assert.equal(manifest.license.spdx, "CC-BY-4.0");
  assert.equal(
    manifest.scale.classification,
    "product-scale-reference",
  );
  assert.equal(manifest.expected.vertices, 417_028);
  assert.equal(manifest.expected.triangles, 573_952);
  assert.equal(
    manifest.browserQualification.requireCenterPick,
    false,
  );
  assert.equal(manifest.tracking.artifactTracked, false);
  assert.equal(manifest.tracking.releaseBundled, false);
  assert.equal(manifest.tracking.networkAtRuntime, false);
});

test("public embedded texture GLB pins exact cache-only input", async () => {
  const manifest = await loadPublicGltfFixtureManifest(
    PUBLIC_GLTF_EMBEDDED_TEXTURE_MANIFEST,
  );
  assert.equal(
    manifest.fixtureId,
    "khronos-gltf-sample-assets-box-textured-embedded-png-glb",
  );
  assert.equal(manifest.entry.byteLength, 5_956);
  assert.equal(
    manifest.entry.sha256,
    "b510eca2e2ef33f62f9ed57d6e7ce2d1" +
      "0ebb2bdebc4a8e59d347719ba81abdf4",
  );
  assert.equal(manifest.expected.embeddedImageResources, 1);
  assert.equal(manifest.expected.embeddedImageBytes, 3_750);
  assert.equal(
    manifest.expected.imageStorageProfile,
    "glb-buffer-view",
  );
  assert.equal(manifest.expected.geometryRangeBytes, 4_756);
  assert.equal(manifest.tracking.artifactTracked, false);
  assert.equal(manifest.tracking.releaseBundled, false);
  assert.equal(manifest.tracking.networkAtRuntime, false);
});

test("public glTF acquisition verifies and reuses private cache", async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "bim-explorer-gltf-fixture-"),
  );
  const bytes = syntheticGlbBytes();
  const digest = createHash("sha256")
    .update(bytes)
    .digest("hex");
  const manifestPath = path.join(temporary, "manifest.json");
  const manifest = {
    schema: "bim-explorer-public-gltf-fixture/1",
    fixtureId: "synthetic-acquisition-test",
    purpose: "acquisition test",
    provenance: {
      repository:
        "https://github.com/KhronosGroup/glTF-Sample-Assets",
      commit: "1".repeat(40),
      path: "Models/Box/glTF-Binary/Box.glb",
    },
    entry: {
      name: "Box.glb",
      mediaType: "model/gltf-binary",
      byteLength: bytes.byteLength,
      sha256: digest,
      rawUrl:
        "https://raw.githubusercontent.com/KhronosGroup/" +
        "glTF-Sample-Assets/" +
        `${"1".repeat(40)}/Models/Box/glTF-Binary/Box.glb`,
    },
    license: {
      spdx: "CC-BY-4.0",
      attribution: "Synthetic acquisition test",
    },
    tracking: {
      cacheRoot: ".gltf-cache/public-gltf",
      artifactTracked: false,
      releaseBundled: false,
      networkAtRuntime: false,
    },
  };
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  let fetches = 0;
  const fetchImpl = async () => {
    fetches += 1;
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-length": String(bytes.byteLength),
      },
    });
  };
  try {
    const first = await acquirePublicGltfFixture({
      cacheRoot: path.join(temporary, "cache"),
      fetchImpl,
      manifestPath,
    });
    assert.equal(first.receipt.cacheHit, false);
    first.bytes.fill(0);
    const second = await acquirePublicGltfFixture({
      cacheRoot: path.join(temporary, "cache"),
      fetchImpl,
      manifestPath,
    });
    assert.equal(second.receipt.cacheHit, true);
    assert.equal(fetches, 1);
    second.bytes.fill(0);
  } finally {
    bytes.fill(0);
    await rm(temporary, { recursive: true, force: true });
  }
});

for (const [format, fixture] of [
  ["gltf", syntheticGltfJsonBytes],
  ["glb", syntheticGlbBytes],
]) {
  test(`official Khronos Validator accepts synthetic ${format}`, async () => {
    const bytes = fixture();
    try {
      const report = await validator.validateBytes(bytes, {
        format,
        maxIssues: 100,
        uri: `synthetic.${format}`,
        writeTimestamp: false,
      });
      assert.equal(validator.version(), "2.0.0-dev.3.10");
      assert.equal(report.issues.numErrors, 0);
      assert.equal(report.issues.truncated, false);
    } finally {
      bytes.fill(0);
    }
  });
}
