import {
  createBounded3dRenderer,
  createWebGl2Backend,
} from "./bim-renderer-3d.mjs";
import {
  BrowserGeometryRangeSession,
} from "./source-session.mjs";

const canvas = document.querySelector("#model-canvas");
const receiptElement = document.querySelector("#receipt");
const statusElement = document.querySelector("#status");

async function json(route) {
  const response = await fetch(route, {
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(
      `federation Browser resource ${route} is unavailable`,
    );
  }
  return await response.json();
}

function publish(report) {
  globalThis.__bimFederationBrowserProbeReport =
    Object.freeze(report);
  receiptElement.textContent = JSON.stringify(report, null, 2);
  statusElement.textContent = report.status === "passed"
    ? "Passed: federated WebGL2 resources released"
    : report.status === "running"
      ? "Rendering product-scale federation…"
      : `Failed: ${report.error?.message ?? "unknown error"}`;
}

function sourceProjection(snapshot) {
  return snapshot.federation.sourceSlots.map((slot) => {
    const entities = snapshot.entities.filter((entity) =>
      entity.federationSourceId === slot.federationSourceId);
    return {
      federationSourceId: slot.federationSourceId,
      format: slot.format,
      sourceRevisionId: slot.sourceRevisionId,
      entities: entities.length,
      instances: entities.reduce(
        (sum, entity) => sum + entity.primitives.length,
        0,
      ),
    };
  });
}

async function run() {
  publish({
    schema: "bim-explorer-federation-browser-webgl2-report/1",
    status: "running",
  });
  let backend = null;
  let renderer = null;
  let session = null;
  try {
    const input = await json("/probe-input.json");
    if (
      input.schema !==
        "bim-explorer-federation-browser-probe-input/1" ||
      input.snapshot?.federation?.sourceIdentityMerged !== false ||
      input.snapshot?.source?.format !== "federated"
    ) {
      throw new Error(
        "federation Browser input schema is invalid",
      );
    }
    const expected = input.qualification.expected;
    session = new BrowserGeometryRangeSession(input.snapshot);
    backend = createWebGl2Backend({
      canvas,
      width: 640,
      height: 480,
    });
    renderer = createBounded3dRenderer({
      backend,
      limits: input.qualification.rendererLimits,
    });
    const mount = await renderer.mount({
      session,
      snapshot: input.snapshot,
    });
    const selected = await renderer.renderView({
      camera: mount.backend.camera,
      selectedPickIds: [input.qualification.selectedPickId],
    });
    const rangeState = await json("/range-state.json");
    const sessionState = session.state;
    const release = await renderer.unmount();
    const rendererDisposed = await renderer.dispose();
    const sessionDisposed = await session.dispose();
    const sourceSlots = sourceProjection(input.snapshot);
    const duplicateGlobalIds = input.snapshot.entities
      .filter((entity) => entity.globalId !== null)
      .reduce((counts, entity) => {
        counts.set(
          entity.globalId,
          (counts.get(entity.globalId) ?? 0) + 1,
        );
        return counts;
      }, new Map());
    const report = {
      schema: "bim-explorer-federation-browser-webgl2-report/1",
      status: "passed",
      fixture: input.fixture,
      federation: {
        federationId:
          input.snapshot.federation.federationId,
        sourceSlots,
        sourceIdentityMerged: false,
        distinctCompositeNativeIds: new Set(
          input.snapshot.entities.map((entity) => entity.nativeId),
        ).size,
        largestDuplicateGlobalIdOccurrences: Math.max(
          0,
          ...duplicateGlobalIds.values(),
        ),
      },
      renderer: {
        backend: mount.backend.backendId,
        actualGpu: mount.backend.actualGpu,
        rendered: mount.backend.rendered,
        glError: mount.backend.glError,
        nonBackgroundPixels:
          mount.backend.nonBackgroundPixels,
        selectedInstances:
          selected.selection.selectedInstances,
        highlightedInstances:
          selected.selection.highlightedInstances,
        highlightPixels: selected.backend.highlightPixels,
        sourceReadBytes: mount.metrics.sourceReadBytes,
        sourceReads: mount.metrics.sourceReads,
        geometryPayloadBytes:
          mount.metrics.geometryPayloadBytes,
        geometryRecords: mount.metrics.geometryRecords,
        uniqueTriangles: mount.metrics.uniqueTriangles,
        instances: mount.metrics.instances,
        instancedTriangles:
          mount.metrics.instancedTriangles,
        drawCalls: mount.metrics.drawCalls,
        cpuStagingBytes: mount.metrics.cpuStagingBytes,
        uploadedBytes: mount.backend.uploadedBytes,
      },
      range: {
        clientReads: sessionState.rangeReads,
        clientBytes: sessionState.rangeBytes,
        serverRequests: rangeState.rangeRequests,
        serverBytes: rangeState.rangeBytes,
      },
      cleanup: {
        releasedBytes: release.releasedBytes,
        rendererDisposed,
        sessionDisposed,
        backendDisposed: backend.state.disposed,
        activeBackendBytes: backend.state.activeBytes,
        residentRanges: backend.state.residentRanges,
      },
    };
    if (
      JSON.stringify(report.federation.sourceSlots) !==
        JSON.stringify(expected.sourceSlots) ||
      report.federation.distinctCompositeNativeIds !==
        expected.entities ||
      report.federation
        .largestDuplicateGlobalIdOccurrences !== 2 ||
      report.renderer.backend !== "webgl2" ||
      report.renderer.actualGpu !== true ||
      report.renderer.rendered !== true ||
      report.renderer.glError !== 0 ||
      report.renderer.nonBackgroundPixels <= 0 ||
      report.renderer.selectedInstances !== 1 ||
      report.renderer.highlightedInstances !== 1 ||
      report.renderer.highlightPixels <= 0 ||
      [
        "sourceReadBytes",
        "sourceReads",
        "geometryPayloadBytes",
        "geometryRecords",
        "uniqueTriangles",
        "instances",
        "instancedTriangles",
        "drawCalls",
        "cpuStagingBytes",
        "uploadedBytes",
      ].some((field) =>
        report.renderer[field] !== expected[field]) ||
      report.range.clientReads !== expected.sourceReads ||
      report.range.clientBytes !== expected.sourceReadBytes ||
      report.range.serverRequests !== expected.sourceReads ||
      report.range.serverBytes !== expected.sourceReadBytes ||
      report.cleanup.releasedBytes !== expected.uploadedBytes ||
      report.cleanup.rendererDisposed !== true ||
      report.cleanup.sessionDisposed !== true ||
      report.cleanup.backendDisposed !== true ||
      report.cleanup.activeBackendBytes !== 0 ||
      report.cleanup.residentRanges !== 0
    ) {
      throw new Error(
        "federation Browser WebGL2 receipt is invalid",
      );
    }
    publish(report);
  } catch (error) {
    try {
      if (renderer !== null && renderer.state.disposed !== true) {
        await renderer.dispose();
      }
      if (session !== null && session.state.disposed !== true) {
        await session.dispose();
      }
    } catch {
      // The original failure remains authoritative.
    }
    publish({
      schema: "bim-explorer-federation-browser-webgl2-report/1",
      status: "failed",
      error: {
        name: error?.name ?? "Error",
        message:
          error?.message ?? "federation Browser probe failed",
      },
      cleanup: {
        rendererDisposed:
          renderer?.state.disposed ?? false,
        sessionDisposed:
          session?.state.disposed ?? false,
        backendDisposed:
          backend?.state.disposed ?? false,
        activeBackendBytes:
          backend?.state.activeBytes ?? 0,
      },
    });
  }
}

await run();
