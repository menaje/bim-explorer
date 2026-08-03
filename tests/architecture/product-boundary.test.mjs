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
  assert.match(product, /GlobalId·snapshot-scoped Express ID/u);
  assert.match(product, /Viewer UI와 event로 Spatial authority/u);
  assert.match(architecture, /Native process/u);
  assert.match(architecture, /WASM Worker/u);
  assert.match(architecture, /Browser Host/u);
  assert.match(architecture, /VS Code Host/u);
  assert.match(strategy, /root package는 `private: true`, `UNLICENSED`/u);
});

test("optional handoff carries identity but not authority", async () => {
  const product = await readFile("docs/product-boundary.md", "utf8");
  assert.match(product, /source fingerprint/u);
  assert.match(product, /native identity/u);
  assert.match(product, /viewpoint/u);
  assert.match(product, /acceptance token을 넣지 않습니다/u);
});
