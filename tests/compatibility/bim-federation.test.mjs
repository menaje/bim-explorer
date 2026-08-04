import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateBimFederationCompatibility,
} from "../../scripts/check-bim-federation-compatibility.mjs";

const [manifest, evidence] = await Promise.all([
  readFile(
    "compatibility/bim-federation.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "bim-federation-synthetic-2026-08-04.json",
    "utf8",
  ).then(JSON.parse),
]);

test("BIM federation admits IFC and qualified glTF references", () => {
  assert.deepEqual(
    validateBimFederationCompatibility(
      manifest,
      evidence,
    ),
    {
      status: "experimental",
      passedGates: 16,
      heldGates: 7,
      registeredFormats: 9,
    },
  );
});

test("BIM federation cannot merge native source identity", () => {
  const overclaim = structuredClone(manifest);
  overclaim.policy.mergeNativeIdentity = true;
  assert.throws(
    () => validateBimFederationCompatibility(
      overclaim,
      evidence,
    ),
    /overclaims capability/u,
  );
});

test("held reference codecs cannot become supported without evidence", () => {
  const overclaim = structuredClone(manifest);
  overclaim.gates.pointCloudCodec = true;
  assert.throws(
    () => validateBimFederationCompatibility(
      overclaim,
      evidence,
    ),
    /must remain held/u,
  );
});

test("federation evidence rejects datum transformation claims", () => {
  const overclaim = structuredClone(evidence);
  overclaim.coordinates.datumTransformation = "performed";
  assert.throws(
    () => validateBimFederationCompatibility(
      manifest,
      overclaim,
    ),
    /coordinate evidence is invalid/u,
  );
});
