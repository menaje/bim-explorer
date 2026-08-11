import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  acquirePublicGltfResourceBundle,
  loadPublicGltfResourceBundleManifest,
} from "../../scripts/public-gltf-resource-bundle-fixture.mjs";

test("public external glTF bundle manifest pins both exact resources", async () => {
  const manifest = await loadPublicGltfResourceBundleManifest();
  assert.equal(manifest.document.byteLength, 2_898);
  assert.equal(
    manifest.document.sha256,
    "4a0d69eecfce0672a50b71dc218cbacec6c53fe2445040c235c6314b1b2c41b9",
  );
  assert.deepEqual(
    manifest.resources.map((resource) => ({
      name: resource.name,
      byteLength: resource.byteLength,
      sha256: resource.sha256,
    })),
    [{
      name: "Box0.bin",
      byteLength: 648,
      sha256:
        "3266a8e39b9f425b3341cbe5eec7849f44310256bfa651e6b8b40c85ce0ccafb",
    }],
  );
  assert.equal(manifest.tracking.artifactsTracked, false);
  assert.equal(manifest.tracking.releaseBundled, false);
  assert.equal(manifest.tracking.networkAtRuntime, false);
});

test("public external glTF bundle acquisition verifies and reuses cache", async () => {
  const manifest = structuredClone(
    await loadPublicGltfResourceBundleManifest(),
  );
  const documentBytes = new TextEncoder().encode("bounded glTF JSON");
  const resourceBytes = Uint8Array.from([1, 2, 3, 4]);
  const digest = (bytes) =>
    createHash("sha256").update(bytes).digest("hex");
  manifest.document.byteLength = documentBytes.byteLength;
  manifest.document.sha256 = digest(documentBytes);
  manifest.resources[0].byteLength = resourceBytes.byteLength;
  manifest.resources[0].sha256 = digest(resourceBytes);
  manifest.expected.externalResourceBytes = resourceBytes.byteLength;
  manifest.expected.aggregateSourceBytes =
    documentBytes.byteLength + resourceBytes.byteLength;
  const sourceByUrl = new Map([
    [manifest.document.rawUrl, documentBytes],
    [manifest.resources[0].rawUrl, resourceBytes],
  ]);
  let requests = 0;
  const invalidFetch = async (url) => {
    requests += 1;
    const bytes = sourceByUrl.get(url);
    return {
      ok: true,
      headers: {
        get: (name) => name.toLowerCase() === "content-length"
          ? String(bytes.byteLength)
          : null,
      },
      arrayBuffer: async () => bytes.slice().buffer,
    };
  };
  const temporary = await mkdtemp(
    path.join(tmpdir(), "bex-gltf-bundle-"),
  );
  try {
    const manifestPath = path.join(temporary, "manifest.json");
    const cacheRoot = path.join(temporary, "cache");
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    const first = await acquirePublicGltfResourceBundle({
      cacheRoot,
      fetchImpl: invalidFetch,
      manifestPath,
    });
    assert.equal(first.receipt.cacheHit, false);
    assert.equal(requests, 2);
    first.document.bytes.fill(0);
    first.resources[0].bytes.fill(0);
    const second = await acquirePublicGltfResourceBundle({
      cacheRoot,
      fetchImpl: async () => {
        throw new Error("cache should prevent network access");
      },
      manifestPath,
    });
    assert.equal(second.receipt.cacheHit, true);
    assert.deepEqual([...second.document.bytes], [...documentBytes]);
    assert.deepEqual([...second.resources[0].bytes], [...resourceBytes]);
    second.document.bytes.fill(0);
    second.resources[0].bytes.fill(0);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
