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
  lasLazPointRendererEvidence,
  lasLazBrowserProductEvidence,
  lasLazVscodeProductEvidence,
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
  readFile(
    "compatibility/evidence/" +
      "las-laz-point-renderer-2026-08-08.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "las-laz-browser-product-2026-08-08.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "las-laz-vscode-product-2026-08-08.json",
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
      lasLazPointRendererEvidence,
      lasLazBrowserProductEvidence,
      lasLazVscodeProductEvidence,
    ),
    {
      status: "pre-admission",
      passedGates: 19,
      heldGates: 4,
      sampleFormats: 3,
    },
  );
});

test("an E57 decode probe cannot claim renderer qualification", () => {
  const overclaim = structuredClone(manifest);
  overclaim.gates.e57Renderer = true;
  assert.throws(
    () => validateReferenceFormatProbeCompatibility(
      overclaim,
      e57Evidence,
      lasLazEvidence,
      lasLazWorkerEvidence,
      lasLazPointRendererEvidence,
      lasLazBrowserProductEvidence,
      lasLazVscodeProductEvidence,
    ),
    /must be held/u,
  );
});

test("a LAS/LAZ Browser product open cannot claim format admission", () => {
  const overclaim = structuredClone(manifest);
  overclaim.gates.lasLazFormatAdmission = true;
  assert.throws(
    () => validateReferenceFormatProbeCompatibility(
      overclaim,
      e57Evidence,
      lasLazEvidence,
      lasLazWorkerEvidence,
      lasLazPointRendererEvidence,
      lasLazBrowserProductEvidence,
      lasLazVscodeProductEvidence,
    ),
    /must be held/u,
  );
});
