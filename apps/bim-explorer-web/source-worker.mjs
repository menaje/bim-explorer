import {
  createWebIfcSourceArtifact,
} from "../../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../../packages/bim-model-source/src/index.mjs";

const REQUEST_SCHEMA =
  "bim-explorer-product-source-worker-request/0.1";
const RESPONSE_SCHEMA =
  "bim-explorer-product-source-worker-response/0.1";
const MAXIMUM_SOURCE_BYTES = 64 * 1024 * 1024;
const OPERATIONS = new Set([
  "getEntity",
  "queryRelations",
  "queryTree",
  "readRange",
  "searchEntities",
]);

let active = null;
let queue = Promise.resolve();
let shuttingDown = false;

function post(requestId, type, value, transfer = []) {
  self.postMessage({
    schema: RESPONSE_SCHEMA,
    requestId,
    type,
    value,
  }, transfer);
}

function progress(requestId, phase, detail = null) {
  post(requestId, "progress", {
    phase,
    detail,
  });
}

function stableDiagnostic(operation, error) {
  const code = error?.name === "AbortError"
    ? "SOURCE_OPERATION_CANCELLED"
    : error?.name === "RangeError"
      ? "SOURCE_LIMIT_OR_IDENTITY_REJECTED"
      : operation === "open"
        ? "SOURCE_OPEN_FAILED"
        : "SOURCE_OPERATION_FAILED";
  return {
    code,
    operation,
    retryable: operation === "open",
  };
}

async function releaseActive() {
  if (active === null) {
    return {
      sessionDisposed: false,
      sourceDisposed: false,
    };
  }
  const current = active;
  active = null;
  const sessionDisposed = await current.session.dispose();
  const sourceDisposed = await current.source.dispose();
  return {
    sessionDisposed,
    sourceDisposed,
  };
}

function validOpen(request) {
  const options = request?.options;
  return (
    request?.schema === REQUEST_SCHEMA &&
    request.type === "open" &&
    typeof request.requestId === "string" &&
    request.requestId.length > 0 &&
    request.bytes instanceof ArrayBuffer &&
    request.bytes.byteLength > 0 &&
    request.bytes.byteLength <= MAXIMUM_SOURCE_BYTES &&
    typeof options?.webIfcModuleUrl === "string" &&
    options.webIfcModuleUrl.length > 0 &&
    typeof options?.wasmPath === "string" &&
    options.wasmPath.length > 0 &&
    (
      options.wasmUrl === null ||
      (
        typeof options.wasmUrl === "string" &&
        options.wasmUrl.length > 0
      )
    ) &&
    typeof options?.profile === "string" &&
    options.profile.length > 0
  );
}

async function openSource(request) {
  if (!validOpen(request)) {
    throw new TypeError("product source open request is invalid");
  }
  await releaseActive();
  const started = performance.now();
  const bytes = new Uint8Array(request.bytes);
  let artifact = null;
  progress(request.requestId, "source-admitted", {
    byteLength: bytes.byteLength,
  });
  try {
    const artifactStarted = performance.now();
    progress(request.requestId, "web-ifc-importing");
    const webIfcModule = await import(
      request.options.webIfcModuleUrl
    );
    progress(request.requestId, "web-ifc-imported");
    artifact = await createWebIfcSourceArtifact(bytes, {
      adapterBackend: "browser-wasm-product-source",
      forceSingleThread: true,
      maximumSourceBytes: MAXIMUM_SOURCE_BYTES,
      profile: request.options.profile,
      wasmPath: request.options.wasmPath,
      wasmUrl: request.options.wasmUrl,
      webIfcModule,
    });
    const artifactMs = performance.now() - artifactStarted;
    progress(request.requestId, "artifact-created", {
      products: artifact.geometry.products,
      ranges: artifact.ranges.length,
    });
    const sourceStarted = performance.now();
    const source = createBimModelSource(artifact, {
      maximumRequestBytes: 1024 * 1024,
    });
    for (const range of artifact.ranges) {
      range.bytes.fill(0);
    }
    const session = await source.open({
      protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
    });
    const snapshot = await session.getSnapshot();
    const sourceMs = performance.now() - sourceStarted;
    active = {
      session,
      snapshot,
      source,
    };
    progress(request.requestId, "snapshot-ready", {
      revisionId: snapshot.revisionId,
    });
    post(request.requestId, "result", {
      descriptor: session.descriptor,
      diagnostics: [],
      performance: {
        artifactMs,
        sourceMs,
        totalMs: performance.now() - started,
      },
      resources: {
        sourceBytes: artifact.resources.observed.sourceBytes,
        geometryBytes:
          artifact.resources.observed.geometryBytes,
        metadataBytes:
          artifact.resources.observed.metadataBytes,
        ranges: artifact.resources.observed.ranges,
        products: artifact.resources.observed.products,
        wasmHeapCapacityBytes:
          artifact.resources.wasmHeapCapacityBytes ?? null,
      },
      snapshot,
    });
  } finally {
    bytes.fill(0);
    for (const range of artifact?.ranges ?? []) {
      range.bytes.fill(0);
    }
  }
}

async function sourceOperation(request) {
  if (
    request?.schema !== REQUEST_SCHEMA ||
    request.type !== "operation" ||
    typeof request.requestId !== "string" ||
    !OPERATIONS.has(request.operation) ||
    active === null
  ) {
    throw new TypeError(
      "product source operation request is invalid",
    );
  }
  const args = Array.isArray(request.args)
    ? request.args
    : [];
  const operation = active.session[request.operation];
  if (typeof operation !== "function") {
    throw new TypeError(
      "product source operation is unavailable",
    );
  }
  const value = await operation(...args);
  if (value instanceof Uint8Array) {
    const bytes = value.slice();
    post(
      request.requestId,
      "result",
      bytes.buffer,
      [bytes.buffer],
    );
  } else {
    post(request.requestId, "result", value);
  }
}

async function handle(request) {
  const requestId =
    typeof request?.requestId === "string"
      ? request.requestId
      : "invalid";
  const operation = request?.type === "operation"
    ? request.operation
    : request?.type ?? "invalid";
  try {
    if (shuttingDown) {
      throw new DOMException(
        "product source Worker is shutting down",
        "InvalidStateError",
      );
    }
    if (request?.type === "open") {
      await openSource(request);
    } else if (request?.type === "operation") {
      await sourceOperation(request);
    } else if (request?.type === "release") {
      const cleanup = await releaseActive();
      post(requestId, "result", cleanup);
    } else if (request?.type === "shutdown") {
      shuttingDown = true;
      const cleanup = await releaseActive();
      post(requestId, "result", {
        ...cleanup,
        workerClosed: true,
      });
      setTimeout(() => self.close(), 0);
    } else {
      throw new TypeError(
        "product source Worker request is invalid",
      );
    }
  } catch (error) {
    if (request?.type === "open") {
      await releaseActive();
    }
    post(requestId, "error", stableDiagnostic(
      operation,
      error,
    ));
  }
}

post("worker:boot", "progress", {
  phase: "worker-ready",
});

self.addEventListener("message", (event) => {
  queue = queue.then(
    () => handle(event.data),
    () => handle(event.data),
  );
});
