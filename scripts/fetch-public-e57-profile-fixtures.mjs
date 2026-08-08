import {
  acquirePublicE57ProfileFixtures,
} from "./public-e57-profile-fixtures.mjs";

if (process.argv.length !== 2) {
  throw new TypeError(
    "usage: node scripts/fetch-public-e57-profile-fixtures.mjs",
  );
}

const acquired = await acquirePublicE57ProfileFixtures();
console.log(JSON.stringify({
  schema: "bim-explorer-public-e57-profile-fetch/1",
  fixtureSetId: acquired.manifest.fixtureSetId,
  fixtures: acquired.fixtures.map((fixture) => ({
    fixtureId: fixture.entry.fixtureId,
    byteLength: fixture.bytes.byteLength,
    sha256: fixture.entry.sha256,
    cacheHit: fixture.receipt.cacheHit,
  })),
  artifactTracked: false,
  releaseBundled: false,
  testOnly: true,
}, null, 2));
acquired.fixtures.forEach((fixture) => fixture.bytes.fill(0));
