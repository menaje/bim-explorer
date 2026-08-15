import {
  BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE,
  BIM_SOURCE_PROTOCOL_VERSION,
  cameraViewProjectionMatrix,
  createBimModelSource,
  createBimSurfaceHitRenderer,
  createBounded3dRenderer,
  createExplicitAlignment,
  createFederatedBimSurface,
  createGltfReferenceSource,
  createWebGl2Backend,
  encodeBimRetainedOverlayPacket,
  sha256BimRetainedOverlayPacket,
} from "../../packages/federated-bim-surface/src/package-entry.mjs";

const WIDTH = 800;
const HEIGHT = 600;
const canvas = document.querySelector("#model-canvas");
const receiptElement = document.querySelector("#receipt");
const statusElement = document.querySelector("#status");
const IDENTITY = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

function publish(report) {
  globalThis.__retainedOverlayBrowserReport = Object.freeze(report);
  receiptElement.textContent = JSON.stringify(report, null, 2);
  statusElement.textContent = report.status;
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function reviveBytes(value) {
  if (Array.isArray(value)) {
    return value.map(reviveBytes);
  }
  if (value !== null && typeof value === "object") {
    if (Object.keys(value).length === 1 && typeof value.$bytes === "string") {
      return decodeBase64(value.$bytes);
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, reviveBytes(item)]),
    );
  }
  return value;
}

function translation(x) {
  return Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, 0, 0, 1,
  ]);
}

function alignment(snapshot, x, reference) {
  return createExplicitAlignment({
    sourceRevisionId: snapshot.revisionId,
    sourceCoordinateSystem: snapshot.coordinateSystem.source,
    federationCoordinateSystem: "federation-local",
    sourceToFederation: translation(x),
    reference,
  });
}

function transformPoint(matrix, point) {
  const [x, y, z] = point;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

function projectBounds(bounds, matrix) {
  const points = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        points.push(transformPoint(matrix, [x, y, z]));
      }
    }
  }
  const min = [0, 1, 2].map((axis) =>
    Math.min(...points.map((point) => point[axis])));
  const max = [0, 1, 2].map((axis) =>
    Math.max(...points.map((point) => point[axis])));
  for (let axis = 0; axis < 3; axis += 1) {
    if (min[axis] === max[axis]) {
      const epsilon = Math.max(1, Math.abs(min[axis])) * 1e-6;
      min[axis] -= epsilon;
      max[axis] += epsilon;
    }
  }
  return Object.freeze({
    min: Object.freeze(min),
    max: Object.freeze(max),
  });
}

function projectedPixel(camera, point) {
  const matrix = cameraViewProjectionMatrix(camera, WIDTH / HEIGHT);
  const clip = [0, 0, 0, 0];
  for (let row = 0; row < 4; row += 1) {
    clip[row] =
      matrix[row] * point[0] +
      matrix[4 + row] * point[1] +
      matrix[8 + row] * point[2] +
      matrix[12 + row];
  }
  if (clip[3] <= 0) {
    return null;
  }
  return Object.freeze({
    x: Math.floor((clip[0] / clip[3] + 1) * WIDTH / 2),
    y: Math.floor((1 - clip[1] / clip[3]) * HEIGHT / 2),
  });
}

function pixelCandidates(camera, bounds) {
  const center = bounds.min.map(
    (value, axis) => (value + bounds.max[axis]) / 2,
  );
  const projected = projectedPixel(camera, center);
  if (projected === null) {
    return [];
  }
  return [
    [0, 0], [-4, 0], [4, 0], [0, -4], [0, 4],
    [-8, -8], [-8, 8], [8, -8], [8, 8],
  ].map(([x, y]) => ({
    x: projected.x + x,
    y: projected.y + y,
  })).filter((point) =>
    point.x >= 0 && point.x < WIDTH && point.y >= 0 && point.y < HEIGHT);
}

async function retainedPick(surface, camera, bounds, sourceId) {
  for (const point of pixelCandidates(camera, bounds)) {
    const pick = await surface.pick(point);
    if (
      pick.status === "hit" &&
      pick.federationSourceId === sourceId &&
      pick.retainedOverlay?.sequence === 1
    ) {
      return { pick, point };
    }
  }
  throw new Error("retained overlay Browser pick was not resolved");
}

function geometry(bounds) {
  const z = (bounds.min[2] + bounds.max[2]) / 2;
  return {
    positions: [
      bounds.min[0], bounds.min[1], z,
      bounds.max[0], bounds.min[1], z,
      (bounds.min[0] + bounds.max[0]) / 2, bounds.max[1], z,
    ],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 1, 2],
  };
}

async function run() {
  publish({ status: "running" });
  const sources = [];
  let backend = null;
  let surface = null;
  try {
    const input = reviveBytes(await (await fetch("/probe-input.json")).json());
    const semanticSource = createBimModelSource(input.ifcArtifact);
    const referenceSource = await createGltfReferenceSource(input.referenceGlb);
    const overlaySource = await createGltfReferenceSource(input.overlayGlb);
    sources.push(semanticSource, referenceSource, overlaySource);
    const semanticSession = await semanticSource.open({
      protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
    });
    const referenceSession = await referenceSource.open({
      protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
    });
    const overlaySession = await overlaySource.open({
      protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
    });
    const semanticSnapshot = await semanticSession.getSnapshot();
    const referenceSnapshot = await referenceSession.getSnapshot();
    const overlaySnapshot = await overlaySession.getSnapshot();
    const overlayAlignment = alignment(
      overlaySnapshot,
      8,
      "retained-browser:overlay",
    );
    backend = createWebGl2Backend({ canvas, width: WIDTH, height: HEIGHT });
    const renderer = createBimSurfaceHitRenderer({
      width: WIDTH,
      height: HEIGHT,
      renderer: createBounded3dRenderer({
        backend,
        limits: { maximumFirstFrameRanges: 3 },
      }),
    });
    surface = createFederatedBimSurface({ renderer });
    const opened = await surface.open({
      federationId: "federation:retained-browser",
      sources: [
        {
          federationSourceId: "source-slot:reference",
          sourceRole: "geometric-reference",
          lifecycleOwnership: "transferred",
          session: referenceSession,
          snapshot: referenceSnapshot,
          alignment: alignment(referenceSnapshot, -8, "retained-browser:base"),
        },
        {
          federationSourceId: "source-slot:semantic",
          sourceRole: "semantic-base",
          lifecycleOwnership: "transferred",
          session: semanticSession,
          snapshot: semanticSnapshot,
          alignment: alignment(semanticSnapshot, 0, "retained-browser:semantic"),
        },
        {
          federationSourceId: "source-slot:overlay",
          sourceRole: "consumer-overlay",
          lifecycleOwnership: "transferred",
          session: overlaySession,
          snapshot: overlaySnapshot,
          alignment: overlayAlignment,
        },
      ],
    });
    const camera = opened.mount.backend.camera;
    await renderer.renderView({
      camera,
      clippingPlanes: [{ normal: [1, 0, 0], constant: 1_000 }],
    });
    const entity = overlaySnapshot.entities[0];
    const bounds = projectBounds(entity.bounds, overlayAlignment.sourceToFederation);
    const toRevisionId = `${overlaySnapshot.revisionId}:retained:1`;
    const packet = encodeBimRetainedOverlayPacket({
      deltaId: "delta:retained-browser:1",
      sourceId: overlaySnapshot.sourceId,
      layerId: overlaySnapshot.layerId,
      fromRevisionId: overlaySnapshot.revisionId,
      toRevisionId,
      sequence: 1,
      entries: [{
        operationId: "operation:retained-browser:1",
        kind: "upsert",
        aspect: "geometry",
        renderId: entity.renderId,
        pickId: `${entity.pickId}:retained:1`,
        nativeId: entity.nativeId,
        externalIdentityToken: entity.externalIdentityToken,
        bounds,
        transform: IDENTITY,
        color: [0.15, 0.85, 0.35, 1],
        visible: true,
        geometry: geometry(bounds),
      }],
    });
    const delta = Object.freeze({
      protocolVersion: "0.1.0",
      deltaId: "delta:retained-browser:1",
      sessionId: "session:retained-browser",
      sourceId: overlaySnapshot.sourceId,
      baseSnapshotId: "snapshot:retained-browser:base",
      fromRevisionId: overlaySnapshot.revisionId,
      toRevisionId,
      sequence: 1,
      operations: Object.freeze([{
        operationId: "operation:retained-browser:1",
        kind: "upsert",
        aspect: "geometry",
        sourceId: overlaySnapshot.sourceId,
        layerId: overlaySnapshot.layerId,
        renderIds: Object.freeze([entity.renderId]),
        affectedWorldBounds: bounds,
        dependencyIds: Object.freeze([]),
        externalIdentityToken: entity.externalIdentityToken,
      }]),
      affectedWorldBounds: bounds,
      payload: Object.freeze({
        protocolVersion: "0.1.0",
        payloadId: "payload:retained-browser:1",
        sessionId: "session:retained-browser",
        sourceId: overlaySnapshot.sourceId,
        fromRevisionId: overlaySnapshot.revisionId,
        toRevisionId,
        mediaType: BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE,
        byteLength: packet.byteLength,
        sha256: await sha256BimRetainedOverlayPacket(packet),
        expiresAt: null,
        disposeWithSession: true,
      }),
    });
    const rangesBefore = sources.map((source) => source.state.rangeReads);
    const activeBytesBefore = backend.state.activeBytes;
    let payloadReads = 0;
    const adapter = surface.createRetainedOverlayAdapter({
      federationSourceId: "source-slot:overlay",
      async readPayload() {
        payloadReads += 1;
        return packet;
      },
    });
    const prepareStarted = performance.now();
    const transaction = await adapter.prepareDelta(delta);
    const prepareMs = performance.now() - prepareStarted;
    const beforeCommit = {
      revisionId: surface.state.retainedOverlays[0].revisionId,
      activeBytes: backend.state.activeBytes,
      clippingPlanes: backend.state.clippingPlanes,
      cameraProjection: backend.state.cameraProjection,
      framebufferPreserved:
        transaction.receipt.renderer.backend.currentFramebufferPreserved,
      pickMapPreserved:
        transaction.receipt.renderer.backend.currentPickMapPreserved,
    };
    const commitStarted = performance.now();
    const committed = transaction.commit();
    const commitMs = performance.now() - commitStarted;
    const retained = await retainedPick(
      surface,
      camera,
      bounds,
      "source-slot:overlay",
    );
    const checkpoint = surface.checkpointRetainedOverlay({
      federationSourceId: "source-slot:overlay",
      checkpointId: "checkpoint:retained-browser:1",
      expectedRevisionId: toRevisionId,
    });
    const tombstone = Object.freeze({
      ...delta,
      deltaId: "delta:retained-browser:2",
      fromRevisionId: toRevisionId,
      toRevisionId: `${toRevisionId}:tombstone`,
      sequence: 2,
      operations: Object.freeze([{
        ...delta.operations[0],
        operationId: "operation:retained-browser:2",
        kind: "tombstone",
        aspect: "entity",
        externalIdentityToken: null,
      }]),
      payload: null,
    });
    (await adapter.prepareDelta(tombstone)).commit();
    const afterDelete = await surface.pick(retained.point);
    const tombstonePickMiss =
      afterDelete.status === "miss" ||
      afterDelete.rendererPick.identity?.pickId !==
        retained.pick.rendererPick.identity.pickId;
    const rangesAfter = sources.map((source) => source.state.rangeReads);
    const finalOverlayBytes = backend.state.activeBytes;
    const preservedView = {
      cameraProjection: backend.state.cameraProjection,
      clippingPlanes: backend.state.clippingPlanes,
    };
    await adapter.dispose();
    const cleanup = await surface.dispose({ reason: "retained-browser-complete" });
    const report = {
      schema: "bim-explorer-retained-overlay-browser-qualification/1",
      status: "passed",
      contract: "bim-explorer-federated-retained-overlay/0.1",
      environment: {
        host: "browser",
        actualWebGl2: opened.mount.backend.actualGpu,
        context: opened.mount.backend.context,
      },
      transaction: {
        prepareMs,
        commitMs,
        atomic: committed.renderer.backend.geometryPickRevisionAtomic,
        payloadReads,
        beforeCommit,
        committedRevisionId: committed.revisionId,
        selectedSource: retained.pick.federationSourceId,
        selectedPickId: retained.pick.rendererPick.identity.pickId,
        selectionItems: retained.pick.selection.items.length,
        selectionSource:
          retained.pick.selection.items[0]?.federationSourceId ?? null,
        tombstonePickMiss,
      },
      pixels: {
        nonBackgroundAfterCommit:
          committed.renderer.backend.nonBackgroundPixels,
      },
      preservation: {
        rangesBefore,
        rangesAfter,
        externalReadsUnchanged:
          JSON.stringify(rangesBefore) === JSON.stringify(rangesAfter),
        activeBytesBefore,
        activeBytesAfterTombstone: finalOverlayBytes,
        unchangedBaseGpuAllocation:
          activeBytesBefore === finalOverlayBytes,
        cameraProjection: preservedView.cameraProjection,
        clippingPlanes: preservedView.clippingPlanes,
        cameraUnchanged:
          beforeCommit.cameraProjection === preservedView.cameraProjection,
        clippingUnchanged:
          beforeCommit.clippingPlanes === preservedView.clippingPlanes,
        checkpointReads: checkpoint.externalSourceRangeReads,
        checkpointParses: checkpoint.externalSourceParses,
        checkpointUploads: checkpoint.externalSourceRangeUploads,
      },
      cleanup: {
        surfaceStatus: cleanup.status,
        backendDisposed: backend.state.disposed,
        backendActiveBytes: backend.state.activeBytes,
        retainedObjects: backend.state.retainedObjects,
      },
    };
    if (
      report.environment.actualWebGl2 !== true ||
      report.transaction.atomic !== true ||
      report.transaction.payloadReads !== 1 ||
      report.transaction.beforeCommit.framebufferPreserved !== true ||
      report.transaction.beforeCommit.pickMapPreserved !== true ||
      report.transaction.selectionItems !== 1 ||
      report.transaction.selectionSource !==
        report.transaction.selectedSource ||
      report.transaction.tombstonePickMiss !== true ||
      report.pixels.nonBackgroundAfterCommit <= 0 ||
      report.preservation.externalReadsUnchanged !== true ||
      report.preservation.unchangedBaseGpuAllocation !== true ||
      report.preservation.cameraUnchanged !== true ||
      report.preservation.clippingUnchanged !== true ||
      report.preservation.checkpointReads !== 0 ||
      report.preservation.checkpointParses !== 0 ||
      report.preservation.checkpointUploads !== 0 ||
      report.cleanup.backendDisposed !== true ||
      report.cleanup.backendActiveBytes !== 0 ||
      report.cleanup.retainedObjects !== 0
    ) {
      throw new Error("retained overlay Browser qualification failed");
    }
    for (const source of sources) {
      await source.dispose();
    }
    publish(report);
  } catch (error) {
    try {
      if (surface?.state.lifecycle === "ready") {
        await surface.dispose({ reason: "retained-browser-failure" });
      }
      for (const source of sources) {
        await source.dispose();
      }
    } catch {
      // The original failure remains authoritative.
    }
    publish({
      schema: "bim-explorer-retained-overlay-browser-qualification/1",
      status: "failed",
      error: { name: error?.name ?? "Error", message: error?.message ?? "failed" },
      cleanup: {
        backendDisposed: backend?.state.disposed ?? false,
        backendActiveBytes: backend?.state.activeBytes ?? 0,
      },
    });
  }
}

await run();
