import {
  LAS_LAZ_MAXIMUM_SOURCE_BYTES,
  createLasLazPointSourceArtifact,
} from "../../packages/las-laz-point-source/src/index.mjs";

const REQUEST_SCHEMA =
  "bim-explorer-point-source-worker-request/0.1";
const RESPONSE_SCHEMA =
  "bim-explorer-point-source-worker-response/0.1";
const FORMATS = new Set(["las", "laz"]);

let accepted = false;
let loadedLazPerfScriptUrl = null;

function post(requestId, type, value, transfer = []) {
  self.postMessage({
    schema: RESPONSE_SCHEMA,
    requestId,
    type,
    value,
  }, transfer);
}

function progress(requestId, phase, detail = null) {
  post(requestId, "progress", { detail, phase });
}

function sameOriginUrl(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} is invalid`);
  }
  const url = new URL(value, self.location.href);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.origin !== self.location.origin ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0
  ) {
    throw new TypeError(`${label} must be a same-origin URL`);
  }
  return url.href;
}

function validRequest(request) {
  return (
    request?.schema === REQUEST_SCHEMA &&
    request.type === "open" &&
    typeof request.requestId === "string" &&
    request.requestId.length > 0 &&
    request.bytes instanceof ArrayBuffer &&
    request.bytes.byteLength > 0 &&
    request.bytes.byteLength <= LAS_LAZ_MAXIMUM_SOURCE_BYTES &&
    FORMATS.has(request.options?.format)
  );
}

async function lazPerfModuleFactory(scriptUrl, wasmUrl) {
  if (loadedLazPerfScriptUrl === null) {
    importScripts(scriptUrl);
    loadedLazPerfScriptUrl = scriptUrl;
  } else if (loadedLazPerfScriptUrl !== scriptUrl) {
    throw new Error("LAZ decoder script identity changed");
  }
  if (typeof globalThis.createLazPerf !== "function") {
    throw new Error("LAZ decoder factory is unavailable");
  }
  return await globalThis.createLazPerf({
    locateFile(name) {
      if (name !== "laz-perf.wasm") {
        throw new Error("LAZ decoder requested an unknown asset");
      }
      return wasmUrl;
    },
  });
}

async function open(request) {
  if (accepted || !validRequest(request)) {
    throw new TypeError("point source Worker request is invalid");
  }
  accepted = true;
  const format = request.options.format;
  const scriptUrl = sameOriginUrl(
    request.options.lazPerfScriptUrl,
    "LAZ decoder script URL",
  );
  const wasmUrl = sameOriginUrl(
    request.options.lazPerfWasmUrl,
    "LAZ decoder WASM URL",
  );
  const bytes = new Uint8Array(request.bytes);
  const started = performance.now();
  let artifact = null;
  try {
    progress(request.requestId, "source-admitted", {
      byteLength: bytes.byteLength,
      format,
    });
    if (format === "laz") {
      progress(request.requestId, "decoder-initializing");
    }
    artifact = await createLasLazPointSourceArtifact(bytes, {
      format,
      moduleFactory: format === "laz"
        ? () => lazPerfModuleFactory(scriptUrl, wasmUrl)
        : undefined,
    });
    progress(request.requestId, "point-range-created", {
      pointRangeBytes: artifact.range.byteLength,
      points: artifact.model.points,
    });
    bytes.fill(0);
    const rangeBuffer = artifact.range.bytes.buffer;
    post(request.requestId, "result", {
      artifact,
      cleanup: {
        pointRangeTransferred: true,
        sourceBufferCleared: bytes.every((value) => value === 0),
        workerRetainedUntilClientReceipt: true,
      },
      performance: {
        totalMs: performance.now() - started,
      },
    }, [rangeBuffer]);
  } finally {
    bytes.fill(0);
    if (
      artifact !== null &&
      artifact.range.bytes.byteLength > 0
    ) {
      artifact.range.bytes.fill(0);
    }
  }
}

self.addEventListener("message", (event) => {
  const request = event.data;
  Promise.resolve()
    .then(() => open(request))
    .catch((error) => {
      post(
        typeof request?.requestId === "string"
          ? request.requestId
          : "invalid",
        "error",
        {
          code: error?.name === "RangeError"
            ? "POINT_SOURCE_LIMIT_REJECTED"
            : "POINT_SOURCE_OPEN_FAILED",
          retryable: true,
        },
      );
    });
});
