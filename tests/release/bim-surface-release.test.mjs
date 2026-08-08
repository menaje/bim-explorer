import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("BIM Surface release is separate, reproducible and immutable", async () => {
  const [
    workflow,
    builder,
    comparator,
    packageManifest,
    sourceOffer,
    releasePolicy,
  ] = await Promise.all([
    readFile(".github/workflows/bim-surface-release.yml", "utf8"),
    readFile("scripts/build-bim-surface-release.mjs", "utf8"),
    readFile("scripts/compare-bim-surface-release.mjs", "utf8"),
    readFile("packages/bim-surface/package.json", "utf8")
      .then(JSON.parse),
    readFile("packages/bim-surface/SOURCE_OFFER.md", "utf8"),
    readFile("docs/bim-surface-release.md", "utf8"),
  ]);

  assert.equal(packageManifest.name, "@bim-explorer/bim-surface");
  assert.equal(packageManifest.version, "0.1.0");
  assert.equal(packageManifest.private, true);
  assert.match(workflow, /tags:\n\s+- "bim-surface-v\*"/u);
  assert.doesNotMatch(workflow, /tags:\n\s+- "v\*"/u);
  assert.doesNotMatch(workflow, /uses:\s+[^@\s]+@v\d/u);
  assert.match(workflow, /compare-bim-surface-release\.mjs/u);
  assert.match(workflow, /attestations: write/u);
  assert.match(workflow, /id-token: write/u);
  assert.match(workflow, /--prerelease/u);
  assert.match(workflow, /--latest=false/u);
  assert.match(workflow, /gh release verify /u);
  assert.match(workflow, /gh release verify-asset /u);
  assert.match(workflow, /gh attestation verify/u);

  assert.match(
    builder,
    /BIM surface release requires a clean tracked source tree/u,
  );
  assert.match(builder, /status: qualification\.status/u);
  assert.match(builder, /required-for-official-release/u);
  assert.match(comparator, /SHA256SUMS/u);
  assert.match(comparator, /byteIdentical: true/u);
  assert.match(
    sourceOffer,
    /tree\/bim-surface-v0\.1\.0/u,
  );
  assert.match(releasePolicy, /npm registry/u);
  assert.match(releasePolicy, /실제 consumer/u);
});
