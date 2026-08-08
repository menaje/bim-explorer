import {
  acquirePublicE57SphericalFixture,
} from "./public-e57-spherical-fixture.mjs";

if (process.argv.length !== 2) {
  throw new TypeError(
    "usage: node scripts/fetch-public-e57-spherical-fixture.mjs",
  );
}

const acquired = await acquirePublicE57SphericalFixture();
console.log(JSON.stringify({
  schema: "bim-explorer-public-e57-spherical-fetch/1",
  fixtureId: acquired.manifest.fixtureId,
  byteLength: acquired.bytes.byteLength,
  sha256: acquired.manifest.entry.sha256,
  cacheHit: acquired.receipt.cacheHit,
  artifactTracked: false,
  releaseBundled: false,
  testOnly: true,
}, null, 2));
acquired.bytes.fill(0);
