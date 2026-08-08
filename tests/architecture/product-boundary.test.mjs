import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("authority documents preserve the three-product boundary", async () => {
  const product = await readFile("docs/product-boundary.md", "utf8");
  const architecture = await readFile("docs/system-architecture.md", "utf8");
  const strategy = await readFile(
    "docs/open-source-commercial-boundary.md",
    "utf8",
  );

  for (const name of ["DWG Viewer", "BIM Explorer", "Coni Spatial"]) {
    assert.match(product, new RegExp(name, "u"));
  }
  assert.match(
    product,
    /IFC GlobalId·Express ID, reference native ID 또는 revision\/root-range-scoped derived point ID/u,
  );
  assert.match(
    product,
    /glTF\/GLB native ID: exact reference snapshot/u,
  );
  assert.match(
    product,
    /E57\/LAS\/LAZ `point:n`: exact source revision과 root range digest/u,
  );
  assert.match(product, /Viewer UI와 event로 Spatial authority/u);
  assert.match(architecture, /Native process/u);
  assert.match(architecture, /WASM Worker/u);
  assert.match(architecture, /Browser Host/u);
  assert.match(architecture, /VS Code Host/u);
  assert.match(
    strategy,
    /source license는 MPL-2\.0/u,
  );
});

test("optional handoff carries identity but not authority", async () => {
  const product = await readFile("docs/product-boundary.md", "utf8");
  assert.match(product, /source fingerprint/u);
  assert.match(product, /native identity/u);
  assert.match(product, /viewpoint/u);
  assert.match(product, /acceptance token을 넣지 않습니다/u);
});

test("3D renderer stays independent from the DWG renderer", async () => {
  const [rootManifest, rendererManifest, rendererIndex, hostAdapter] =
    await Promise.all([
      readFile("package.json", "utf8"),
      readFile(
        "packages/bim-renderer-3d/package.json",
        "utf8",
      ),
      readFile(
        "packages/bim-renderer-3d/src/index.mjs",
        "utf8",
      ),
      readFile(
        "packages/bim-renderer-3d/src/host-adapter.mjs",
        "utf8",
      ),
    ]);
  const manifests = [
    JSON.parse(rootManifest),
    JSON.parse(rendererManifest),
  ];
  const dependencyNames = manifests.flatMap((manifest) =>
    Object.keys({
      ...(manifest.dependencies ?? {}),
      ...(manifest.devDependencies ?? {}),
      ...(manifest.optionalDependencies ?? {}),
      ...(manifest.peerDependencies ?? {}),
    }),
  );

  assert.equal(
    dependencyNames.some((name) => /dwg/u.test(name)),
    false,
  );
  assert.doesNotMatch(
    `${rendererIndex}\n${hostAdapter}`,
    /from\s+["'][^"']*dwg[^"']*["']/iu,
  );
});
