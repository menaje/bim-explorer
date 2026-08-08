import {
  createBoundedPointCloudRenderer,
  createPointCloudWebGl2Backend,
} from "./bim-renderer-3d.mjs";

const canvas = document.querySelector("#point-canvas");
const receiptElement = document.querySelector("#receipt");
const statusElement = document.querySelector("#status");

async function json(route) {
  const response = await fetch(route, {
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(
      `LAS/LAZ point renderer resource ${route} is unavailable`,
    );
  }
  return await response.json();
}

async function bytes(route, expected) {
  const response = await fetch(route, {
    cache: "no-store",
    credentials: "omit",
  });
  if (
    !response.ok ||
    response.headers.get("content-type") !== expected.mediaType
  ) {
    throw new Error("LAS/LAZ point range response is invalid");
  }
  const value = new Uint8Array(await response.arrayBuffer());
  if (value.byteLength !== expected.byteLength) {
    value.fill(0);
    throw new Error("LAS/LAZ point range length is invalid");
  }
  return value;
}

function publish(report) {
  globalThis.__lasLazPointRendererProbeReport = Object.freeze(report);
  receiptElement.textContent = JSON.stringify(report, null, 2);
  statusElement.textContent = report.status === "passed"
    ? "Passed: bounded WebGL2 point resources released"
    : report.status === "running"
      ? "Running bounded point qualification…"
      : `Failed: ${report.error?.message ?? "unknown error"}`;
}

async function run() {
  publish({
    schema: "bim-explorer-las-laz-point-renderer-browser-report/1",
    status: "running",
  });
  let backend = null;
  let inputBytes = null;
  let renderer = null;
  try {
    const input = await json("/probe-input.json");
    if (
      input.schema !==
        "bim-explorer-las-laz-point-renderer-probe-input/1" ||
      input.qualification?.productRuntime !== false
    ) {
      throw new Error("LAS/LAZ point renderer input is invalid");
    }
    inputBytes = await bytes("/point-range.bin", input.range);
    backend = createPointCloudWebGl2Backend({
      canvas,
      height: input.qualification.canvas.height,
      width: input.qualification.canvas.width,
    });
    renderer = createBoundedPointCloudRenderer({
      backend,
      limits: input.qualification.limits,
      pointSize: input.qualification.pointSize,
    });
    const mount = await renderer.mount({
      range: {
        ...input.range,
        bytes: inputBytes,
      },
      source: input.source,
    });
    inputBytes.fill(0);
    const fetchedInputCleared = inputBytes.every(
      (value) => value === 0,
    );
    const rangeState = await json("/range-state.json");
    const release = await renderer.unmount();
    const rendererDisposed = await renderer.dispose();
    const report = {
      schema: "bim-explorer-las-laz-point-renderer-browser-report/1",
      status: "passed",
      fixture: input.fixture,
      provenance: input.provenance,
      source: mount.source,
      range: {
        ...mount.range,
        pointStrideBytes: input.profile.range.pointStrideBytes,
      },
      projection: {
        coordinate: input.profile.coordinateProjection,
        color: input.profile.colorProjection,
        renderedBounds: mount.geometry.bounds,
        renderedColorRange: mount.geometry.colorRange,
      },
      renderer: {
        contract: "bim-explorer-bounded-point-renderer/0.1",
        backend: mount.backend.backendId,
        actualGpu: mount.backend.actualGpu,
        rendered: mount.backend.rendered,
        pointPrimitive: mount.backend.pointPrimitive,
        points: mount.metrics.points,
        pointSize: mount.metrics.pointSize,
        drawCalls: mount.backend.drawCalls,
        uploadedBytes: mount.backend.uploadedBytes,
        cpuStagingPeakBytes:
          mount.metrics.cpuStagingPeakBytes,
        nonBackgroundPixels:
          mount.backend.nonBackgroundPixels,
        readbackBytes: mount.backend.readbackBytes,
        glVersion: mount.backend.glVersion,
        glError: mount.backend.glError,
        frameMs: mount.backend.frameMs,
        uploadMs: mount.backend.uploadMs,
      },
      network: {
        rangeRequests: rangeState.rangeRequests,
        rangeBytes: rangeState.rangeBytes,
      },
      cleanup: {
        rendererStagingReleased:
          mount.cleanup.cpuRangeStagingReleased,
        fetchedInputCleared,
        releasedBytes: release.releasedBytes,
        releasedPoints: release.releasedPoints,
        backendResourcesDeleted:
          release.backend.resourcesDeleted,
        rendererDisposed,
        backendDisposed: backend.state.disposed,
        activeBackendBytes: backend.state.activeBytes,
        residentRanges: backend.state.residentRanges,
      },
    };
    if (
      report.source.semanticAuthority !== false ||
      report.source.coordinateReferenceStatus !== "unqualified" ||
      report.range.byteLength !== input.range.byteLength ||
      report.range.sha256 !== input.range.sha256 ||
      report.renderer.backend !== "webgl2-points" ||
      report.renderer.actualGpu !== true ||
      report.renderer.rendered !== true ||
      report.renderer.pointPrimitive !== "POINTS" ||
      report.renderer.points !==
        input.profile.source.pointRecords ||
      report.renderer.pointSize !== input.qualification.pointSize ||
      report.renderer.drawCalls !== 1 ||
      report.renderer.uploadedBytes !==
        input.profile.range.payloadBytes ||
      report.renderer.cpuStagingPeakBytes !==
        input.profile.range.byteLength ||
      report.renderer.nonBackgroundPixels <= 0 ||
      report.renderer.glError !== 0 ||
      report.network.rangeRequests !== 1 ||
      report.network.rangeBytes !== input.range.byteLength ||
      report.cleanup.rendererStagingReleased !== true ||
      report.cleanup.fetchedInputCleared !== true ||
      report.cleanup.releasedBytes !==
        input.profile.range.payloadBytes ||
      report.cleanup.releasedPoints !==
        input.profile.source.pointRecords ||
      report.cleanup.backendResourcesDeleted !== true ||
      report.cleanup.rendererDisposed !== true ||
      report.cleanup.backendDisposed !== true ||
      report.cleanup.activeBackendBytes !== 0 ||
      report.cleanup.residentRanges !== 0
    ) {
      throw new Error(
        "LAS/LAZ point renderer Browser receipt is invalid",
      );
    }
    publish(report);
  } catch (error) {
    inputBytes?.fill(0);
    try {
      if (renderer !== null && renderer.state.disposed !== true) {
        await renderer.dispose();
      }
    } catch {
      // The original failure remains authoritative.
    }
    publish({
      schema: "bim-explorer-las-laz-point-renderer-browser-report/1",
      status: "failed",
      error: {
        name: error?.name ?? "Error",
        message:
          error?.message ?? "LAS/LAZ point renderer probe failed",
      },
      cleanup: {
        fetchedInputCleared:
          inputBytes?.every((value) => value === 0) ?? true,
        rendererDisposed:
          renderer?.state.disposed ?? false,
        backendDisposed:
          backend?.state.disposed ?? false,
        activeBackendBytes:
          backend?.state.activeBytes ?? 0,
      },
    });
  }
}

await run();
