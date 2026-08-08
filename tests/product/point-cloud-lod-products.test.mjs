import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validatePointCloudLodProductQualification,
} from "../../scripts/qualify-point-cloud-lod-products.mjs";

const evidence = JSON.parse(await readFile(
  "compatibility/evidence/" +
    "point-cloud-lod-products-2026-08-09.json",
  "utf8",
));

test("Browser, VS Code and clean VSIX preserve derived point LOD", () => {
  assert.equal(
    validatePointCloudLodProductQualification(evidence),
    evidence,
  );
  for (const surface of ["browser", "staged", "installed"]) {
    const observation = evidence.surfaces[surface].observation;
    assert.equal(observation.model.chunks, 51);
    assert.equal(observation.model.levels, 3);
    assert.equal(observation.initialPointLod.lod.pointCount, 31_971);
    assert.equal(observation.pointCloud.lod.pointCount, 1_213_990);
    assert.equal(
      observation.productLifecycle.hierarchyCleanup.retainedBytes,
      0,
    );
  }
});

test("coarse picks map rendered vertices to root-range identity", () => {
  const observation = evidence.surfaces.browser.observation;
  const identity = observation.initialPointLod.pointSelection.identity;
  assert.equal(identity.pointIndex, 918_699);
  assert.equal(identity.renderedPointIndex, 20_935);
  assert.notEqual(
    identity.rangeSha256,
    identity.renderedRangeSha256,
  );
  assert.equal(
    observation.lodTransitions[1].releasedIdentityMapBytes,
    971_284,
  );
});

test("derived LOD cannot claim source-native hierarchy or admission", () => {
  for (const [field, value] of [
    ["sourceNativeHierarchy", "passed"],
    ["coordinateReference", "passed"],
    ["pointCloudCodec", "passed"],
    ["formatAdmission", true],
  ]) {
    const overclaim = structuredClone(evidence);
    overclaim.decision[field] = value;
    assert.throws(
      () => validatePointCloudLodProductQualification(overclaim),
      /evidence is invalid/u,
    );
  }
});
