import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateSpatialIntegrationCompatibility,
} from "../../scripts/check-spatial-integration-compatibility.mjs";

async function inputs() {
  return Promise.all([
    readFile(
      "compatibility/spatial-integration.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "spatial-integration-synthetic-2026-08-04.json",
      "utf8",
    ).then(JSON.parse),
  ]);
}

test("Spatial integration pins Explorer provider evidence without consumer overclaim", async () => {
  const [manifest, evidence] = await inputs();
  assert.deepEqual(
    validateSpatialIntegrationCompatibility(
      manifest,
      evidence,
    ),
    {
      status: "experimental",
      passedGates: 10,
      heldGates: 3,
      blockers: 3,
    },
  );
});

test("synthetic bridge cannot promote actual Spatial consumer conformance", async () => {
  const [manifest, evidence] = await inputs();
  manifest.gates.actualSpatialConsumerConformance = true;
  manifest.policy.claimActualSpatialConsumer = true;
  assert.throws(
    () => validateSpatialIntegrationCompatibility(
      manifest,
      evidence,
    ),
    /must remain held/u,
  );
});

test("legacy bridge status cannot override federated v0.2 admission", async () => {
  const [manifest, evidence] = await inputs();
  manifest.contractScope.statusMeaning =
    "actualSpatialConsumerConformance applies to every contract line";
  assert.throws(
    () => validateSpatialIntegrationCompatibility(
      manifest,
      evidence,
    ),
    /contract scope is ambiguous/u,
  );
});

test("Spatial context request cannot smuggle Canonical identity", async () => {
  const [manifest, evidence] = await inputs();
  evidence.context.requestContainsCanonicalId = true;
  assert.throws(
    () => validateSpatialIntegrationCompatibility(
      manifest,
      evidence,
    ),
    /Context Reference evidence is invalid/u,
  );
});
