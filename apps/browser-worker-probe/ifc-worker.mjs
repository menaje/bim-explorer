import * as WebIFC from "/vendor/web-ifc-api.js";

const REQUEST_SCHEMA = "bim-explorer-browser-worker-request/0.4";
const RESULT_SCHEMA = "bim-explorer-browser-worker-result/0.4";
const PROGRESS_SCHEMA = "bim-explorer-browser-worker-progress/0.2";
const SOURCE_ID = /^[a-z0-9][a-z0-9-]+$/u;
const SOURCE_KINDS = new Set([
  "local-file",
  "public-fixture",
  "synthetic",
]);
const EXCHANGE_START = Uint8Array.from(
  "ISO-10303-21;",
  (value) => value.charCodeAt(0),
);
const EXCHANGE_END = Uint8Array.from(
  "END-ISO-10303-21;",
  (value) => value.charCodeAt(0),
);
const HEADER_TOKEN = Uint8Array.from(
  "HEADER;",
  (value) => value.charCodeAt(0),
);
const DATA_TOKEN = Uint8Array.from(
  "DATA;",
  (value) => value.charCodeAt(0),
);
const END_SECTION_TOKEN = Uint8Array.from(
  "ENDSEC;",
  (value) => value.charCodeAt(0),
);
const MAX_HEADER_SCAN_BYTES = 1024 * 1024;
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

function tokenAt(bytes, token, offset) {
  if (offset < 0 || offset + token.length > bytes.length) {
    return false;
  }
  for (let index = 0; index < token.length; index += 1) {
    if (bytes[offset + index] !== token[index]) {
      return false;
    }
  }
  return true;
}

function indexOfToken(bytes, token, start, end) {
  const maximum = Math.min(
    end - token.length,
    bytes.length - token.length,
  );
  for (let offset = start; offset <= maximum; offset += 1) {
    if (tokenAt(bytes, token, offset)) {
      return offset;
    }
  }
  return -1;
}

function validIfcExchangeEnvelope(bytes) {
  if (!tokenAt(bytes, EXCHANGE_START, 0)) {
    return false;
  }
  let meaningfulEnd = bytes.length;
  while (
    meaningfulEnd > 0 &&
    [
      0x09,
      0x0a,
      0x0d,
      0x20,
    ].includes(bytes[meaningfulEnd - 1])
  ) {
    meaningfulEnd -= 1;
  }
  const exchangeEnd = meaningfulEnd - EXCHANGE_END.length;
  if (!tokenAt(bytes, EXCHANGE_END, exchangeEnd)) {
    return false;
  }
  const headerScanEnd = Math.min(
    exchangeEnd,
    MAX_HEADER_SCAN_BYTES,
  );
  const header = indexOfToken(
    bytes,
    HEADER_TOKEN,
    EXCHANGE_START.length,
    headerScanEnd,
  );
  const firstEndSection = indexOfToken(
    bytes,
    END_SECTION_TOKEN,
    header + HEADER_TOKEN.length,
    headerScanEnd,
  );
  const data = indexOfToken(
    bytes,
    DATA_TOKEN,
    firstEndSection + END_SECTION_TOKEN.length,
    headerScanEnd,
  );
  let secondEndSection = exchangeEnd - END_SECTION_TOKEN.length;
  while (
    secondEndSection > data &&
    !tokenAt(bytes, END_SECTION_TOKEN, secondEndSection)
  ) {
    secondEndSection -= 1;
  }
  return (
    header >= EXCHANGE_START.length &&
    firstEndSection > header &&
    data > firstEndSection &&
    secondEndSection > data &&
    exchangeEnd > secondEndSection
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
  let modelOpened = false;
  let modelSchema = null;
  let failurePhase = "request-validation";
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

    failurePhase = "source-envelope";
    if (!validIfcExchangeEnvelope(bytes)) {
      throw new Error("invalid IFC exchange envelope");
    }

    failurePhase = "model-open";
    await checkpoint(state, "model-open-call-starting");
    const openStarted = performance.now();
    modelId = api.OpenModel(bytes, {
      COORDINATE_TO_ORIGIN: false,
    });
    modelOpened = true;
    const openMs = performance.now() - openStarted;
    modelSchema = api.GetModelSchema(modelId);
    wasmHeapAfterOpen = wasmHeapCapacity(api);
    await checkpoint(state, "model-opened");

    failurePhase = "model-inspection";
    const inspectionStarted = performance.now();
    const semantics = {
      projects: entityCount(api, modelId, WebIFC.IFCPROJECT),
      walls: entityCount(api, modelId, WebIFC.IFCWALL),
    };
    if (semantics.projects === 0) {
      failurePhase = "semantic-admission";
      throw new Error("IFC source has no project root");
    }
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
      report =
        bytes instanceof Uint8Array &&
        typeof digest === "string" &&
        request?.source !== null &&
        typeof request?.source === "object"
          ? {
            schema: RESULT_SCHEMA,
            requestId,
            status: "failed",
            engine: engineIdentity(),
            source: {
              id: request.source.id,
              kind: request.source.kind,
              byteLength: bytes.byteLength,
              sha256: digest,
              schema:
                typeof modelSchema === "string" &&
                modelSchema.length > 0
                  ? modelSchema
                  : null,
            },
            failure: {
              code: "BROWSER_IFC_INPUT_REJECTED",
              phase: failurePhase,
            },
            resources: {
              inputBytes: bytes.byteLength,
            },
            cleanup: {
              modelOpened,
              modelClosed: false,
              engineDisposed: false,
            },
            diagnostics: [
              {
                code: "BROWSER_IFC_INPUT_REJECTED",
              },
            ],
          }
          : {
            schema: RESULT_SCHEMA,
            requestId,
            status: "failed",
            failure: {
              code: "BROWSER_IFC_REQUEST_REJECTED",
              phase: "request-validation",
            },
            cleanup: {
              modelOpened: false,
              modelClosed: false,
              engineDisposed: false,
            },
            diagnostics: [
              {
                code: "BROWSER_IFC_REQUEST_REJECTED",
              },
            ],
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

  report.cleanup = report.status === "failed"
    ? {
      modelOpened,
      modelClosed,
      engineDisposed,
    }
    : {
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
