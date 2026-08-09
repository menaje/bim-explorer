import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateFederatedBimSurfaceCompatibility,
} from "../../scripts/check-federated-bim-surface-compatibility.mjs";

const [
  manifest,
  evidence,
  browserEvidence,
  vscodeEvidence,
  packageEvidence,
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
      "federated-bim-surface-package-2026-08-09.json",
    "utf8",
  ).then(JSON.parse),
]);

test("federated BIM Surface admits actual Browser and VS Code anchors", () => {
  assert.deepEqual(
    validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
      vscodeEvidence,
      packageEvidence,
    ),
    {
      status: "experimental",
      passedGates: 17,
      heldGates: 3,
      sourceCount: 3,
      anchors: 3,
      surfaceHits: 3,
      vscodeAnchors: 3,
      packageVersion: "0.2.0",
      packageBytes: 97293,
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
    ),
    /package qualification is invalid/u,
  );
});
