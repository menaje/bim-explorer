import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateGltfPhysicalGpuAdmission,
} from "../../scripts/check-gltf-reference-source-compatibility.mjs";

async function inputs() {
  const manifest = JSON.parse(
    await readFile(
      "compatibility/gltf-reference-source.json",
      "utf8",
    ),
  );
  const evidence = JSON.parse(
    await readFile(
      manifest.evidence.representativePhysicalGpu,
      "utf8",
    ),
  );
  return { evidence, manifest };
}

test("glTF reference source admits exact Apple Metal evidence", async () => {
  const { evidence, manifest } = await inputs();
  const report = validateGltfPhysicalGpuAdmission(
    manifest,
    evidence,
  );
  assert.deepEqual(report, {
    status:
      "passed-darwin-arm64-apple-metal-representative-products",
    format: "glb",
    platform: "darwin-arm64",
    surfaces: 3,
  });
});

test("glTF physical GPU admission rejects changed GLB bytes", async () => {
  const { evidence, manifest } = await inputs();
  evidence.browser.glb.product.renderer.sourceReadBytes += 1;
  assert.throws(
    () => validateGltfPhysicalGpuAdmission(manifest, evidence),
    /representative model physical GPU evidence is invalid/u,
  );
});

test("glTF physical GPU admission stays platform-scoped", async () => {
  const { evidence, manifest } = await inputs();
  evidence.held.crossPlatformPhysicalGpu = true;
  assert.throws(
    () => validateGltfPhysicalGpuAdmission(manifest, evidence),
    /representative model physical GPU evidence is invalid/u,
  );
});
