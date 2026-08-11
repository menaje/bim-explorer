import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import validator from "gltf-validator";

import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createGltfReferenceSource,
} from "../../packages/gltf-reference-source/src/index.mjs";
import {
  createBounded3dRenderer,
  createHeadless3dBackend,
} from "../../packages/bim-renderer-3d/src/index.mjs";
import {
  acquirePublicGltfFixture,
} from "../../scripts/public-gltf-fixture.mjs";
import {
  acquirePublicMeshoptGltfFixture,
  deriveMeshoptPublicBoxGlb,
  loadPublicMeshoptGltfManifest,
} from "../../scripts/public-gltf-meshopt-fixture.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readGeometry(session, snapshot) {
  const handle = snapshot.layers[0].rangeHandles[0];
  const bytes = new Uint8Array(handle.byteLength);
  for (
    let offset = 0;
    offset < bytes.byteLength;
    offset += handle.maximumRequestBytes
  ) {
    const length = Math.min(
      handle.maximumRequestBytes,
      bytes.byteLength - offset,
    );
    bytes.set(
      await session.readRange(handle, offset, length),
      offset,
    );
  }
  return bytes;
}

test("public Box meshopt derivation is exact and cache-only", async () => {
  const manifest = await loadPublicMeshoptGltfManifest();
  const source = await acquirePublicGltfFixture();
  const first = await deriveMeshoptPublicBoxGlb(source.bytes);
  const second = await deriveMeshoptPublicBoxGlb(source.bytes);
  assert.equal(first.byteLength, manifest.entry.byteLength);
  assert.equal(sha256(first), manifest.entry.sha256);
  assert.deepEqual(first, second);

  const validation = await validator.validateBytes(first, {
    format: "glb",
    maxIssues: 100,
    uri: manifest.entry.name,
    writeTimestamp: false,
  });
  assert.deepEqual(
    {
      errors: validation.issues.numErrors,
      warnings: validation.issues.numWarnings,
      infos: validation.issues.numInfos,
      hints: validation.issues.numHints,
    },
    {
      errors: 0,
      warnings: 0,
      infos: 2,
      hints: 0,
    },
  );
  assert.deepEqual(
    validation.issues.messages.map((issue) => issue.code),
    manifest.expected.validator.knownInfoCodes,
  );
  assert.deepEqual(
    validation.info.extensionsUsed,
    manifest.expected.extensionsUsed,
  );
  assert.deepEqual(
    validation.info.extensionsRequired,
    manifest.expected.extensionsRequired,
  );

  const cacheRoot = await mkdtemp(
    path.join(tmpdir(), "bex-meshopt-gltf-"),
  );
  try {
    const acquired = await acquirePublicMeshoptGltfFixture({
      cacheRoot,
    });
    assert.equal(acquired.receipt.cacheHit, false);
    assert.equal(acquired.receipt.derivedArtifactTracked, false);
    acquired.bytes.fill(0);
    const cached = await acquirePublicMeshoptGltfFixture({ cacheRoot });
    assert.equal(cached.receipt.cacheHit, true);
    assert.equal(sha256(cached.bytes), manifest.entry.sha256);
    cached.bytes.fill(0);
  } finally {
    await rm(cacheRoot, { force: true, recursive: true });
  }

  source.bytes.fill(0);
  first.fill(0);
  second.fill(0);
});

test("meshopt Box preserves bounded geometry and cleanup", async () => {
  const fixture = await acquirePublicMeshoptGltfFixture();
  const source = await createGltfReferenceSource(fixture.bytes, {
    maximumRequestBytes: 256,
    sessionReadBudgetBytes: 1_512,
  });
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  assert.equal(
    snapshot.source.fingerprint,
    fixture.manifest.expected.sourceFingerprint,
  );
  assert.deepEqual(
    snapshot.referenceMetadata.extensionsRequired,
    fixture.manifest.expected.extensionsRequired,
  );
  assert.deepEqual(snapshot.referenceMetadata.compression, {
    extension: "EXT_meshopt_compression",
    bufferViews: fixture.manifest.expected.meshoptBufferViews,
    compressedBytes:
      fixture.manifest.expected.meshoptCompressedBytes,
    decodedBytes: fixture.manifest.expected.meshoptDecodedBytes,
    decoder: {
      id: "meshoptimizer",
      version: fixture.manifest.codec.version,
      runtime: fixture.manifest.codec.runtime,
    },
    fallbackBuffers: 1,
    fallbackMarkers: 1,
    filters: fixture.manifest.expected.meshoptFilters,
    modes: fixture.manifest.expected.meshoptModes,
  });
  assert.equal(snapshot.entities[0].globalId, null);
  assert.equal(snapshot.source.semanticAuthority, false);
  assert.equal(snapshot.source.writeAuthority, false);
  assert.equal(snapshot.source.roundTripAuthority, false);

  const geometry = await readGeometry(session, snapshot);
  assert.equal(
    geometry.byteLength,
    fixture.manifest.expected.geometryRangeBytes,
  );
  assert.equal(
    sha256(geometry),
    fixture.manifest.expected.geometryRangeSha256,
  );
  const backend = createHeadless3dBackend();
  const renderer = createBounded3dRenderer({ backend });
  const receipt = await renderer.mount({ session, snapshot });
  assert.equal(receipt.metrics.geometryRecords, 1);
  assert.equal(receipt.metrics.instances, 1);
  assert.equal(receipt.metrics.instancedTriangles, 12);
  assert.equal(
    receipt.backend.uploadedBytes,
    fixture.manifest.expected.gpuUploadBytes,
  );
  assert.equal(await renderer.dispose(), true);
  assert.equal(await session.dispose(), true);
  assert.equal(await source.dispose(), true);
  assert.equal(backend.state.activeBytes, 0);

  geometry.fill(0);
  fixture.bytes.fill(0);
});
