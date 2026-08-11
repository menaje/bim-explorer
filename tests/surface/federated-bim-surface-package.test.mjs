import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  qualifyFederatedBimSurfacePackage,
  validateFederatedBimSurfacePackageQualification,
} from "../../scripts/qualify-federated-bim-surface-package.mjs";

const evidencePath =
  "compatibility/evidence/" +
  "federated-bim-surface-package-release-ready-2026-08-11.json";

test("federated BIM Surface candidate is reproducible and clean-installs", async () => {
  const expected = JSON.parse(await readFile(evidencePath, "utf8"));
  const observed = await qualifyFederatedBimSurfacePackage();
  assert.deepEqual(observed, expected);
});

test("federated package publication authorization cannot be revoked", async () => {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const invalid = structuredClone(evidence);
  invalid.releaseGate.publicationAuthorized = false;
  assert.throws(
    () => validateFederatedBimSurfacePackageQualification(invalid),
    /qualification is invalid/u,
  );
});

test("release-ready package cannot lose exact-byte Spatial admission", async () => {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const invalid = structuredClone(evidence);
  invalid.releaseGate.releaseReadyPackageConsumerRevalidation = false;
  assert.throws(
    () => validateFederatedBimSurfacePackageQualification(invalid),
    /qualification is invalid/u,
  );
});

test("release-ready package cannot claim a public artifact early", async () => {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const invalid = structuredClone(evidence);
  invalid.claims.immutablePublicReleaseAsset = true;
  assert.throws(
    () => validateFederatedBimSurfacePackageQualification(invalid),
    /qualification is invalid/u,
  );
});
