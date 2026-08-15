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
  BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE,
  createBounded3dRenderer,
  createHeadless3dBackend,
  encodeBimRetainedOverlayPacket,
  sha256BimRetainedOverlayPacket,
} from "../../packages/bim-renderer-3d/src/index.mjs";
import {
  syntheticMappedIfc,
} from "../../scripts/generate-synthetic-ifc.mjs";

const IDENTITY = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

const TRIANGLE = Object.freeze({
  positions: Object.freeze([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]),
  normals: Object.freeze([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ]),
  indices: Object.freeze([0, 1, 2]),
});

async function mountedOverlay({ maximumGpuCacheBytes = 2_048 } = {}) {
  const artifact = await createWebIfcSourceArtifact(
    new TextEncoder().encode(syntheticMappedIfc()),
  );
  const source = createBimModelSource(artifact, {
    maximumRequestBytes: 128,
  });
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const backend = createHeadless3dBackend();
  const renderer = createBounded3dRenderer({
    backend,
    limits: { maximumGpuCacheBytes },
  });
  await renderer.mount({ session, snapshot });
  const entity = snapshot.entities[0];
  const primitive = entity.primitives[0];
  const sourceRenderId = "consumer-render:wall-1";
  const sourcePickId = "consumer-pick:wall-1";
  renderer.registerRetainedOverlaySource({
    overlayId: "overlay:consumer-source",
    sourceId: "consumer-source",
    layerId: "consumer-layer",
    revisionId: "consumer-revision:1",
    identities: [{
      sourceRenderId,
      sourcePickId,
      renderId: entity.renderId,
      pickId: entity.pickId,
      nativeId: entity.nativeId ?? entity.globalId,
      externalIdentityToken: entity.externalIdentityToken,
      bounds: entity.bounds,
      transform: primitive.transform,
      color: primitive.color,
      visible: true,
    }],
  });
  return {
    backend,
    bounds: entity.bounds,
    renderer,
    session,
    snapshot,
    source,
    sourcePickId,
    sourceRenderId,
  };
}

function operation({
  aspect,
  bounds,
  kind = "upsert",
  operationId,
  sourceRenderId,
}) {
  return Object.freeze({
    operationId,
    kind,
    aspect,
    sourceId: "consumer-source",
    layerId: "consumer-layer",
    renderIds: Object.freeze([sourceRenderId]),
    affectedWorldBounds: bounds,
    externalIdentityToken: kind === "tombstone"
      ? null
      : "consumer-token:wall-1",
  });
}

async function encodedDelta({
  aspect = "geometry",
  bounds,
  color = [0.2, 0.7, 0.9, 1],
  fromRevisionId,
  operationId,
  sequence,
  sourceRenderId,
  toRevisionId,
  transform = IDENTITY,
  visible = true,
}) {
  const packet = encodeBimRetainedOverlayPacket({
    deltaId: `delta:${sequence}`,
    sourceId: "consumer-source",
    layerId: "consumer-layer",
    fromRevisionId,
    toRevisionId,
    sequence,
    entries: [{
      operationId,
      kind: "upsert",
      aspect,
      renderId: sourceRenderId,
      pickId: aspect === "geometry"
        ? "consumer-pick:wall-2"
        : aspect === "identity"
          ? "consumer-pick:wall-3"
          : null,
      nativeId: aspect === "geometry"
        ? "consumer-native:wall-1"
        : aspect === "identity"
          ? "consumer-native:wall-2"
          : null,
      externalIdentityToken: "consumer-token:wall-1",
      bounds,
      transform: ["geometry", "transform"].includes(aspect)
        ? transform
        : null,
      color: ["geometry", "style"].includes(aspect) ? color : null,
      visible: ["geometry", "style"].includes(aspect) ? visible : null,
      geometry: aspect === "geometry" ? TRIANGLE : null,
    }],
  });
  return {
    delta: Object.freeze({
      deltaId: `delta:${sequence}`,
      sourceId: "consumer-source",
      fromRevisionId,
      toRevisionId,
      sequence,
      affectedWorldBounds: bounds,
      operations: Object.freeze([
        operation({
          aspect,
          bounds,
          operationId,
          sourceRenderId,
        }),
      ]),
      payload: Object.freeze({
        mediaType: BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE,
        byteLength: packet.byteLength,
        sha256: await sha256BimRetainedOverlayPacket(packet),
      }),
    }),
    packet,
  };
}

async function closeFixture(fixture) {
  await fixture.renderer.dispose();
  await fixture.session.dispose();
  await fixture.source.dispose();
}

test("retained geometry stages off-scene and commits geometry and pick atomically", async () => {
  const fixture = await mountedOverlay();
  try {
    const beforeReads = fixture.source.state.rangeReads;
    const beforeBytes = fixture.renderer.state.activeBackendBytes;
    const { delta, packet } = await encodedDelta({
      bounds: fixture.bounds,
      fromRevisionId: "consumer-revision:1",
      operationId: "operation:geometry:1",
      sequence: 1,
      sourceRenderId: fixture.sourceRenderId,
      toRevisionId: "consumer-revision:2",
    });
    const transaction = await fixture.renderer.prepareRetainedOverlayDelta({
      overlayId: "overlay:consumer-source",
      delta,
      payloadBytes: packet,
    });

    assert.equal(transaction.receipt.status, "prepared");
    assert.equal(transaction.receipt.cpuStagingReleased, true);
    assert.equal(fixture.renderer.state.stagedRetainedDelta, true);
    assert.equal(fixture.renderer.state.activeBackendBytes, beforeBytes);
    assert.equal(fixture.source.state.rangeReads, beforeReads);
    assert.equal(
      fixture.renderer.retainedOverlaySnapshot({
        overlayId: "overlay:consumer-source",
      }).revisionId,
      "consumer-revision:1",
    );
    assert.throws(
      () => fixture.renderer.checkpointRetainedOverlay({
        overlayId: "overlay:consumer-source",
        checkpointId: "checkpoint:blocked",
        expectedRevisionId: "consumer-revision:1",
      }),
      /operation is in progress/u,
    );

    const committed = transaction.commit();
    const current = fixture.renderer.retainedOverlaySnapshot({
      overlayId: "overlay:consumer-source",
    });
    assert.equal(committed.status, "applied");
    assert.equal(committed.backend.geometryPickRevisionAtomic, true);
    assert.equal(current.revisionId, "consumer-revision:2");
    assert.equal(current.sequence, 1);
    assert.equal(current.identities.length, 1);
    assert.equal(
      current.identities[0].retainedOverlay.sourceRenderId,
      fixture.sourceRenderId,
    );
    assert.notEqual(current.identities[0].pickId, fixture.snapshot.entities[0].pickId);
    assert.equal(fixture.renderer.state.stagedRetainedDelta, false);
    assert.equal(fixture.backend.state.retainedCommits, 1);
    assert.equal(fixture.source.state.rangeReads, beforeReads);

    const checkpoint = fixture.renderer.checkpointRetainedOverlay({
      overlayId: "overlay:consumer-source",
      checkpointId: "checkpoint:1",
      expectedRevisionId: "consumer-revision:2",
    });
    assert.equal(checkpoint.externalSourceRangeReads, 0);
    assert.equal(checkpoint.externalSourceParses, 0);
    assert.equal(checkpoint.externalSourceRangeUploads, 0);
    assert.equal(checkpoint.cameraPreserved, true);
    assert.equal(checkpoint.clippingPreserved, true);
    assert.equal(fixture.source.state.rangeReads, beforeReads);
  } finally {
    await closeFixture(fixture);
  }
});

test("retained style, transform, identity, rollback, and tombstone are atomic", async () => {
  const fixture = await mountedOverlay();
  try {
    const first = await encodedDelta({
      bounds: fixture.bounds,
      fromRevisionId: "consumer-revision:1",
      operationId: "operation:geometry:1",
      sequence: 1,
      sourceRenderId: fixture.sourceRenderId,
      toRevisionId: "consumer-revision:2",
    });
    const geometryCommit = (await fixture.renderer.prepareRetainedOverlayDelta({
      overlayId: "overlay:consumer-source",
      delta: first.delta,
      payloadBytes: first.packet,
    })).commit();
    const committedBytes = fixture.renderer.state.activeBackendBytes;

    const style = await encodedDelta({
      aspect: "style",
      bounds: fixture.bounds,
      color: [1, 0, 0, 1],
      fromRevisionId: "consumer-revision:2",
      operationId: "operation:style:2",
      sequence: 2,
      sourceRenderId: fixture.sourceRenderId,
      toRevisionId: "consumer-revision:3",
      visible: false,
    });
    const styleTransaction =
      await fixture.renderer.prepareRetainedOverlayDelta({
        overlayId: "overlay:consumer-source",
        delta: style.delta,
        payloadBytes: style.packet,
      });
    await styleTransaction.rollback();
    assert.equal(
      fixture.renderer.retainedOverlaySnapshot({
        overlayId: "overlay:consumer-source",
      }).revisionId,
      "consumer-revision:2",
    );
    assert.equal(fixture.renderer.state.activeBackendBytes, committedBytes);
    assert.equal(fixture.backend.state.retainedRollbacks, 1);

    const committedStyle = await encodedDelta({
      aspect: "style",
      bounds: fixture.bounds,
      color: [1, 0, 0, 1],
      fromRevisionId: "consumer-revision:2",
      operationId: "operation:style:2",
      sequence: 2,
      sourceRenderId: fixture.sourceRenderId,
      toRevisionId: "consumer-revision:3",
      visible: false,
    });
    const styleCommit = (await fixture.renderer
      .prepareRetainedOverlayDelta({
        overlayId: "overlay:consumer-source",
        delta: committedStyle.delta,
        payloadBytes: committedStyle.packet,
      })).commit();
    assert.equal(styleCommit.status, "applied");
    assert.equal(styleCommit.sequence, 2);
    assert.equal(styleCommit.backend.geometryPickRevisionAtomic, true);
    assert.equal(
      styleCommit.backend.visibleInstances,
      geometryCommit.backend.visibleInstances - 1,
    );

    const translated = Object.freeze([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      2, 3, 4, 1,
    ]);
    const transform = await encodedDelta({
      aspect: "transform",
      bounds: fixture.bounds,
      fromRevisionId: "consumer-revision:3",
      operationId: "operation:transform:3",
      sequence: 3,
      sourceRenderId: fixture.sourceRenderId,
      toRevisionId: "consumer-revision:4",
      transform: translated,
    });
    const transformCommit = (await fixture.renderer
      .prepareRetainedOverlayDelta({
        overlayId: "overlay:consumer-source",
        delta: transform.delta,
        payloadBytes: transform.packet,
      })).commit();
    assert.equal(transformCommit.status, "applied");
    assert.equal(transformCommit.sequence, 3);
    assert.equal(transformCommit.backend.geometryPickRevisionAtomic, true);
    assert.equal(
      fixture.renderer.retainedOverlaySnapshot({
        overlayId: "overlay:consumer-source",
      }).revisionId,
      "consumer-revision:4",
    );

    const identity = await encodedDelta({
      aspect: "identity",
      bounds: fixture.bounds,
      fromRevisionId: "consumer-revision:4",
      operationId: "operation:identity:4",
      sequence: 4,
      sourceRenderId: fixture.sourceRenderId,
      toRevisionId: "consumer-revision:5",
    });
    const identityCommit = (await fixture.renderer
      .prepareRetainedOverlayDelta({
        overlayId: "overlay:consumer-source",
        delta: identity.delta,
        payloadBytes: identity.packet,
      })).commit();
    assert.equal(identityCommit.status, "applied");
    assert.equal(identityCommit.sequence, 4);
    assert.equal(identityCommit.backend.geometryPickRevisionAtomic, true);
    assert.equal(identityCommit.identities[0].nativeId,
      "consumer-native:wall-2");
    assert.equal(identityCommit.identities[0].retainedOverlay.sourcePickId,
      "consumer-pick:wall-3");

    const tombstoneDelta = Object.freeze({
      deltaId: "delta:5:tombstone",
      sourceId: "consumer-source",
      fromRevisionId: "consumer-revision:5",
      toRevisionId: "consumer-revision:6",
      sequence: 5,
      affectedWorldBounds: fixture.bounds,
      operations: Object.freeze([
        operation({
          aspect: "entity",
          bounds: fixture.bounds,
          kind: "tombstone",
          operationId: "operation:tombstone:5",
          sourceRenderId: fixture.sourceRenderId,
        }),
      ]),
      payload: null,
    });
    (await fixture.renderer.prepareRetainedOverlayDelta({
      overlayId: "overlay:consumer-source",
      delta: tombstoneDelta,
    })).commit();
    const current = fixture.renderer.retainedOverlaySnapshot({
      overlayId: "overlay:consumer-source",
    });
    assert.equal(current.revisionId, "consumer-revision:6");
    assert.equal(current.identities.length, 0);
    assert.equal(fixture.backend.state.retainedObjects, 0);
  } finally {
    await closeFixture(fixture);
  }
});

test("retained deltas fail closed for stale, digest, cancellation, and GPU budget", async () => {
  const fixture = await mountedOverlay({ maximumGpuCacheBytes: 1_200 });
  try {
    const candidate = await encodedDelta({
      bounds: fixture.bounds,
      fromRevisionId: "consumer-revision:1",
      operationId: "operation:geometry:1",
      sequence: 1,
      sourceRenderId: fixture.sourceRenderId,
      toRevisionId: "consumer-revision:2",
    });
    const baseline = fixture.renderer.state.activeBackendBytes;
    const stale = {
      ...candidate.delta,
      sequence: 2,
    };
    await assert.rejects(
      fixture.renderer.prepareRetainedOverlayDelta({
        overlayId: "overlay:consumer-source",
        delta: stale,
        payloadBytes: candidate.packet,
      }),
      /stale or out of order/u,
    );
    const badDigest = {
      ...candidate.delta,
      payload: {
        ...candidate.delta.payload,
        sha256: `${candidate.delta.payload.sha256[0] === "f" ? "e" : "f"}` +
          candidate.delta.payload.sha256.slice(1),
      },
    };
    await assert.rejects(
      fixture.renderer.prepareRetainedOverlayDelta({
        overlayId: "overlay:consumer-source",
        delta: badDigest,
        payloadBytes: candidate.packet,
      }),
      /payload identity is invalid/u,
    );
    const controller = new AbortController();
    controller.abort(new DOMException("cancel retained prepare", "AbortError"));
    await assert.rejects(
      fixture.renderer.prepareRetainedOverlayDelta({
        overlayId: "overlay:consumer-source",
        delta: candidate.delta,
        payloadBytes: candidate.packet,
        signal: controller.signal,
      }),
      { name: "AbortError" },
    );
    await assert.rejects(
      fixture.renderer.prepareRetainedOverlayDelta({
        overlayId: "overlay:consumer-source",
        delta: candidate.delta,
        payloadBytes: candidate.packet,
      }),
      /active GPU budget/u,
    );
    assert.equal(fixture.renderer.state.activeBackendBytes, baseline);
    assert.equal(fixture.renderer.state.stagedRetainedDelta, false);
    assert.equal(fixture.backend.state.retainedCommits, 0);
    assert.equal(
      fixture.renderer.retainedOverlaySnapshot({
        overlayId: "overlay:consumer-source",
      }).revisionId,
      "consumer-revision:1",
    );
  } finally {
    await closeFixture(fixture);
  }
});
