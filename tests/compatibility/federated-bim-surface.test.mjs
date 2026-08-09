import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateFederatedBimSurfaceCompatibility,
} from "../../scripts/check-federated-bim-surface-compatibility.mjs";

const [manifest, evidence] = await Promise.all([
  readFile(
    "compatibility/federated-bim-surface.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "federated-bim-surface-headless-2026-08-09.json",
    "utf8",
  ).then(JSON.parse),
]);

test("federated BIM Surface admits only its headless foundation", () => {
  assert.deepEqual(
    validateFederatedBimSurfaceCompatibility(
      manifest,
      evidence,
    ),
    {
      status: "experimental",
      passedGates: 13,
      heldGates: 6,
      sourceCount: 2,
      anchors: 2,
    },
  );
});

test("federated BIM Surface cannot claim Browser anchors", () => {
  const overclaim = structuredClone(manifest);
  overclaim.gates.actualBrowserAnchor = true;
  assert.throws(
    () => validateFederatedBimSurfaceCompatibility(
      overclaim,
      evidence,
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
    ),
    /overclaims authority/u,
  );
});
