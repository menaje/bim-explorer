import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("development promotes through prerelease before main", async () => {
  const [policy, workflow, ci, stableRelease, packageRelease] =
    await Promise.all([
      readFile("docs/branch-release-workflow.md", "utf8"),
      readFile(".github/workflows/promotion-policy.yml", "utf8"),
      readFile(".github/workflows/ci.yml", "utf8"),
      readFile(".github/workflows/release.yml", "utf8"),
      readFile(".github/workflows/bim-surface-release.yml", "utf8"),
    ]);

  assert.match(policy, /dev -> prerelease -> main/u);
  assert.match(policy, /`dev`를 GitHub 기본 브랜치/u);
  assert.match(policy, /Marketplace, Open VSX/u);
  assert.match(workflow, /BASE_BRANCH.*prerelease/u);
  assert.match(workflow, /HEAD_BRANCH.*dev/u);
  assert.match(workflow, /BASE_BRANCH.*main/u);
  assert.match(workflow, /HEAD_BRANCH.*prerelease/u);
  assert.match(workflow, /HEAD_REPOSITORY/u);
  assert.match(workflow, /TARGET_REPOSITORY/u);
  for (const branch of ["dev", "prerelease", "main"]) {
    assert.match(ci, new RegExp(`- ${branch}`, "u"));
  }
  assert.match(stableRelease, /current main branch HEAD/u);
  assert.match(packageRelease, /current prerelease branch HEAD/u);
  assert.doesNotMatch(packageRelease, /vsce publish/u);
  assert.doesNotMatch(packageRelease, /\.vsix/u);
});
