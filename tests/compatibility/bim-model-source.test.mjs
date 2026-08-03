import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateBimModelSourceCompatibility,
} from "../../scripts/check-bim-model-source-compatibility.mjs";

async function fixtures() {
  const manifest = JSON.parse(await readFile(
    "compatibility/bim-model-source.json",
    "utf8",
  ));
  const evidence = JSON.parse(await readFile(
    manifest.evidence,
    "utf8",
  ));
  return { manifest, evidence };
}

test("BIM model source compatibility remains synthetic-only", async () => {
  const { manifest, evidence } = await fixtures();
  const result = validateBimModelSourceCompatibility(
    manifest,
    evidence,
  );

  assert.equal(result.status, "experimental");
  assert.equal(result.products, 2);
  assert.equal(result.triangles, 24);
  assert.equal(result.heldGates, 4);
});

test("synthetic source evidence cannot promote held gates", async () => {
  const { manifest, evidence } = await fixtures();
  const promoted = structuredClone(manifest);
  promoted.gates.viewerCoreConformance = true;

  assert.throws(
    () => validateBimModelSourceCompatibility(promoted, evidence),
    /viewerCoreConformance must remain held/u,
  );
});

test("BIM source compatibility rejects production claims", async () => {
  const { manifest, evidence } = await fixtures();
  const promoted = structuredClone(manifest);
  promoted.policy.claimProductionIfcSupport = true;

  assert.throws(
    () => validateBimModelSourceCompatibility(promoted, evidence),
    /policy overclaims compatibility/u,
  );
});

test("BIM source evidence requires every fail-closed assertion", async () => {
  const { manifest, evidence } = await fixtures();
  const incomplete = structuredClone(evidence);
  delete incomplete.failClosed.malformedRangeStructureRejected;

  assert.throws(
    () => validateBimModelSourceCompatibility(manifest, incomplete),
    /malformedRangeStructureRejected did not pass/u,
  );
});
