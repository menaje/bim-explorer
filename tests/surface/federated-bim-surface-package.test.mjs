import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  qualifyFederatedBimSurfacePackage,
  validateFederatedBimSurfacePackageQualification,
} from "../../scripts/qualify-federated-bim-surface-package.mjs";

const evidencePath =
  "compatibility/evidence/" +
  "federated-bim-surface-package-2026-08-09.json";

test("federated BIM Surface candidate is reproducible and clean-installs", async () => {
  const expected = JSON.parse(await readFile(evidencePath, "utf8"));
  const observed = await qualifyFederatedBimSurfacePackage();
  assert.deepEqual(observed, expected);
});

test("federated package candidate cannot authorize publication", async () => {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const invalid = structuredClone(evidence);
  invalid.releaseGate.publicationAuthorized = true;
  assert.throws(
    () => validateFederatedBimSurfacePackageQualification(invalid),
    /qualification is invalid/u,
  );
});
