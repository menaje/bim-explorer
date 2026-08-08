import {
  acquirePublicLasLazFixture,
} from "./public-las-laz-fixture.mjs";

if (process.argv.length !== 2) {
  throw new TypeError(
    "usage: node scripts/fetch-public-las-laz-fixture.mjs",
  );
}
const fixture = await acquirePublicLasLazFixture();
try {
  console.log(JSON.stringify({
    ...fixture.receipt,
    cacheOnly: true,
    networkAtRuntime: false,
  }, null, 2));
} finally {
  fixture.bytes.las.fill(0);
  fixture.bytes.laz.fill(0);
}
