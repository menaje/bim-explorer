import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateBimSurfaceCompatibility,
} from "../../scripts/check-bim-surface-compatibility.mjs";

async function inputs() {
  return Promise.all([
    readFile("compatibility/bim-surface.json", "utf8")
      .then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "bim-surface-package-2026-08-09.json",
      "utf8",
    ).then(JSON.parse),
    readFile("packages/bim-surface/runtime/index.mjs"),
  ]);
}

test("BIM surface records a clean-install release candidate without public overclaim", async () => {
  const [manifest, evidence, runtimeBytes] = await inputs();
  assert.deepEqual(
    validateBimSurfaceCompatibility(
      manifest,
      evidence,
      runtimeBytes,
    ),
    {
      status: "experimental",
      passedGates: 12,
      heldGates: 4,
      blockers: 4,
      packageSha256:
        "bd6352525f1f91c7977199559cd58d471916fb9dc14904d63e7f260b2e86a9cc",
    },
  );
});

test("release candidate cannot claim an immutable public package", async () => {
  const [manifest, evidence, runtimeBytes] = await inputs();
  manifest.gates.immutablePublicReleaseAsset = true;
  evidence.claims.immutablePublicReleaseAsset = true;
  assert.throws(
    () => validateBimSurfaceCompatibility(
      manifest,
      evidence,
      runtimeBytes,
    ),
    /claims are invalid|must remain held/u,
  );
});

test("BIM surface rejects Spatial authority in a clean consumer", async () => {
  const [manifest, evidence, runtimeBytes] = await inputs();
  evidence.consumer.lifecycle.authority.publish = true;
  assert.throws(
    () => validateBimSurfaceCompatibility(
      manifest,
      evidence,
      runtimeBytes,
    ),
    /authority/u,
  );
});
