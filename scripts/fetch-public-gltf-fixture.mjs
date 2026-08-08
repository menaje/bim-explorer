import {
  acquirePublicGltfFixture,
  PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
} from "./public-gltf-fixture.mjs";

const values = process.argv.slice(2);
if (
  values.length > 1 ||
  (values.length === 1 && values[0] !== "--product-scale")
) {
  throw new TypeError(
    "usage: node scripts/fetch-public-gltf-fixture.mjs " +
      "[--product-scale]",
  );
}
const fixture = await acquirePublicGltfFixture({
  manifestPath: values[0] === "--product-scale"
    ? PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST
    : undefined,
});
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
