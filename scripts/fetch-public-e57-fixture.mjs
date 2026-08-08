import {
  acquirePublicE57Fixture,
} from "./public-e57-fixture.mjs";

if (process.argv.length !== 2) {
  throw new TypeError(
    "usage: node scripts/fetch-public-e57-fixture.mjs",
  );
}
const fixture = await acquirePublicE57Fixture();
try {
  console.log(JSON.stringify({
    ...fixture.receipt,
    cacheOnly: true,
    networkAtRuntime: false,
  }, null, 2));
} finally {
  fixture.bytes.fill(0);
}
