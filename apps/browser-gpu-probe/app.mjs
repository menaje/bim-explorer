import {
  createBounded3dRenderer,
  createWebGl2Backend,
} from "./bim-renderer-3d.mjs";
import {
  BrowserGeometryRangeSession,
} from "./source-session.mjs";

const elements = {
  canvas: document.querySelector("#model-canvas"),
  fixture: document.querySelector("#fixture"),
  frame: document.querySelector("#frame"),
  lifecycle: document.querySelector("#lifecycle"),
  ranges: document.querySelector("#ranges"),
  receipt: document.querySelector("#receipt"),
  status: document.querySelector("#status"),
  upload: document.querySelector("#upload"),
};

async function json(route) {
  const response = await fetch(route, {
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`probe resource ${route} is unavailable`);
  }
  return await response.json();
}

function showReport(report) {
  const receipt = report.renderer.receipt;
  elements.fixture.textContent =
    `${report.fixture.id} · ${report.fixture.byteLength} bytes`;
  elements.ranges.textContent =
    `${receipt.metrics.sourceReads} reads · ` +
    `${receipt.metrics.sourceReadBytes} bytes`;
  elements.upload.textContent =
    `${receipt.backend.uploadedBytes} bytes · ` +
    `${receipt.backend.drawCalls} draws`;
  elements.frame.textContent =
    `${receipt.backend.nonBackgroundPixels} pixels · ` +
    `${receipt.backend.firstFrameMs.toFixed(1)} ms`;
  elements.lifecycle.textContent =
    `${report.cleanup.releasedBytes} bytes released · ` +
    `active ${report.cleanup.backendState.activeBytes}`;
  elements.receipt.textContent = JSON.stringify(report, null, 2);
  elements.status.dataset.state = "passed";
  elements.status.textContent = "Passed: WebGL2 first frame disposed";
}

function showFailure(error, cleanup) {
  const report = {
    schema: "bim-explorer-browser-webgl2-report/1",
    status: "failed",
    error: {
      name: error?.name ?? "Error",
      message: error?.message ?? "Browser GPU probe failed",
    },
    cleanup,
  };
  globalThis.__bimGpuProbeReport = report;
  elements.receipt.textContent = JSON.stringify(report, null, 2);
  elements.status.dataset.state = "failed";
  elements.status.textContent = "Failed: Browser GPU probe";
}

async function run() {
  elements.status.dataset.state = "running";
  elements.status.textContent = "Preparing bounded WebGL2 frame…";
  globalThis.__bimGpuProbeReport = Object.freeze({
    schema: "bim-explorer-browser-webgl2-report/1",
    status: "running",
  });
  const started = performance.now();
  let backend;
  let renderer;
  let session;
  let releaseReceipt;
  try {
    const input = await json("/probe-input.json");
    if (
      input.schema !== "bim-explorer-browser-gpu-probe-input/1"
    ) {
      throw new Error("Browser GPU probe input schema is invalid");
    }
    session = new BrowserGeometryRangeSession(input.snapshot);
    backend = createWebGl2Backend({
      canvas: elements.canvas,
      height: 540,
      width: 960,
    });
    renderer = createBounded3dRenderer({ backend });
    const mountStarted = performance.now();
    const receipt = await renderer.mount({
      session,
      snapshot: input.snapshot,
    });
    const mountMs = performance.now() - mountStarted;
    const rendererStateAfterMount = renderer.state;
    const backendStateAfterMount = backend.state;
    const sourceStateAfterMount = session.state;
    const serverRangeState = await json("/range-state.json");
    releaseReceipt = await renderer.unmount();
    const rendererDisposed = await renderer.dispose();
    const sessionDisposed = await session.dispose();
    const report = {
      schema: "bim-explorer-browser-webgl2-report/1",
      status: "passed",
      fixture: input.fixture,
      provenance: input.provenance,
      acquisition: input.acquisition,
      source: {
        fingerprint: input.snapshot.source.fingerprint,
        revisionId: input.snapshot.revisionId,
        projectedEntities: input.snapshot.entities.length,
        bounds: input.snapshot.geometry.bounds,
        firstFrameRangeIds:
          input.snapshot.loadPlan.firstFrameRangeIds,
        deferredRangeIds:
          input.snapshot.loadPlan.deferredRangeIds,
      },
      renderer: {
        backend: "webgl2",
        gpuApi: true,
        physicalGpuClaimed: false,
        limits: renderer.limits,
        receipt,
        sourceStateAfterMount,
        serverRangeState,
        rendererStateAfterMount,
        backendStateAfterMount,
        releaseReceipt,
      },
      performance: {
        mountMs,
        totalMs: performance.now() - started,
      },
      environment: {
        userAgent: navigator.userAgent,
        crossOriginIsolated: globalThis.crossOriginIsolated,
      },
      cleanup: {
        rendererDisposed,
        sessionDisposed,
        releasedBytes: releaseReceipt.releasedBytes,
        backendState: backend.state,
      },
      diagnostics: [],
    };
    if (
      receipt.backend.actualGpu !== true ||
      receipt.backend.rendered !== true ||
      receipt.backend.glError !== 0 ||
      receipt.backend.nonBackgroundPixels <= 0 ||
      receipt.backend.uploadedBytes !==
        releaseReceipt.releasedBytes ||
      backend.state.activeBytes !== 0 ||
      backend.state.disposed !== true ||
      session.state.disposed !== true
    ) {
      throw new Error(
        "Browser GPU probe lifecycle assertion failed",
      );
    }
    globalThis.__bimGpuProbeReport = Object.freeze(report);
    showReport(report);
  } catch (error) {
    let rendererDisposed = false;
    let sessionDisposed = false;
    try {
      rendererDisposed = renderer === undefined
        ? false
        : await renderer.dispose();
    } catch {
      rendererDisposed = false;
    }
    try {
      sessionDisposed = session === undefined
        ? false
        : await session.dispose();
    } catch {
      sessionDisposed = false;
    }
    showFailure(error, {
      rendererDisposed,
      sessionDisposed,
      releaseReceipt: releaseReceipt ?? null,
      backendState: backend?.state ?? null,
    });
  }
}

void run();
