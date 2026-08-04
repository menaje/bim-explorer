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
  const metadataEvidence = JSON.parse(await readFile(
    manifest.evidence.metadataExtension,
    "utf8",
  ));
  return {
    manifest,
    syntheticEvidence,
    publicEvidence,
    metadataEvidence,
  };
}

function validateFixtures({
  manifest,
  syntheticEvidence,
  publicEvidence,
  metadataEvidence,
}) {
  return validateBimModelSourceCompatibility(
    manifest,
    syntheticEvidence,
    publicEvidence,
    metadataEvidence,
  );
}

test("BIM model source compatibility records public multi-range evidence", async () => {
  const {
    manifest,
    syntheticEvidence,
    publicEvidence,
    metadataEvidence,
  } = await fixtures();
  const result = validateFixtures({
    manifest,
    syntheticEvidence,
    publicEvidence,
    metadataEvidence,
  });

  assert.equal(result.status, "experimental");
  assert.equal(result.products, 3_569);
  assert.equal(result.triangles, 261_424);
  assert.equal(result.syntheticProducts, 2);
  assert.equal(result.passedGates, 17);
  assert.equal(result.heldGates, 0);
});

test("source metadata evidence cannot promote production support", async () => {
  const {
    manifest,
    syntheticEvidence,
    publicEvidence,
    metadataEvidence,
  } = await fixtures();
  const promoted = structuredClone(manifest);
  promoted.policy.claimProductionIfcSupport = true;

  assert.throws(
    () => validateFixtures({
      manifest: promoted,
      syntheticEvidence,
      publicEvidence,
      metadataEvidence,
    }),
    /policy overclaims compatibility/u,
  );
});

test("source Viewer Core claim requires release evidence", async () => {
  const {
    manifest,
    syntheticEvidence,
    publicEvidence,
    metadataEvidence,
  } = await fixtures();
  manifest.evidence.viewerCoreRelease =
    "compatibility/evidence/missing.json";
  assert.throws(
    () => validateFixtures({
      manifest,
      syntheticEvidence,
      publicEvidence,
      metadataEvidence,
    }),
    /policy overclaims compatibility/u,
  );
});

test("BIM source compatibility rejects production claims", async () => {
  const {
    manifest,
    syntheticEvidence,
    publicEvidence,
    metadataEvidence,
  } = await fixtures();
  const promoted = structuredClone(manifest);
  promoted.policy.claimProductionIfcSupport = true;

  assert.throws(
    () => validateFixtures({
      manifest: promoted,
      syntheticEvidence,
      publicEvidence,
      metadataEvidence,
    }),
    /policy overclaims compatibility/u,
  );
});

test("BIM source evidence requires every fail-closed assertion", async () => {
  const {
    manifest,
    syntheticEvidence,
    publicEvidence,
    metadataEvidence,
  } = await fixtures();
  const incomplete = structuredClone(syntheticEvidence);
  delete incomplete.failClosed.malformedRangeStructureRejected;

  assert.throws(
    () => validateFixtures({
      manifest,
      syntheticEvidence: incomplete,
      publicEvidence,
      metadataEvidence,
    }),
    /malformedRangeStructureRejected did not pass/u,
  );
});

test("public source evidence pins every geometry range", async () => {
  const {
    manifest,
    syntheticEvidence,
    publicEvidence,
    metadataEvidence,
  } = await fixtures();
  const corrupted = structuredClone(publicEvidence);
  corrupted.representativeReport.snapshot.ranges[1].sha256 =
    "0".repeat(64);

  assert.throws(
    () => validateFixtures({
      manifest,
      syntheticEvidence,
      publicEvidence: corrupted,
      metadataEvidence,
    }),
    /range 1 is invalid/u,
  );
});

test("public source evidence pins every semantic detail range", async () => {
  const {
    manifest,
    syntheticEvidence,
    publicEvidence,
    metadataEvidence,
  } = await fixtures();
  const corrupted = structuredClone(publicEvidence);
  corrupted.representativeReport.snapshot
    .detailRanges[1].sha256 = "0".repeat(64);

  assert.throws(
    () => validateFixtures({
      manifest,
      syntheticEvidence,
      publicEvidence: corrupted,
      metadataEvidence,
    }),
    /detail range 1 is invalid/u,
  );
});
