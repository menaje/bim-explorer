import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateGltfProductPlatformCompatibility,
} from "../../scripts/check-gltf-product-platform-compatibility.mjs";

async function fixtures() {
  const [matrix, productManifest, sourceManifest] =
    await Promise.all([
      readFile(
        "compatibility/evidence/" +
          "gltf-product-platform-matrix-2026-08-08.json",
        "utf8",
      ).then(JSON.parse),
      readFile(
        "compatibility/bim-product-shells.json",
        "utf8",
      ).then(JSON.parse),
      readFile(
        "compatibility/gltf-reference-source.json",
        "utf8",
      ).then(JSON.parse),
    ]);
  return {
    matrix,
    productManifest,
    sourceManifest,
  };
}

test("glTF product surfaces match across macOS and Linux", async () => {
  const values = await fixtures();
  const result = validateGltfProductPlatformCompatibility(
    values.matrix,
    values.productManifest,
    values.sourceManifest,
  );
  assert.equal(result.passedPlatforms, 2);
  assert.equal(result.productSurfaces, 3);
  assert.match(result.projectionSha256, /^[0-9a-f]{64}$/u);
  assert.equal(result.status, "experimental");
});

test("cross-platform evidence requires every product surface", async () => {
  const values = await fixtures();
  values.matrix.platforms[1].assertions.cleanInstall = false;
  assert.throws(
    () => validateGltfProductPlatformCompatibility(
      values.matrix,
      values.productManifest,
      values.sourceManifest,
    ),
    /linux-x64 glTF product evidence is incomplete/u,
  );
});

test("cross-platform evidence rejects divergent rendering", async () => {
  const values = await fixtures();
  values.matrix.platforms[1].browser.renderer
    .nonBackgroundPixels += 1;
  assert.throws(
    () => validateGltfProductPlatformCompatibility(
      values.matrix,
      values.productManifest,
      values.sourceManifest,
    ),
    /cross-platform evidence is incomplete/u,
  );
});

test("software platform evidence does not overclaim physical GPU coverage", async () => {
  const values = await fixtures();
  values.productManifest.physicalGpuScope.crossPlatform = true;
  assert.throws(
    () => validateGltfProductPlatformCompatibility(
      values.matrix,
      values.productManifest,
      values.sourceManifest,
    ),
    /manifests do not admit the evidence/u,
  );
});

test("source physical GPU admission remains separate from the software matrix", async () => {
  const values = await fixtures();
  values.sourceManifest.evidence.representativePhysicalGpu =
    values.sourceManifest.evidence.productPlatformMatrix;
  assert.throws(
    () => validateGltfProductPlatformCompatibility(
      values.matrix,
      values.productManifest,
      values.sourceManifest,
    ),
    /manifests do not admit the evidence/u,
  );
});
