import assert from "node:assert/strict";
import test from "node:test";

import {
  createWebIfcSourceArtifact,
} from "../../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../../packages/bim-model-source/src/index.mjs";
import {
  createBounded3dRenderer,
  createFitCamera3d,
  createHeadless3dBackend,
  decodeBimGeometryRange,
} from "../../packages/bim-renderer-3d/src/index.mjs";
import {
  syntheticMappedIfc,
} from "../../scripts/generate-synthetic-ifc.mjs";

function mappedBytes() {
  return new TextEncoder().encode(syntheticMappedIfc());
}

function multiGeometryBytes() {
  const rewrites = [
    [
      "#41=IFCMAPPEDITEM(#34,#36);",
      "#41=IFCEXTRUDEDAREASOLID(#30,#11,#31,2.);",
    ],
    [
      "#42=IFCSHAPEREPRESENTATION(#12,'Body'," +
        "'MappedRepresentation',(#41));",
      "#42=IFCSHAPEREPRESENTATION(#12,'Body'," +
        "'SweptSolid',(#41));",
    ],
  ];
  let fixture = syntheticMappedIfc();
  for (const [from, to] of rewrites) {
    fixture = fixture.replace(from, to);
  }
  return new TextEncoder().encode(fixture);
}

async function sourceSession(bytes, artifactOptions = {}) {
  const artifact = await createWebIfcSourceArtifact(
    bytes,
    artifactOptions,
  );
  const source = createBimModelSource(artifact, {
    maximumRequestBytes: 128,
  });
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  return {
    source,
    session,
    snapshot: await session.getSnapshot(),
  };
}

test("geometry range decoder validates payload and record boundaries", async () => {
  const artifact = await createWebIfcSourceArtifact(mappedBytes());
  const decoded = decodeBimGeometryRange(artifact.ranges[0].bytes);

  assert.deepEqual({
    byteLength: decoded.byteLength,
    recordCount: decoded.recordCount,
    payloadBytes: decoded.payloadBytes,
    vertices: decoded.vertices,
    indices: decoded.indices,
    triangles: decoded.triangles,
  }, {
    byteLength: 996,
    recordCount: 1,
    payloadBytes: 960,
    vertices: 34,
    indices: 36,
    triangles: 12,
  });
  assert.deepEqual(decoded.records[0].slice, {
    offset: 16,
    byteLength: 980,
  });

  const malformed = Uint8Array.from(artifact.ranges[0].bytes);
  malformed[0] ^= 0xff;
  assert.throws(
    () => decodeBimGeometryRange(malformed),
    /magic is invalid/u,
  );
});

test("bounded renderer stages only the first geometry range", async () => {
  const {
    source,
    session,
    snapshot,
  } = await sourceSession(multiGeometryBytes(), {
    maximumRangeBytes: 996,
  });
  const backend = createHeadless3dBackend();
  const renderer = createBounded3dRenderer({
    backend,
    limits: {
      maximumRangeBytes: 996,
      maximumSourceReadBytes: 996,
    },
  });
  const receipt = await renderer.mount({
    session,
    snapshot,
  });

  assert.deepEqual(receipt.rangeIds, [
    "range:ifc:geometry:0",
  ]);
  assert.deepEqual(receipt.deferredRangeIds, [
    "range:ifc:geometry:1",
  ]);
  assert.deepEqual(receipt.metrics, {
    sourceReadBytes: 996,
    sourceReads: 8,
    geometryPayloadBytes: 960,
    geometryRecords: 1,
    vertices: 34,
    indices: 36,
    uniqueTriangles: 12,
    instances: 1,
    instancedTriangles: 12,
    drawCalls: 1,
    instanceBytes: 80,
    cpuStagingBytes: 1_076,
  });
  assert.equal(receipt.backend.backendId, "headless");
  assert.equal(receipt.backend.rendered, false);
  assert.equal(receipt.backend.uploadedBytes, 1_040);
  assert.equal(receipt.identity.renderPickBoundToRevision, true);
  assert.equal(source.state.remainingReadBytes, 996);
  assert.equal(renderer.state.activeBackendBytes, 1_040);

  const released = await renderer.unmount();
  assert.equal(released.releasedBytes, 1_040);
  assert.equal(backend.state.activeBytes, 0);
  assert.equal(await renderer.dispose(), true);
  assert.equal(await renderer.dispose(), false);
  assert.equal(await session.dispose(), true);
  assert.equal(await source.dispose(), true);
});

test("progressive range cache loads, hits, and evicts within its GPU bound", async () => {
  const {
    source,
    session,
    snapshot,
  } = await sourceSession(multiGeometryBytes(), {
    maximumRangeBytes: 996,
  });
  const backend = createHeadless3dBackend();
  const renderer = createBounded3dRenderer({
    backend,
    limits: {
      maximumRangeBytes: 996,
      maximumSourceReadBytes: 996,
      maximumGpuCacheBytes: 2_080,
    },
  });
  await renderer.mount({ session, snapshot });
  const rangeId = snapshot.loadPlan.deferredRangeIds[0];
  const loaded = await renderer.loadRange({ rangeId });

  assert.equal(loaded.status, "loaded");
  assert.equal(loaded.cacheHit, false);
  assert.equal(loaded.metrics.sourceReadBytes, 996);
  assert.equal(loaded.backend.addedBytes, 1_040);
  assert.equal(loaded.backend.activeBytes, 2_080);
  assert.deepEqual(loaded.residentRangeIds, [
    "range:ifc:geometry:0",
    "range:ifc:geometry:1",
  ]);
  assert.deepEqual(loaded.deferredRangeIds, []);
  assert.equal(source.state.remainingReadBytes, 0);
  const readsAfterLoad = source.state.rangeReads;

  const hit = await renderer.loadRange({ rangeId });
  assert.equal(hit.status, "resident");
  assert.equal(hit.cacheHit, true);
  assert.equal(hit.backend, null);
  assert.equal(source.state.rangeReads, readsAfterLoad);

  const evicted = await renderer.evictRange({ rangeId });
  assert.equal(evicted.status, "evicted");
  assert.equal(evicted.backend.releasedBytes, 1_040);
  assert.equal(evicted.activeBackendBytes, 1_040);
  assert.deepEqual(evicted.residentRangeIds, [
    "range:ifc:geometry:0",
  ]);
  assert.deepEqual(evicted.deferredRangeIds, [
    "range:ifc:geometry:1",
  ]);
  assert.equal(renderer.state.rangeLoads, 1);
  assert.equal(renderer.state.rangeCacheHits, 1);
  assert.equal(renderer.state.rangeEvictions, 1);
  assert.equal(backend.state.rangeUpdates, 2);

  await assert.rejects(
    renderer.evictRange({
      rangeId: "range:ifc:geometry:0",
    }),
    /initial range must remain resident/u,
  );
  const released = await renderer.unmount();
  assert.equal(released.releasedBytes, 1_040);
  await renderer.dispose();
  await session.dispose();
  await source.dispose();
});

test("progressive range cache rejects aggregate GPU overcommit", async () => {
  const {
    source,
    session,
    snapshot,
  } = await sourceSession(multiGeometryBytes(), {
    maximumRangeBytes: 996,
  });
  const backend = createHeadless3dBackend();
  const renderer = createBounded3dRenderer({
    backend,
    limits: {
      maximumRangeBytes: 996,
      maximumSourceReadBytes: 996,
      maximumGpuCacheBytes: 2_079,
    },
  });
  await renderer.mount({ session, snapshot });

  await assert.rejects(
    renderer.loadRange({
      rangeId: snapshot.loadPlan.deferredRangeIds[0],
    }),
    /GPU cache exceeds/u,
  );
  assert.equal(renderer.state.activeBackendBytes, 1_040);
  assert.equal(renderer.state.rangeLoads, 0);
  assert.equal(backend.state.rangeUpdates, 0);

  await renderer.dispose();
  await session.dispose();
  await source.dispose();
});

test("camera visibility can choose a deferred source range first", async () => {
  const {
    source,
    session,
    snapshot,
  } = await sourceSession(multiGeometryBytes(), {
    maximumRangeBytes: 996,
  });
  const selectedRangeId = snapshot.loadPlan.deferredRangeIds[0];
  const selectedEntity = snapshot.entities.find((entity) =>
    entity.primitives.some((primitive) =>
      primitive.slice.rangeId === selectedRangeId));
  const renderer = createBounded3dRenderer({
    limits: {
      maximumRangeBytes: 996,
      maximumSourceReadBytes: 996,
    },
  });
  const receipt = await renderer.mount({
    initialCamera: createFitCamera3d(selectedEntity.bounds),
    initialRangeStrategy: "camera-visibility",
    session,
    snapshot,
  });

  assert.deepEqual(receipt.rangeIds, [selectedRangeId]);
  assert.deepEqual(receipt.deferredRangeIds, [
    snapshot.loadPlan.firstFrameRangeIds[0],
  ]);
  assert.equal(
    receipt.initialRangeSelection.strategy,
    "camera-visibility",
  );
  assert.equal(
    receipt.initialRangeSelection.cameraDriven,
    true,
  );
  assert.deepEqual(
    receipt.initialRangeSelection.sourcePlanRangeIds,
    snapshot.loadPlan.firstFrameRangeIds,
  );
  assert.equal(
    receipt.initialRangeSelection.ranking[0].rangeId,
    selectedRangeId,
  );
  assert.equal(source.state.rangeReads, 8);
  assert.equal(source.state.remainingReadBytes, 996);

  const sourcePlanLoad = await renderer.loadRange({
    rangeId: snapshot.loadPlan.firstFrameRangeIds[0],
  });
  assert.deepEqual(sourcePlanLoad.deferredRangeIds, []);
  await renderer.dispose();
  await session.dispose();
  await source.dispose();
});

test("shared geometry uploads once and keeps two source instances", async () => {
  const {
    source,
    session,
    snapshot,
  } = await sourceSession(mappedBytes());
  const renderer = createBounded3dRenderer();
  const receipt = await renderer.mount({ session, snapshot });

  assert.equal(receipt.metrics.geometryRecords, 1);
  assert.equal(receipt.metrics.instances, 2);
  assert.equal(receipt.metrics.uniqueTriangles, 12);
  assert.equal(receipt.metrics.instancedTriangles, 24);
  assert.equal(receipt.backend.geometryBytes, 960);
  assert.equal(receipt.backend.instanceBytes, 160);
  assert.equal(receipt.backend.uploadedBytes, 1_120);

  await renderer.dispose();
  await session.dispose();
  await source.dispose();
});

test("renderer source switch releases the prior backend mount", async () => {
  const first = await sourceSession(mappedBytes());
  const second = await sourceSession(multiGeometryBytes(), {
    maximumRangeBytes: 996,
  });
  const backend = createHeadless3dBackend();
  const renderer = createBounded3dRenderer({ backend });

  const firstReceipt = await renderer.mount({
    session: first.session,
    snapshot: first.snapshot,
  });
  const secondReceipt = await renderer.mount({
    session: second.session,
    snapshot: second.snapshot,
  });

  assert.notEqual(
    firstReceipt.source.fingerprint,
    secondReceipt.source.fingerprint,
  );
  assert.equal(renderer.state.mounts, 2);
  assert.equal(renderer.state.unmounts, 1);
  assert.equal(backend.state.mounts, 2);
  assert.equal(backend.state.unmounts, 1);
  assert.equal(backend.state.activeHandleId, "headless-3d-mount:2");

  await renderer.dispose();
  assert.equal(backend.state.unmounts, 2);
  await first.session.dispose();
  await first.source.dispose();
  await second.session.dispose();
  await second.source.dispose();
});

test("renderer rejects range bytes and budgets before backend mount", async () => {
  const {
    source,
    session,
    snapshot,
  } = await sourceSession(mappedBytes());
  const backend = createHeadless3dBackend();
  const tooSmall = createBounded3dRenderer({
    backend,
    limits: {
      maximumRangeBytes: 995,
    },
  });
  await assert.rejects(
    tooSmall.mount({ session, snapshot }),
    /range exceeds its byte limit/u,
  );
  assert.equal(source.state.rangeReads, 0);
  assert.equal(backend.state.mounts, 0);
  await tooSmall.dispose();

  const staleSnapshot = structuredClone(snapshot);
  staleSnapshot.layers[0].rangeHandles[0].revisionId += ":stale";
  const staleRenderer = createBounded3dRenderer();
  await assert.rejects(
    staleRenderer.mount({
      session,
      snapshot: staleSnapshot,
    }),
    /range handle is invalid/u,
  );
  assert.equal(source.state.rangeReads, 0);
  await staleRenderer.dispose();
  await session.dispose();
  await source.dispose();

  const second = await sourceSession(mappedBytes());
  const corruptSession = {
    readRange: async (handle, offset, length) =>
      new Uint8Array(length),
  };
  const corruptRenderer = createBounded3dRenderer();
  await assert.rejects(
    corruptRenderer.mount({
      session: corruptSession,
      snapshot: second.snapshot,
    }),
    /digest does not match/u,
  );
  assert.equal(corruptRenderer.state.mounted, false);
  await corruptRenderer.dispose();
  await second.session.dispose();
  await second.source.dispose();
});

test("renderer cleans up a backend that returns an invalid receipt", async () => {
  const {
    source,
    session,
    snapshot,
  } = await sourceSession(mappedBytes());
  const state = {
    unmounts: 0,
    disposed: false,
  };
  const backend = {
    mount: async () => ({
      handleId: "invalid-backend-mount:1",
      receipt: {
        backendId: "invalid",
        frameId: "invalid-frame:1",
        rendered: false,
        geometryBytes: 0,
        instanceBytes: 0,
        uploadedBytes: 0,
        drawCalls: 0,
      },
    }),
    unmount: async () => {
      state.unmounts += 1;
      return {
        released: true,
        releasedBytes: 0,
      };
    },
    dispose: async () => {
      state.disposed = true;
      return true;
    },
  };
  const renderer = createBounded3dRenderer({ backend });

  await assert.rejects(
    renderer.mount({ session, snapshot }),
    /mount receipt is invalid/u,
  );
  assert.equal(state.unmounts, 1);
  assert.equal(renderer.state.mounted, false);
  await renderer.dispose();
  assert.equal(state.disposed, true);
  await session.dispose();
  await source.dispose();
});

test("renderer abort and disposal are terminal", async () => {
  const {
    source,
    session,
    snapshot,
  } = await sourceSession(mappedBytes());
  const renderer = createBounded3dRenderer();
  const controller = new AbortController();
  controller.abort(new DOMException("cancelled", "AbortError"));

  await assert.rejects(
    renderer.mount({
      session,
      snapshot,
      signal: controller.signal,
    }),
    /cancelled/u,
  );
  assert.equal(source.state.rangeReads, 0);
  assert.equal(await renderer.dispose(), true);
  await assert.rejects(
    renderer.mount({ session, snapshot }),
    /disposed/u,
  );
  await session.dispose();
  await source.dispose();
});
