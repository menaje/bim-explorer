import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateBimSurfaceCompatibility,
  validateBimSurfaceReleaseEvidence,
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
    readFile(
      "compatibility/evidence/" +
        "bim-surface-release-v0.1.0-2026-08-09.json",
      "utf8",
    ).then(JSON.parse),
    readFile("packages/bim-surface/runtime/index.mjs"),
  ]);
}

test("BIM surface records an immutable public prerelease", async () => {
  const [
    manifest,
    evidence,
    releaseEvidence,
    runtimeBytes,
  ] = await inputs();
  assert.deepEqual(
    validateBimSurfaceCompatibility(
      manifest,
      evidence,
      releaseEvidence,
      runtimeBytes,
    ),
    {
      status: "experimental",
      passedGates: 19,
      heldGates: 3,
      blockers: 3,
      packageSha256:
        "bd6352525f1f91c7977199559cd58d471916fb9dc14904d63e7f260b2e86a9cc",
    },
  );
  assert.deepEqual(
    validateBimSurfaceReleaseEvidence(
      releaseEvidence,
      evidence.package,
    ),
    {
      artifacts: 9,
      assertions: 17,
    },
  );
});

test("public package requires immutable remote evidence", async () => {
  const [manifest, evidence, , runtimeBytes] = await inputs();
  assert.throws(
    () => validateBimSurfaceCompatibility(
      manifest,
      evidence,
      null,
      runtimeBytes,
    ),
    /release evidence/u,
  );
});

test("BIM surface rejects altered release evidence", async () => {
  const [
    manifest,
    evidence,
    releaseEvidence,
    runtimeBytes,
  ] = await inputs();
  releaseEvidence.release.immutable = false;
  assert.throws(
    () => validateBimSurfaceCompatibility(
      manifest,
      evidence,
      releaseEvidence,
      runtimeBytes,
    ),
    /publication evidence/u,
  );
});

test("BIM surface rejects Spatial authority in a clean consumer", async () => {
  const [
    manifest,
    evidence,
    releaseEvidence,
    runtimeBytes,
  ] = await inputs();
  evidence.consumer.lifecycle.authority.publish = true;
  assert.throws(
    () => validateBimSurfaceCompatibility(
      manifest,
      evidence,
      releaseEvidence,
      runtimeBytes,
    ),
    /authority/u,
  );
});
