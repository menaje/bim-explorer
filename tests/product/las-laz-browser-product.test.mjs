import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateLasLazBrowserProductQualification,
} from "../../scripts/qualify-las-laz-browser-product.mjs";

const evidence = JSON.parse(await readFile(
  "compatibility/evidence/" +
    "las-laz-browser-product-2026-08-08.json",
  "utf8",
));

test("committed LAS/LAZ Browser product evidence pins paired open and cleanup", () => {
  assert.equal(
    validateLasLazBrowserProductQualification(evidence),
    evidence,
  );
  assert.equal(evidence.parity.points, 10_201);
  assert.equal(evidence.parity.nonBackgroundPixels, 36_934);
});

test("Browser product evidence cannot claim CRS or format admission", () => {
  const coordinateOverclaim = structuredClone(evidence);
  coordinateOverclaim.decision.coordinateReference = "passed";
  assert.throws(
    () => validateLasLazBrowserProductQualification(
      coordinateOverclaim,
    ),
    /evidence is invalid/u,
  );

  const admissionOverclaim = structuredClone(evidence);
  admissionOverclaim.decision.formatAdmission = true;
  assert.throws(
    () => validateLasLazBrowserProductQualification(
      admissionOverclaim,
    ),
    /evidence is invalid/u,
  );
});

test("Browser product evidence requires exact LAS/LAZ visual parity", () => {
  const divergent = structuredClone(evidence);
  divergent.surfaces.laz.observation.renderer
    .nonBackgroundPixels += 1;
  assert.throws(
    () => validateLasLazBrowserProductQualification(divergent),
    /evidence is invalid/u,
  );
});
