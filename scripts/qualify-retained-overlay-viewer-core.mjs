import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createWebIfcSourceArtifact,
} from "../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../packages/bim-model-source/src/index.mjs";
import {
  BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE,
  createBounded3dRenderer,
  createHeadless3dBackend,
  encodeBimRetainedOverlayPacket,
  sha256BimRetainedOverlayPacket,
} from "../packages/bim-renderer-3d/src/index.mjs";
import {
  createExplicitAlignment,
} from "../packages/bim-federation/src/index.mjs";
import {
  createFederatedBimSurface,
} from "../packages/federated-bim-surface/src/index.mjs";
import {
  syntheticMappedIfc,
} from "./generate-synthetic-ifc.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const EXPECTED_VIEWER_CORE_COMMIT =
  "6702ad1439e44fa9a9835f56181614299c1fe1ff";
const SCHEMA =
  "bim-explorer-retained-overlay-viewer-core-qualification/1";
const IDENTITY = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

function parseArguments(values) {
  let output = null;
  let viewerRoot = path.resolve(ROOT, "../2d-cad-viewer");
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    const value = values[index + 1];
    if (
      !["--out", "--output", "--viewer-root"].includes(name) ||
      typeof value !== "string" || value.startsWith("-")
    ) {
      throw new TypeError(
        "usage: node scripts/qualify-retained-overlay-viewer-core.mjs " +
          "[--viewer-root path] [--out path]",
      );
    }
    if (name === "--viewer-root") {
      viewerRoot = path.resolve(value);
    } else {
      output = path.resolve(value);
    }
    index += 1;
  }
  return { output, viewerRoot };
}

function git(viewerRoot, ...args) {
  return execFileSync("git", ["-C", viewerRoot, ...args], {
    encoding: "utf8",
  }).trim();
}

function siblingState(viewerRoot) {
  const workingTree = git(
    viewerRoot,
    "status",
    "--short",
    "--untracked-files=all",
  );
  const relevantSource = git(
    viewerRoot,
    "status",
    "--short",
    "--untracked-files=all",
    "--",
    "packages/viewer-core",
    "packages/viewer-render-protocol",
  );
  return Object.freeze({
    branch: git(viewerRoot, "branch", "--show-current"),
    head: git(viewerRoot, "rev-parse", "HEAD"),
    workingTreeEntries:
      workingTree === "" ? 0 : workingTree.split("\n").length,
    workingTreeFingerprint: createHash("sha256")
      .update(workingTree)
      .digest("hex"),
    relevantSourceMatchesHead: relevantSource === "",
  });
}

function normalizedBounds(bounds) {
  const min = [...bounds.min];
  const max = [...bounds.max];
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

function geometry(bounds) {
  const z = (bounds.min[2] + bounds.max[2]) / 2;
  return Object.freeze({
    positions: Object.freeze([
      bounds.min[0], bounds.min[1], z,
      bounds.max[0], bounds.min[1], z,
      (bounds.min[0] + bounds.max[0]) / 2, bounds.max[1], z,
    ]),
    normals: Object.freeze([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ]),
    indices: Object.freeze([0, 1, 2]),
  });
}

function deltaDescriptor({
  bounds,
  digest,
  entity,
  fromRevisionId,
  kind = "upsert",
  layerId,
  packet,
  sequence,
  sessionId,
  snapshotId,
  sourceId,
  suffix,
  toRevisionId,
}) {
  const tombstone = kind === "tombstone";
  return Object.freeze({
    protocolVersion: "0.1.0",
    deltaId: `delta:retained-viewer-core:${suffix}`,
    sessionId,
    sourceId,
    baseSnapshotId: snapshotId,
    fromRevisionId,
    toRevisionId,
    sequence,
    operations: Object.freeze([{
      operationId: `operation:retained-viewer-core:${suffix}`,
      kind,
      aspect: tombstone ? "entity" : "geometry",
      sourceId,
      layerId,
      renderIds: Object.freeze([entity.renderId]),
      affectedWorldBounds: bounds,
      dependencyIds: Object.freeze([]),
      externalIdentityToken:
        tombstone ? null : entity.externalIdentityToken,
    }]),
    affectedWorldBounds: bounds,
    payload: tombstone
      ? null
      : Object.freeze({
          protocolVersion: "0.1.0",
          payloadId: `payload:retained-viewer-core:${suffix}`,
          sessionId,
          sourceId,
          fromRevisionId,
          toRevisionId,
          mediaType: BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE,
          byteLength: packet.byteLength,
          sha256: digest,
          expiresAt: null,
          disposeWithSession: true,
        }),
  });
}

function allTrue(value) {
  return value !== null &&
    typeof value === "object" &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((item) => item === true);
}

export function validateRetainedOverlayViewerCoreQualification(value) {
  return (
    value?.schema === SCHEMA &&
    value.status === "passed-viewer-core-source-0.1.3" &&
    value.asOf === "2026-08-15" &&
    value.viewerCore?.version === "0.1.3" &&
    value.viewerCore.sourceCommit === EXPECTED_VIEWER_CORE_COMMIT &&
    value.viewerCore.sourceCommitQualified === true &&
    value.viewerCore.publishedArtifactQualified === false &&
    value.viewerCore.branch === "dev" &&
    value.transaction?.atomic === true &&
    value.transaction.stagedFramebufferPreserved === true &&
    value.transaction.stagedPickMapPreserved === true &&
    value.transaction.controllerRevisionMatchesSurface === true &&
    value.transaction.cancelledSurfaceUnchanged === true &&
    value.transaction.staleRejectedBeforePrepare === true &&
    value.transaction.digestRejectedSurfaceUnchanged === true &&
    value.transaction.tombstoneApplied === true &&
    value.transaction.payloadReads === 3 &&
    value.transaction.prepareCalls === 4 &&
    value.preservation?.externalReadsUnchanged === true &&
    value.preservation.checkpointReads === 0 &&
    value.preservation.checkpointParses === 0 &&
    value.preservation.checkpointUploads === 0 &&
    value.preservation.baseGpuAllocationPreserved === true &&
    value.cleanup?.controllerDisposed === true &&
    value.cleanup.surfaceDisposed === true &&
    value.cleanup.backendDisposed === true &&
    value.cleanup.backendActiveBytes === 0 &&
    value.cleanup.retainedObjects === 0 &&
    value.sibling?.relevantSourceMatchesHead === true &&
    value.sibling.headUnchanged === true &&
    value.sibling.workingTreeUnchanged === true &&
    Number.isSafeInteger(value.sibling.workingTreeEntriesBefore) &&
    value.sibling.workingTreeEntriesBefore >= 0 &&
    value.sibling.workingTreeEntriesAfter ===
      value.sibling.workingTreeEntriesBefore &&
    allTrue(value.assertions)
  );
}

export async function qualifyRetainedOverlayViewerCore({
  viewerRoot = path.resolve(ROOT, "../2d-cad-viewer"),
} = {}) {
  const siblingBefore = siblingState(viewerRoot);
  assert.equal(siblingBefore.branch, "dev");
  assert.equal(siblingBefore.head, EXPECTED_VIEWER_CORE_COMMIT);
  assert.equal(
    siblingBefore.relevantSourceMatchesHead,
    true,
    "Viewer Core source paths must match the exact commit",
  );
  const viewerCore = await import(pathToFileURL(path.join(
    viewerRoot,
    "packages",
    "viewer-core",
    "src",
    "index.mjs",
  )).href);
  assert.equal(viewerCore.ViewerCoreVersion, "0.1.3");

  const artifact = await createWebIfcSourceArtifact(
    new TextEncoder().encode(syntheticMappedIfc()),
    { profile: "ReferenceView_V1.2" },
  );
  const source = createBimModelSource(artifact);
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const sourceSnapshot = await session.getSnapshot();
  const backend = createHeadless3dBackend();
  const renderer = createBounded3dRenderer({ backend });
  const surface = createFederatedBimSurface({ renderer });
  let controller = null;
  let surfaceDisposed = false;
  try {
    await surface.open({
      federationId: "federation:retained-viewer-core",
      sources: [{
        federationSourceId: "source-slot:retained-viewer-core",
        sourceRole: "consumer-overlay",
        lifecycleOwnership: "borrowed",
        session,
        snapshot: sourceSnapshot,
        alignment: createExplicitAlignment({
          sourceRevisionId: sourceSnapshot.revisionId,
          sourceCoordinateSystem: sourceSnapshot.coordinateSystem.source,
          federationCoordinateSystem: "federation-local",
          sourceToFederation: IDENTITY,
          reference: "qualification:retained-viewer-core",
        }),
      }],
    });
    const entity = sourceSnapshot.entities.find((candidate) =>
      candidate.renderable === true);
    assert.ok(entity);
    const bounds = normalizedBounds(entity.bounds);
    const sessionId = "session:retained-viewer-core";
    const snapshotId = "snapshot:retained-viewer-core";
    const toRevisionId = `${sourceSnapshot.revisionId}:retained:1`;
    const packet = encodeBimRetainedOverlayPacket({
      deltaId: "delta:retained-viewer-core:1",
      sourceId: sourceSnapshot.sourceId,
      layerId: sourceSnapshot.layerId,
      fromRevisionId: sourceSnapshot.revisionId,
      toRevisionId,
      sequence: 1,
      entries: [{
        operationId: "operation:retained-viewer-core:1",
        kind: "upsert",
        aspect: "geometry",
        renderId: entity.renderId,
        pickId: `${entity.pickId}:retained:1`,
        nativeId: entity.nativeId ?? entity.globalId,
        externalIdentityToken: entity.externalIdentityToken,
        bounds,
        transform: IDENTITY,
        color: [0.18, 0.48, 0.92, 1],
        visible: true,
        geometry: geometry(bounds),
      }],
    });
    const digest = await sha256BimRetainedOverlayPacket(packet);
    const first = deltaDescriptor({
      bounds,
      digest,
      entity,
      fromRevisionId: sourceSnapshot.revisionId,
      layerId: sourceSnapshot.layerId,
      packet,
      sequence: 1,
      sessionId,
      snapshotId,
      sourceId: sourceSnapshot.sourceId,
      suffix: "1",
      toRevisionId,
    });
    let cancelNextRead = true;
    let payloadReads = 0;
    let prepareCalls = 0;
    let payloadPacket = packet;
    let commitReceipt = null;
    let preparedReceipt = null;
    let readStartedResolve;
    let readStarted = new Promise((resolve) => {
      readStartedResolve = resolve;
    });
    const surfaceAdapter = surface.createRetainedOverlayAdapter({
      federationSourceId: "source-slot:retained-viewer-core",
      async readPayload(_descriptor, { signal } = {}) {
        payloadReads += 1;
        if (cancelNextRead) {
          cancelNextRead = false;
          readStartedResolve();
          await new Promise((resolve, reject) => {
            const abort = () => reject(
              signal?.reason ??
                new DOMException("payload read aborted", "AbortError"),
            );
            if (signal?.aborted) {
              abort();
              return;
            }
            signal?.addEventListener("abort", abort, { once: true });
          });
        }
        return payloadPacket;
      },
    });
    const adapter = Object.freeze({
      async prepareDelta(delta, options) {
        prepareCalls += 1;
        const transaction = await surfaceAdapter.prepareDelta(
          delta,
          options,
        );
        preparedReceipt = transaction.receipt;
        return Object.freeze({
          commit() {
            commitReceipt = transaction.commit();
            return commitReceipt;
          },
          rollback: () => transaction.rollback(),
          dispose: () => transaction.dispose(),
        });
      },
      dispose: () => surfaceAdapter.dispose(),
    });
    const sourceSession = Object.freeze({
      descriptor: Object.freeze({
        protocolVersion: "0.1.0",
        sessionId,
        sourceId: sourceSnapshot.sourceId,
        currentRevisionId: sourceSnapshot.revisionId,
        lastSuccessfulRevisionId: sourceSnapshot.revisionId,
        capabilities: Object.freeze([
          "layer-manifest",
          "render-snapshot",
          "render-delta",
        ]),
        resourceBudgetBytes: 16 * 1024 * 1024,
      }),
    });
    const viewerSnapshot = Object.freeze({
      protocolVersion: "0.1.0",
      sessionId,
      sourceId: sourceSnapshot.sourceId,
      revisionId: sourceSnapshot.revisionId,
      snapshotId,
      sequence: 0,
      layers: Object.freeze([{
        layerId: sourceSnapshot.layerId,
        sourceId: sourceSnapshot.sourceId,
        revisionId: sourceSnapshot.revisionId,
        kind: "live",
        representation: "3d",
        order: 0,
        visible: true,
      }]),
    });
    controller = new viewerCore.ViewerRenderDeltaController({
      adapter,
      snapshot: viewerSnapshot,
      sourceSession,
    });
    const nativeReadsBefore = source.state.rangeReads;
    const baselineBackendBytes = backend.state.activeBytes;
    const cancellation = new AbortController();
    const cancelled = controller.applyCommittedAsync(first, {
      signal: cancellation.signal,
    });
    await readStarted;
    cancellation.abort(new DOMException(
      "qualification cancellation",
      "AbortError",
    ));
    await assert.rejects(cancelled, { name: "AbortError" });
    const cancelledSurfaceUnchanged =
      controller.revisionId === sourceSnapshot.revisionId &&
      surface.state.retainedOverlays[0].revisionId ===
        sourceSnapshot.revisionId &&
      backend.state.retainedObjects === 0 &&
      backend.state.activeBytes === baselineBackendBytes;

    const applyStarted = performance.now();
    const applied = await controller.applyCommittedAsync(first);
    const applyMs = performance.now() - applyStarted;
    const controllerRevisionMatchesSurface =
      applied.revisionId === toRevisionId &&
      controller.revisionId === toRevisionId &&
      surface.state.retainedOverlays[0].revisionId === toRevisionId;
    const committedPrepareCalls = prepareCalls;
    await assert.rejects(
      async () => await controller.applyCommittedAsync(first),
      (error) =>
        error?.code === "VIEWER_RENDER_STALE_REVISION" ||
        /expected revision|stale/u.test(error?.message ?? ""),
    );
    const staleRejectedBeforePrepare =
      prepareCalls === committedPrepareCalls;

    const invalidToRevisionId = `${toRevisionId}:invalid-digest`;
    const invalidPacket = encodeBimRetainedOverlayPacket({
      deltaId: "delta:retained-viewer-core:invalid-digest",
      sourceId: sourceSnapshot.sourceId,
      layerId: sourceSnapshot.layerId,
      fromRevisionId: toRevisionId,
      toRevisionId: invalidToRevisionId,
      sequence: 2,
      entries: [{
        operationId:
          "operation:retained-viewer-core:invalid-digest",
        kind: "upsert",
        aspect: "geometry",
        renderId: entity.renderId,
        pickId: `${entity.pickId}:retained:invalid-digest`,
        nativeId: entity.nativeId ?? entity.globalId,
        externalIdentityToken: entity.externalIdentityToken,
        bounds,
        transform: IDENTITY,
        color: [0.92, 0.24, 0.18, 1],
        visible: true,
        geometry: geometry(bounds),
      }],
    });
    payloadPacket = invalidPacket;
    const invalidDigest = deltaDescriptor({
      bounds,
      digest: "0".repeat(64),
      entity,
      fromRevisionId: toRevisionId,
      layerId: sourceSnapshot.layerId,
      packet: invalidPacket,
      sequence: 2,
      sessionId,
      snapshotId,
      sourceId: sourceSnapshot.sourceId,
      suffix: "invalid-digest",
      toRevisionId: invalidToRevisionId,
    });
    await assert.rejects(
      async () => await controller.applyCommittedAsync(invalidDigest),
      /digest|SHA-256|payload identity|delta ID|revision/u,
    );
    const digestRejectedSurfaceUnchanged =
      controller.revisionId === toRevisionId &&
      surface.state.retainedOverlays[0].revisionId === toRevisionId &&
      backend.state.retainedObjects === 1;

    const tombstoneRevisionId = `${toRevisionId}:tombstone`;
    const tombstone = deltaDescriptor({
      bounds,
      digest,
      entity,
      fromRevisionId: toRevisionId,
      kind: "tombstone",
      layerId: sourceSnapshot.layerId,
      packet,
      sequence: 2,
      sessionId,
      snapshotId,
      sourceId: sourceSnapshot.sourceId,
      suffix: "tombstone",
      toRevisionId: tombstoneRevisionId,
    });
    await controller.applyCommittedAsync(tombstone);
    const tombstoneApplied =
      controller.revisionId === tombstoneRevisionId &&
      surface.state.retainedOverlays[0].revisionId ===
        tombstoneRevisionId &&
      backend.state.retainedObjects === 0 &&
      backend.state.activeBytes === baselineBackendBytes;
    const activeBytesAfterTombstone = backend.state.activeBytes;
    const checkpoint = surface.checkpointRetainedOverlay({
      federationSourceId: "source-slot:retained-viewer-core",
      checkpointId: "checkpoint:retained-viewer-core:1",
      expectedRevisionId: tombstoneRevisionId,
    });
    const nativeReadsAfter = source.state.rangeReads;
    const controllerDisposed = await controller.disposeAsync();
    const surfaceCleanup = await surface.dispose({
      reason: "retained-viewer-core-qualified",
    });
    surfaceDisposed = true;
    const siblingAfter = siblingState(viewerRoot);
    const siblingWorkingTreeUnchanged =
      siblingBefore.workingTreeEntries ===
        siblingAfter.workingTreeEntries &&
      siblingBefore.workingTreeFingerprint ===
        siblingAfter.workingTreeFingerprint;
    const siblingHeadUnchanged =
      siblingBefore.branch === siblingAfter.branch &&
      siblingBefore.head === siblingAfter.head;
    const report = Object.freeze({
      schema: SCHEMA,
      status: "passed-viewer-core-source-0.1.3",
      asOf: "2026-08-15",
      capturedAt: new Date().toISOString(),
      viewerCore: Object.freeze({
        version: viewerCore.ViewerCoreVersion,
        sourceCommit: siblingBefore.head,
        branch: siblingBefore.branch,
        sourceCommitQualified: true,
        publishedArtifactQualified: false,
        protocolVersion: "0.1.0",
      }),
      transaction: Object.freeze({
        applyMs,
        atomic:
          commitReceipt?.renderer?.backend
            ?.geometryPickRevisionAtomic === true,
        stagedFramebufferPreserved:
          preparedReceipt?.renderer?.backend
            ?.currentFramebufferPreserved === true,
        stagedPickMapPreserved:
          preparedReceipt?.renderer?.backend
            ?.currentPickMapPreserved === true,
        controllerRevisionMatchesSurface,
        cancelledSurfaceUnchanged,
        staleRejectedBeforePrepare,
        digestRejectedSurfaceUnchanged,
        tombstoneApplied,
        payloadReads,
        prepareCalls,
      }),
      preservation: Object.freeze({
        nativeReadsBefore,
        nativeReadsAfter,
        externalReadsUnchanged: nativeReadsBefore === nativeReadsAfter,
        checkpointReads: checkpoint.externalSourceRangeReads,
        checkpointParses: checkpoint.externalSourceParses,
        checkpointUploads: checkpoint.externalSourceRangeUploads,
        baseGpuAllocationPreserved:
          baselineBackendBytes === activeBytesAfterTombstone,
      }),
      cleanup: Object.freeze({
        controllerDisposed,
        surfaceDisposed: surfaceCleanup.status === "disposed",
        backendDisposed: backend.state.disposed,
        backendActiveBytes: backend.state.activeBytes,
        retainedObjects: backend.state.retainedObjects,
      }),
      sibling: Object.freeze({
        branchBefore: siblingBefore.branch,
        branchAfter: siblingAfter.branch,
        workingTreeEntriesBefore: siblingBefore.workingTreeEntries,
        workingTreeEntriesAfter: siblingAfter.workingTreeEntries,
        headBefore: siblingBefore.head,
        headAfter: siblingAfter.head,
        headUnchanged: siblingHeadUnchanged,
        workingTreeUnchanged: siblingWorkingTreeUnchanged,
        relevantSourceMatchesHead:
          siblingBefore.relevantSourceMatchesHead &&
          siblingAfter.relevantSourceMatchesHead,
      }),
      assertions: Object.freeze({
        upstreamSourceCommitExact: true,
        stagedAdapterContractAccepted: true,
        synchronousAtomicCommitObserved: true,
        cancellationPreservedCurrentSurface: true,
        staleOrderingRejectedBeforeAdapter: true,
        digestFailurePreservedCurrentSurface: true,
        tombstoneAndCheckpointQualified: true,
        checkpointAvoidedSourceParse: true,
        nativeSourceNotReread: true,
        resourcesDisposed: true,
        siblingRepositoryUntouched:
          siblingHeadUnchanged && siblingWorkingTreeUnchanged,
        publishedArtifactNotClaimed: true,
      }),
    });
    if (!validateRetainedOverlayViewerCoreQualification(report)) {
      throw new Error("retained overlay Viewer Core qualification failed");
    }
    return report;
  } finally {
    if (controller !== null && !controller.disposed) {
      await controller.disposeAsync();
    }
    if (!surfaceDisposed && surface.state.lifecycle === "ready") {
      await surface.dispose({ reason: "retained-viewer-core-cleanup" });
    }
    await session.dispose();
    await source.dispose();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = await qualifyRetainedOverlayViewerCore({
    viewerRoot: options.viewerRoot,
  });
  if (options.output !== null) {
    await mkdir(path.dirname(options.output), { recursive: true });
    await writeFile(
      options.output,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
