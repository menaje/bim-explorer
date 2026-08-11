import {
  createWebIfcSourceArtifact,
} from "../../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../../packages/bim-model-source/src/index.mjs";
import {
  createGltfReferenceSource,
} from "../../packages/gltf-reference-source/src/index.mjs";

const REQUEST_SCHEMA =
  "bim-explorer-product-source-worker-request/0.1";
const RESPONSE_SCHEMA =
  "bim-explorer-product-source-worker-response/0.1";
const MAXIMUM_SOURCE_BYTES = 64 * 1024 * 1024;
const SOURCE_FORMATS = new Set(["ifc", "gltf", "glb"]);
const EXTERNAL_RESOURCE_NAME =
  /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:bin|jpe?g|png)$/u;
const OPERATIONS = new Set([
  "getEntity",
  "getEntityDetails",
  "getPropertySetValues",
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
  const resources = request?.resources;
  return (
    request?.schema === REQUEST_SCHEMA &&
    request.type === "open" &&
    typeof request.requestId === "string" &&
    request.requestId.length > 0 &&
    request.bytes instanceof ArrayBuffer &&
    request.bytes.byteLength > 0 &&
    request.bytes.byteLength <= MAXIMUM_SOURCE_BYTES &&
    Array.isArray(resources) &&
    resources.length <= 16 &&
    (resources.length === 0 || options?.format === "gltf") &&
    new Set(resources.map((resource) => resource?.uri)).size ===
      resources.length &&
    resources.every((resource) =>
      typeof resource?.uri === "string" &&
      resource.uri.length <= 128 &&
      EXTERNAL_RESOURCE_NAME.test(resource.uri) &&
      !resource.uri.includes("..") &&
      resource.bytes instanceof ArrayBuffer &&
      resource.bytes.byteLength > 0 &&
      resource.bytes.byteLength <= MAXIMUM_SOURCE_BYTES) &&
    request.bytes.byteLength + resources.reduce(
      (total, resource) => total + resource.bytes.byteLength,
      0,
    ) <= MAXIMUM_SOURCE_BYTES &&
    SOURCE_FORMATS.has(options?.format) &&
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

function ifcResources(artifact) {
  return {
    sourceBytes: artifact.resources.observed.sourceBytes,
    geometryBytes:
      artifact.resources.observed.geometryBytes,
    metadataBytes:
      artifact.resources.observed.metadataBytes,
    detailBytes:
      artifact.resources.observed.detailBytes,
    detailRanges:
      artifact.resources.observed.detailRanges,
    largestDetailRangeBytes:
      artifact.resources.observed.largestDetailRangeBytes,
    propertyDetailBytes:
      artifact.propertyDetails.resources.observed.bytes,
    propertyDetailRanges:
      artifact.propertyDetails.resources.observed.ranges,
    ranges: artifact.resources.observed.ranges,
    products: artifact.resources.observed.products,
    wasmHeapCapacityBytes:
      artifact.resources.wasmHeapCapacityBytes ?? null,
  };
}

function referenceResources(snapshot) {
  const handles = snapshot.layers.flatMap((layer) =>
    layer.rangeHandles ?? []);
  const geometryBytes = handles.reduce(
    (total, handle) => total + handle.byteLength,
    0,
  );
  const metadataBytes = new TextEncoder().encode(
    JSON.stringify({
      entities: snapshot.entities.map((entity) => ({
        localNumericId: entity.localNumericId,
        name: entity.name,
        nativeId: entity.nativeId,
        provenance: entity.provenance,
      })),
      geometry: snapshot.geometry,
      referenceMetadata: snapshot.referenceMetadata,
      source: snapshot.source,
    }),
  ).byteLength;
  return {
    sourceBytes: snapshot.source.byteLength,
    documentBytes:
      snapshot.referenceMetadata.resourceBundle.documentBytes,
    externalResourceBytes:
      snapshot.referenceMetadata.resourceBundle
        .externalResourceBytes,
    externalResources:
      snapshot.referenceMetadata.resourceBundle.externalResources,
    ...(snapshot.referenceMetadata.resourceBundle
      .externalImageResources === undefined
      ? {}
      : {
          externalBufferResources:
            snapshot.referenceMetadata.resourceBundle
              .externalBufferResources,
          externalImageResources:
            snapshot.referenceMetadata.resourceBundle
              .externalImageResources,
        }),
    ...(snapshot.referenceMetadata.resourceBundle
      .embeddedImageResources === undefined
      ? {}
      : {
          embeddedImageBytes:
            snapshot.referenceMetadata.resourceBundle
              .embeddedImageBytes,
          embeddedImageResources:
            snapshot.referenceMetadata.resourceBundle
              .embeddedImageResources,
        }),
    ...(snapshot.referenceMetadata.appearance === null
      ? {}
      : {
          textureSourceBytes:
            snapshot.referenceMetadata.appearance
              .textureSourceBytes,
          textureDecodedBytes:
            snapshot.referenceMetadata.appearance
              .textureDecodedBytes,
          textures:
            snapshot.referenceMetadata.appearance.textures,
        }),
    geometryBytes,
    metadataBytes,
    detailBytes: 0,
    detailRanges: 0,
    largestDetailRangeBytes: 0,
    propertyDetailBytes: 0,
    propertyDetailRanges: 0,
    ranges: handles.length,
    products: 0,
    referenceEntities: snapshot.entities.length,
    wasmHeapCapacityBytes: null,
  };
}

async function openSource(request) {
  if (!validOpen(request)) {
    throw new TypeError("product source open request is invalid");
  }
  await releaseActive();
  const started = performance.now();
  const bytes = new Uint8Array(request.bytes);
  const externalResources = request.resources.map((resource) => ({
    uri: resource.uri,
    bytes: new Uint8Array(resource.bytes),
  }));
  let artifact = null;
  let candidateSession = null;
  let candidateSource = null;
  progress(request.requestId, "source-admitted", {
    byteLength: bytes.byteLength,
    externalResources: externalResources.length,
    format: request.options.format,
  });
  try {
    const artifactStarted = performance.now();
    if (request.options.format === "ifc") {
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
      progress(request.requestId, "artifact-created", {
        format: "ifc",
        products: artifact.geometry.products,
        ranges: artifact.ranges.length,
      });
      candidateSource = createBimModelSource(artifact, {
        maximumRequestBytes: 1024 * 1024,
      });
    } else {
      progress(request.requestId, "gltf-validating", {
        format: request.options.format,
      });
      candidateSource = await createGltfReferenceSource(bytes, {
        maximumRequestBytes: 1024 * 1024,
        resources: externalResources,
      });
      progress(request.requestId, "artifact-created", {
        format: request.options.format,
        products: 0,
        ranges: 1,
      });
    }
    const artifactMs = performance.now() - artifactStarted;
    const sourceStarted = performance.now();
    for (const range of artifact?.ranges ?? []) {
      range.bytes.fill(0);
    }
    for (const range of artifact?.detailRanges ?? []) {
      range.bytes.fill(0);
    }
    for (
      const range of artifact?.propertyDetails?.ranges ?? []
    ) {
      range.bytes.fill(0);
    }
    candidateSession = await candidateSource.open({
      protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
    });
    const snapshot = await candidateSession.getSnapshot();
    const observedFormat =
      snapshot.source.format ?? "ifc";
    if (observedFormat !== request.options.format) {
      throw new TypeError(
        "source bytes do not match the declared format",
      );
    }
    const sourceMs = performance.now() - sourceStarted;
    active = {
      session: candidateSession,
      snapshot,
      source: candidateSource,
    };
    candidateSession = null;
    candidateSource = null;
    progress(request.requestId, "snapshot-ready", {
      format: observedFormat,
      revisionId: snapshot.revisionId,
    });
    post(request.requestId, "result", {
      descriptor: active.session.descriptor,
      diagnostics: [],
      performance: {
        artifactMs,
        sourceMs,
        totalMs: performance.now() - started,
      },
      resources: observedFormat === "ifc"
        ? ifcResources(artifact)
        : referenceResources(snapshot),
      snapshot,
    });
  } catch (error) {
    await candidateSession?.dispose();
    await candidateSource?.dispose();
    throw error;
  } finally {
    bytes.fill(0);
    for (const resource of externalResources) {
      resource.bytes.fill(0);
    }
    for (const range of artifact?.ranges ?? []) {
      range.bytes.fill(0);
    }
    for (const range of artifact?.detailRanges ?? []) {
      range.bytes.fill(0);
    }
    for (
      const range of artifact?.propertyDetails?.ranges ?? []
    ) {
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
