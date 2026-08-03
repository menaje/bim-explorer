import * as WebIFC from "/vendor/web-ifc-api.js";

const REQUEST_SCHEMA = "bim-explorer-browser-worker-request/0.1";
const RESULT_SCHEMA = "bim-explorer-browser-worker-result/0.1";
let handled = false;

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

self.addEventListener("message", async (event) => {
  if (handled) {
    return;
  }
  handled = true;
  const request = event.data;
  const requestId =
    typeof request?.requestId === "string" ? request.requestId : "invalid";
  const started = performance.now();
  const api = new WebIFC.IfcAPI();
  let initialized = false;
  let modelId = null;
  let report;
  let modelClosed = false;
  let engineDisposed = false;

  try {
    if (
      request?.schema !== REQUEST_SCHEMA ||
      request.type !== "inspect" ||
      !(request.bytes instanceof ArrayBuffer) ||
      request.bytes.byteLength === 0
    ) {
      throw new TypeError("invalid request");
    }
    const bytes = new Uint8Array(request.bytes);
    const digest = await sha256(bytes);
    const initializationStarted = performance.now();
    api.SetWasmPath(new URL("/vendor/", self.location.origin).href, true);
    await api.Init(undefined, true);
    initialized = true;
    const initializationMs = performance.now() - initializationStarted;

    const openStarted = performance.now();
    modelId = api.OpenModel(bytes, {
      COORDINATE_TO_ORIGIN: false,
    });
    const openMs = performance.now() - openStarted;

    const inspectionStarted = performance.now();
    const semantics = {
      projects: entityCount(api, modelId, WebIFC.IFCPROJECT),
      walls: entityCount(api, modelId, WebIFC.IFCWALL),
    };
    const geometry = geometryCounts(api, modelId);
    const inspectionMs = performance.now() - inspectionStarted;
    report = {
      schema: RESULT_SCHEMA,
      requestId,
      status: "passed",
      engine: {
        id: "web-ifc",
        version: "0.0.77",
        backend: "browser-wasm-worker-prototype",
        license: "MPL-2.0",
      },
      fixture: {
        id: "synthetic-small-ifc4",
        byteLength: bytes.byteLength,
        sha256: digest,
        schema: api.GetModelSchema(modelId),
      },
      semantics,
      geometry,
      performance: {
        initializationMs,
        openMs,
        inspectionMs,
        totalMs: performance.now() - started,
      },
      cleanup: {
        modelClosed: false,
        engineDisposed: false,
      },
      diagnostics: [],
    };
  } catch {
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
});
