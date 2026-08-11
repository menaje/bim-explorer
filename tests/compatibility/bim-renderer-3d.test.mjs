import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateBimRenderer3dCompatibility,
} from "../../scripts/check-bim-renderer-3d-compatibility.mjs";

async function fixtures() {
  const manifest = JSON.parse(await readFile(
    "compatibility/bim-renderer-3d.json",
    "utf8",
  ));
  const evidence = {
    headless: JSON.parse(await readFile(
      manifest.evidence.headless,
      "utf8",
    )),
    browserWebGl2: JSON.parse(await readFile(
      manifest.evidence.browserWebGl2,
      "utf8",
    )),
    browserViewState: JSON.parse(await readFile(
      manifest.evidence.browserViewState,
      "utf8",
    )),
    browserPickingSelection: JSON.parse(await readFile(
      manifest.evidence.browserPickingSelection,
      "utf8",
    )),
    browserLifecycle: JSON.parse(await readFile(
      manifest.evidence.browserLifecycle,
      "utf8",
    )),
    browserSectionMeasurement: JSON.parse(await readFile(
      manifest.evidence.browserSectionMeasurement,
      "utf8",
    )),
    browserLargeCoordinate: JSON.parse(await readFile(
      manifest.evidence.browserLargeCoordinate,
      "utf8",
    )),
    browserProgressiveRange: JSON.parse(await readFile(
      manifest.evidence.browserProgressiveRange,
      "utf8",
    )),
    browserAtomicDelta: JSON.parse(await readFile(
      manifest.evidence.browserAtomicDelta,
      "utf8",
    )),
    browserCameraInput: JSON.parse(await readFile(
      manifest.evidence.browserCameraInput,
      "utf8",
    )),
    browserVisibilityFirstFrame: JSON.parse(await readFile(
      manifest.evidence.browserVisibilityFirstFrame,
      "utf8",
    )),
    browserVscodeHost: JSON.parse(await readFile(
      manifest.evidence.browserVscodeHost,
      "utf8",
    )),
    browserWorkerLifecycle: JSON.parse(await readFile(
      manifest.evidence.browserWorkerLifecycle,
      "utf8",
    )),
    browserPointPrimitive: JSON.parse(await readFile(
      manifest.evidence.browserPointPrimitive,
      "utf8",
    )),
    browserPointPicking: JSON.parse(await readFile(
      manifest.evidence.browserPointPicking,
      "utf8",
    )),
    vscodePointPicking: JSON.parse(await readFile(
      manifest.evidence.vscodePointPicking,
      "utf8",
    )),
    pointHierarchyChunkLod: JSON.parse(await readFile(
      manifest.evidence.pointHierarchyChunkLod,
      "utf8",
    )),
    pointPhysicalGpuQualification: JSON.parse(await readFile(
      manifest.evidence.pointPhysicalGpuQualification,
      "utf8",
    )),
    baseColorTextureProducts: JSON.parse(await readFile(
      manifest.evidence.baseColorTextureProducts,
      "utf8",
    )),
    jpegBaseColorTextureProducts: JSON.parse(await readFile(
      manifest.evidence.jpegBaseColorTextureProducts,
      "utf8",
    )),
  };
  return { manifest, evidence };
}

test("BIM renderer records headless and Browser WebGL2 mounts", async () => {
  const { manifest, evidence } = await fixtures();
  const result = validateBimRenderer3dCompatibility(
    manifest,
    evidence,
  );

  assert.equal(result.status, "experimental");
  assert.equal(result.instances, 3_182);
  assert.equal(result.instancedTriangles, 127_993);
  assert.equal(result.uploadedBytes, 4_399_252);
  assert.equal(result.browserPixels, 67_153);
  assert.equal(result.browserViewFrames, 4);
  assert.equal(result.browserPickHighlightPixels, 7_507);
  assert.equal(result.browserLifecycleMounts, 3);
  assert.equal(result.browserMeasuredDistance, 1.5237454002432795);
  assert.deepEqual(result.browserPrecisionWorldOrigin, [
    1_000_000_002,
    1_000_000_003,
    1_000_000_001.5,
  ]);
  assert.equal(result.browserProgressiveActiveBytes, 9_674_488);
  assert.equal(result.browserDeltaRedrawPixels, 8_888);
  assert.equal(result.browserCameraInputFrames, 3);
  assert.equal(
    result.browserVisibilityFirstFrameRange,
    "range:ifc:geometry:1",
  );
  assert.deepEqual(result.browserVscodeHostKinds, [
    "browser",
    "vscode-webview",
  ]);
  assert.equal(result.browserPointCount, 10_201);
  assert.equal(result.browserPointPixels, 40_471);
  assert.equal(result.baseColorTextureSurfaces, 6);
  assert.equal(result.jpegBaseColorTextureSurfaces, 3);
  assert.equal(result.passedGates, 30);
  assert.equal(result.heldGates, 0);
  assert.equal(result.pointPhysicalGpuSurfaces, 12);
});

test("BIM renderer requires exact base color texture evidence", async () => {
  const { manifest, evidence } = await fixtures();
  evidence.baseColorTextureProducts.assertions
    .deterministicCleanup = false;
  assert.throws(
    () => validateBimRenderer3dCompatibility(manifest, evidence),
    /glTF texture product evidence is invalid/u,
  );
});

test("BIM renderer requires exact JPEG texture evidence", async () => {
  const { manifest, evidence } = await fixtures();
  evidence.jpegBaseColorTextureProducts.core.geometry.rangeBytes += 1;
  assert.throws(
    () => validateBimRenderer3dCompatibility(manifest, evidence),
    /glTF JPEG texture product evidence is invalid/u,
  );
});

test("BIM renderer Viewer Core claim requires release evidence", async () => {
  const { manifest, evidence } = await fixtures();
  manifest.evidence.viewerCoreRelease =
    "compatibility/evidence/missing.json";
  assert.throws(
    () => validateBimRenderer3dCompatibility(
      manifest,
      evidence,
    ),
    /policy overclaims compatibility/u,
  );
});

test("Browser evidence is required for the GPU first-frame gate", async () => {
  const { manifest, evidence } = await fixtures();
  const corrupted = structuredClone(evidence);
  corrupted.browserWebGl2.representativeReport
    .renderer.receipt.backend.rendered = false;

  assert.throws(
    () => validateBimRenderer3dCompatibility(manifest, corrupted),
    /first frame is invalid/u,
  );
});

test("Browser view evidence pins revision-bound visibility", async () => {
  const { manifest, evidence } = await fixtures();
  const corrupted = structuredClone(evidence);
  corrupted.browserViewState.representativeReport
    .viewSequence[2].visibleInstances += 1;

  assert.throws(
    () => validateBimRenderer3dCompatibility(manifest, corrupted),
    /frame is invalid/u,
  );
});

test("Browser pick evidence pins active revision identity", async () => {
  const { manifest, evidence } = await fixtures();
  const corrupted = structuredClone(evidence);
  corrupted.browserPickingSelection.representativeReport
    .pick.identity.pickId = "pick:stale";

  assert.throws(
    () => validateBimRenderer3dCompatibility(manifest, corrupted),
    /pick receipt is invalid/u,
  );
});

test("Browser lifecycle evidence pins context and source cleanup", async () => {
  const { manifest, evidence } = await fixtures();
  const corrupted = structuredClone(evidence);
  corrupted.browserLifecycle.representativeReport
    .cleanup.activeBytes = 1;

  assert.throws(
    () => validateBimRenderer3dCompatibility(manifest, corrupted),
    /lifecycle cleanup is invalid/u,
  );
});

test("Browser section evidence pins clipping and measurement", async () => {
  const { manifest, evidence } = await fixtures();
  const corrupted = structuredClone(evidence);
  corrupted.browserSectionMeasurement.representativeReport
    .section.restored.pixels -= 1;

  assert.throws(
    () => validateBimRenderer3dCompatibility(manifest, corrupted),
    /section receipt is invalid/u,
  );
});

test("Browser precision evidence pins relative GPU coordinates", async () => {
  const { manifest, evidence } = await fixtures();
  const corrupted = structuredClone(evidence);
  corrupted.browserLargeCoordinate.representativeReport
    .renderer.precision.maximumRelativeCoordinate = 64;

  assert.throws(
    () => validateBimRenderer3dCompatibility(manifest, corrupted),
    /precision render receipt is invalid/u,
  );
});

test("Browser progressive evidence pins cache hit and eviction", async () => {
  const { manifest, evidence } = await fixtures();
  const corrupted = structuredClone(evidence);
  corrupted.browserProgressiveRange.representativeReport
    .cacheHit.sourceReadsAfter += 1;

  assert.throws(
    () => validateBimRenderer3dCompatibility(manifest, corrupted),
    /progressive cache hit is invalid/u,
  );
});

test("Browser delta evidence pins partial atomic redraw", async () => {
  const { manifest, evidence } = await fixtures();
  const corrupted = structuredClone(evidence);
  corrupted.browserAtomicDelta.representativeReport
    .redraw.pixels += 1;

  assert.throws(
    () => validateBimRenderer3dCompatibility(manifest, corrupted),
    /delta redraw is invalid/u,
  );
});

test("Browser camera-input evidence pins serialized GPU frames", async () => {
  const { manifest, evidence } = await fixtures();
  const corrupted = structuredClone(evidence);
  corrupted.browserCameraInput.representativeReport
    .input.serializedUpdates += 1;

  assert.throws(
    () => validateBimRenderer3dCompatibility(manifest, corrupted),
    /camera-input frames are invalid/u,
  );
});

test("Browser and VS Code host evidence pins editor cleanup", async () => {
  const { manifest, evidence } = await fixtures();
  const corrupted = structuredClone(evidence);
  corrupted.browserVscodeHost.representativeReport
    .runs[1].backendActiveBytes = 1;

  assert.throws(
    () => validateBimRenderer3dCompatibility(manifest, corrupted),
    /host lifecycle is invalid/u,
  );
});

test("Browser point evidence pins one bounded primitive draw", async () => {
  const { manifest, evidence } = await fixtures();
  const corrupted = structuredClone(evidence);
  corrupted.browserPointPrimitive.renderer.drawCalls = 2;

  assert.throws(
    () => validateBimRenderer3dCompatibility(manifest, corrupted),
    /point renderer qualification evidence is invalid/u,
  );
});

test("point physical GPU evidence rejects software fallback", async () => {
  const { manifest, evidence } = await fixtures();
  evidence.pointPhysicalGpuQualification.browser.e57
    .environment.gpu.unmaskedRenderer =
      "ANGLE (Google, SwiftShader)";

  assert.throws(
    () => validateBimRenderer3dCompatibility(manifest, evidence),
    /physical Browser evidence is invalid/u,
  );
});

test("BIM renderer rejects production claims", async () => {
  const { manifest, evidence } = await fixtures();
  const promoted = structuredClone(manifest);
  promoted.policy.claimProductionRenderer = true;

  assert.throws(
    () => validateBimRenderer3dCompatibility(promoted, evidence),
    /policy overclaims compatibility/u,
  );
});

test("BIM renderer evidence pins initial range accounting", async () => {
  const { manifest, evidence } = await fixtures();
  const corrupted = structuredClone(evidence);
  corrupted.headless.representativeReport.renderer.receipt
    .metrics.instances += 1;

  assert.throws(
    () => validateBimRenderer3dCompatibility(manifest, corrupted),
    /mount receipt is invalid/u,
  );
});
