import {
  LAS_LAZ_MAXIMUM_SOURCE_BYTES,
  createLasLazPointSourceArtifact,
} from "../../packages/las-laz-point-source/src/index.mjs";
import {
  E57_MULTIPLE_SCAN_MAXIMUM_SOURCE_BYTES,
  createE57ProductPointSourceArtifact,
} from "../../packages/e57-point-source/src/index.mjs";
import {
  BIM_POINT_HIERARCHY_CONTRACT,
  createDerivedPointCloudHierarchy,
} from "../../packages/bim-renderer-3d/src/point-cloud-lod.mjs";

const REQUEST_SCHEMA =
  "bim-explorer-point-source-worker-request/0.2";
const RESPONSE_SCHEMA =
  "bim-explorer-point-source-worker-response/0.2";
const FORMATS = new Set(["e57", "las", "laz"]);
const MAXIMUM_SOURCE_BYTES = Object.freeze({
  e57: E57_MULTIPLE_SCAN_MAXIMUM_SOURCE_BYTES,
  las: LAS_LAZ_MAXIMUM_SOURCE_BYTES,
  laz: LAS_LAZ_MAXIMUM_SOURCE_BYTES,
});

let accepted = false;
let hierarchy = null;
let loadedLazPerfScriptUrl = null;
let operation = Promise.resolve();

function stableErrorCode(error) {
  const message = typeof error?.message === "string"
    ? error.message
    : "";
  if (
    error?.name === "EvalError" &&
    /compile or instantiate WebAssembly|WebAssembly compilation/iu
      .test(message)
  ) {
    return "POINT_SOURCE_WASM_CSP_REJECTED";
  }
  if (error?.name === "RangeError") {
    return "POINT_SOURCE_LIMIT_REJECTED";
  }
  if (error?.name === "EvalError") {
    return "POINT_SOURCE_DYNAMIC_CODE_REJECTED";
  }
  if (
    ["CompileError", "LinkError", "RuntimeError"].includes(
      error?.name,
    )
  ) {
    return "POINT_SOURCE_WASM_FAILED";
  }
  if (error?.name === "SecurityError") {
    return "POINT_SOURCE_RUNTIME_SECURITY_REJECTED";
  }
  if (error?.name === "TypeError") {
    return "POINT_SOURCE_RUNTIME_CONTRACT_REJECTED";
  }
  return "POINT_SOURCE_OPEN_FAILED";
}

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
  const allowedProtocol = ["http:", "https:", "blob:"].includes(
    url.protocol,
  );
  if (
    !allowedProtocol ||
    url.origin !== self.location.origin ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0
  ) {
    throw new TypeError(`${label} must be a same-origin URL`);
  }
  return url.href;
}

function validOpenRequest(request) {
  return (
    request?.schema === REQUEST_SCHEMA &&
    request.type === "open" &&
    typeof request.requestId === "string" &&
    request.requestId.length > 0 &&
    request.bytes instanceof ArrayBuffer &&
    request.bytes.byteLength > 0 &&
    FORMATS.has(request.options?.format) &&
    request.bytes.byteLength <=
      MAXIMUM_SOURCE_BYTES[request.options.format]
  );
}

function validLodRequest(request) {
  return (
    request?.schema === REQUEST_SCHEMA &&
    typeof request.requestId === "string" &&
    request.requestId.length > 0 &&
    (
      (
        request.type === "read-lod" &&
        typeof request.options?.levelId === "string" &&
        request.options.levelId.length > 0 &&
        (
          request.options.chunkIds === undefined ||
          Array.isArray(request.options.chunkIds)
        )
      ) ||
      request.type === "dispose-lod"
    )
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
  if (accepted || !validOpenRequest(request)) {
    throw new TypeError("point source Worker request is invalid");
  }
  accepted = true;
  const format = request.options.format;
  const scriptUrl = format === "laz"
    ? sameOriginUrl(
        request.options.lazPerfScriptUrl,
        "LAZ decoder script URL",
      )
    : null;
  const wasmUrl = format === "laz"
    ? sameOriginUrl(
        request.options.lazPerfWasmUrl,
        "LAZ decoder WASM URL",
      )
    : null;
  const bytes = new Uint8Array(request.bytes);
  const started = performance.now();
  let artifact = null;
  let completed = false;
  let initial = null;
  try {
    progress(request.requestId, "source-admitted", {
      byteLength: bytes.byteLength,
      format,
    });
    if (format === "laz") {
      progress(request.requestId, "decoder-initializing");
    }
    artifact = format === "e57"
      ? await createE57ProductPointSourceArtifact(bytes)
      : await createLasLazPointSourceArtifact(bytes, {
          format,
          moduleFactory: format === "laz"
            ? () => lazPerfModuleFactory(scriptUrl, wasmUrl)
            : undefined,
        });
    const hierarchyRequested = request.options.hierarchy === true;
    if (hierarchyRequested) {
      progress(request.requestId, "point-hierarchy-creating", {
        points: artifact.model.points,
      });
      hierarchy = await createDerivedPointCloudHierarchy({
        range: artifact.range,
        source: artifact.source,
      });
      initial = await hierarchy.readLevel(
        hierarchy.manifest.initialLevelId,
      );
      progress(request.requestId, "point-lod-ready", {
        chunks: hierarchy.manifest.chunks.length,
        levels: hierarchy.manifest.levels.length,
        points: initial.receipt.level.pointCount,
      });
    } else {
      progress(request.requestId, "point-range-created", {
        pointRangeBytes: artifact.range.byteLength,
        points: artifact.model.points,
      });
    }
    bytes.fill(0);
    const rootRange = artifact.range;
    const range = initial?.range ?? rootRange;
    const hierarchyState = hierarchy?.state ?? null;
    const hierarchyContract = hierarchy === null
      ? null
      : BIM_POINT_HIERARCHY_CONTRACT;
    const retainHierarchy =
      hierarchy !== null && hierarchy.manifest.levels.length > 1;
    const transportArtifact = hierarchy === null
      ? artifact
      : {
          ...artifact,
          hierarchy: hierarchy.manifest,
          range,
          rootRange: {
            byteLength: rootRange.byteLength,
            handleId: rootRange.handleId,
            mediaType: rootRange.mediaType,
            sha256: rootRange.sha256,
          },
          resources: {
            ...artifact.resources,
            hierarchyIndexBytes: hierarchyState.indexBytes,
            hierarchyRetainedBytes: hierarchyState.retainedBytes,
            initialPointRangeBytes: range.byteLength,
          },
        };
    const transfer = [range.bytes.buffer];
    if (range.pointIndices instanceof Uint32Array) {
      transfer.push(range.pointIndices.buffer);
    }
    if (!retainHierarchy && hierarchy !== null) {
      await hierarchy.dispose();
      hierarchy = null;
    }
    post(request.requestId, "result", {
      artifact: transportArtifact,
      cleanup: {
        hierarchyContract,
        pointIndexMapTransferred:
          range.pointIndices instanceof Uint32Array,
        pointRangeTransferred: true,
        sourceBufferCleared: bytes.every((value) => value === 0),
        workerRetainedForLod: retainHierarchy,
        workerRetainedUntilClientReceipt: true,
      },
      performance: {
        totalMs: performance.now() - started,
      },
    }, transfer);
    completed = true;
  } finally {
    bytes.fill(0);
    if (
      artifact !== null &&
      artifact.range.bytes.byteLength > 0
    ) {
      artifact.range.bytes.fill(0);
    }
    if (!completed && hierarchy !== null) {
      await hierarchy.dispose();
      hierarchy = null;
    }
  }
}

async function readLod(request) {
  if (!accepted || hierarchy === null || !validLodRequest(request)) {
    throw new TypeError("point LOD Worker request is invalid");
  }
  const result = await hierarchy.readLevel(
    request.options.levelId,
    { chunkIds: request.options.chunkIds },
  );
  const transfer = [result.range.bytes.buffer];
  if (result.range.pointIndices instanceof Uint32Array) {
    transfer.push(result.range.pointIndices.buffer);
  }
  post(request.requestId, "result", {
    hierarchyId: hierarchy.manifest.hierarchyId,
    ...result,
  }, transfer);
}

async function disposeLod(request) {
  if (!accepted || hierarchy === null || !validLodRequest(request)) {
    throw new TypeError("point LOD dispose request is invalid");
  }
  const hierarchyId = hierarchy.manifest.hierarchyId;
  const disposed = await hierarchy.dispose();
  const state = hierarchy.state;
  hierarchy = null;
  post(request.requestId, "result", {
    cleanup: {
      disposed,
      hierarchyId,
      indexBytes: state.indexBytes,
      retainedBytes: state.retainedBytes,
      rootRangeBytes: state.rootRangeBytes,
    },
  });
}

async function route(request) {
  if (request?.type === "open") {
    return await open(request);
  }
  if (request?.type === "read-lod") {
    return await readLod(request);
  }
  if (request?.type === "dispose-lod") {
    return await disposeLod(request);
  }
  throw new TypeError("point source Worker request is invalid");
}

self.addEventListener("message", (event) => {
  const request = event.data;
  operation = operation
    .then(() => route(request))
    .catch((error) => {
      post(
        typeof request?.requestId === "string"
          ? request.requestId
          : "invalid",
        "error",
        {
          code: stableErrorCode(error),
          retryable: true,
        },
      );
    });
});
