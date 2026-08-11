import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateFederatedBimSurfaceCompatibility as validateCompatibilityEvidence,
} from "../../scripts/check-federated-bim-surface-compatibility.mjs";

const [
  manifest,
  evidence,
  browserEvidence,
  vscodeEvidence,
  physicalGpuEvidence,
  packageEvidence,
  releaseEvidence,
  spatialConsumerEvidence,
  spatialReleaseReadyConsumerEvidence,
  spatialPublicArtifactConsumerEvidence,
] = await Promise.all([
  readFile(
    "compatibility/federated-bim-surface.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "federated-bim-surface-headless-2026-08-09.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "federated-bim-surface-browser-2026-08-09.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "federated-bim-surface-vscode-2026-08-09.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "federated-bim-surface-physical-gpu-darwin-arm64-" +
      "2026-08-11.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "federated-bim-surface-package-release-ready-2026-08-11.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "federated-bim-surface-release-v0.2.0-2026-08-11.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "federated-bim-surface-spatial-consumer-2026-08-11.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "federated-bim-surface-spatial-release-ready-consumer-" +
      "2026-08-11.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "federated-bim-surface-spatial-public-artifact-consumer-" +
      "2026-08-11.json",
    "utf8",
  ).then(JSON.parse),
]);

function validateFederatedBimSurfaceCompatibility(
  manifestValue,
  evidenceValue,
  browserEvidenceValue,
  vscodeEvidenceValue,
  packageEvidenceValue,
  releaseEvidenceValue,
  spatialConsumerEvidenceValue,
  spatialReleaseReadyConsumerEvidenceValue,
  spatialPublicArtifactConsumerEvidenceValue,
  physicalGpuEvidenceValue = physicalGpuEvidence,
) {
  return validateCompatibilityEvidence(
    manifestValue,
    evidenceValue,
    browserEvidenceValue,
    vscodeEvidenceValue,
    physicalGpuEvidenceValue,
    packageEvidenceValue,
    releaseEvidenceValue,
    spatialConsumerEvidenceValue,
    spatialReleaseReadyConsumerEvidenceValue,
    spatialPublicArtifactConsumerEvidenceValue,
  );
}

test("federated BIM Surface admits actual Browser and VS Code anchors", () => {
  assert.deepEqual(
    validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
    ),
    {
      status: "experimental",
      passedGates: 22,
      heldGates: 1,
      sourceCount: 3,
      anchors: 3,
      surfaceHits: 3,
      vscodeAnchors: 3,
      packageVersion: "0.2.0",
      packageBytes: 97623,
      spatialConsumer: "passed-private-candidate-actual-consumer",
      releaseReadySpatialConsumer:
        "passed-release-ready-package-consumer-revalidation",
      publicRelease: "passed-immutable-public-package-prerelease",
      publicArtifactSpatialAdmission:
        "passed-public-artifact-spatial-admission",
      physicalGpu: "passed-darwin-arm64-apple-metal-products",
    },
  );
});

test("federated BIM Surface cannot demote its qualified VS Code surface", () => {
  const invalid = structuredClone(manifest);
  invalid.gates.actualVscodeSurface = false;
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      invalid,
      evidence,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
    ),
    /passed Gate is missing/u,
  );
});

test("federated BIM Surface requires unchanged-source range replay", () => {
  const invalid = structuredClone(evidence);
  invalid.refresh.unchangedSourceRangeReadsAfter = 2;
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      invalid,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
    ),
    /refresh evidence is invalid/u,
  );
});

test("federated BIM Surface evidence cannot gain authority", () => {
  const overclaim = structuredClone(evidence);
  overclaim.authority.constraintMutation = true;
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      overclaim,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
    ),
    /overclaims authority/u,
  );
});

test("federated BIM Surface rejects an altered Browser normal", () => {
  const invalid = structuredClone(browserEvidence);
  invalid.anchors[0].normal = [0, 0, 2];
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      invalid,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
    ),
    /surface 0 is invalid/u,
  );
});

test("federated BIM Surface rejects an altered Browser locator", () => {
  const invalid = structuredClone(browserEvidence);
  invalid.anchors[1].locator.triangleIndex += 1;
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      invalid,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
    ),
    /surface 1 is invalid/u,
  );
});

test("federated BIM Surface Browser hit cannot gain authority", () => {
  const overclaim = structuredClone(browserEvidence);
  overclaim.picks[2].authority.nativeFace = true;
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      overclaim,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
    ),
    /overclaims authority/u,
  );
});

test("federated BIM Surface rejects incomplete VS Code Worker cleanup", () => {
  const invalid = structuredClone(vscodeEvidence);
  invalid.surfaces.installed.observation.cleanup.workersTerminated =
    false;
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      invalid,
      packageEvidence,
      releaseEvidence,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
    ),
    /VS Code qualification is invalid/u,
  );
});

test("federated BIM Surface package candidate cannot become public", () => {
  const invalid = structuredClone(packageEvidence);
  invalid.claims.immutablePublicReleaseAsset = true;
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      vscodeEvidence,
      invalid,
      releaseEvidence,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
    ),
    /package qualification is invalid/u,
  );
});

test("release-ready consumer Gate cannot be demoted", () => {
  const invalid = structuredClone(packageEvidence);
  invalid.releaseGate.releaseReadyPackageConsumerRevalidation = false;
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      vscodeEvidence,
      invalid,
      releaseEvidence,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
    ),
    /package qualification is invalid/u,
  );
});

test("Spatial actual-consumer admission is digest-bound", () => {
  const invalid = structuredClone(spatialConsumerEvidence);
  invalid.source.evidenceSha256 = "0".repeat(64);
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      invalid,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
    ),
    /Spatial consumer admission evidence is invalid/u,
  );
});

test("Spatial consumer admission cannot redirect its evidence URL", () => {
  const invalid = structuredClone(spatialConsumerEvidence);
  invalid.source.evidenceUrl =
    "https://github.com/menaje/coni-spatial/blob/main/README.md";
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      invalid,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
    ),
    /Spatial consumer admission evidence is invalid/u,
  );
});

test("Spatial release-ready admission is digest-bound", () => {
  const invalid = structuredClone(spatialReleaseReadyConsumerEvidence);
  invalid.source.evidenceSha256 = "0".repeat(64);
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      spatialConsumerEvidence,
      invalid,
      spatialPublicArtifactConsumerEvidence,
    ),
    /Spatial release-ready consumer admission evidence is invalid/u,
  );
});

test("Spatial release-ready admission cannot redirect evidence", () => {
  const invalid = structuredClone(spatialReleaseReadyConsumerEvidence);
  invalid.source.evidenceUrl =
    "https://github.com/menaje/coni-spatial/blob/main/README.md";
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      spatialConsumerEvidence,
      invalid,
      spatialPublicArtifactConsumerEvidence,
    ),
    /Spatial release-ready consumer admission evidence is invalid/u,
  );
});

test("federated BIM Surface public release is digest-bound", () => {
  const invalid = structuredClone(releaseEvidence);
  invalid.artifacts[7].sha256 = "0".repeat(64);
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
      invalid,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
    ),
    /public release evidence is invalid/u,
  );
});

test("federated BIM Surface public release stays prerelease", () => {
  const invalid = structuredClone(releaseEvidence);
  invalid.release.prerelease = false;
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
      invalid,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
    ),
    /public release evidence is invalid/u,
  );
});

test("Spatial public-artifact admission is digest-bound", () => {
  const invalid = structuredClone(spatialPublicArtifactConsumerEvidence);
  invalid.source.evidenceSha256 = "0".repeat(64);
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      invalid,
    ),
    /Spatial public-artifact consumer admission evidence is invalid/u,
  );
});

test("Spatial public-artifact admission cannot overclaim VSIX BIM", () => {
  const invalid = structuredClone(spatialPublicArtifactConsumerEvidence);
  invalid.claims.spatialVsixBundledRuntime = true;
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      invalid,
    ),
    /Spatial public-artifact consumer admission evidence is invalid/u,
  );
});

test("Spatial public-artifact admission records unstarted hosted CI", () => {
  const invalid = structuredClone(spatialPublicArtifactConsumerEvidence);
  invalid.hostedCi.runnerAssigned = true;
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      invalid,
    ),
    /Spatial public-artifact consumer admission evidence is invalid/u,
  );
});

test("physical GPU qualification rejects a software renderer", () => {
  const invalid = structuredClone(physicalGpuEvidence);
  invalid.browser.runs[0].gpu.unmaskedRenderer =
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))";
  invalid.browser.runs[1] = structuredClone(invalid.browser.runs[0]);
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
      invalid,
    ),
    /physical GPU (?:evidence|identity) is invalid/u,
  );
});

test("physical GPU qualification requires software fallback disabled", () => {
  const invalid = structuredClone(physicalGpuEvidence);
  invalid.launchPolicy.softwareRasterizerDisabled = false;
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
      invalid,
    ),
    /physical GPU evidence is invalid/u,
  );
});

test("physical GPU qualification cannot claim cross-platform coverage", () => {
  const invalid = structuredClone(physicalGpuEvidence);
  invalid.held.crossPlatformPhysicalGpu = true;
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
      releaseEvidence,
      spatialConsumerEvidence,
      spatialReleaseReadyConsumerEvidence,
      spatialPublicArtifactConsumerEvidence,
      invalid,
    ),
    /physical GPU evidence is invalid/u,
  );
});
