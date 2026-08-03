import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateViewerCoreManifest,
} from "../../scripts/check-viewer-core-compatibility.mjs";

async function manifest() {
  return JSON.parse(
    await readFile("compatibility/viewer-core.json", "utf8"),
  );
}

test("Viewer Core compatibility is explicitly unresolved", async () => {
  const report = validateViewerCoreManifest(await manifest());
  assert.equal(report.status, "unresolved");
  assert.equal(report.passedGates, 0);
  assert.ok(report.blockerCount >= 4);
});

test("an unresolved manifest rejects an invented version pin", async () => {
  const value = await manifest();
  value.pin = {
    viewerCore: "@dwg-viewer/viewer-core@0.1.0",
  };
  assert.throws(
    () => validateViewerCoreManifest(value),
    /cannot have a pin/u,
  );
});

test("an unresolved manifest rejects optimistic compatibility claims", async () => {
  const value = await manifest();
  value.admissionGates.durableArtifact = true;
  assert.throws(
    () => validateViewerCoreManifest(value),
    /cannot claim passed admission gates/u,
  );

  value.admissionGates.durableArtifact = false;
  value.policy.claimCompatibility = true;
  assert.throws(
    () => validateViewerCoreManifest(value),
    /must fail closed/u,
  );
});
