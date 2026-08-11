import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateGltfExternalResourceAdmission,
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

async function externalInputs() {
  const manifest = JSON.parse(
    await readFile(
      "compatibility/gltf-reference-source.json",
      "utf8",
    ),
  );
  const [evidence, fixture] = await Promise.all([
    readFile(
      manifest.evidence.externalResourceProducts,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.externalResourceFixtureManifest,
      "utf8",
    ).then(JSON.parse),
  ]);
  return { evidence, fixture, manifest };
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

test("glTF reference source admits the exact local resource bundle", async () => {
  const { evidence, fixture, manifest } =
    await externalInputs();
  assert.deepEqual(
    validateGltfExternalResourceAdmission(
      manifest,
      evidence,
      fixture,
    ),
    {
      status:
        "passed-darwin-arm64-apple-metal-local-bundle",
      surfaces: 3,
      sourceBytes: 3_546,
      externalResources: 1,
    },
  );
});

test("glTF resource bundle admission rejects changed sidecar bytes", async () => {
  const { evidence, fixture, manifest } =
    await externalInputs();
  evidence.surfaces.browser.resources.externalResourceBytes += 1;
  assert.throws(
    () => validateGltfExternalResourceAdmission(
      manifest,
      evidence,
      fixture,
    ),
    /glTF resource bundle product evidence is invalid/u,
  );
});

test("glTF resource bundle admission keeps arbitrary URI held", async () => {
  const { evidence, fixture, manifest } =
    await externalInputs();
  evidence.held.arbitraryUri = true;
  assert.throws(
    () => validateGltfExternalResourceAdmission(
      manifest,
      evidence,
      fixture,
    ),
    /glTF resource bundle product evidence is invalid/u,
  );
});

test("glTF resource bundle admission requires exact fixture provenance", async () => {
  const { evidence, fixture, manifest } =
    await externalInputs();
  fixture.resources[0].sha256 = "0".repeat(64);
  assert.throws(
    () => validateGltfExternalResourceAdmission(
      manifest,
      evidence,
      fixture,
    ),
    /glTF external resource admission evidence is invalid/u,
  );
});
