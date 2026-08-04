import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  checkCommunityHistory,
} from "../../scripts/check-community-history.mjs";
import {
  generateCommunitySboms,
} from "../../scripts/generate-community-sbom.mjs";

test("Community history is free of customer artifacts and credential patterns", () => {
  const report = checkCommunityHistory();
  assert.equal(report.schema, "bim-explorer-community-history-check/1");
  assert.equal(report.commits >= 45, true);
  assert.equal(report.uniquePaths >= 250, true);
  assert.deepEqual(report.forbiddenPaths, []);
  assert.deepEqual(report.secretPatternFiles, []);
  assert.equal(
    Object.values(report.assertions).every(Boolean),
    true,
  );
});

test("Community runtime and source SBOMs are deterministic and exact", async () => {
  const first = await generateCommunitySboms();
  const second = await generateCommunitySboms();
  assert.deepEqual(second, first);
  assert.equal(first.version, "0.1.0");
  assert.equal(first.runtime.spdxVersion, "SPDX-2.3");
  assert.equal(first.runtime.dataLicense, "CC0-1.0");
  assert.equal(first.runtime.packages.length, 6);
  assert.deepEqual(
    first.runtime.packages.map((item) => [
      item.name,
      item.versionInfo,
      item.licenseDeclared,
    ]),
    [
      ["bim-explorer", "0.1.0", "MPL-2.0"],
      ["@bim-explorer/adapter-web-ifc", "0.0.0", "MPL-2.0"],
      ["@bim-explorer/bim-model-source", "0.0.0", "MPL-2.0"],
      ["@bim-explorer/bim-renderer-3d", "0.0.0", "MPL-2.0"],
      ["@bim-explorer/bim-semantic-explorer", "0.0.0", "MPL-2.0"],
      ["web-ifc", "0.0.77", "MPL-2.0"],
    ],
  );
  assert.equal(first.source.packages.length >= 360, true);
  assert.equal(
    first.source.packages.every((item) =>
      typeof item.versionInfo === "string" &&
      item.versionInfo.length > 0),
    true,
  );
  assert.equal(
    first.runtime.packages.every((item) =>
      item.licenseDeclared !== "NOASSERTION"),
    true,
  );
});

test("Community licenses and release workflow are explicit and pinned", async () => {
  const [
    mpl,
    bundledMpl,
    apache,
    releaseWorkflow,
    sourceOffer,
  ] = await Promise.all([
    readFile("LICENSE", "utf8"),
    readFile("node_modules/web-ifc/LICENSE.md", "utf8"),
    readFile("specs/LICENSE", "utf8"),
    readFile(".github/workflows/release.yml", "utf8"),
    readFile("SOURCE_OFFER.md", "utf8"),
  ]);
  assert.equal(mpl, bundledMpl);
  assert.match(apache, /Apache License\s+Version 2\.0/u);
  assert.match(sourceOffer, /tree\/v0\.1\.0/u);
  assert.match(sourceOffer, /f26c4beef0a668ebdb180d2b95a94097a1e21cef/u);
  assert.doesNotMatch(
    releaseWorkflow,
    /uses:\s+[^@\s]+@v\d/u,
  );
  assert.match(releaseWorkflow, /attestations: write/u);
  assert.match(releaseWorkflow, /id-token: write/u);
  assert.match(releaseWorkflow, /compare-community-release/u);
});
