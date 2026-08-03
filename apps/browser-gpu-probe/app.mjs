import {
  createBounded3dRenderer,
  createFitCamera3d,
  createWebGl2Backend,
  orbitCamera3d,
  panCamera3d,
  zoomCamera3d,
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
  view: document.querySelector("#view"),
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
  elements.view.textContent =
    `${report.viewSequence.length + 1} frames · ` +
    `${report.viewSequence[1].visibility.hiddenInstances} hidden`;
  elements.lifecycle.textContent =
    `${report.cleanup.releasedBytes} bytes released · ` +
    `active ${report.cleanup.backendState.activeBytes}`;
  elements.receipt.textContent = JSON.stringify(report, null, 2);
  elements.status.dataset.state = "passed";
  elements.status.textContent =
    "Passed: WebGL2 view sequence disposed";
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

async function pickVisibleInstance(renderer) {
  const coordinates = [
    [480, 270],
    [480, 180],
    [480, 360],
    [320, 270],
    [640, 270],
    [320, 180],
    [640, 180],
    [320, 360],
    [640, 360],
  ];
  const attempts = [];
  for (const [x, y] of coordinates) {
    const receipt = await renderer.pick({ x, y });
    attempts.push(receipt);
    if (receipt.status === "hit") {
      return Object.freeze({
        attempts: Object.freeze(attempts),
        receipt,
      });
    }
  }
  throw new Error("Browser GPU probe could not pick visible geometry");
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
  let secondarySession;
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
    const viewStarted = performance.now();
    const orbited = orbitCamera3d(receipt.backend.camera, {
      pitch: 0.08,
      yaw: 0.28,
    });
    const movedCamera = panCamera3d(
      zoomCamera3d(orbited, 0.82),
      {
        right: 0.015,
        up: 0.01,
      },
    );
    const movedView = await renderer.renderView({
      camera: movedCamera,
    });
    const hiddenRenderIds = input.snapshot.entities
      .slice(0, 64)
      .map((entity) => entity.renderId);
    const hiddenView = await renderer.renderView({
      camera: movedCamera,
      hiddenRenderIds,
    });
    const fittedView = await renderer.renderView({
      camera: createFitCamera3d(
        input.snapshot.geometry.bounds,
        {
          aspect: 16 / 9,
          projection: "orthographic",
        },
      ),
    });
    const picking = await pickVisibleInstance(renderer);
    const selectedView = await renderer.renderView({
      camera: fittedView.camera,
      selectedPickIds: [picking.receipt.identity.pickId],
    });
    const viewMs = performance.now() - viewStarted;
    const viewSequence = [
      movedView,
      hiddenView,
      fittedView,
      selectedView,
    ];
    const rendererStateAfterViews = renderer.state;
    const backendStateAfterViews = backend.state;
    const contextLoss = await backend.qualifyContextLoss(
      backend.state.activeHandleId,
    );
    const backendStateAfterContextRestore = backend.state;
    let invalidatedRenderRejected = false;
    try {
      await renderer.renderView({
        camera: selectedView.camera,
      });
    } catch (error) {
      invalidatedRenderRejected =
        error?.name === "InvalidStateError";
    }
    const recoveryReceipt = await renderer.mount({
      session,
      snapshot: input.snapshot,
    });
    const sourceStateAfterRecovery = session.state;
    const rendererStateAfterRecovery = renderer.state;
    const backendStateAfterRecovery = backend.state;
    const secondaryInput = await json(
      "/secondary-probe-input.json",
    );
    secondarySession = new BrowserGeometryRangeSession(
      secondaryInput.snapshot,
      {
        rangeRoute: "/secondary-range",
      },
    );
    const sourceSwitchReceipt = await renderer.mount({
      session: secondarySession,
      snapshot: secondaryInput.snapshot,
    });
    const rendererStateAfterSourceSwitch = renderer.state;
    const backendStateAfterSourceSwitch = backend.state;
    const serverRangeState = await json("/range-state.json");
    releaseReceipt = await renderer.unmount();
    const rendererDisposed = await renderer.dispose();
    const sessionDisposed = await session.dispose();
    const secondarySessionDisposed =
      await secondarySession.dispose();
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
        rendererStateAfterViews,
        backendStateAfterViews,
        contextLoss,
        backendStateAfterContextRestore,
        invalidatedRenderRejected,
        recoveryReceipt,
        sourceStateAfterRecovery,
        rendererStateAfterRecovery,
        backendStateAfterRecovery,
        sourceSwitch: {
          fixture: secondaryInput.fixture,
          source: {
            fingerprint:
              secondaryInput.snapshot.source.fingerprint,
            revisionId: secondaryInput.snapshot.revisionId,
          },
          receipt: sourceSwitchReceipt,
          sourceState: secondarySession.state,
          rendererState: rendererStateAfterSourceSwitch,
          backendState: backendStateAfterSourceSwitch,
        },
        releaseReceipt,
      },
      viewSequence,
      picking,
      performance: {
        mountMs,
        viewMs,
        totalMs: performance.now() - started,
      },
      environment: {
        userAgent: navigator.userAgent,
        crossOriginIsolated: globalThis.crossOriginIsolated,
      },
      cleanup: {
        rendererDisposed,
        sessionDisposed,
        secondarySessionDisposed,
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
      movedView.viewRevision !== 1 ||
      movedView.backend.rendered !== true ||
      hiddenView.viewRevision !== 2 ||
      hiddenView.visibility.hiddenRenderIds.length !== 64 ||
      hiddenView.visibility.hiddenInstances < 64 ||
      hiddenView.visibility.visibleInstances >=
        receipt.metrics.instances ||
      fittedView.viewRevision !== 3 ||
      fittedView.camera.projection !== "orthographic" ||
      fittedView.visibility.hiddenInstances !== 0 ||
      picking.receipt.status !== "hit" ||
      picking.receipt.source.revisionId !==
        input.snapshot.revisionId ||
      picking.receipt.source.fingerprint !==
        input.snapshot.source.fingerprint ||
      picking.receipt.backend.actualGpu !== true ||
      picking.receipt.backend.temporaryReleased !== true ||
      picking.receipt.backend.temporaryTargetBytes !==
        960 * 540 * 6 ||
      selectedView.viewRevision !== 4 ||
      selectedView.selection.selectedPickIds.length !== 1 ||
      selectedView.selection.selectedInstances < 1 ||
      selectedView.selection.highlightedInstances < 1 ||
      selectedView.backend.highlightPixels < 1 ||
      rendererStateAfterViews.picks !==
        picking.attempts.length ||
      rendererStateAfterViews.viewUpdates !== 4 ||
      backendStateAfterViews.frames !== 5 ||
      backendStateAfterViews.picks !== picking.attempts.length ||
      backendStateAfterViews.hiddenRenderIds !== 0 ||
      backendStateAfterViews.selectedPickIds !== 1 ||
      contextLoss.contextLostObserved !== true ||
      contextLoss.contextRestoredObserved !== true ||
      contextLoss.invalidatedBytes !==
        receipt.backend.uploadedBytes ||
      contextLoss.priorGeneration !== 1 ||
      contextLoss.restoredGeneration !== 2 ||
      !Array.isArray(contextLoss.clearedErrors) ||
      contextLoss.glError !== 0 ||
      backendStateAfterContextRestore.contextInvalidated !==
        true ||
      invalidatedRenderRejected !== true ||
      recoveryReceipt.source.fingerprint !==
        receipt.source.fingerprint ||
      recoveryReceipt.backend.uploadedBytes !==
        receipt.backend.uploadedBytes ||
      rendererStateAfterRecovery.mounts !== 2 ||
      rendererStateAfterRecovery.unmounts !== 1 ||
      backendStateAfterRecovery.mounts !== 2 ||
      backendStateAfterRecovery.unmounts !== 1 ||
      backendStateAfterRecovery.contextInvalidated !== false ||
      backendStateAfterRecovery.activeBytes !==
        receipt.backend.uploadedBytes ||
      sourceStateAfterRecovery.rangeReads !== 8 ||
      sourceStateAfterRecovery.rangeBytes !==
        receipt.metrics.sourceReadBytes * 2 ||
      sourceSwitchReceipt.source.fingerprint ===
        receipt.source.fingerprint ||
      sourceSwitchReceipt.source.revisionId ===
        receipt.source.revisionId ||
      sourceSwitchReceipt.backend.uploadedBytes !== 1_120 ||
      rendererStateAfterSourceSwitch.mounts !== 3 ||
      rendererStateAfterSourceSwitch.unmounts !== 2 ||
      rendererStateAfterSourceSwitch.activeBackendBytes !== 1_120 ||
      backendStateAfterSourceSwitch.mounts !== 3 ||
      backendStateAfterSourceSwitch.unmounts !== 2 ||
      backendStateAfterSourceSwitch.activeBytes !== 1_120 ||
      backendStateAfterSourceSwitch.releasedBytes !==
        receipt.backend.uploadedBytes * 2 ||
      releaseReceipt.releasedBytes !== 1_120 ||
      backend.state.activeBytes !== 0 ||
      backend.state.disposed !== true ||
      backend.state.mounts !== 3 ||
      backend.state.unmounts !== 3 ||
      backend.state.contextLosses !== 1 ||
      backend.state.releasedBytes !==
        receipt.backend.uploadedBytes * 2 + 1_120 ||
      session.state.disposed !== true ||
      secondarySession.state.disposed !== true
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
    let secondarySessionDisposed = false;
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
    try {
      secondarySessionDisposed =
        secondarySession === undefined
          ? false
          : await secondarySession.dispose();
    } catch {
      secondarySessionDisposed = false;
    }
    showFailure(error, {
      rendererDisposed,
      sessionDisposed,
      secondarySessionDisposed,
      releaseReceipt: releaseReceipt ?? null,
      backendState: backend?.state ?? null,
    });
  }
}

void run();
