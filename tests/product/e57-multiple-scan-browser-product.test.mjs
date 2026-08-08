import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateE57MultipleScanBrowserProductQualification,
} from "../../scripts/qualify-e57-multiple-scan-browser-product.mjs";

const evidence = JSON.parse(await readFile(
  "compatibility/evidence/" +
    "e57-multiple-scan-browser-product-2026-08-08.json",
  "utf8",
));

test("multiple-scan E57 Browser product pins pose projection", () => {
  const validated =
    validateE57MultipleScanBrowserProductQualification(evidence);
  assert.equal(validated.surface.observation.model.points, 1_213_990);
  assert.equal(
    validated.surface.observation.renderer.uploadedBytes,
    19_423_840,
  );
  assert.equal(validated.profile.scanCount, 5);
  assert.equal(validated.profile.poseAuthority, "local-registration-only");
});

test("multiple-scan Browser evidence cannot claim CRS authority", () => {
  const overclaim = structuredClone(evidence);
  overclaim.decision.coordinateReference = "passed";
  assert.throws(
    () =>
      validateE57MultipleScanBrowserProductQualification(overclaim),
    /evidence is invalid/u,
  );
});

test("multiple-scan Browser evidence cannot admit E57", () => {
  const overclaim = structuredClone(evidence);
  overclaim.decision.formatAdmission = true;
  assert.throws(
    () =>
      validateE57MultipleScanBrowserProductQualification(overclaim),
    /evidence is invalid/u,
  );
});
