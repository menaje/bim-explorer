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
  syntheticMeshoptGlbBytes,
  syntheticQuantizedGltfJsonBytes,
  syntheticQuantizedGlbBytes,
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

test("KHR_mesh_quantization decodes bounded position and normal accessors", async () => {
  const bytes = syntheticQuantizedGlbBytes();
  const profile = parseGltfReferenceProfile(bytes);
  assert.deepEqual(
    profile.extensionsUsed,
    ["KHR_mesh_quantization"],
  );
  assert.deepEqual(
    profile.extensionsRequired,
    ["KHR_mesh_quantization"],
  );
  assert.deepEqual(
    [...profile.records[0].positions],
    [-1, -1, 0, 1, -1, 0, 0, 1, 0],
  );
  assert.deepEqual(
    [...profile.records[0].normals],
    [0, 0, 1, 0, 0, 1, 0, 0, 1],
  );
  assert.deepEqual(profile.bounds, {
    min: [-1, -1, 0],
    max: [4, 1, 1],
  });

  const source = await createGltfReferenceSource(bytes);
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  assert.deepEqual(
    snapshot.referenceMetadata.extensionsRequired,
    ["KHR_mesh_quantization"],
  );
  assert.deepEqual(
    snapshot.referenceMetadata.extensionsUsed,
    ["KHR_mesh_quantization"],
  );
  assert.equal(snapshot.geometry.vertices, 3);
  assert.equal(snapshot.geometry.triangles, 1);
  assert.equal(await session.dispose(), true);
  assert.equal(await source.dispose(), true);
  bytes.fill(0);
});

test("KHR_mesh_quantization declarations and layouts fail closed", () => {
  const fixture = () => JSON.parse(
    new TextDecoder().decode(
      syntheticQuantizedGltfJsonBytes(),
    ),
  );

  const optional = fixture();
  optional.extensionsRequired = [];
  assert.throws(
    () => parseGltfReferenceProfile(
      new TextEncoder().encode(JSON.stringify(optional)),
    ),
    /must be a required extension/u,
  );

  const undeclared = fixture();
  delete undeclared.extensionsUsed;
  delete undeclared.extensionsRequired;
  assert.throws(
    () => parseGltfReferenceProfile(
      new TextEncoder().encode(JSON.stringify(undeclared)),
    ),
    /POSITION accessor profile is unsupported/u,
  );

  const invalidNormal = fixture();
  invalidNormal.accessors[1].normalized = false;
  assert.throws(
    () => parseGltfReferenceProfile(
      new TextEncoder().encode(JSON.stringify(invalidNormal)),
    ),
    /NORMAL accessor profile is unsupported/u,
  );

  const unsignedNormal = fixture();
  unsignedNormal.accessors[1].componentType = 5121;
  assert.throws(
    () => parseGltfReferenceProfile(
      new TextEncoder().encode(JSON.stringify(unsignedNormal)),
    ),
    /NORMAL accessor profile is unsupported/u,
  );

  const misaligned = fixture();
  misaligned.bufferViews[1].byteStride = 3;
  assert.throws(
    () => parseGltfReferenceProfile(
      new TextEncoder().encode(JSON.stringify(misaligned)),
    ),
    /accessor byte layout is invalid/u,
  );

  const unsupported = fixture();
  unsupported.extensionsUsed.push("EXT_meshopt_compression");
  unsupported.extensionsRequired.push("EXT_meshopt_compression");
  assert.throws(
    () => parseGltfReferenceProfile(
      new TextEncoder().encode(JSON.stringify(unsupported)),
    ),
    /has no compressed bufferView/u,
  );
});

test("EXT_meshopt_compression decodes bounded attribute and index views", async () => {
  const { loadMeshoptDecoder } = await import(
    "../../packages/gltf-reference-source/src/meshopt-decoder.mjs"
  );
  const decoder = await loadMeshoptDecoder();
  for (const indexMode of ["TRIANGLES", "INDICES"]) {
    const bytes = await syntheticMeshoptGlbBytes({ indexMode });
    assert.throws(
      () => parseGltfReferenceProfile(bytes),
      /decoder is unavailable/u,
    );
    const profile = parseGltfReferenceProfile(bytes, {
      meshoptDecoder: decoder,
    });
    assert.deepEqual(profile.extensionsUsed, [
      "EXT_meshopt_compression",
    ]);
    assert.deepEqual(profile.extensionsRequired, [
      "EXT_meshopt_compression",
    ]);
    assert.equal(profile.compression.extension,
      "EXT_meshopt_compression");
    assert.equal(profile.compression.bufferViews, 3);
    assert.equal(profile.compression.decodedBytes, 78);
    assert.equal(profile.compression.decoder.id, "meshoptimizer");
    assert.equal(profile.compression.decoder.version, "1.2.0");
    assert.deepEqual(profile.compression.filters, ["NONE"]);
    assert.deepEqual(
      profile.compression.modes,
      ["ATTRIBUTES", indexMode].sort(),
    );
    assert.deepEqual(
      [...profile.records[0].positions],
      [-1, -1, 0, 1, -1, 0, 0, 1, 0],
    );
    assert.deepEqual(
      [...profile.records[0].indices],
      [0, 1, 2],
    );

    const source = await createGltfReferenceSource(bytes);
    const session = await source.open({
      protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
    });
    const snapshot = await session.getSnapshot();
    assert.equal(snapshot.geometry.vertices, 3);
    assert.equal(snapshot.geometry.triangles, 1);
    assert.deepEqual(
      snapshot.referenceMetadata.compression,
      profile.compression,
    );
    assert.equal(await session.dispose(), true);
    assert.equal(await source.dispose(), true);
    for (const record of profile.records) {
      record.positions.fill(0);
      record.normals.fill(0);
      record.indices.fill(0);
    }
    bytes.fill(0);
  }
});

function mutateGlbDocument(bytes, update) {
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  const jsonLength = view.getUint32(12, true);
  const binaryHeader = 20 + jsonLength;
  const document = JSON.parse(
    new TextDecoder().decode(bytes.slice(20, binaryHeader))
      .replace(/[\u0000\u0020]+$/u, ""),
  );
  update(document);
  const json = new TextEncoder().encode(JSON.stringify(document));
  const paddedJsonLength = Math.ceil(json.byteLength / 4) * 4;
  const binaryLength = view.getUint32(binaryHeader, true);
  const binary = bytes.slice(binaryHeader + 8);
  const result = new Uint8Array(
    12 + 8 + paddedJsonLength + 8 + binaryLength,
  );
  const resultView = new DataView(result.buffer);
  resultView.setUint32(0, 0x46546c67, true);
  resultView.setUint32(4, 2, true);
  resultView.setUint32(8, result.byteLength, true);
  resultView.setUint32(12, paddedJsonLength, true);
  resultView.setUint32(16, 0x4e4f534a, true);
  result.fill(0x20, 20, 20 + paddedJsonLength);
  result.set(json, 20);
  const resultBinaryHeader = 20 + paddedJsonLength;
  resultView.setUint32(resultBinaryHeader, binaryLength, true);
  resultView.setUint32(resultBinaryHeader + 4, 0x004e4942, true);
  result.set(binary, resultBinaryHeader + 8);
  binary.fill(0);
  return result;
}

test("EXT_meshopt_compression metadata and malformed streams fail closed", async () => {
  const source = await syntheticMeshoptGlbBytes();
  const optional = mutateGlbDocument(source, (document) => {
    document.extensionsRequired = [];
  });
  assert.throws(
    () => parseGltfReferenceProfile(optional),
    /must be a required extension/u,
  );

  const filtered = mutateGlbDocument(source, (document) => {
    document.bufferViews[0].extensions
      .EXT_meshopt_compression.filter = "OCTAHEDRAL";
  });
  assert.throws(
    () => parseGltfReferenceProfile(filtered),
    { name: "NotSupportedError" },
  );

  const overlap = mutateGlbDocument(source, (document) => {
    document.bufferViews[1].extensions
      .EXT_meshopt_compression.byteOffset =
        document.bufferViews[0].extensions
          .EXT_meshopt_compression.byteOffset;
  });
  assert.throws(
    () => parseGltfReferenceProfile(overlap),
    /ranges overlap/u,
  );

  await assert.rejects(
    createGltfReferenceSource(source, {
      limits: { maximumMeshoptDecodedBytes: 77 },
    }),
    /decoded bytes exceed/u,
  );
  const highRatio = mutateGlbDocument(source, (document) => {
    document.bufferViews[0].extensions
      .EXT_meshopt_compression.byteLength = 1;
  });
  await assert.rejects(
    createGltfReferenceSource(highRatio, {
      limits: { maximumMeshoptCompressionRatio: 1 },
    }),
    /decoded bytes exceed/u,
  );

  const malformed = Uint8Array.from(source);
  const malformedView = new DataView(malformed.buffer);
  const malformedBinaryHeader =
    20 + malformedView.getUint32(12, true);
  malformed[malformedBinaryHeader + 8] = 0;
  await assert.rejects(
    createGltfReferenceSource(malformed),
    /compressed buffer is malformed/u,
  );

  source.fill(0);
  optional.fill(0);
  filtered.fill(0);
  highRatio.fill(0);
  overlap.fill(0);
  malformed.fill(0);
});

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
