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
    throw new Error(`glTF Browser resource ${route} is unavailable`);
  }
  return await response.json();
}

function publish(report) {
  globalThis.__gltfBrowserProbeReport = Object.freeze(report);
  receiptElement.textContent = JSON.stringify(report, null, 2);
  statusElement.textContent = report.status === "passed"
    ? "Passed: glTF WebGL2 resources released"
    : `Failed: ${report.error?.message ?? "unknown error"}`;
}

async function run() {
  publish({
    schema: "bim-explorer-gltf-browser-webgl2-report/1",
    status: "running",
  });
  let backend = null;
  let renderer = null;
  let session = null;
  try {
    const input = await json("/probe-input.json");
    if (
      input.schema !==
        "bim-explorer-gltf-browser-probe-input/1"
    ) {
      throw new Error("glTF Browser input schema is invalid");
    }
    session = new BrowserGeometryRangeSession(input.snapshot);
    backend = createWebGl2Backend({
      canvas,
      width: 640,
      height: 480,
    });
    renderer = createBounded3dRenderer({ backend });
    const mount = await renderer.mount({
      session,
      snapshot: input.snapshot,
    });
    const pick = await renderer.pick({
      x: 320,
      y: 240,
    });
    if (pick.status !== "hit") {
      throw new Error("glTF Browser center pick missed");
    }
    const selected = await renderer.renderView({
      camera: mount.backend.camera,
      selectedPickIds: [pick.identity.pickId],
    });
    const rangeState = await json("/range-state.json");
    const sourceState = session.state;
    const release = await renderer.unmount();
    const rendererDisposed = await renderer.dispose();
    const sessionDisposed = await session.dispose();
    const entity = input.snapshot.entities[0];
    const report = {
      schema: "bim-explorer-gltf-browser-webgl2-report/1",
      status: "passed",
      fixture: input.fixture,
      source: {
        format: input.snapshot.source.format,
        fingerprint: input.snapshot.source.fingerprint,
        revisionId: input.snapshot.revisionId,
        sourceRole: input.snapshot.source.sourceRole,
        semanticAuthority:
          input.snapshot.source.semanticAuthority,
        bounds: input.snapshot.geometry.bounds,
      },
      identity: {
        nativeId: entity.nativeId,
        globalId: entity.globalId,
        pickedNativeId: pick.identity.nativeId,
        pickedGlobalId: pick.identity.globalId,
        renderId: pick.identity.renderId,
        pickId: pick.identity.pickId,
      },
      renderer: {
        backend: mount.backend.backendId,
        actualGpu: mount.backend.actualGpu,
        rendered: mount.backend.rendered,
        glError: mount.backend.glError,
        nonBackgroundPixels:
          mount.backend.nonBackgroundPixels,
        uploadedBytes: mount.backend.uploadedBytes,
        drawCalls: mount.backend.drawCalls,
        instances: mount.metrics.instances,
        triangles: mount.metrics.instancedTriangles,
        geometryRecords: mount.metrics.geometryRecords,
        sourceReadBytes: mount.metrics.sourceReadBytes,
        sourceReads: mount.metrics.sourceReads,
        selectedInstances:
          selected.selection.selectedInstances,
        highlightPixels: selected.backend.highlightPixels,
      },
      picking: {
        status: pick.status,
        actualGpu: pick.backend.actualGpu,
        temporaryTargetBytes:
          pick.backend.temporaryTargetBytes,
        temporaryReleased:
          pick.backend.temporaryReleased,
        worldPosition: pick.worldPosition,
      },
      range: {
        clientReads: sourceState.rangeReads,
        clientBytes: sourceState.rangeBytes,
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
      report.source.format !== "glb" ||
      report.source.semanticAuthority !== false ||
      report.identity.nativeId !==
        report.identity.pickedNativeId ||
      report.identity.globalId !== null ||
      report.identity.pickedGlobalId !== null ||
      report.renderer.backend !== "webgl2" ||
      report.renderer.actualGpu !== true ||
      report.renderer.rendered !== true ||
      report.renderer.glError !== 0 ||
      report.renderer.nonBackgroundPixels <= 0 ||
      report.renderer.uploadedBytes !== 800 ||
      report.renderer.drawCalls !== 1 ||
      report.renderer.instances !== 1 ||
      report.renderer.triangles !== 12 ||
      report.renderer.geometryRecords !== 1 ||
      report.renderer.sourceReadBytes !== 756 ||
      report.renderer.sourceReads !== 3 ||
      report.renderer.selectedInstances !== 1 ||
      report.renderer.highlightPixels <= 0 ||
      report.picking.actualGpu !== true ||
      report.picking.temporaryReleased !== true ||
      report.range.clientReads !== 3 ||
      report.range.clientBytes !== 756 ||
      report.range.serverRequests !== 3 ||
      report.range.serverBytes !== 756 ||
      report.cleanup.releasedBytes !== 800 ||
      report.cleanup.rendererDisposed !== true ||
      report.cleanup.sessionDisposed !== true ||
      report.cleanup.backendDisposed !== true ||
      report.cleanup.activeBackendBytes !== 0 ||
      report.cleanup.residentRanges !== 0
    ) {
      throw new Error("glTF Browser WebGL2 receipt is invalid");
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
      schema: "bim-explorer-gltf-browser-webgl2-report/1",
      status: "failed",
      error: {
        name: error?.name ?? "Error",
        message:
          error?.message ?? "glTF Browser probe failed",
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
