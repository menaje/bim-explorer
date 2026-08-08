import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateBimFederationCompatibility,
} from "../../scripts/check-bim-federation-compatibility.mjs";

const [
  manifest,
  evidence,
  productScaleEvidence,
  productScalePlatformEvidence,
] = await Promise.all([
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
  readFile(
    "compatibility/evidence/" +
      "bim-federation-product-scale-platform-matrix-2026-08-08.json",
    "utf8",
  ).then(JSON.parse),
]);

test("BIM federation admits IFC and qualified glTF references", () => {
  assert.deepEqual(
    validateBimFederationCompatibility(
      manifest,
      evidence,
      productScaleEvidence,
      productScalePlatformEvidence,
    ),
    {
      status: "experimental",
      passedGates: 19,
      heldGates: 6,
      registeredFormats: 9,
      qualifiedPlatforms: 2,
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
      productScalePlatformEvidence,
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
      productScalePlatformEvidence,
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
      productScalePlatformEvidence,
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
      productScalePlatformEvidence,
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
      productScalePlatformEvidence,
    ),
    /cleanup or decision evidence is invalid/u,
  );
});

test("product-scale federation requires both CI platforms", () => {
  const invalid = structuredClone(productScalePlatformEvidence);
  invalid.platforms.pop();
  assert.throws(
    () => validateBimFederationCompatibility(
      manifest,
      evidence,
      productScaleEvidence,
      invalid,
    ),
    /platform matrix identity differs/u,
  );
});

test("product-scale federation rejects divergent platform rendering", () => {
  const invalid = structuredClone(productScalePlatformEvidence);
  invalid.platforms[1].browser.renderer.highlightPixels += 1;
  assert.throws(
    () => validateBimFederationCompatibility(
      manifest,
      evidence,
      productScaleEvidence,
      invalid,
    ),
    /cross-platform evidence is incomplete/u,
  );
});
