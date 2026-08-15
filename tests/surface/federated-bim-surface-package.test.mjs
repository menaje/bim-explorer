import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  qualifyFederatedBimSurfaceV03Package,
  validateFederatedBimSurfaceV03PackageQualification,
} from "../../scripts/qualify-federated-bim-surface-v0.3-package.mjs";

const evidencePath =
  "compatibility/evidence/" +
  "bim-retained-overlay-package-release-ready-2026-08-15.json";

test("federated BIM Surface candidate is reproducible and clean-installs", async () => {
  const expected = JSON.parse(await readFile(evidencePath, "utf8"));
  const observed = await qualifyFederatedBimSurfaceV03Package();
  assert.deepEqual(observed, expected);
});

test("federated package publication authorization cannot be revoked", async () => {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const invalid = structuredClone(evidence);
  invalid.releaseGate.publicationAuthorized = false;
  assert.throws(
    () => validateFederatedBimSurfaceV03PackageQualification(invalid),
    /qualification is invalid/u,
  );
});

test("release-ready package requires artifact-only retained conformance", async () => {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const invalid = structuredClone(evidence);
  invalid.releaseGate.artifactOnlyRetainedOverlay = false;
  assert.throws(
    () => validateFederatedBimSurfaceV03PackageQualification(invalid),
    /qualification is invalid/u,
  );
});

test("release-ready package cannot claim a public artifact early", async () => {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const invalid = structuredClone(evidence);
  invalid.claims.publicSurfaceArtifact = true;
  assert.throws(
    () => validateFederatedBimSurfaceV03PackageQualification(invalid),
    /qualification is invalid/u,
  );
});
