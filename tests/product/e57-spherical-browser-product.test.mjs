import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateE57SphericalBrowserProductQualification,
} from "../../scripts/qualify-e57-spherical-browser-product.mjs";

const evidence = JSON.parse(await readFile(
  "compatibility/evidence/" +
    "e57-spherical-browser-product-2026-08-08.json",
  "utf8",
));

test("spherical E57 Browser product pins rendering and cleanup", () => {
  const validated =
    validateE57SphericalBrowserProductQualification(evidence);
  assert.equal(validated.surface.observation.model.points, 155_201);
  assert.equal(
    validated.surface.observation.renderer.uploadedBytes,
    2_483_216,
  );
  assert.equal(
    validated.surface.observation.lifecycle.rendererDisposed,
    true,
  );
});

test("spherical E57 Browser evidence cannot admit the format", () => {
  const overclaim = structuredClone(evidence);
  overclaim.decision.formatAdmission = true;
  assert.throws(
    () =>
      validateE57SphericalBrowserProductQualification(overclaim),
    /evidence is invalid/u,
  );
});
