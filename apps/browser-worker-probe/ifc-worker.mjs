import * as WebIFC from "/vendor/web-ifc-api.js";

const REQUEST_SCHEMA = "bim-explorer-browser-worker-request/0.4";
const RESULT_SCHEMA = "bim-explorer-browser-worker-result/0.4";
const PROGRESS_SCHEMA = "bim-explorer-browser-worker-progress/0.1";
const SOURCE_ID = /^[a-z0-9][a-z0-9-]+$/u;
const SOURCE_KINDS = new Set([
  "local-file",
  "synthetic",
]);
const CANCELLED = Symbol("cancelled");
let active = null;

function entityCount(api, modelId, type) {
  return api.GetLineIDsWithType(modelId, type, false).size();
}

function geometryCounts(api, modelId) {
  let products = 0;
  let triangles = 0;
  api.StreamAllMeshes(modelId, (mesh) => {
    products += 1;
    for (let index = 0; index < mesh.geometries.size(); index += 1) {
      const placedGeometry = mesh.geometries.get(index);
      const geometry = api.GetGeometry(
        modelId,
        placedGeometry.geometryExpressID,
      );
      try {
        const indices = api.GetIndexArray(
          geometry.GetIndexData(),
          geometry.GetIndexDataSize(),
        );
        triangles += Math.floor(indices.length / 3);
      } finally {
        geometry.delete();
      }
    }
  });
  return {
    products,
    triangles,
  };
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")).join("");
}

function engineIdentity() {
  return {
    id: "web-ifc",
    version: "0.0.77",
    backend: "browser-wasm-worker-prototype",
    license: "MPL-2.0",
  };
}

function wasmHeapCapacity(api) {
  const value = api.wasmModule?.HEAPU8?.buffer?.byteLength;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("web-ifc WASM heap capacity is unavailable");
  }
  return value;
}

function validInspectRequest(request) {
  return (
    request?.schema === REQUEST_SCHEMA &&
    request.type === "inspect" &&
    request.source !== null &&
    typeof request.source === "object" &&
    SOURCE_ID.test(request.source.id) &&
    SOURCE_KINDS.has(request.source.kind) &&
    request.bytes instanceof ArrayBuffer &&
    request.bytes.byteLength > 0
  );
}

async function checkpoint(state, phase) {
  state.phase = phase;
  const waiting = new Promise((resolve) => {
    state.resume = resolve;
    state.waitingPhase = phase;
  });
  self.postMessage({
    schema: PROGRESS_SCHEMA,
    requestId: state.requestId,
    status: "progress",
    phase,
  });
  if (state.cancelRequested) {
    state.resume();
  }
  await waiting;
  state.resume = null;
  state.waitingPhase = null;
  if (state.cancelRequested) {
    throw CANCELLED;
  }
}

async function inspectRequest(request, state) {
  const requestId =
    typeof request?.requestId === "string" ? request.requestId : "invalid";
  const started = performance.now();
  const api = new WebIFC.IfcAPI();
  let bytes;
  let digest;
  let initialized = false;
  let modelId = null;
  let modelSchema = null;
  let wasmHeapAfterInitialization = null;
  let wasmHeapAfterInspection = null;
  let wasmHeapAfterOpen = null;
  let report;
  let modelClosed = false;
  let engineDisposed = false;

  try {
    if (!validInspectRequest(request)) {
      throw new TypeError("invalid request");
    }
    bytes = new Uint8Array(request.bytes);
    digest = await sha256(bytes);
    const initializationStarted = performance.now();
    api.SetWasmPath(new URL("/vendor/", self.location.origin).href, true);
    await api.Init(undefined, true);
    initialized = true;
    wasmHeapAfterInitialization = wasmHeapCapacity(api);
    const initializationMs = performance.now() - initializationStarted;
    await checkpoint(state, "engine-initialized");

    const openStarted = performance.now();
    modelId = api.OpenModel(bytes, {
      COORDINATE_TO_ORIGIN: false,
    });
    const openMs = performance.now() - openStarted;
    modelSchema = api.GetModelSchema(modelId);
    wasmHeapAfterOpen = wasmHeapCapacity(api);
    await checkpoint(state, "model-opened");

    const inspectionStarted = performance.now();
    const semantics = {
      projects: entityCount(api, modelId, WebIFC.IFCPROJECT),
      walls: entityCount(api, modelId, WebIFC.IFCWALL),
    };
    const geometry = geometryCounts(api, modelId);
    const inspectionMs = performance.now() - inspectionStarted;
    wasmHeapAfterInspection = wasmHeapCapacity(api);
    await checkpoint(state, "inspection-complete");
    report = {
      schema: RESULT_SCHEMA,
      requestId,
      status: "passed",
      engine: engineIdentity(),
      source: {
        id: request.source.id,
        kind: request.source.kind,
        byteLength: bytes.byteLength,
        sha256: digest,
        schema: modelSchema,
      },
      semantics,
      geometry,
      performance: {
        initializationMs,
        openMs,
        inspectionMs,
        totalMs: performance.now() - started,
      },
      resources: {
        inputBytes: bytes.byteLength,
        wasmHeapCapacityBytes: {
          afterInitialization: wasmHeapAfterInitialization,
          afterInspection: wasmHeapAfterInspection,
          afterOpen: wasmHeapAfterOpen,
          peakObserved: Math.max(
            wasmHeapAfterInitialization,
            wasmHeapAfterOpen,
            wasmHeapAfterInspection,
          ),
        },
      },
      cleanup: {
        modelClosed: false,
        engineDisposed: false,
      },
      diagnostics: [],
    };
  } catch (error) {
    if (
      error === CANCELLED &&
      bytes instanceof Uint8Array &&
      typeof digest === "string"
    ) {
      report = {
        schema: RESULT_SCHEMA,
        requestId,
        status: "cancelled",
        phase: state.phase,
        engine: engineIdentity(),
        source: {
          id: request.source.id,
          kind: request.source.kind,
          byteLength: bytes.byteLength,
          sha256: digest,
          schema: modelSchema,
        },
        cleanup: {
          modelClosed: false,
          engineDisposed: false,
        },
        diagnostics: [],
      };
    } else {
      report = {
        schema: RESULT_SCHEMA,
        requestId,
        status: "failed",
        diagnostic: {
          code: "BROWSER_IFC_INSPECTION_FAILED",
        },
        cleanup: {
          modelClosed: false,
          engineDisposed: false,
        },
      };
    }
  } finally {
    if (modelId !== null) {
      try {
        api.CloseModel(modelId);
        modelClosed = true;
      } catch {
        modelClosed = false;
      }
    }
    if (initialized) {
      try {
        api.Dispose();
        engineDisposed = true;
      } catch {
        engineDisposed = false;
      }
    }
  }

  report.cleanup = {
    modelClosed,
    engineDisposed,
  };
  self.postMessage(report);
}

self.addEventListener("message", (event) => {
  const request = event.data;
  if (active === null) {
    if (request?.type !== "inspect") {
      return;
    }
    active = {
      cancelRequested: false,
      phase: null,
      requestId:
        typeof request.requestId === "string"
          ? request.requestId
          : "invalid",
      resume: null,
      waitingPhase: null,
    };
    const state = active;
    void inspectRequest(request, state).finally(() => {
      if (active === state) {
        active = null;
      }
    });
    return;
  }
  if (
    request?.schema !== REQUEST_SCHEMA ||
    request.requestId !== active.requestId
  ) {
    return;
  }
  if (request.type === "cancel") {
    active.cancelRequested = true;
    active.resume?.();
    return;
  }
  if (
    request.type === "continue" &&
    request.phase === active.waitingPhase &&
    !active.cancelRequested
  ) {
    active.resume?.();
  }
});
