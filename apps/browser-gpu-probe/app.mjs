import {
  attachCameraControls3d,
  createBimRenderer3dHost,
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

class ProbeWorkerLease {
  #terminated = false;

  get terminated() {
    return this.#terminated;
  }

  terminate() {
    if (this.#terminated) {
      return false;
    }
    this.#terminated = true;
    return true;
  }
}

function hostRendererProjection(run) {
  return Object.freeze({
    primary: Object.freeze({
      source: run.primary.source,
      rangeIds: run.primary.renderer.rangeIds,
      metrics: run.primary.renderer.metrics,
      uploadedBytes:
        run.primary.renderer.backend.uploadedBytes,
      actualGpu:
        run.primary.renderer.backend.actualGpu,
      nonBackgroundPixels:
        run.primary.renderer.backend.nonBackgroundPixels,
    }),
    view: Object.freeze({
      source: run.view.source,
      viewRevision: run.view.viewRevision,
      visibleInstances: run.view.visibility.visibleInstances,
      drawCalls: run.view.backend.drawCalls,
      nonBackgroundPixels:
        run.view.backend.nonBackgroundPixels,
    }),
    pick: Object.freeze({
      source: run.pick.source,
      status: run.pick.status,
      identity: run.pick.identity,
    }),
    sourceSwitch: Object.freeze({
      source: run.sourceSwitch.source,
      sourceSwitch: run.sourceSwitch.sourceSwitch,
      priorResources: run.sourceSwitch.priorResources,
      uploadedBytes:
        run.sourceSwitch.renderer.backend.uploadedBytes,
    }),
    cleanup: Object.freeze({
      reason: run.cleanup.receipt.reason,
      rendererDisposed:
        run.cleanup.receipt.rendererDisposed,
      resources: run.cleanup.receipt.resources,
      backendActiveBytes:
        run.cleanup.backendState.activeBytes,
      backendDisposed:
        run.cleanup.backendState.disposed,
      primarySessionDisposed:
        run.cleanup.primarySessionState.disposed,
      secondarySessionDisposed:
        run.cleanup.secondarySessionState.disposed,
      primaryWorkerTerminated:
        run.cleanup.primaryWorkerTerminated,
      secondaryWorkerTerminated:
        run.cleanup.secondaryWorkerTerminated,
    }),
  });
}

async function runRendererHostProbe({
  canvas,
  input,
  kind,
  secondaryInput,
}) {
  const primarySession = new BrowserGeometryRangeSession(
    input.snapshot,
  );
  const secondarySession = new BrowserGeometryRangeSession(
    secondaryInput.snapshot,
    {
      rangeRoute: "/secondary-range",
    },
  );
  const primaryWorker = new ProbeWorkerLease();
  const secondaryWorker = new ProbeWorkerLease();
  const backend = createWebGl2Backend({
    canvas,
    height: 540,
    width: 960,
  });
  const renderer = createBounded3dRenderer({ backend });
  const host = createBimRenderer3dHost({
    kind,
    renderer,
  });
  try {
    const primary = await host.mount({
      session: primarySession,
      snapshot: input.snapshot,
      workerLease: primaryWorker,
    });
    const view = await host.renderView({
      camera: primary.renderer.backend.camera,
    });
    const pick = await host.pick({
      x: 480,
      y: 270,
    });
    const sourceSwitch = await host.mount({
      session: secondarySession,
      snapshot: secondaryInput.snapshot,
      workerLease: secondaryWorker,
    });
    const stateAfterSourceSwitch = host.state;
    const backendStateAfterSourceSwitch = backend.state;
    const receipt = await host.dispose({
      reason: "editor-exit",
    });
    const cleanup = Object.freeze({
      receipt,
      hostState: host.state,
      backendState: backend.state,
      primarySessionState: primarySession.state,
      secondarySessionState: secondarySession.state,
      primaryWorkerTerminated: primaryWorker.terminated,
      secondaryWorkerTerminated: secondaryWorker.terminated,
    });
    return Object.freeze({
      kind,
      primary,
      view,
      pick,
      sourceSwitch,
      stateAfterSourceSwitch,
      backendStateAfterSourceSwitch,
      cleanup,
    });
  } catch (error) {
    try {
      await host.dispose({
        reason: "probe-failure",
      });
    } catch {
      await primarySession.dispose();
      await secondarySession.dispose();
    }
    throw error;
  }
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
  let interactionBackend;
  let interactionRenderer;
  let interactionSession;
  let visibilityBackend;
  let visibilityRenderer;
  let visibilitySession;
  let releaseReceipt;
  let precisionReleaseReceipt;
  let progressiveReleaseReceipt;
  let interactionReleaseReceipt;
  let visibilityReleaseReceipt;
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
    const initialRangeId =
      input.snapshot.loadPlan.firstFrameRangeIds[0];
    const isolateRenderIds = input.snapshot.entities
      .filter((entity) =>
        entity.primitives.some((primitive) =>
          primitive.slice.rangeId === initialRangeId))
      .slice(0, 8)
      .map((entity) => entity.renderId);
    const isolateView =
      await progressiveRenderer.renderView({
        camera: progressiveMount.backend.camera,
        isolateRenderIds,
      });
    const showAllView =
      await progressiveRenderer.renderView({
        camera: progressiveMount.backend.camera,
      });
    const backendStateAfterVisibility =
      progressiveBackend.state;
    const modelBounds = input.snapshot.geometry.bounds;
    const affectedWorldBounds = {
      min: modelBounds.min.map(
        (value, axis) =>
          value +
          (modelBounds.max[axis] - value) * 0.25,
      ),
      max: modelBounds.min.map(
        (value, axis) =>
          value +
          (modelBounds.max[axis] - value) * 0.5,
      ),
    };
    const presentationDelta = {
      deltaId: "delta:browser:presentation:1",
      sourceId: input.snapshot.sourceId,
      fromRevisionId: input.snapshot.revisionId,
      toRevisionId: input.snapshot.revisionId,
      sequence: 1,
      operations: [{
        operationId:
          "operation:browser:presentation-invalidate:1",
        kind: "invalidate",
        aspect: "presentation",
        layerId: input.snapshot.layerId,
        sourceId: input.snapshot.sourceId,
        renderIds: [isolateRenderIds[0]],
        affectedWorldBounds,
      }],
      affectedWorldBounds,
      payload: null,
    };
    const appliedDelta =
      await progressiveRenderer.applyRenderDelta({
        delta: presentationDelta,
      });
    const unsupportedDelta =
      structuredClone(presentationDelta);
    unsupportedDelta.deltaId =
      "delta:browser:geometry:2";
    unsupportedDelta.sequence = 2;
    unsupportedDelta.toRevisionId =
      `${input.snapshot.revisionId}:next`;
    unsupportedDelta.operations[0].kind = "upsert";
    unsupportedDelta.operations[0].aspect = "geometry";
    unsupportedDelta.payload = {
      mediaType:
        "application/vnd.bim-explorer.unsupported-delta",
    };
    const remountRequiredDelta =
      await progressiveRenderer.applyRenderDelta({
        delta: unsupportedDelta,
      });
    let staleDeltaRejected = false;
    try {
      await progressiveRenderer.applyRenderDelta({
        delta: presentationDelta,
      });
    } catch (error) {
      staleDeltaRejected =
        error instanceof RangeError &&
        /stale or out of order/u.test(error.message);
    }
    const backendStateAfterDelta =
      progressiveBackend.state;
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
      visibility: {
        isolateRenderIds,
        isolateView,
        showAllView,
        backendState: backendStateAfterVisibility,
      },
      delta: {
        affectedWorldBounds,
        applied: appliedDelta,
        remountRequired: remountRequiredDelta,
        staleDeltaRejected,
        backendState: backendStateAfterDelta,
      },
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
    interactionSession = new BrowserGeometryRangeSession(
      input.snapshot,
    );
    interactionBackend = createWebGl2Backend({
      canvas: elements.canvas,
      height: 540,
      width: 960,
    });
    interactionRenderer = createBounded3dRenderer({
      backend: interactionBackend,
    });
    const interactionMount =
      await interactionRenderer.mount({
        session: interactionSession,
        snapshot: input.snapshot,
      });
    const interactionViews = [];
    const controls = attachCameraControls3d({
      camera: interactionMount.backend.camera,
      element: elements.canvas,
      height: 540,
      width: 960,
      async onCamera(camera, interactionType) {
        interactionViews.push({
          interaction: interactionType,
          receipt: await interactionRenderer.renderView({
            camera,
          }),
        });
      },
    });
    elements.canvas.dispatchEvent(new PointerEvent(
      "pointerdown",
      {
        bubbles: true,
        button: 0,
        clientX: 420,
        clientY: 280,
        pointerId: 71,
      },
    ));
    elements.canvas.dispatchEvent(new PointerEvent(
      "pointermove",
      {
        bubbles: true,
        buttons: 1,
        clientX: 520,
        clientY: 220,
        pointerId: 71,
      },
    ));
    elements.canvas.dispatchEvent(new PointerEvent(
      "pointerup",
      {
        bubbles: true,
        button: 0,
        clientX: 520,
        clientY: 220,
        pointerId: 71,
      },
    ));
    elements.canvas.dispatchEvent(new WheelEvent(
      "wheel",
      {
        bubbles: true,
        cancelable: true,
        deltaY: -120,
      },
    ));
    await controls.whenIdle();
    const controlsState = controls.state;
    const controlsDisposed = controls.dispose();
    const backendStateAfterInteraction =
      interactionBackend.state;
    interactionReleaseReceipt =
      await interactionRenderer.unmount();
    const interactionRendererDisposed =
      await interactionRenderer.dispose();
    const interactionSessionDisposed =
      await interactionSession.dispose();
    const interaction = {
      mount: interactionMount,
      views: interactionViews,
      controlsState,
      controlsDisposed,
      backendStateAfterInteraction,
      cleanup: {
        releaseReceipt: interactionReleaseReceipt,
        rendererDisposed: interactionRendererDisposed,
        sessionDisposed: interactionSessionDisposed,
        backendState: interactionBackend.state,
      },
    };
    const visibilityTargetRangeId =
      input.snapshot.loadPlan.deferredRangeIds[0];
    const visibilityTarget = input.snapshot.entities.find(
      (entity) =>
        entity.expressId === 597326 &&
        entity.primitives.some((primitive) =>
          primitive.slice.rangeId ===
            visibilityTargetRangeId),
    );
    if (visibilityTarget === undefined) {
      throw new Error(
        "Browser GPU visibility target is unavailable",
      );
    }
    const visibilityInitialCamera = createFitCamera3d(
      visibilityTarget.bounds,
      {
        aspect: 16 / 9,
      },
    );
    visibilitySession = new BrowserGeometryRangeSession(
      input.snapshot,
    );
    visibilityBackend = createWebGl2Backend({
      canvas: elements.canvas,
      height: 540,
      width: 960,
    });
    visibilityRenderer = createBounded3dRenderer({
      backend: visibilityBackend,
    });
    const visibilityMount =
      await visibilityRenderer.mount({
        initialCamera: visibilityInitialCamera,
        initialRangeStrategy: "camera-visibility",
        session: visibilitySession,
        snapshot: input.snapshot,
      });
    const visibilitySourceState = visibilitySession.state;
    const visibilityBackendState = visibilityBackend.state;
    visibilityReleaseReceipt =
      await visibilityRenderer.unmount();
    const visibilityRendererDisposed =
      await visibilityRenderer.dispose();
    const visibilitySessionDisposed =
      await visibilitySession.dispose();
    const visibilityFirstFrame = {
      target: {
        bounds: visibilityTarget.bounds,
        expressId: visibilityTarget.expressId,
        rangeId: visibilityTargetRangeId,
      },
      initialCamera: visibilityInitialCamera,
      mount: visibilityMount,
      sourceState: visibilitySourceState,
      backendState: visibilityBackendState,
      cleanup: {
        releaseReceipt: visibilityReleaseReceipt,
        rendererDisposed: visibilityRendererDisposed,
        sessionDisposed: visibilitySessionDisposed,
        backendState: visibilityBackend.state,
      },
    };
    const browserHost = await runRendererHostProbe({
      canvas: elements.canvas,
      input,
      kind: "browser",
      secondaryInput,
    });
    const vscodeWebviewHost = await runRendererHostProbe({
      canvas: elements.canvas,
      input,
      kind: "vscode-webview",
      secondaryInput,
    });
    const browserHostProjection =
      hostRendererProjection(browserHost);
    const vscodeWebviewHostProjection =
      hostRendererProjection(vscodeWebviewHost);
    const hostConformance = {
      schema: "bim-explorer-browser-vscode-" +
        "renderer-host-report/1",
      status: "passed",
      actualBrowser: true,
      actualVscodeShellClaimed: false,
      contract:
        "bim-explorer-bim-renderer-3d-host/0.1",
      runs: {
        browser: browserHost,
        vscodeWebview: vscodeWebviewHost,
      },
      normalizedProjection: browserHostProjection,
      sameRendererProjection:
        JSON.stringify(browserHostProjection) ===
        JSON.stringify(vscodeWebviewHostProjection),
      workerLifecycleEvidence:
        "compatibility/evidence/" +
        "web-ifc-browser-public-representative-" +
        "performance-2026-08-03.json",
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
      interaction,
      visibilityFirstFrame,
      hostConformance,
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
        interactionRendererDisposed,
        interactionSessionDisposed,
        visibilityRendererDisposed,
        visibilitySessionDisposed,
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
      isolateRenderIds.length !== 8 ||
      isolateView.visibility.mode !== "isolate" ||
      isolateView.visibility.isolatedRenderIds.length !== 8 ||
      isolateView.visibility.hiddenInstances <= 0 ||
      isolateView.visibility.visibleInstances >=
        progressiveMount.metrics.instances ||
      isolateView.backend.nonBackgroundPixels <= 0 ||
      showAllView.visibility.mode !== "show-all" ||
      showAllView.visibility.hiddenInstances !== 0 ||
      showAllView.visibility.visibleInstances !==
        progressiveMount.metrics.instances ||
      showAllView.backend.nonBackgroundPixels !==
        progressiveMount.backend.nonBackgroundPixels ||
      backendStateAfterVisibility.activeBytes !==
        progressiveMount.backend.uploadedBytes ||
      backendStateAfterVisibility.frames !== 3 ||
      appliedDelta.status !== "applied" ||
      appliedDelta.atomic !== true ||
      appliedDelta.applied !== true ||
      appliedDelta.backend.actualGpu !== true ||
      appliedDelta.backend.redrawScope !==
        "affected-world-bounds" ||
      appliedDelta.backend.redrawPixels <= 0 ||
      appliedDelta.backend.redrawPixels >= 960 * 540 ||
      appliedDelta.backend.drawCalls !==
        progressiveMount.metrics.drawCalls ||
      appliedDelta.backend.glError !== 0 ||
      remountRequiredDelta.status !== "remount-required" ||
      remountRequiredDelta.atomic !== true ||
      remountRequiredDelta.applied !== false ||
      remountRequiredDelta.backend !== null ||
      staleDeltaRejected !== true ||
      backendStateAfterDelta.frames !== 4 ||
      backendStateAfterDelta.activeBytes !==
        progressiveMount.backend.uploadedBytes ||
      progressiveBackend.state.activeBytes !== 0 ||
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
      ||
      interactionViews.length !== 2 ||
      interactionViews[0].interaction.kind !== "orbit" ||
      interactionViews[1].interaction.kind !== "zoom" ||
      interactionViews[0].receipt.camera.yaw ===
        interactionMount.backend.camera.yaw ||
      interactionViews[1].receipt.camera.distance >=
        interactionViews[0].receipt.camera.distance ||
      interactionViews.some((view) =>
        view.receipt.backend.nonBackgroundPixels <= 0 ||
        view.receipt.backend.glError !== 0) ||
      controlsState.events !== 4 ||
      controlsState.orbitUpdates !== 1 ||
      controlsState.panUpdates !== 0 ||
      controlsState.zoomUpdates !== 1 ||
      controlsDisposed !== true ||
      backendStateAfterInteraction.frames !== 3 ||
      backendStateAfterInteraction.activeBytes !==
        interactionMount.backend.uploadedBytes ||
      interactionReleaseReceipt.releasedBytes !==
        interactionMount.backend.uploadedBytes ||
      interactionBackend.state.activeBytes !== 0 ||
      interactionBackend.state.disposed !== true ||
      interactionSession.state.disposed !== true
      ||
      visibilityMount.initialRangeSelection.strategy !==
        "camera-visibility" ||
      visibilityMount.initialRangeSelection.cameraDriven !==
        true ||
      visibilityMount.rangeIds.length !== 1 ||
      visibilityMount.rangeIds[0] !==
        visibilityTargetRangeId ||
      visibilityMount.rangeIds[0] ===
        input.snapshot.loadPlan.firstFrameRangeIds[0] ||
      visibilityMount.initialRangeSelection.ranking[0]
        .rangeId !== visibilityTargetRangeId ||
      visibilityMount.backend.actualGpu !== true ||
      visibilityMount.backend.nonBackgroundPixels <= 0 ||
      visibilityMount.backend.camera.target.some(
        (value, axis) =>
          value !== visibilityInitialCamera.target[axis],
      ) ||
      visibilitySourceState.rangeBytes !==
        visibilityMount.metrics.sourceReadBytes ||
      visibilitySourceState.rangeReads !==
        visibilityMount.metrics.sourceReads ||
      visibilityBackendState.activeBytes !==
        visibilityMount.backend.uploadedBytes ||
      visibilityReleaseReceipt.releasedBytes !==
        visibilityMount.backend.uploadedBytes ||
      visibilityBackend.state.activeBytes !== 0 ||
      visibilityBackend.state.disposed !== true ||
      visibilitySession.state.disposed !== true
      ||
      hostConformance.sameRendererProjection !== true ||
      browserHost.kind !== "browser" ||
      vscodeWebviewHost.kind !== "vscode-webview" ||
      browserHost.primary.host.contract !==
        hostConformance.contract ||
      vscodeWebviewHost.primary.host.contract !==
        hostConformance.contract ||
      browserHost.pick.status !== "hit" ||
      vscodeWebviewHost.pick.status !== "hit" ||
      browserHost.pick.source.revisionId !==
        input.snapshot.revisionId ||
      vscodeWebviewHost.pick.source.revisionId !==
        input.snapshot.revisionId ||
      browserHost.sourceSwitch.sourceSwitch !== true ||
      vscodeWebviewHost.sourceSwitch.sourceSwitch !== true ||
      browserHost.sourceSwitch.priorResources.length !== 2 ||
      vscodeWebviewHost.sourceSwitch.priorResources.length !== 2 ||
      browserHost.stateAfterSourceSwitch.sourceSwitches !== 1 ||
      vscodeWebviewHost.stateAfterSourceSwitch.sourceSwitches !== 1 ||
      browserHost.backendStateAfterSourceSwitch.activeBytes !==
        1_120 ||
      vscodeWebviewHost.backendStateAfterSourceSwitch
        .activeBytes !== 1_120 ||
      browserHost.cleanup.receipt.reason !== "editor-exit" ||
      vscodeWebviewHost.cleanup.receipt.reason !==
        "editor-exit" ||
      browserHost.cleanup.hostState.commands !== 5 ||
      vscodeWebviewHost.cleanup.hostState.commands !== 5 ||
      browserHost.cleanup.hostState.releases.length !== 4 ||
      vscodeWebviewHost.cleanup.hostState.releases.length !== 4 ||
      browserHost.cleanup.backendState.activeBytes !== 0 ||
      vscodeWebviewHost.cleanup.backendState.activeBytes !== 0 ||
      browserHost.cleanup.backendState.disposed !== true ||
      vscodeWebviewHost.cleanup.backendState.disposed !== true ||
      browserHost.cleanup.primarySessionState.disposed !== true ||
      browserHost.cleanup.secondarySessionState.disposed !== true ||
      vscodeWebviewHost.cleanup.primarySessionState.disposed !==
        true ||
      vscodeWebviewHost.cleanup.secondarySessionState.disposed !==
        true ||
      browserHost.cleanup.primaryWorkerTerminated !== true ||
      browserHost.cleanup.secondaryWorkerTerminated !== true ||
      vscodeWebviewHost.cleanup.primaryWorkerTerminated !== true ||
      vscodeWebviewHost.cleanup.secondaryWorkerTerminated !== true
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
    let interactionRendererDisposed = false;
    let interactionSessionDisposed = false;
    let visibilityRendererDisposed = false;
    let visibilitySessionDisposed = false;
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
    try {
      interactionRendererDisposed =
        interactionRenderer === undefined
          ? false
          : await interactionRenderer.dispose();
    } catch {
      interactionRendererDisposed = false;
    }
    try {
      interactionSessionDisposed =
        interactionSession === undefined
          ? false
          : await interactionSession.dispose();
    } catch {
      interactionSessionDisposed = false;
    }
    try {
      visibilityRendererDisposed =
        visibilityRenderer === undefined
          ? false
          : await visibilityRenderer.dispose();
    } catch {
      visibilityRendererDisposed = false;
    }
    try {
      visibilitySessionDisposed =
        visibilitySession === undefined
          ? false
          : await visibilitySession.dispose();
    } catch {
      visibilitySessionDisposed = false;
    }
    showFailure(error, {
      rendererDisposed,
      sessionDisposed,
      secondarySessionDisposed,
      precisionRendererDisposed,
      precisionSessionDisposed,
      progressiveRendererDisposed,
      progressiveSessionDisposed,
      interactionRendererDisposed,
      interactionSessionDisposed,
      visibilityRendererDisposed,
      visibilitySessionDisposed,
      releaseReceipt: releaseReceipt ?? null,
      precisionReleaseReceipt:
        precisionReleaseReceipt ?? null,
      progressiveReleaseReceipt:
        progressiveReleaseReceipt ?? null,
      interactionReleaseReceipt:
        interactionReleaseReceipt ?? null,
      visibilityReleaseReceipt:
        visibilityReleaseReceipt ?? null,
      backendState: backend?.state ?? null,
      precisionBackendState:
        precisionBackend?.state ?? null,
      progressiveBackendState:
        progressiveBackend?.state ?? null,
      interactionBackendState:
        interactionBackend?.state ?? null,
      visibilityBackendState:
        visibilityBackend?.state ?? null,
    });
  }
}

void run();
