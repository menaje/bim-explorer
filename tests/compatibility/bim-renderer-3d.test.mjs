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
  assert.equal(result.passedGates, 18);
  assert.equal(result.heldGates, 3);
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
