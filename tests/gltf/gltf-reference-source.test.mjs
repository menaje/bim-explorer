import assert from "node:assert/strict";
import test from "node:test";

import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createGltfReferenceSource,
  parseGltfReferenceProfile,
} from "../../packages/gltf-reference-source/src/index.mjs";
import {
  createBounded3dRenderer,
  createHeadless3dBackend,
  decodeBimGeometryRange,
} from "../../packages/bim-renderer-3d/src/index.mjs";
import {
  syntheticGltfExternalBundle,
  syntheticGlbBytes,
  syntheticGltfJsonBytes,
} from "../../scripts/generate-synthetic-gltf.mjs";

for (const [format, fixture] of [
  ["gltf", syntheticGltfJsonBytes],
  ["glb", syntheticGlbBytes],
]) {
  test(`bounded ${format} profile projects one shared mesh`, () => {
    const bytes = fixture();
    const profile = parseGltfReferenceProfile(bytes);

    assert.equal(profile.format, format);
    assert.deepEqual(profile.statistics, {
      nodes: 2,
      meshes: 1,
      geometryRecords: 1,
      instances: 2,
      vertices: 3,
      triangles: 1,
      sourceBytes: bytes.byteLength,
    });
    assert.deepEqual(profile.bounds, {
      min: [-1, -1, 0],
      max: [4, 1, 1],
    });
    assert.deepEqual(
      profile.occurrences.map((item) => item.nativeId),
      [
        "node:0/mesh:0/primitive:0",
        "node:1/mesh:0/primitive:0",
      ],
    );
  });
}

test("GLB reference source mounts without inventing IFC identity", async () => {
  const source = await createGltfReferenceSource(
    syntheticGlbBytes(),
    {
      maximumRequestBytes: 64,
      sessionReadBudgetBytes: 512,
    },
  );
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const entity = snapshot.entities[0];

  assert.equal(snapshot.source.format, "glb");
  assert.equal(snapshot.source.semanticAuthority, false);
  assert.equal(entity.globalId, null);
  assert.equal(entity.nativeId, "node:0/mesh:0/primitive:0");
  assert.equal(entity.expressId, entity.localNumericId);
  const handle = snapshot.layers[0].rangeHandles[0];
  const chunks = [];
  for (
    let offset = 0;
    offset < handle.byteLength;
    offset += handle.maximumRequestBytes
  ) {
    chunks.push(await session.readRange(
      handle,
      offset,
      Math.min(
        handle.maximumRequestBytes,
        handle.byteLength - offset,
      ),
    ));
  }
  const geometry = new Uint8Array(handle.byteLength);
  let cursor = 0;
  for (const chunk of chunks) {
    geometry.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  const decoded = decodeBimGeometryRange(geometry);
  assert.equal(decoded.recordCount, 1);
  assert.equal(decoded.vertices, 3);
  assert.equal(decoded.triangles, 1);

  const renderer = createBounded3dRenderer({
    backend: createHeadless3dBackend(),
  });
  const receipt = await renderer.mount({ session, snapshot });
  assert.equal(receipt.metrics.geometryRecords, 1);
  assert.equal(receipt.metrics.instances, 2);
  assert.equal(receipt.metrics.instancedTriangles, 2);
  assert.equal(await renderer.dispose(), true);
  assert.equal(await session.dispose(), true);
  assert.equal(await source.dispose(), true);
  geometry.fill(0);
});

test("local external glTF buffer bundle is exact and source-bound", async () => {
  const bundle = syntheticGltfExternalBundle({
    uri: "Box0.bin",
  });
  const profile = parseGltfReferenceProfile(bundle.bytes, {
    resources: bundle.resources,
  });
  assert.equal(profile.format, "gltf");
  assert.deepEqual(profile.externalResourceUris, ["Box0.bin"]);
  assert.deepEqual(profile.resourceBundle, {
    documentBytes: bundle.bytes.byteLength,
    externalResourceBytes: 80,
    externalResources: 1,
  });
  assert.equal(
    profile.statistics.sourceBytes,
    bundle.bytes.byteLength + 80,
  );

  const originalResource = Uint8Array.from(
    bundle.resources[0].bytes,
  );
  const source = await createGltfReferenceSource(bundle.bytes, {
    resources: bundle.resources,
  });
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  assert.deepEqual(snapshot.referenceMetadata.resourceBundle, {
    schema: "bim-explorer-gltf-local-resource-bundle/0.1",
    documentBytes: bundle.bytes.byteLength,
    externalResourceBytes: 80,
    externalResources: 1,
    networkAtRuntime: false,
  });
  assert.equal(snapshot.source.byteLength, bundle.bytes.byteLength + 80);
  assert.match(snapshot.source.fingerprint, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(await session.dispose(), true);
  assert.equal(await source.dispose(), true);
  assert.deepEqual(bundle.resources[0].bytes, originalResource);
  originalResource.fill(0);
  bundle.bytes.fill(0);
  bundle.resources[0].bytes.fill(0);
});

test("external glTF bundle rejects paths, missing and unused resources", () => {
  const missing = syntheticGltfExternalBundle({
    uri: "geometry.bin",
  });
  assert.throws(
    () => parseGltfReferenceProfile(missing.bytes),
    { name: "NotSupportedError" },
  );
  assert.throws(
    () => parseGltfReferenceProfile(missing.bytes, {
      resources: [
        ...missing.resources,
        { uri: "unused.bin", bytes: Uint8Array.from([1]) },
      ],
    }),
    /unused external resource/u,
  );
  for (const uri of [
    "../geometry.bin",
    "folder/geometry.bin",
    "https://example.com/geometry.bin",
    "geometry.bin?token=secret",
    "geometry%2ebin",
  ]) {
    const rejected = syntheticGltfExternalBundle({ uri });
    assert.throws(
      () => parseGltfReferenceProfile(rejected.bytes, {
        resources: rejected.resources,
      }),
      { name: "NotSupportedError" },
    );
    rejected.bytes.fill(0);
    rejected.resources[0].bytes.fill(0);
  }
  missing.bytes.fill(0);
  missing.resources[0].bytes.fill(0);
});

test("external glTF bundle applies one aggregate source byte limit", () => {
  const bundle = syntheticGltfExternalBundle({
    uri: "geometry.bin",
  });
  assert.throws(
    () => parseGltfReferenceProfile(bundle.bytes, {
      limits: {
        maximumSourceBytes:
          bundle.bytes.byteLength +
          bundle.resources[0].bytes.byteLength -
          1,
      },
      resources: bundle.resources,
    }),
    /source bundle exceeds the source byte limit/u,
  );
  bundle.bytes.fill(0);
  bundle.resources[0].bytes.fill(0);
});

test("glTF source identity, handle and disposal fail closed", async () => {
  const source = await createGltfReferenceSource(
    syntheticGltfJsonBytes(),
  );
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const entity = snapshot.entities[1];
  const resolved = await session.getEntity({
    protocolVersion: snapshot.protocolVersion,
    sessionId: snapshot.sessionId,
    sourceId: snapshot.sourceId,
    revisionId: snapshot.revisionId,
    snapshotId: snapshot.snapshotId,
    layerId: snapshot.layerId,
    nativeId: entity.nativeId,
  });
  assert.equal(resolved.renderId, entity.renderId);
  await assert.rejects(
    session.readRange(
      {
        ...snapshot.layers[0].rangeHandles[0],
        revisionId: "source-snapshot:sha256:" + "0".repeat(64),
      },
      0,
      1,
    ),
    /outside the snapshot/u,
  );
  assert.equal(await session.dispose(), true);
  await assert.rejects(
    session.getSnapshot(),
    /session is disposed/u,
  );
  assert.equal(await source.dispose(), true);
  assert.equal(await source.dispose(), false);
});

test("bounded profile blocks arbitrary URI and unsupported content", () => {
  const external = JSON.parse(
    new TextDecoder().decode(syntheticGltfJsonBytes()),
  );
  external.buffers[0].uri = "https://example.com/model.bin";
  assert.throws(
    () => parseGltfReferenceProfile(
      new TextEncoder().encode(JSON.stringify(external)),
    ),
    { name: "NotSupportedError" },
  );

  const extended = JSON.parse(
    new TextDecoder().decode(syntheticGltfJsonBytes()),
  );
  extended.extensionsRequired = [
    "KHR_draco_mesh_compression",
  ];
  assert.throws(
    () => parseGltfReferenceProfile(
      new TextEncoder().encode(JSON.stringify(extended)),
    ),
    { name: "NotSupportedError" },
  );

  const externalImage = JSON.parse(
    new TextDecoder().decode(syntheticGltfJsonBytes()),
  );
  externalImage.images = [{ uri: "texture.png" }];
  assert.throws(
    () => parseGltfReferenceProfile(
      new TextEncoder().encode(JSON.stringify(externalImage)),
    ),
    { name: "NotSupportedError" },
  );

  const truncated = syntheticGlbBytes().slice(0, -4);
  assert.throws(
    () => parseGltfReferenceProfile(truncated),
    /declared length does not match/u,
  );
  assert.throws(
    () => parseGltfReferenceProfile(
      syntheticGlbBytes(),
      { limits: { maximumSourceBytes: 32 } },
    ),
    /source byte limit/u,
  );
});
