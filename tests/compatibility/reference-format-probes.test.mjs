import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateReferenceFormatProbeCompatibility,
} from "../../scripts/check-reference-format-probes-compatibility.mjs";

const [
  manifest,
  e57Evidence,
  lasLazEvidence,
  lasLazWorkerEvidence,
] = await Promise.all([
  readFile(
    "compatibility/reference-format-probes.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "e57-public-sample-probe-2026-08-08.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "las-laz-public-sample-probe-2026-08-08.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "las-laz-browser-worker-2026-08-08.json",
    "utf8",
  ).then(JSON.parse),
]);

test("reference sample probes remain separate from format admission", () => {
  assert.deepEqual(
    validateReferenceFormatProbeCompatibility(
      manifest,
      e57Evidence,
      lasLazEvidence,
      lasLazWorkerEvidence,
    ),
    {
      status: "pre-admission",
      passedGates: 13,
      heldGates: 6,
      sampleFormats: 3,
    },
  );
});

test("an E57 sample probe cannot claim point decode", () => {
  const overclaim = structuredClone(manifest);
  overclaim.gates.e57PointDecode = true;
  assert.throws(
    () => validateReferenceFormatProbeCompatibility(
      overclaim,
      e57Evidence,
      lasLazEvidence,
      lasLazWorkerEvidence,
    ),
    /must be held/u,
  );
});

test("a LAS/LAZ point probe cannot claim product open", () => {
  const overclaim = structuredClone(manifest);
  overclaim.gates.lasLazProductOpen = true;
  assert.throws(
    () => validateReferenceFormatProbeCompatibility(
      overclaim,
      e57Evidence,
      lasLazEvidence,
      lasLazWorkerEvidence,
    ),
    /must be held/u,
  );
});
