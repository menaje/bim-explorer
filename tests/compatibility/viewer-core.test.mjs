import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateViewerCoreManifest,
} from "../../scripts/check-viewer-core-compatibility.mjs";

async function inputs() {
  const manifest = JSON.parse(
    await readFile("compatibility/viewer-core.json", "utf8"),
  );
  const evidence = JSON.parse(
    await readFile(
      manifest.observations.releaseArtifactProbe.evidence,
      "utf8",
    ),
  );
  return { evidence, manifest };
}

test("public Viewer Core release is admitted as experimental", async () => {
  const { evidence, manifest } = await inputs();
  const report = validateViewerCoreManifest(
    manifest,
    evidence,
  );
  assert.equal(report.status, "experimental");
  assert.equal(report.passedGates, 8);
  assert.equal(report.blockerCount, 3);
  assert.equal(
    report.localProbe,
    "passed-local-workspace-only",
  );
});

test("local workspace evidence cannot become admission evidence", async () => {
  const { evidence, manifest } = await inputs();
  manifest.observations.localWorkspaceProbe.admissionEvidence =
    true;
  assert.throws(
    () => validateViewerCoreManifest(manifest, evidence),
    /must remain non-admission evidence/u,
  );
});

test("Viewer Core release evidence rejects a changed artifact", async () => {
  const { evidence, manifest } = await inputs();
  evidence.packages.viewerCore.installedContent.sha256 =
    "0".repeat(64);
  assert.throws(
    () => validateViewerCoreManifest(manifest, evidence),
    /release identity is invalid/u,
  );
});

test("Viewer Core compatibility rejects a changed package pin", async () => {
  const { evidence, manifest } = await inputs();
  manifest.pin.renderProtocol.sha256 = "0".repeat(64);
  assert.throws(
    () => validateViewerCoreManifest(manifest, evidence),
    /compatibility pin is invalid/u,
  );
});

test("public preview cannot claim production compatibility", async () => {
  const { evidence, manifest } = await inputs();
  manifest.policy.productionClaims = true;
  assert.throws(
    () => validateViewerCoreManifest(manifest, evidence),
    /must remain preview-only/u,
  );

  const second = await inputs();
  second.manifest.status = "qualified";
  assert.throws(
    () => validateViewerCoreManifest(
      second.manifest,
      second.evidence,
    ),
    /upstream identity is invalid/u,
  );
});
