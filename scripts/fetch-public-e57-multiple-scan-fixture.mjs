import {
  acquirePublicE57MultipleScanFixture,
} from "./public-e57-multiple-scan-fixture.mjs";

if (process.argv.length !== 2) {
  throw new TypeError(
    "usage: node scripts/fetch-public-e57-multiple-scan-fixture.mjs",
  );
}

const fixture = await acquirePublicE57MultipleScanFixture();
console.log(JSON.stringify({
  schema: "bim-explorer-public-e57-multiple-scan-fetch/1",
  fixtureId: fixture.manifest.fixtureId,
  byteLength: fixture.receipt.byteLength,
  sha256: fixture.receipt.sha256,
  cacheHit: fixture.receipt.cacheHit,
  artifactTracked: false,
  releaseBundled: false,
  testOnly: true,
}, null, 2));
fixture.bytes.fill(0);
