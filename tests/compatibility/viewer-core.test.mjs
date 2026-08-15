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
  const productEvidence = JSON.parse(
    await readFile(
      manifest.observations.productEntrypointProbe.evidence,
      "utf8",
    ),
  );
  const physicalEvidence = JSON.parse(
    await readFile(
      manifest.observations.physicalGpuProductEntrypointProbe
        .evidence,
      "utf8",
    ),
  );
  return {
    evidence,
    manifest,
    physicalEvidence,
    productEvidence,
  };
}

test("public Viewer Core release is admitted as experimental", async () => {
  const {
    evidence,
    manifest,
    physicalEvidence,
    productEvidence,
  } = await inputs();
  const report = validateViewerCoreManifest(
    manifest,
    evidence,
    productEvidence,
    physicalEvidence,
  );
  assert.equal(report.status, "experimental");
  assert.equal(report.passedGates, 9);
  assert.equal(report.blockerCount, 2);
  assert.equal(
    report.localProbe,
    "passed-local-workspace-only",
  );
});

test("local workspace evidence cannot become admission evidence", async () => {
  const {
    evidence,
    manifest,
    physicalEvidence,
    productEvidence,
  } = await inputs();
  manifest.observations.localWorkspaceProbe.admissionEvidence =
    true;
  assert.throws(
    () => validateViewerCoreManifest(
      manifest,
      evidence,
      productEvidence,
      physicalEvidence,
    ),
    /must remain non-admission evidence/u,
  );
});

test("Viewer Core release evidence rejects a changed artifact", async () => {
  const {
    evidence,
    manifest,
    physicalEvidence,
    productEvidence,
  } = await inputs();
  evidence.packages.viewerCore.installedContent.sha256 =
    "0".repeat(64);
  assert.throws(
    () => validateViewerCoreManifest(
      manifest,
      evidence,
      productEvidence,
      physicalEvidence,
    ),
    /release identity is invalid/u,
  );
});

test("Viewer Core compatibility rejects a changed package pin", async () => {
  const {
    evidence,
    manifest,
    physicalEvidence,
    productEvidence,
  } = await inputs();
  manifest.pin.renderProtocol.sha256 = "0".repeat(64);
  assert.throws(
    () => validateViewerCoreManifest(
      manifest,
      evidence,
      productEvidence,
      physicalEvidence,
    ),
    /compatibility pin is invalid/u,
  );
});

test("public preview cannot claim production compatibility", async () => {
  const {
    evidence,
    manifest,
    physicalEvidence,
    productEvidence,
  } = await inputs();
  manifest.policy.productionClaims = true;
  assert.throws(
    () => validateViewerCoreManifest(
      manifest,
      evidence,
      productEvidence,
      physicalEvidence,
    ),
    /must remain preview-only/u,
  );

  const second = await inputs();
  second.manifest.status = "qualified";
  assert.throws(
    () => validateViewerCoreManifest(
      second.manifest,
      second.evidence,
      second.productEvidence,
      second.physicalEvidence,
    ),
    /upstream identity is invalid/u,
  );
});

test("Viewer Core product entrypoint evidence must remain exact", async () => {
  const {
    evidence,
    manifest,
    physicalEvidence,
    productEvidence,
  } = await inputs();
  productEvidence.decision.vscodeExtensionPublished = true;
  assert.throws(
    () => validateViewerCoreManifest(
      manifest,
      evidence,
      productEvidence,
      physicalEvidence,
    ),
    /Viewer Core product entrypoint evidence is incomplete/u,
  );
});

test("Viewer Core physical GPU product evidence must remain exact", async () => {
  const {
    evidence,
    manifest,
    physicalEvidence,
    productEvidence,
  } = await inputs();
  physicalEvidence.browser.ifc.product.viewerCore.opened.source
    .rangeBytesRead += 1;
  assert.throws(
    () => validateViewerCoreManifest(
      manifest,
      evidence,
      productEvidence,
      physicalEvidence,
    ),
    /representative model physical GPU evidence is invalid/u,
  );
});
