import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateCommunityReleaseCompatibility,
} from "../../scripts/check-community-release-compatibility.mjs";

const manifest = JSON.parse(
  await readFile(
    "compatibility/community-release.json",
    "utf8",
  ),
);

test("Community release candidate holds only remote publication gates", () => {
  const result = validateCommunityReleaseCompatibility(manifest);
  assert.deepEqual(result, {
    status: "release-candidate",
    passed: 16,
    held: 8,
  });
});

test("Community release cannot qualify without remote evidence", () => {
  const promoted = structuredClone(manifest);
  promoted.status = "qualified";
  assert.throws(
    () => validateCommunityReleaseCompatibility(promoted),
    /qualified release is missing publication evidence/u,
  );
});

test("Community release cannot gain write or Spatial authority", () => {
  for (const key of [
    "nativeWrite",
    "spatialAuthority",
    "claimProductionBim",
  ]) {
    const overclaim = structuredClone(manifest);
    overclaim.policy[key] = true;
    assert.throws(
      () => validateCommunityReleaseCompatibility(overclaim),
      /overclaims authority/u,
    );
  }
});
