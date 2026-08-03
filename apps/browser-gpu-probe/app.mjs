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

async function measureVisibleSurface(renderer, seedPick) {
  const coordinates = [
    [460, 270],
    [480, 250],
    [500, 270],
    [480, 290],
    [440, 240],
    [520, 300],
  ];
  const picks = [seedPick];
  const attempts = [];
  for (const [x, y] of coordinates) {
    const receipt = await renderer.pick({ x, y });
    attempts.push(receipt);
    if (receipt.status !== "hit") {
      continue;
    }
    const distinct = picks.every((pick) =>
      Math.hypot(
        ...receipt.worldPosition.map(
          (value, axis) =>
            value - pick.worldPosition[axis],
        ),
      ) > 1e-4);
    if (distinct) {
      picks.push(receipt);
    }
    if (picks.length < 3) {
      continue;
    }
    try {
      return Object.freeze({
        attempts: Object.freeze(attempts),
        picks: Object.freeze(picks),
        distance: renderer.measure({
          type: "distance",
          picks: picks.slice(0, 2),
        }),
        angle: renderer.measure({
          type: "angle",
          picks: [picks[1], picks[0], picks[2]],
        }),
        area: renderer.measure({
          type: "area",
          picks: picks.slice(0, 3),
        }),
      });
    } catch (error) {
      if (error?.name !== "RangeError") {
        throw error;
      }
      picks.pop();
    }
  }
  throw new Error(
    "Browser GPU probe could not measure visible geometry",
  );
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
  let precisionBackend;
  let precisionRenderer;
  let precisionSession;
  let progressiveBackend;
  let progressiveRenderer;
  let progressiveSession;
  let releaseReceipt;
  let precisionReleaseReceipt;
  let progressiveReleaseReceipt;
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
    const measurement = await measureVisibleSurface(
      renderer,
      picking.receipt,
    );
    const bounds = input.snapshot.geometry.bounds;
    const center = bounds.min.map(
      (value, axis) => (value + bounds.max[axis]) / 2,
    );
    const clippedView = await renderer.renderView({
      camera: fittedView.camera,
      clippingPlanes: [{
        normal: [1, 0, 0],
        constant: -center[0],
      }],
    });
    const clippedPick = await renderer.pick({
      x: 480,
      y: 270,
    });
    const sectionBox = {
      min: bounds.min.map(
        (value, axis) =>
          value + (bounds.max[axis] - value) * 0.1,
      ),
      max: bounds.max.map(
        (value, axis) =>
          value - (value - bounds.min[axis]) * 0.1,
      ),
    };
    const sectionView = await renderer.renderView({
      camera: fittedView.camera,
      sectionBox,
    });
    const sectionPick = await renderer.pick({
      x: 480,
      y: 270,
    });
    const restoredView = await renderer.renderView({
      camera: fittedView.camera,
    });
    const viewMs = performance.now() - viewStarted;
    const viewSequence = [
      movedView,
      hiddenView,
      fittedView,
      selectedView,
      clippedView,
      sectionView,
      restoredView,
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
    const precisionInput = await json(
      "/precision-probe-input.json",
    );
    precisionSession = new BrowserGeometryRangeSession(
      precisionInput.snapshot,
      {
        rangeRoute: "/precision-range",
      },
    );
    precisionBackend = createWebGl2Backend({
      canvas: elements.canvas,
      height: 540,
      width: 960,
    });
    precisionRenderer = createBounded3dRenderer({
      backend: precisionBackend,
    });
    const precisionReceipt = await precisionRenderer.mount({
      session: precisionSession,
      snapshot: precisionInput.snapshot,
    });
    const precisionPicking = await pickVisibleInstance(
      precisionRenderer,
    );
    precisionReleaseReceipt =
      await precisionRenderer.unmount();
    const precisionRendererDisposed =
      await precisionRenderer.dispose();
    const precisionSessionDisposed =
      await precisionSession.dispose();
    const precision = {
      fixture: precisionInput.fixture,
      source: {
        fingerprint:
          precisionInput.snapshot.source.fingerprint,
        revisionId: precisionInput.snapshot.revisionId,
        bounds: precisionInput.snapshot.geometry.bounds,
      },
      receipt: precisionReceipt,
      picking: precisionPicking,
      cleanup: {
        releaseReceipt: precisionReleaseReceipt,
        rendererDisposed: precisionRendererDisposed,
        sessionDisposed: precisionSessionDisposed,
        backendState: precisionBackend.state,
      },
    };
    progressiveSession = new BrowserGeometryRangeSession(
      input.snapshot,
    );
    progressiveBackend = createWebGl2Backend({
      canvas: elements.canvas,
      height: 540,
      width: 960,
    });
    progressiveRenderer = createBounded3dRenderer({
      backend: progressiveBackend,
    });
    const progressiveMount =
      await progressiveRenderer.mount({
        session: progressiveSession,
        snapshot: input.snapshot,
      });
    const [
      firstDeferredRangeId,
      secondDeferredRangeId,
    ] = input.snapshot.loadPlan.deferredRangeIds;
    const firstRangeLoad =
      await progressiveRenderer.loadRange({
        rangeId: firstDeferredRangeId,
      });
    const sourceStateAfterFirstRange =
      progressiveSession.state;
    const firstRangeCacheHit =
      await progressiveRenderer.loadRange({
        rangeId: firstDeferredRangeId,
      });
    const sourceStateAfterCacheHit =
      progressiveSession.state;
    const secondRangeLoad =
      await progressiveRenderer.loadRange({
        rangeId: secondDeferredRangeId,
      });
    const rendererStateAfterAllRanges =
      progressiveRenderer.state;
    const backendStateAfterAllRanges =
      progressiveBackend.state;
    const firstRangeEviction =
      await progressiveRenderer.evictRange({
        rangeId: firstDeferredRangeId,
      });
    const rendererStateAfterEviction =
      progressiveRenderer.state;
    const backendStateAfterEviction =
      progressiveBackend.state;
    progressiveReleaseReceipt =
      await progressiveRenderer.unmount();
    const progressiveRendererDisposed =
      await progressiveRenderer.dispose();
    const progressiveSessionDisposed =
      await progressiveSession.dispose();
    const progressive = {
      source: {
        fingerprint: input.snapshot.source.fingerprint,
        revisionId: input.snapshot.revisionId,
      },
      mount: progressiveMount,
      firstRangeLoad,
      sourceStateAfterFirstRange,
      firstRangeCacheHit,
      sourceStateAfterCacheHit,
      secondRangeLoad,
      rendererStateAfterAllRanges,
      backendStateAfterAllRanges,
      firstRangeEviction,
      rendererStateAfterEviction,
      backendStateAfterEviction,
      cleanup: {
        releaseReceipt: progressiveReleaseReceipt,
        rendererDisposed: progressiveRendererDisposed,
        sessionDisposed: progressiveSessionDisposed,
        backendState: progressiveBackend.state,
      },
    };
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
      measurement,
      section: {
        clippingPlane: clippedView,
        clippedPick,
        sectionBox,
        sectionView,
        sectionPick,
        restoredView,
      },
      precision,
      progressive,
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
        precisionRendererDisposed,
        precisionSessionDisposed,
        progressiveRendererDisposed,
        progressiveSessionDisposed,
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
      measurement.picks.length < 3 ||
      measurement.distance.measurement.value <= 0 ||
      measurement.angle.measurement.radians <= 0 ||
      measurement.angle.measurement.radians >= Math.PI ||
      measurement.area.measurement.value <= 0 ||
      clippedView.viewRevision !== 5 ||
      clippedView.clipping.activePlanes !== 1 ||
      clippedView.backend.clippingPlanes !== 1 ||
      clippedView.backend.nonBackgroundPixels <= 0 ||
      clippedView.backend.nonBackgroundPixels >=
        fittedView.backend.nonBackgroundPixels ||
      (
        clippedPick.status === "hit" &&
        clippedPick.worldPosition[0] < center[0] - 1e-3
      ) ||
      sectionView.viewRevision !== 6 ||
      sectionView.clipping.activePlanes !== 6 ||
      sectionView.backend.clippingPlanes !== 6 ||
      sectionView.backend.nonBackgroundPixels <= 0 ||
      sectionView.backend.nonBackgroundPixels >=
        fittedView.backend.nonBackgroundPixels ||
      (
        sectionPick.status === "hit" &&
        sectionPick.worldPosition.some((value, axis) =>
          value < sectionBox.min[axis] - 1e-3 ||
          value > sectionBox.max[axis] + 1e-3)
      ) ||
      restoredView.viewRevision !== 7 ||
      restoredView.clipping.activePlanes !== 0 ||
      restoredView.backend.nonBackgroundPixels !==
        fittedView.backend.nonBackgroundPixels ||
      rendererStateAfterViews.picks !==
        picking.attempts.length +
          measurement.attempts.length + 2 ||
      rendererStateAfterViews.measurements !== 3 ||
      rendererStateAfterViews.viewUpdates !== 7 ||
      backendStateAfterViews.frames !== 8 ||
      backendStateAfterViews.picks !==
        picking.attempts.length +
          measurement.attempts.length + 2 ||
      backendStateAfterViews.clippingPlanes !== 0 ||
      backendStateAfterViews.hiddenRenderIds !== 0 ||
      backendStateAfterViews.selectedPickIds !== 0 ||
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
      ||
      precisionReceipt.backend.precision.strategy !==
        "camera-relative-model-origin" ||
      precisionReceipt.backend.precision.worldOrigin.some(
        (value) => value < 999_999_999,
      ) ||
      precisionReceipt.backend.precision
        .maximumRelativeCoordinate > 5 ||
      precisionReceipt.backend.nonBackgroundPixels <= 0 ||
      precisionPicking.receipt.status !== "hit" ||
      precisionPicking.receipt.source.fingerprint !==
        precisionInput.snapshot.source.fingerprint ||
      precisionPicking.receipt.worldPosition.some(
        (value) => value < 999_999_999,
      ) ||
      precisionReleaseReceipt.releasedBytes !==
        precisionReceipt.backend.uploadedBytes ||
      precisionBackend.state.activeBytes !== 0 ||
      precisionBackend.state.disposed !== true ||
      precisionSession.state.disposed !== true
      ||
      firstRangeLoad.status !== "loaded" ||
      firstRangeLoad.cacheHit !== false ||
      firstRangeLoad.backend.actualGpu !== true ||
      firstRangeLoad.backend.nonBackgroundPixels <= 0 ||
      firstRangeLoad.backend.activeBytes !==
        progressiveMount.backend.uploadedBytes +
          firstRangeLoad.backend.addedBytes ||
      firstRangeCacheHit.status !== "resident" ||
      firstRangeCacheHit.cacheHit !== true ||
      firstRangeCacheHit.backend !== null ||
      sourceStateAfterCacheHit.rangeReads !==
        sourceStateAfterFirstRange.rangeReads ||
      sourceStateAfterCacheHit.rangeBytes !==
        sourceStateAfterFirstRange.rangeBytes ||
      secondRangeLoad.status !== "loaded" ||
      secondRangeLoad.deferredRangeIds.length !== 0 ||
      secondRangeLoad.backend.nonBackgroundPixels <= 0 ||
      rendererStateAfterAllRanges.residentRangeIds.length !== 3 ||
      rendererStateAfterAllRanges.rangeLoads !== 2 ||
      rendererStateAfterAllRanges.rangeCacheHits !== 1 ||
      rendererStateAfterAllRanges.activeBackendBytes !==
        secondRangeLoad.backend.activeBytes ||
      rendererStateAfterAllRanges.activeBackendBytes >
        progressiveRenderer.limits.maximumGpuCacheBytes ||
      backendStateAfterAllRanges.residentRanges !== 3 ||
      backendStateAfterAllRanges.activeBytes !==
        rendererStateAfterAllRanges.activeBackendBytes ||
      firstRangeEviction.status !== "evicted" ||
      firstRangeEviction.backend.releasedBytes !==
        firstRangeLoad.backend.addedBytes ||
      firstRangeEviction.backend.nonBackgroundPixels <= 0 ||
      rendererStateAfterEviction.residentRangeIds.length !== 2 ||
      rendererStateAfterEviction.rangeEvictions !== 1 ||
      backendStateAfterEviction.residentRanges !== 2 ||
      progressiveReleaseReceipt.releasedBytes !==
        firstRangeEviction.activeBackendBytes ||
      progressiveBackend.state.activeBytes !== 0 ||
      progressiveBackend.state.disposed !== true ||
      progressiveSession.state.disposed !== true
    ) {
      throw new Error(
        "Browser GPU probe lifecycle assertion failed: " +
          JSON.stringify({
            measurementPicks: measurement.picks.length,
            distance: measurement.distance.measurement.value,
            angle: measurement.angle.measurement.radians,
            area: measurement.area.measurement.value,
            fittedPixels:
              fittedView.backend.nonBackgroundPixels,
            clippedPixels:
              clippedView.backend.nonBackgroundPixels,
            sectionPixels:
              sectionView.backend.nonBackgroundPixels,
            restoredPixels:
              restoredView.backend.nonBackgroundPixels,
            rendererStateAfterViews,
            backendStateAfterViews,
          }),
      );
    }
    globalThis.__bimGpuProbeReport = Object.freeze(report);
    showReport(report);
  } catch (error) {
    let rendererDisposed = false;
    let sessionDisposed = false;
    let secondarySessionDisposed = false;
    let precisionRendererDisposed = false;
    let precisionSessionDisposed = false;
    let progressiveRendererDisposed = false;
    let progressiveSessionDisposed = false;
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
    try {
      precisionRendererDisposed =
        precisionRenderer === undefined
          ? false
          : await precisionRenderer.dispose();
    } catch {
      precisionRendererDisposed = false;
    }
    try {
      precisionSessionDisposed =
        precisionSession === undefined
          ? false
          : await precisionSession.dispose();
    } catch {
      precisionSessionDisposed = false;
    }
    try {
      progressiveRendererDisposed =
        progressiveRenderer === undefined
          ? false
          : await progressiveRenderer.dispose();
    } catch {
      progressiveRendererDisposed = false;
    }
    try {
      progressiveSessionDisposed =
        progressiveSession === undefined
          ? false
          : await progressiveSession.dispose();
    } catch {
      progressiveSessionDisposed = false;
    }
    showFailure(error, {
      rendererDisposed,
      sessionDisposed,
      secondarySessionDisposed,
      precisionRendererDisposed,
      precisionSessionDisposed,
      progressiveRendererDisposed,
      progressiveSessionDisposed,
      releaseReceipt: releaseReceipt ?? null,
      precisionReleaseReceipt:
        precisionReleaseReceipt ?? null,
      progressiveReleaseReceipt:
        progressiveReleaseReceipt ?? null,
      backendState: backend?.state ?? null,
      precisionBackendState:
        precisionBackend?.state ?? null,
      progressiveBackendState:
        progressiveBackend?.state ?? null,
    });
  }
}

void run();
