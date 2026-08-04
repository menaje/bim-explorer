import assert from "node:assert/strict";
import test from "node:test";

import {
  qualifyIfcLicenseProfile,
} from "../../scripts/qualify-ifc-license-profile.mjs";

test("web-ifc technical license profile is exact and fail-closed", async () => {
  const evidence = await qualifyIfcLicenseProfile();
  assert.equal(
    evidence.status,
    "passed-technical-due-diligence",
  );
  assert.equal(evidence.selectedEngine.id, "web-ifc");
  assert.equal(evidence.selectedEngine.version, "0.0.77");
  assert.equal(
    evidence.decision.profileAdmission,
    "passed-experimental-read-only",
  );
  assert.equal(evidence.artifact.license.spdx, "MPL-2.0");
  assert.equal(evidence.artifact.license.fullTextPresent, true);
  assert.equal(
    evidence.packagingBoundary.exactNotices.length,
    3,
  );
  assert.equal(
    evidence.packagingBoundary.multiThreadRuntime.admission,
    "blocked",
  );
  assert.equal(evidence.fallback.bundled, false);
  assert.equal(evidence.decision.legalApproval, false);
  assert.equal(evidence.decision.productionClaims, false);
});
