import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateCommunityReleaseCompatibility,
  validateCommunityReleaseEvidence,
} from "../../scripts/check-community-release-compatibility.mjs";

const manifest = JSON.parse(
  await readFile(
    "compatibility/community-release.json",
    "utf8",
  ),
);
const evidence = JSON.parse(
  await readFile(
    "compatibility/evidence/" +
      "community-release-v0.1.0-2026-08-04.json",
    "utf8",
  ),
);

test("Community release is qualified by immutable remote evidence", () => {
  const result = validateCommunityReleaseCompatibility(
    manifest,
    evidence,
  );
  assert.deepEqual(result, {
    status: "qualified",
    passed: 24,
    held: 0,
  });
  assert.deepEqual(validateCommunityReleaseEvidence(evidence), {
    artifacts: 12,
    assertions: 14,
  });
});

test("Community release cannot qualify without remote evidence", () => {
  assert.throws(
    () => validateCommunityReleaseCompatibility(manifest),
    /qualified release is missing publication evidence/u,
  );
});

test("Community release rejects altered remote evidence", () => {
  const altered = structuredClone(evidence);
  altered.release.immutable = false;
  assert.throws(
    () => validateCommunityReleaseCompatibility(manifest, altered),
    /publication evidence is invalid/u,
  );
});

test("Community release candidate may hold only publication gates", () => {
  const candidate = structuredClone(manifest);
  candidate.status = "release-candidate";
  for (const gate of [
    "macosTagBuild",
    "linuxTagBuild",
    "crossPlatformByteIdentity",
    "publicRepository",
    "privateVulnerabilityReporting",
    "taggedRelease",
    "artifactAttestation",
    "publishedAssetsVerified",
  ]) {
    candidate.gates[gate] = false;
  }
  candidate.evidence.releaseEvidence = null;
  candidate.held = Array.from({ length: 7 }, (_, index) =>
    `remote-publication-gate-${index + 1}`);
  assert.deepEqual(
    validateCommunityReleaseCompatibility(candidate),
    {
      status: "release-candidate",
      passed: 16,
      held: 8,
    },
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
      () => validateCommunityReleaseCompatibility(overclaim, evidence),
      /overclaims authority/u,
    );
  }
});
