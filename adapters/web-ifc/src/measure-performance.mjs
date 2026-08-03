import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import * as WebIFC from "web-ifc";

export const WEB_IFC_PERFORMANCE_REPORT =
  "bim-explorer-web-ifc-performance-report/1";
const FIXTURE_ID = /^[a-z0-9][a-z0-9-]+$/u;

function parseInputArguments(values) {
  if (values.length !== 4) {
    throw new TypeError(
      "usage: node adapters/web-ifc/src/measure-performance.mjs " +
        "--input <source.ifc> --fixture-id <id>",
    );
  }
  const options = {
    fixtureId: null,
    input: null,
  };
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (name === "--input" && value) {
      options.input = path.resolve(value);
    } else if (
      name === "--fixture-id" &&
      FIXTURE_ID.test(value ?? "")
    ) {
      options.fixtureId = value;
    } else {
      throw new TypeError(`invalid web-ifc performance argument ${name}`);
    }
  }
  if (options.input === null || options.fixtureId === null) {
    throw new TypeError("--input and --fixture-id are required");
  }
  return options;
}

function entityCount(api, modelId, type, includeInherited = false) {
  return api
    .GetLineIDsWithType(modelId, type, includeInherited)
    .size();
}

function wasmHeapCapacity(api) {
  const value = api.wasmModule?.HEAPU8?.buffer?.byteLength;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("web-ifc WASM heap capacity is unavailable");
  }
  return value;
}

function geometryCounts(api, modelId) {
  let products = 0;
  let geometries = 0;
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
        geometries += 1;
        triangles += Math.floor(indices.length / 3);
      } finally {
        geometry.delete();
      }
    }
  });
  return {
    products,
    geometries,
    triangles,
  };
}

export async function measureWebIfcPerformance(input, fixtureId) {
  if (!FIXTURE_ID.test(fixtureId ?? "")) {
    throw new TypeError("invalid performance fixture ID");
  }
  const totalStarted = performance.now();
  const readStarted = performance.now();
  const bytes = await readFile(input);
  const readMs = performance.now() - readStarted;
  const api = new WebIFC.IfcAPI();
  let initialized = false;
  let modelId = null;
  let modelClosed = false;
  let engineDisposed = false;
  let report;

  try {
    const initializationStarted = performance.now();
    await api.Init();
    initialized = true;
    const initializationMs = performance.now() - initializationStarted;
    const heapAfterInitialization = wasmHeapCapacity(api);

    const openStarted = performance.now();
    modelId = api.OpenModel(bytes, {
      COORDINATE_TO_ORIGIN: false,
    });
    const openMs = performance.now() - openStarted;
    const heapAfterOpen = wasmHeapCapacity(api);

    const inspectionStarted = performance.now();
    const semantics = {
      projects: entityCount(api, modelId, WebIFC.IFCPROJECT),
      walls: entityCount(api, modelId, WebIFC.IFCWALL),
      productsByType: entityCount(
        api,
        modelId,
        WebIFC.IFCPRODUCT,
        true,
      ),
    };
    const geometry = geometryCounts(api, modelId);
    const inspectionMs = performance.now() - inspectionStarted;
    const heapAfterInspection = wasmHeapCapacity(api);
    const memory = process.memoryUsage();
    report = {
      schema: WEB_IFC_PERFORMANCE_REPORT,
      status: "passed",
      engine: {
        id: "web-ifc",
        version: "0.0.77",
        backend: "node-wasm-isolated-performance",
        license: "MPL-2.0",
      },
      source: {
        id: fixtureId,
        kind: "third-party-public-performance",
        byteLength: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        schema: api.GetModelSchema(modelId),
      },
      semantics,
      geometry,
      performance: {
        readMs,
        initializationMs,
        openMs,
        inspectionMs,
        totalMs: performance.now() - totalStarted,
      },
      resources: {
        inputBytes: bytes.byteLength,
        wasmHeapCapacityBytes: {
          afterInitialization: heapAfterInitialization,
          afterOpen: heapAfterOpen,
          afterInspection: heapAfterInspection,
          peakObserved: Math.max(
            heapAfterInitialization,
            heapAfterOpen,
            heapAfterInspection,
          ),
        },
        processMemoryBytes: {
          maximumResidentSetSize:
            process.resourceUsage().maxRSS * 1024,
          residentSetSizeAfterInspection: memory.rss,
          heapUsedAfterInspection: memory.heapUsed,
        },
      },
      cleanup: {
        modelClosed: false,
        engineDisposed: false,
      },
      diagnostics: [],
    };
  } finally {
    if (modelId !== null) {
      api.CloseModel(modelId);
      modelClosed = true;
    }
    if (initialized) {
      api.Dispose();
      engineDisposed = true;
    }
  }
  report.cleanup = {
    modelClosed,
    engineDisposed,
  };
  return report;
}

async function main() {
  const options = parseInputArguments(process.argv.slice(2));
  const report = await measureWebIfcPerformance(
    options.input,
    options.fixtureId,
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
