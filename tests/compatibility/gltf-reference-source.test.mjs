import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateGltfExternalResourceAdmission,
  validateGltfMeshoptAdmission,
  validateGltfMeshQuantizationAdmission,
  validateGltfPhysicalGpuAdmission,
  validateGltfTextureAdmission,
  validateGltfJpegTextureAdmission,
  validateGltfBufferViewTextureAdmission,
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

async function meshQuantizationInputs() {
  const manifest = JSON.parse(
    await readFile(
      "compatibility/gltf-reference-source.json",
      "utf8",
    ),
  );
  const [evidence, fixture] = await Promise.all([
    readFile(
      manifest.evidence.meshQuantizationProducts,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.meshQuantizationFixtureManifest,
      "utf8",
    ).then(JSON.parse),
  ]);
  return { evidence, fixture, manifest };
}

async function meshoptInputs() {
  const manifest = JSON.parse(
    await readFile(
      "compatibility/gltf-reference-source.json",
      "utf8",
    ),
  );
  const [evidence, fixture] = await Promise.all([
    readFile(
      manifest.evidence.meshoptProducts,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.meshoptFixtureManifest,
      "utf8",
    ).then(JSON.parse),
  ]);
  return { evidence, fixture, manifest };
}

async function textureInputs() {
  const manifest = JSON.parse(
    await readFile(
      "compatibility/gltf-reference-source.json",
      "utf8",
    ),
  );
  const [evidence, fixture, embeddedFixture] = await Promise.all([
    readFile(
      manifest.evidence.textureProducts,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.textureFixtureManifest,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.embeddedTextureFixtureManifest,
      "utf8",
    ).then(JSON.parse),
  ]);
  return { embeddedFixture, evidence, fixture, manifest };
}

async function jpegTextureInputs() {
  const manifest = JSON.parse(
    await readFile(
      "compatibility/gltf-reference-source.json",
      "utf8",
    ),
  );
  const [evidence, fixture] = await Promise.all([
    readFile(
      manifest.evidence.jpegTextureProducts,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.jpegTextureFixtureManifest,
      "utf8",
    ).then(JSON.parse),
  ]);
  return { evidence, fixture, manifest };
}

async function bufferViewTextureInputs() {
  const manifest = JSON.parse(
    await readFile(
      "compatibility/gltf-reference-source.json",
      "utf8",
    ),
  );
  const [evidence, fixture] = await Promise.all([
    readFile(
      manifest.evidence.bufferViewTextureProducts,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.bufferViewTextureFixtureManifest,
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

test("glTF reference source admits exact KHR_mesh_quantization evidence", async () => {
  const { evidence, fixture, manifest } =
    await meshQuantizationInputs();
  assert.deepEqual(
    validateGltfMeshQuantizationAdmission(
      manifest,
      evidence,
      fixture,
    ),
    {
      status:
        "passed-darwin-arm64-apple-metal-khr-mesh-quantization",
      surfaces: 3,
      sourceBytes: 1_632,
      extension: "KHR_mesh_quantization",
    },
  );
});

test("glTF mesh quantization admission rejects changed derived bytes", async () => {
  const { evidence, fixture, manifest } =
    await meshQuantizationInputs();
  fixture.entry.sha256 = "0".repeat(64);
  assert.throws(
    () => validateGltfMeshQuantizationAdmission(
      manifest,
      evidence,
      fixture,
    ),
    /KHR_mesh_quantization admission evidence is invalid/u,
  );
});

test("glTF mesh quantization admission keeps other required extensions held", async () => {
  const { evidence, fixture, manifest } =
    await meshQuantizationInputs();
  evidence.held.otherRequiredExtensions = true;
  assert.throws(
    () => validateGltfMeshQuantizationAdmission(
      manifest,
      evidence,
      fixture,
    ),
    /KHR_mesh_quantization product evidence is invalid/u,
  );
});

test("glTF mesh quantization admission requires the immutable v0.2 boundary", async () => {
  const { evidence, fixture, manifest } =
    await meshQuantizationInputs();
  evidence.immutableFederatedSurfaceV02.meshQuantizationBackported =
    true;
  assert.throws(
    () => validateGltfMeshQuantizationAdmission(
      manifest,
      evidence,
      fixture,
    ),
    /KHR_mesh_quantization product evidence is invalid/u,
  );
});

test("glTF reference source admits exact EXT_meshopt_compression evidence", async () => {
  const { evidence, fixture, manifest } = await meshoptInputs();
  assert.deepEqual(
    validateGltfMeshoptAdmission(manifest, evidence, fixture),
    {
      status: "passed-darwin-arm64-apple-metal-ext-meshopt",
      surfaces: 3,
      sourceBytes: 1_696,
      extension: "EXT_meshopt_compression",
    },
  );
});

test("glTF meshopt admission rejects changed decoder integrity", async () => {
  const { evidence, fixture, manifest } = await meshoptInputs();
  evidence.decoder.integrity = "sha512-invalid";
  assert.throws(
    () => validateGltfMeshoptAdmission(
      manifest,
      evidence,
      fixture,
    ),
    /EXT_meshopt_compression product evidence is invalid/u,
  );
});

test("glTF meshopt admission keeps other filters held", async () => {
  const { evidence, fixture, manifest } = await meshoptInputs();
  evidence.held.otherMeshoptFilters = true;
  assert.throws(
    () => validateGltfMeshoptAdmission(
      manifest,
      evidence,
      fixture,
    ),
    /EXT_meshopt_compression product evidence is invalid/u,
  );
});

test("glTF meshopt admission requires the immutable v0.2 boundary", async () => {
  const { evidence, fixture, manifest } = await meshoptInputs();
  evidence.immutableFederatedSurfaceV02.meshoptBackported = true;
  assert.throws(
    () => validateGltfMeshoptAdmission(
      manifest,
      evidence,
      fixture,
    ),
    /EXT_meshopt_compression product evidence is invalid/u,
  );
});

test("glTF reference source admits exact PNG texture evidence", async () => {
  const { embeddedFixture, evidence, fixture, manifest } =
    await textureInputs();
  const report = validateGltfTextureAdmission(
    manifest,
    evidence,
    fixture,
    embeddedFixture,
  );
  assert.equal(report.surfaces, 6);
  assert.equal(report.sourceBytes, 8_285);
  assert.equal(report.gpuUploadBytes, 350_516);
});

test("glTF reference source admits exact JPEG texture evidence", async () => {
  const { evidence, fixture, manifest } =
    await jpegTextureInputs();
  const report = validateGltfJpegTextureAdmission(
    manifest,
    evidence,
    fixture,
  );
  assert.equal(report.surfaces, 3);
  assert.equal(report.sourceBytes, 4_274);
  assert.equal(report.gpuUploadBytes, 22_836);
});

test("glTF JPEG admission rejects progressive-profile overclaim", async () => {
  const { evidence, fixture, manifest } =
    await jpegTextureInputs();
  evidence.held.progressiveJpeg = true;
  assert.throws(
    () => validateGltfJpegTextureAdmission(
      manifest,
      evidence,
      fixture,
    ),
    /glTF JPEG texture product evidence is invalid/u,
  );
});

test("glTF reference source admits exact external-buffer bufferView evidence", async () => {
  const { evidence, fixture, manifest } =
    await bufferViewTextureInputs();
  const report = validateGltfBufferViewTextureAdmission(
    manifest,
    evidence,
    fixture,
  );
  assert.equal(report.surfaces, 3);
  assert.equal(report.sourceBytes, 7_306);
  assert.equal(report.gpuUploadBytes, 350_516);
});

test("glTF external-buffer bufferView admission rejects changed image accounting", async () => {
  const { evidence, fixture, manifest } =
    await bufferViewTextureInputs();
  evidence.core.source.resourceBundle
    .externalBufferViewImageResources = 2;
  assert.throws(
    () => validateGltfBufferViewTextureAdmission(
      manifest,
      evidence,
      fixture,
    ),
    /glTF external-buffer bufferView texture product evidence is invalid/u,
  );
});
