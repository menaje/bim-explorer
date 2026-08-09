import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateFederatedBimSurfaceCompatibility,
} from "../../scripts/check-federated-bim-surface-compatibility.mjs";

const [manifest, evidence, browserEvidence] = await Promise.all([
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
]);

test("federated BIM Surface admits actual Browser anchors", () => {
  assert.deepEqual(
    validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
      browserEvidence,
    ),
    {
      status: "experimental",
      passedGates: 15,
      heldGates: 4,
      sourceCount: 3,
      anchors: 3,
      surfaceHits: 3,
    },
  );
});

test("federated BIM Surface cannot claim a VS Code surface", () => {
  const overclaim = structuredClone(manifest);
  overclaim.gates.actualVscodeSurface = true;
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      overclaim,
      evidence,
      browserEvidence,
    ),
    /held Gate must remain false/u,
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
    ),
    /overclaims authority/u,
  );
});
