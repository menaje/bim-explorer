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
  const syntheticEvidence = JSON.parse(await readFile(
    manifest.evidence.syntheticMapped,
    "utf8",
  ));
  const publicEvidence = JSON.parse(await readFile(
    manifest.evidence.publicRepresentative,
    "utf8",
  ));
  return { manifest, syntheticEvidence, publicEvidence };
}

test("BIM model source compatibility records public multi-range evidence", async () => {
  const {
    manifest,
    syntheticEvidence,
    publicEvidence,
  } = await fixtures();
  const result = validateBimModelSourceCompatibility(
    manifest,
    syntheticEvidence,
    publicEvidence,
  );

  assert.equal(result.status, "experimental");
  assert.equal(result.products, 3_569);
  assert.equal(result.triangles, 261_424);
  assert.equal(result.syntheticProducts, 2);
  assert.equal(result.passedGates, 9);
  assert.equal(result.heldGates, 4);
});

test("source evidence cannot promote held gates", async () => {
  const {
    manifest,
    syntheticEvidence,
    publicEvidence,
  } = await fixtures();
  const promoted = structuredClone(manifest);
  promoted.gates.viewerCoreConformance = true;

  assert.throws(
    () => validateBimModelSourceCompatibility(
      promoted,
      syntheticEvidence,
      publicEvidence,
    ),
    /viewerCoreConformance must remain held/u,
  );
});

test("BIM source compatibility rejects production claims", async () => {
  const {
    manifest,
    syntheticEvidence,
    publicEvidence,
  } = await fixtures();
  const promoted = structuredClone(manifest);
  promoted.policy.claimProductionIfcSupport = true;

  assert.throws(
    () => validateBimModelSourceCompatibility(
      promoted,
      syntheticEvidence,
      publicEvidence,
    ),
    /policy overclaims compatibility/u,
  );
});

test("BIM source evidence requires every fail-closed assertion", async () => {
  const {
    manifest,
    syntheticEvidence,
    publicEvidence,
  } = await fixtures();
  const incomplete = structuredClone(syntheticEvidence);
  delete incomplete.failClosed.malformedRangeStructureRejected;

  assert.throws(
    () => validateBimModelSourceCompatibility(
      manifest,
      incomplete,
      publicEvidence,
    ),
    /malformedRangeStructureRejected did not pass/u,
  );
});

test("public source evidence pins every geometry range", async () => {
  const {
    manifest,
    syntheticEvidence,
    publicEvidence,
  } = await fixtures();
  const corrupted = structuredClone(publicEvidence);
  corrupted.representativeReport.snapshot.ranges[1].sha256 =
    "0".repeat(64);

  assert.throws(
    () => validateBimModelSourceCompatibility(
      manifest,
      syntheticEvidence,
      corrupted,
    ),
    /range 1 is invalid/u,
  );
});
