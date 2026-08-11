import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("federated BIM Surface release is package-only and gated", async () => {
  const [
    workflow,
    builder,
    comparator,
    packageManifest,
    sourceOffer,
    releaseNotes,
    releasePolicy,
  ] = await Promise.all([
    readFile(".github/workflows/bim-surface-release.yml", "utf8"),
    readFile(
      "scripts/build-federated-bim-surface-release.mjs",
      "utf8",
    ),
    readFile(
      "scripts/compare-federated-bim-surface-release.mjs",
      "utf8",
    ),
    readFile(
      "packages/federated-bim-surface/package.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "packages/federated-bim-surface/SOURCE_OFFER.md",
      "utf8",
    ),
    readFile(
      "docs/releases/bim-surface-v0.2.0.md",
      "utf8",
    ),
    readFile("docs/bim-surface-release.md", "utf8"),
  ]);

  assert.equal(
    packageManifest.name,
    "@bim-explorer/federated-bim-surface",
  );
  assert.equal(packageManifest.version, "0.2.0");
  assert.equal(packageManifest.private, true);
  assert.match(workflow, /current prerelease branch HEAD/u);
  assert.match(
    workflow,
    /compare-federated-bim-surface-release\.mjs/u,
  );
  assert.match(workflow, /publicationAuthorized/u);
  assert.doesNotMatch(workflow, /vsce publish/u);
  assert.doesNotMatch(builder, /\.vsix/u);
  assert.match(builder, /vscodeExtensionIncluded: false/u);
  assert.match(builder, /marketplacePublication: false/u);
  assert.match(comparator, /SHA256SUMS/u);
  assert.match(comparator, /byteIdentical: true/u);
  assert.match(sourceOffer, /bim-surface-v0\.2\.0/u);
  assert.match(releaseNotes, /does not include or publish a BIM/u);
  assert.match(releasePolicy, /`dev` → `prerelease` → `main`/u);
});
