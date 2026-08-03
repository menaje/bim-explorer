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
  const evidence = JSON.parse(await readFile(
    manifest.evidence,
    "utf8",
  ));
  return { manifest, evidence };
}

test("BIM renderer records a bounded public headless mount", async () => {
  const { manifest, evidence } = await fixtures();
  const result = validateBimRenderer3dCompatibility(
    manifest,
    evidence,
  );

  assert.equal(result.status, "experimental");
  assert.equal(result.instances, 3_182);
  assert.equal(result.instancedTriangles, 127_993);
  assert.equal(result.uploadedBytes, 4_399_252);
  assert.equal(result.passedGates, 7);
  assert.equal(result.heldGates, 8);
});

test("headless evidence cannot promote an actual GPU frame", async () => {
  const { manifest, evidence } = await fixtures();
  const promoted = structuredClone(manifest);
  promoted.gates.actualGpuFirstFrame = true;

  assert.throws(
    () => validateBimRenderer3dCompatibility(promoted, evidence),
    /actualGpuFirstFrame must remain held/u,
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
  corrupted.representativeReport.renderer.receipt
    .metrics.instances += 1;

  assert.throws(
    () => validateBimRenderer3dCompatibility(manifest, corrupted),
    /mount receipt is invalid/u,
  );
});
