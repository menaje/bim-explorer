import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateReferenceFormatProbeCompatibility,
} from "../../scripts/check-reference-format-probes-compatibility.mjs";

const [manifest, evidence] = await Promise.all([
  readFile(
    "compatibility/reference-format-probes.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "e57-public-sample-probe-2026-08-08.json",
    "utf8",
  ).then(JSON.parse),
]);

test("reference sample probes remain separate from format admission", () => {
  assert.deepEqual(
    validateReferenceFormatProbeCompatibility(manifest, evidence),
    {
      status: "pre-admission",
      passedGates: 5,
      heldGates: 3,
      sampleFormats: 1,
    },
  );
});

test("an E57 sample probe cannot claim point decode", () => {
  const overclaim = structuredClone(manifest);
  overclaim.gates.e57PointDecode = true;
  assert.throws(
    () => validateReferenceFormatProbeCompatibility(
      overclaim,
      evidence,
    ),
    /must be held/u,
  );
});
