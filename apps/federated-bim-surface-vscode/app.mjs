import {
  cameraViewProjectionMatrix,
  createBimSurfaceHitRenderer,
  createBounded3dRenderer,
  createExplicitAlignment,
  createFederatedBimSurface,
  createWebGl2Backend,
} from "../../packages/federated-bim-surface/runtime/index.mjs";
import {
  createBimProductSourceWorkerClient,
} from "../bim-explorer-web/worker-source-client.mjs";

const HOST_MESSAGE =
  "bim-explorer-federated-product-host-message/0.1";
const REPORT_SCHEMA =
  "bim-explorer-federated-vscode-surface-report/1";
const WIDTH = 800;
const HEIGHT = 600;
const MAXIMUM_SOURCES = 8;
const MAXIMUM_SOURCE_BYTES = 64 * 1024 * 1024;
const MAXIMUM_AGGREGATE_SOURCE_BYTES = 64 * 1024 * 1024;

const elements = {
  canvas: document.querySelector("#model-canvas"),
  composition: document.querySelector("#composition"),
  dispose: document.querySelector("#dispose-surface"),
  receipt: document.querySelector("#receipt"),
  status: document.querySelector("#status"),
  verify: document.querySelector("#verify-anchors"),
};

function meta(name) {
  const value = document.querySelector(
    `meta[name="${name}"]`,
  )?.content;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`federated surface runtime ${name} is missing`);
  }
  return value;
}

const runtime = Object.freeze({
  profile: meta("bim-profile"),
  wasmPath: new URL(
    meta("bim-wasm-path"),
    globalThis.location.href,
  ).href,
  webIfcModuleUrl: new URL(
    meta("bim-web-ifc-module"),
    globalThis.location.href,
  ).href,
  workerModuleUrl: new URL(
    meta("bim-worker-module"),
    globalThis.location.href,
  ).href,
});
const vscodeApi = globalThis.acquireVsCodeApi();

let active = null;
let busy = false;
let hostGeneration = 0;
let lastReady = null;
let lastQualified = null;
let workerRuntimePromise = null;
const runtimeUrls = new Set();
const bootstrapUrls = new Set();

function setStatus(state, text) {
  elements.status.dataset.state = state;
  elements.status.textContent = text;
}

function controls(state) {
  elements.verify.disabled = state !== "ready" || busy;
  elements.dispose.disabled = active === null || busy;
}

function publish(status, additions = {}) {
  const report = Object.freeze({
    ...additions,
    schema: REPORT_SCHEMA,
    status,
    hostKind: "vscode-webview",
    externalUpload: false,
    telemetry: false,
  });
  elements.receipt.textContent = JSON.stringify(report, null, 2);
  vscodeApi.postMessage({
    schema: HOST_MESSAGE,
    type: "report",
    report,
  });
  return report;
}

function renderComposition(composition) {
  elements.composition.replaceChildren();
  const rows = [
    ["Federation", composition.federationId],
    ["Sources", composition.sourceCount],
    ["Formats", composition.formats.join(" · ")],
    ["Roles", composition.sourceRoles.join(" · ")],
    ["Identity", "source-scoped; never merged"],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = String(label);
    description.textContent = String(value);
    row.append(term, description);
    elements.composition.append(row);
  }
}

async function responseText(url, label, maximumBytes) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`${label} is unavailable`);
  }
  const source = await response.text();
  if (source.length === 0 || source.length > maximumBytes) {
    throw new RangeError(`${label} exceeds its byte limit`);
  }
  return source;
}

async function responseBytes(url, label, maximumBytes) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`${label} is unavailable`);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
    throw new RangeError(`${label} exceeds its byte limit`);
  }
  return bytes;
}

async function workerRuntime() {
  workerRuntimePromise ??= Promise.all([
    responseText(
      runtime.workerModuleUrl,
      "federated surface Worker bundle",
      1024 * 1024,
    ),
    responseText(
      runtime.webIfcModuleUrl,
      "federated surface web-ifc module",
      8 * 1024 * 1024,
    ),
    responseBytes(
      new URL("web-ifc.wasm", runtime.wasmPath).href,
      "federated surface web-ifc WASM",
      32 * 1024 * 1024,
    ),
  ]).then(([workerBundle, webIfcSource, wasmBytes]) => {
    const webIfcModuleUrl = URL.createObjectURL(
      new Blob([webIfcSource], { type: "text/javascript" }),
    );
    const wasmUrl = URL.createObjectURL(
      new Blob([wasmBytes], { type: "application/wasm" }),
    );
    runtimeUrls.add(webIfcModuleUrl);
    runtimeUrls.add(wasmUrl);
    return Object.freeze({
      wasmUrl,
      webIfcModuleUrl,
      workerBundle,
    });
  });
  return await workerRuntimePromise;
}

function revokeRuntimeUrls() {
  for (const url of [...bootstrapUrls, ...runtimeUrls]) {
    URL.revokeObjectURL(url);
  }
  bootstrapUrls.clear();
  runtimeUrls.clear();
  return true;
}

async function createSourceClient(limits) {
  const worker = await workerRuntime();
  return createBimProductSourceWorkerClient({
    limits: {
      maximumSourceBytes: Math.min(
        limits.maximumSourceBytes ?? MAXIMUM_SOURCE_BYTES,
        MAXIMUM_SOURCE_BYTES,
      ),
      openTimeoutMs: limits.openTimeoutMs ?? 30_000,
      operationTimeoutMs: 10_000,
    },
    wasmPath: runtime.wasmPath,
    wasmUrl: worker.wasmUrl,
    webIfcModuleUrl: worker.webIfcModuleUrl,
    workerUrl: runtime.workerModuleUrl,
    workerFactory: () => {
      const bootstrapUrl = URL.createObjectURL(
        new Blob([worker.workerBundle], {
          type: "text/javascript",
        }),
      );
      bootstrapUrls.add(bootstrapUrl);
      const sourceWorker = new Worker(bootstrapUrl, {
        name: "bim-explorer-federated-source",
        type: "module",
      });
      let terminated = false;
      return {
        addEventListener(...args) {
          return sourceWorker.addEventListener(...args);
        },
        postMessage(...args) {
          return sourceWorker.postMessage(...args);
        },
        terminate() {
          if (!terminated) {
            terminated = true;
            bootstrapUrls.delete(bootstrapUrl);
            URL.revokeObjectURL(bootstrapUrl);
          }
          return sourceWorker.terminate();
        },
      };
    },
  });
}

function transferredResources(opened, client) {
  let released = false;
  const session = {
    descriptor: opened.session.descriptor,
    get state() {
      return opened.session.state;
    },
    readRange(...args) {
      return opened.session.readRange(...args);
    },
    getEntity(...args) {
      return opened.session.getEntity(...args);
    },
    getEntityDetails(...args) {
      return opened.session.getEntityDetails(...args);
    },
    getPropertySetValues(...args) {
      return opened.session.getPropertySetValues(...args);
    },
    queryTree(...args) {
      return opened.session.queryTree(...args);
    },
    searchEntities(...args) {
      return opened.session.searchEntities(...args);
    },
    queryRelations(...args) {
      return opened.session.queryRelations(...args);
    },
    async dispose() {
      if (!released) {
        released = true;
        await opened.session.dispose();
      }
      return true;
    },
  };
  let workerReleased = false;
  const workerLease = {
    get state() {
      return opened.workerLease.state;
    },
    async dispose() {
      if (workerReleased) {
        return true;
      }
      workerReleased = true;
      await session.dispose();
      await opened.workerLease.dispose();
      return true;
    },
    terminate() {
      workerReleased = true;
      return opened.workerLease.terminate();
    },
  };
  return { client, session, workerLease };
}

function bytesFromMessage(value) {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    );
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value);
  }
  throw new TypeError("federated source bytes are invalid");
}

function alignment(snapshot, sourceToFederation, reference) {
  return createExplicitAlignment({
    sourceRevisionId: snapshot.revisionId,
    sourceCoordinateSystem: snapshot.coordinateSystem.source,
    federationCoordinateSystem: "federation-local",
    sourceToFederation,
    reference,
  });
}

function transformPoint(matrix, point) {
  const [x, y, z] = point;
  const w = matrix[3] * x + matrix[7] * y +
    matrix[11] * z + matrix[15];
  return [
    (matrix[0] * x + matrix[4] * y +
      matrix[8] * z + matrix[12]) / w,
    (matrix[1] * x + matrix[5] * y +
      matrix[9] * z + matrix[13]) / w,
    (matrix[2] * x + matrix[6] * y +
      matrix[10] * z + matrix[14]) / w,
  ];
}

function projectedPixel(camera, point) {
  const matrix = cameraViewProjectionMatrix(
    camera,
    WIDTH / HEIGHT,
  );
  const [x, y, z] = point;
  const clip = [
    matrix[0] * x + matrix[4] * y +
      matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y +
      matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y +
      matrix[10] * z + matrix[14],
    matrix[3] * x + matrix[7] * y +
      matrix[11] * z + matrix[15],
  ];
  if (clip[3] <= 0) {
    return null;
  }
  const pixel = {
    x: Math.floor((clip[0] / clip[3] + 1) * WIDTH / 2),
    y: Math.floor((1 - clip[1] / clip[3]) * HEIGHT / 2),
  };
  return pixel.x < 0 || pixel.x >= WIDTH ||
    pixel.y < 0 || pixel.y >= HEIGHT
    ? null
    : pixel;
}

function boundsCandidates(bounds, sourceToFederation) {
  const center = bounds.min.map(
    (value, axis) => (value + bounds.max[axis]) / 2,
  );
  const points = [center];
  for (let axis = 0; axis < 3; axis += 1) {
    for (const side of [bounds.min[axis], bounds.max[axis]]) {
      const point = [...center];
      point[axis] = side;
      points.push(point);
    }
  }
  return points.map((point) =>
    transformPoint(sourceToFederation, point));
}

function pixelCandidates(camera, points) {
  const offsets = [
    [0, 0],
    [-3, 0], [3, 0], [0, -3], [0, 3],
    [-6, -6], [-6, 6], [6, -6], [6, 6],
    [-12, 0], [12, 0], [0, -12], [0, 12],
  ];
  const candidates = [];
  const keys = new Set();
  for (const point of points) {
    const projected = projectedPixel(camera, point);
    if (projected === null) {
      continue;
    }
    for (const [xOffset, yOffset] of offsets) {
      const candidate = {
        x: projected.x + xOffset,
        y: projected.y + yOffset,
      };
      const key = `${candidate.x}:${candidate.y}`;
      if (
        candidate.x >= 0 && candidate.x < WIDTH &&
        candidate.y >= 0 && candidate.y < HEIGHT &&
        !keys.has(key)
      ) {
        keys.add(key);
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

async function pickSource({
  sourceAlignment,
  camera,
  federationSourceId,
  snapshot,
  surface,
}) {
  const entity = snapshot.entities.find((candidate) =>
    candidate.renderable === true);
  if (entity === undefined) {
    throw new Error("federated source has no renderable entity");
  }
  const candidates = pixelCandidates(
    camera,
    boundsCandidates(
      entity.bounds,
      sourceAlignment.sourceToFederation,
    ),
  );
  for (const coordinates of candidates) {
    const pick = await surface.pick(coordinates);
    if (
      pick.status === "hit" &&
      pick.federationSourceId === federationSourceId &&
      pick.rendererPick.surfaceHitCapability ===
        "resolved-exact-triangle"
    ) {
      return pick;
    }
  }
  throw new Error("source-local federated hit is unavailable");
}

function anchorProjection(anchor) {
  return {
    sourceSlot: anchor.federationSourceId,
    format: anchor.nativeDocument.format,
    identityKind: anchor.nativeIdentity.kind,
    nativeId: anchor.nativeIdentity.nativeId,
    globalId: anchor.nativeIdentity.globalId ?? null,
    point: anchor.hit.point,
    normal: anchor.hit.normal,
    stability: anchor.stability,
    locator: anchor.locator,
    alignmentFingerprint: anchor.alignmentFingerprint,
    projectionFingerprint: anchor.projectionFingerprint,
    authority: anchor.authority,
  };
}

function compositionReport(opened) {
  return {
    federationId: opened.federationId,
    sourceCount: opened.projection.sourceCount,
    formats: opened.sources.map((source) => source.format),
    sourceRoles: opened.sources.map((source) => source.sourceRole),
    semanticAvailability: opened.sources.map((source) =>
      source.semanticAvailable),
    projectionFingerprint: opened.projection.fingerprint,
    sourceProjectionFingerprints: opened.sources.map((source) =>
      source.projectionFingerprint),
    identityMerged: false,
  };
}

async function openFederation(message) {
  if (
    !Number.isSafeInteger(message.generation) ||
    message.generation <= hostGeneration ||
    !Array.isArray(message.sources) ||
    message.sources.length === 0 ||
    message.sources.length > MAXIMUM_SOURCES
  ) {
    return;
  }
  hostGeneration = message.generation;
  busy = true;
  controls("opening");
  setStatus("opening", "Opening isolated federated sources…");
  const records = [];
  let backend = null;
  let renderer = null;
  let surface = null;
  try {
    let aggregateBytes = 0;
    for (const source of message.sources) {
      const bytes = bytesFromMessage(source.bytes);
      aggregateBytes += bytes.byteLength;
      if (
        bytes.byteLength === 0 ||
        bytes.byteLength > MAXIMUM_SOURCE_BYTES ||
        aggregateBytes >
          Math.min(
            message.limits?.maximumAggregateSourceBytes ??
              MAXIMUM_AGGREGATE_SOURCE_BYTES,
            MAXIMUM_AGGREGATE_SOURCE_BYTES,
          )
      ) {
        throw new RangeError("federated source byte limit exceeded");
      }
      const client = await createSourceClient(message.limits ?? {});
      let opened;
      try {
        opened = await client.open(bytes, {
          format: source.format,
          profile: message.profile ?? runtime.profile,
        });
      } catch (error) {
        await client.dispose();
        throw error;
      } finally {
        bytes.fill(0);
      }
      const resources = transferredResources(opened, client);
      const sourceAlignment = alignment(
        opened.snapshot,
        source.sourceToFederation,
        source.reference,
      );
      records.push({
        ...resources,
        federationSourceId: source.federationSourceId,
        sourceRole: source.sourceRole,
        discipline: source.discipline,
        owner: source.owner,
        format: source.format,
        snapshot: opened.snapshot,
        alignment: sourceAlignment,
      });
    }
    backend = createWebGl2Backend({
      canvas: elements.canvas,
      width: WIDTH,
      height: HEIGHT,
    });
    renderer = createBimSurfaceHitRenderer({
      width: WIDTH,
      height: HEIGHT,
      renderer: createBounded3dRenderer({
        backend,
        limits: {
          maximumFirstFrameRanges: MAXIMUM_SOURCES,
          maximumSourceReadBytes: 4 * 1024 * 1024,
        },
      }),
    });
    surface = createFederatedBimSurface({ renderer });
    const opened = await surface.open({
      federationId: message.federationId,
      sources: records.map((record) => ({
        federationSourceId: record.federationSourceId,
        sourceRole: record.sourceRole,
        lifecycleOwnership: "transferred",
        session: record.session,
        snapshot: record.snapshot,
        alignment: record.alignment,
        discipline: record.discipline,
        owner: record.owner,
        workerLease: record.workerLease,
      })),
    });
    const semanticRecord = records.find((record) => {
      const descriptor = opened.sources.find((source) =>
        source.federationSourceId === record.federationSourceId);
      return record.sourceRole === "semantic-base" &&
        descriptor?.semanticAvailable === true;
    });
    const search = semanticRecord === undefined
      ? { items: [] }
      : await surface.search({
          federationSourceId: semanticRecord.federationSourceId,
          query: "wall",
        });
    const referenceRecord = records.find((record) =>
      record.sourceRole !== "semantic-base");
    let referenceSemanticsRejected = referenceRecord === undefined;
    if (referenceRecord !== undefined) {
      try {
        surface.getSemanticExplorer(referenceRecord.federationSourceId);
      } catch (error) {
        referenceSemanticsRejected =
          error?.name === "NotSupportedError";
      }
    }
    const composition = compositionReport(opened);
    renderComposition(composition);
    active = {
      backend,
      opened,
      records,
      renderer,
      surface,
      semantics: {
        queriedSource:
          semanticRecord?.federationSourceId ?? null,
        query: semanticRecord === undefined ? null : "wall",
        returned: search.items.length,
        referenceSemanticsRejected,
      },
    };
    lastReady = publish("ready", {
      contract: opened.contract,
      composition,
      semantics: active.semantics,
      renderer: {
        backend: opened.mount.backend.backendId,
        actualGpu: opened.mount.backend.actualGpu,
        context: opened.mount.backend.context,
        nonBackgroundPixels:
          opened.mount.backend.nonBackgroundPixels,
        uploadedBytes: opened.mount.backend.uploadedBytes,
        surfaceHits: 0,
        surfaceMisses: 0,
        retainedGeometryBytes: renderer.state.retainedGeometryBytes,
      },
      authority: opened.authority,
    });
    setStatus(
      "ready",
      "Ready: three source-scoped models are composed read-only.",
    );
  } catch (error) {
    try {
      if (surface !== null &&
        ["idle", "ready"].includes(surface.state.lifecycle)) {
        await surface.dispose({ reason: "vscode-open-failure" });
      }
      for (const record of records) {
        await record.client.dispose();
      }
    } catch {
      // The original bounded diagnostic remains authoritative.
    }
    revokeRuntimeUrls();
    publish("failed", {
      diagnostic: {
        code: "FEDERATED_SURFACE_OPEN_FAILED",
        name: error?.name ?? "Error",
        operation: "federation-open",
        retryable: false,
      },
      cleanup: {
        surfaceStatus: surface?.state.lifecycle ?? "failed",
        rendererDisposed: renderer?.state.disposed ?? false,
        backendDisposed: backend?.state.disposed ?? false,
        backendActiveBytes: backend?.state.activeBytes ?? 0,
        workersTerminated: records.every((record) =>
          record.client.state.workerActive === false),
      },
    });
    setStatus("failed", "Open failed: FEDERATED_SURFACE_OPEN_FAILED");
  } finally {
    for (const source of message.sources) {
      try {
        bytesFromMessage(source.bytes).fill(0);
      } catch {
        // Invalid payloads contain no admitted source buffer.
      }
    }
    busy = false;
    controls(elements.status.dataset.state);
  }
}

async function verifyAnchors() {
  if (active === null || busy || lastQualified !== null) {
    return false;
  }
  busy = true;
  controls("ready");
  setStatus("opening", "Resolving exact visible source-local hits…");
  try {
    const camera = active.opened.mount.backend.camera;
    const picks = [];
    const anchors = [];
    for (const record of active.records) {
      const pick = await pickSource({
        sourceAlignment: record.alignment,
        camera,
        federationSourceId: record.federationSourceId,
        snapshot: record.snapshot,
        surface: active.surface,
      });
      const result = await active.surface.createAnchor({ pick });
      if (result.status !== "created") {
        throw new Error("source-local anchor was not created");
      }
      const evaluation = await active.surface.evaluateAnchor(
        result.anchor,
      );
      if (evaluation.status !== "current") {
        throw new Error("source-local anchor is not current");
      }
      picks.push(pick);
      anchors.push(result.anchor);
    }
    const selection = active.surface.createSelection({
      items: picks.map((pick) => pick.selection.items[0]),
    });
    const view = active.surface.saveView({
      viewId: "view:vscode-federated-three-source-anchor",
      camera,
    });
    const rendererState = active.renderer.state;
    const rangeSources = active.records.map((record) => ({
      sourceSlot: record.federationSourceId,
      reads: record.session.state.rangeReads,
      bytesRead: record.session.state.rangeBytesRead,
    }));
    lastQualified = publish("qualified", {
      ...lastReady,
      selection: {
        items: selection.items.length,
        sourceSlots: selection.items.map((item) =>
          item.federationSourceId),
        distinctKeys: new Set(selection.items.map((item) =>
          item.key)).size,
        mergeAcrossSources:
          selection.identityPolicy.mergeAcrossSources,
        savedView: view.schema,
      },
      renderer: {
        ...lastReady.renderer,
        surfaceHits: rendererState.surfaceHits,
        surfaceMisses: rendererState.surfaceMisses,
        retainedGeometryBytes:
          rendererState.retainedGeometryBytes,
      },
      picks: picks.map((pick) => ({
        sourceSlot: pick.federationSourceId,
        sourceRevisionId: pick.sourceRevisionId,
        nativeId:
          pick.selection.items[0].nativeIdentity.nativeId ?? null,
        globalId:
          pick.selection.items[0].nativeIdentity.globalId ?? null,
        surfaceHitCapability: pick.anchorCapability,
        coordinateSpace:
          pick.rendererPick.surfaceHit.coordinateSpace,
        locator: pick.rendererPick.surfaceHit.locator,
        verification: pick.rendererPick.surfaceHit.verification,
        resources: pick.rendererPick.surfaceHit.resources,
        authority: pick.rendererPick.surfaceHit.authority,
      })),
      anchors: anchors.map(anchorProjection),
      ranges: {
        sources: rangeSources,
        unchangedBySurfaceResolution:
          rangeSources.every((source) => source.reads === 1),
      },
    });
    setStatus(
      "qualified",
      "Qualified: exact hit, normal, triangle locator, and anchors verified.",
    );
    return true;
  } catch (error) {
    publish("failed", {
      ...(lastReady ?? {}),
      diagnostic: {
        code: "FEDERATED_ANCHOR_VERIFICATION_FAILED",
        name: error?.name ?? "Error",
        operation: "anchor-verification",
        retryable: false,
      },
    });
    setStatus(
      "failed",
      "Verification failed: FEDERATED_ANCHOR_VERIFICATION_FAILED",
    );
    return false;
  } finally {
    busy = false;
    controls(elements.status.dataset.state);
  }
}

async function disposeSurface(reason = "vscode-command") {
  if (active === null || busy) {
    return false;
  }
  busy = true;
  controls(elements.status.dataset.state);
  setStatus("opening", "Releasing Surface, GPU, sessions, and Workers…");
  const current = active;
  active = null;
  try {
    const cleanup = await current.surface.dispose({ reason });
    const repeatedDispose = await current.surface.dispose();
    for (const record of current.records) {
      await record.client.dispose();
    }
    const runtimeUrlsRevoked = revokeRuntimeUrls();
    const report = publish("disposed", {
      ...(lastQualified ?? lastReady ?? {}),
      cleanup: {
        surfaceStatus: cleanup.status,
        rendererDisposed: cleanup.cleanup.rendererDisposed,
        backendDisposed: current.backend.state.disposed,
        backendActiveBytes: current.backend.state.activeBytes,
        backendResidentRanges:
          current.backend.state.residentRanges,
        retainedGeometryBytes:
          current.renderer.state.retainedGeometryBytes,
        projectionCachesReleased:
          cleanup.cleanup.sourceReceipts.every((receipt) =>
            receipt.projectionCache.released === true),
        transferredSessionsReleased:
          cleanup.cleanup.sourceReceipts.every((receipt) =>
            receipt.resources.some((resource) =>
              resource.role === "source-session" &&
              resource.released === true)),
        sourceSessionsDisposed: current.records.every((record) =>
          record.session.state.disposed === true),
        workersTerminated: current.records.every((record) =>
          record.client.state.workerActive === false),
        clientsDisposed: current.records.every((record) =>
          record.client.state.disposed === true),
        runtimeUrlsRevoked,
        repeatedDispose,
      },
    });
    setStatus("disposed", "Closed: all local Surface resources released.");
    return report;
  } catch (error) {
    for (const record of current.records) {
      record.client.terminate();
      await record.client.dispose();
    }
    revokeRuntimeUrls();
    publish("failed", {
      ...(lastQualified ?? lastReady ?? {}),
      diagnostic: {
        code: "FEDERATED_SURFACE_DISPOSE_FAILED",
        name: error?.name ?? "Error",
        operation: "surface-dispose",
        retryable: false,
      },
    });
    setStatus("failed", "Close failed: FEDERATED_SURFACE_DISPOSE_FAILED");
    return false;
  } finally {
    busy = false;
    controls(elements.status.dataset.state);
  }
}

elements.verify.addEventListener("click", () => {
  void verifyAnchors();
});
elements.dispose.addEventListener("click", () => {
  void disposeSurface("vscode-button");
});

globalThis.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.schema !== HOST_MESSAGE) {
    return;
  }
  if (message.type === "federation-sources") {
    void openFederation(message);
  } else if (message.type === "verify-anchors") {
    void verifyAnchors();
  } else if (message.type === "dispose") {
    void disposeSurface("vscode-command");
  } else if (message.type === "federation-error") {
    const code = typeof message.diagnostic?.code === "string"
      ? message.diagnostic.code
      : "FEDERATION_FILE_READ_FAILED";
    publish("failed", {
      diagnostic: {
        code,
        operation: "host-admission",
        retryable: message.diagnostic?.retryable === true,
      },
    });
    setStatus("failed", `Open failed: ${code}`);
    controls("failed");
  }
});

globalThis.addEventListener("pagehide", () => {
  for (const record of active?.records ?? []) {
    record.client.terminate();
  }
  revokeRuntimeUrls();
  if (active !== null) {
    void active.surface.dispose({ reason: "pagehide" });
  }
});

setStatus("opening", "Waiting for a bounded local federation document…");
controls("opening");
vscodeApi.postMessage({
  schema: HOST_MESSAGE,
  type: "ready",
});
