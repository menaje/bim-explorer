import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateBimFederationCompatibility,
} from "../../scripts/check-bim-federation-compatibility.mjs";

const [manifest, evidence, productScaleEvidence] = await Promise.all([
  readFile(
    "compatibility/bim-federation.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "bim-federation-synthetic-2026-08-04.json",
    "utf8",
  ).then(JSON.parse),
  readFile(
    "compatibility/evidence/" +
      "bim-federation-product-scale-2026-08-08.json",
    "utf8",
  ).then(JSON.parse),
]);

test("BIM federation admits IFC and qualified glTF references", () => {
  assert.deepEqual(
    validateBimFederationCompatibility(
      manifest,
      evidence,
      productScaleEvidence,
    ),
    {
      status: "experimental",
      passedGates: 18,
      heldGates: 6,
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
      productScaleEvidence,
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
      productScaleEvidence,
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
      productScaleEvidence,
    ),
    /coordinate evidence is invalid/u,
  );
});

test("product-scale federation requires exact composite metrics", () => {
  const invalid = structuredClone(productScaleEvidence);
  invalid.browser.renderer.uniqueTriangles += 1;
  assert.throws(
    () => validateBimFederationCompatibility(
      manifest,
      evidence,
      invalid,
    ),
    /Browser evidence is invalid/u,
  );
});

test("product-scale federation requires deterministic cleanup", () => {
  const invalid = structuredClone(productScaleEvidence);
  invalid.sourceCleanup.projectionDisposed = false;
  assert.throws(
    () => validateBimFederationCompatibility(
      manifest,
      evidence,
      invalid,
    ),
    /cleanup or decision evidence is invalid/u,
  );
});
