import {
  acquirePublicGltfFixture,
} from "./public-gltf-fixture.mjs";

const fixture = await acquirePublicGltfFixture();
try {
  console.log(JSON.stringify({
    schema: fixture.receipt.schema,
    fixtureId: fixture.receipt.fixtureId,
    byteLength: fixture.receipt.byteLength,
    sha256: fixture.receipt.sha256,
    cacheHit: fixture.receipt.cacheHit,
    artifactTracked: false,
    releaseBundled: false,
  }, null, 2));
} finally {
  fixture.bytes.fill(0);
}
