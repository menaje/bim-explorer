"use strict";

const { existsSync } = require("node:fs");
const path = require("node:path");

const {
  renderBimExplorerWebviewHtml,
} = require("./webview-html.js");
const {
  FEDERATION_VIEW_TYPE,
  FederatedBimSurfaceReadonlyEditorProvider,
} = require("./federation-provider.js");

const VIEW_TYPE = "bimExplorer.ifcEditor";
const HOST_MESSAGE =
  "bim-explorer-product-host-message/0.1";
const REPORT_SCHEMA =
  "bim-explorer-product-shell-report/0.1";
const PRODUCT_MAXIMUM_SOURCE_BYTES = 64 * 1024 * 1024;
const E57_MAXIMUM_SOURCE_BYTES = 32 * 1024 * 1024;
const LAS_LAZ_MAXIMUM_SOURCE_BYTES = 8 * 1024 * 1024;
const DEFAULTS = Object.freeze({
  maximumSourceBytes: PRODUCT_MAXIMUM_SOURCE_BYTES,
  openTimeoutMs: 30_000,
  profile: "ReferenceView_V1.2",
});
const SOURCE_FORMATS = new Set([
  "ifc",
  "gltf",
  "glb",
  "e57",
  "las",
  "laz",
]);
const POINT_SOURCE_FORMATS = new Set(["e57", "las", "laz"]);
const EXTERNAL_GLTF_RESOURCE_NAME =
  /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:bin|jpe?g|png)$/u;

function pointMaximumSourceBytes(format) {
  return format === "e57"
    ? E57_MAXIMUM_SOURCE_BYTES
    : LAS_LAZ_MAXIMUM_SOURCE_BYTES;
}

function boundedInteger(value, fallback, minimum, maximum) {
  return Number.isSafeInteger(value)
    ? Math.max(minimum, Math.min(value, maximum))
    : fallback;
}

function settings(vscode) {
  const configuration =
    vscode.workspace.getConfiguration("bimExplorer");
  return Object.freeze({
    maximumSourceBytes: boundedInteger(
      configuration.get("maximumSourceBytes"),
      DEFAULTS.maximumSourceBytes,
      1,
      PRODUCT_MAXIMUM_SOURCE_BYTES,
    ),
    openTimeoutMs: boundedInteger(
      configuration.get("openTimeoutMs"),
      DEFAULTS.openTimeoutMs,
      1_000,
      120_000,
    ),
    profile:
      configuration.get("ifcProfile") ===
        "ReferenceView_V1.2"
        ? "ReferenceView_V1.2"
        : DEFAULTS.profile,
  });
}

function resolveRuntimeRoot(vscode, context) {
  const packaged = vscode.Uri.joinPath(
    context.extensionUri,
    "apps",
    "bim-explorer-web",
    "index.html",
  );
  if (existsSync(packaged.fsPath)) {
    return context.extensionUri;
  }
  return vscode.Uri.joinPath(
    context.extensionUri,
    "..",
    "..",
  );
}

function stableError(code, retryable) {
  return Object.freeze({
    code,
    retryable,
  });
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function stringOrNull(value, pattern = null) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    (pattern !== null && !pattern.test(value))
  ) {
    return null;
  }
  return value;
}

function numericRecord(value, keys) {
  if (value === null || typeof value !== "object") {
    return null;
  }
  return Object.fromEntries(
    keys.map((key) => [key, numberOrNull(value[key])]),
  );
}

function numericArray(value, length) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((item) =>
      typeof item !== "number" || !Number.isFinite(item))
  ) {
    return null;
  }
  return [...value];
}

function stringArray(value, maximumLength = 16) {
  if (
    !Array.isArray(value) ||
    value.length > maximumLength ||
    value.some((item) =>
      typeof item !== "string" ||
      item.length === 0 ||
      item.length > 128)
  ) {
    return null;
  }
  return [...value];
}

function sanitizedPointLod(value) {
  if (value === null || typeof value !== "object") {
    return null;
  }
  return {
    fullDetail: value.fullDetail === true,
    hierarchyId: stringOrNull(value.hierarchyId),
    levelId: stringOrNull(value.levelId),
    selectionSha256: stringOrNull(
      value.selectionSha256,
      /^[0-9a-f]{64}$/u,
    ),
    ...numericRecord(value, [
      "chunkCount",
      "levelIndex",
      "pointCount",
      "stride",
    ]),
  };
}

function sanitizedPointHierarchy(value) {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const levels = Array.isArray(value.levels) &&
    value.levels.length <= 9
      ? value.levels.map((level) => ({
          fullDetail: level?.fullDetail === true,
          id: stringOrNull(level?.id),
          ...numericRecord(level, [
            "index",
            "pointCount",
            "rangeBytes",
            "stride",
          ]),
        }))
      : [];
  return {
    contract: stringOrNull(value.contract),
    digest: stringOrNull(value.digest, /^[0-9a-f]{64}$/u),
    hierarchyId: stringOrNull(value.hierarchyId),
    initialLevelId: stringOrNull(value.initialLevelId),
    chunkCount: Array.isArray(value.chunks)
      ? value.chunks.length
      : null,
    depth: numberOrNull(value.depth),
    levels,
    sourcePointCount: numberOrNull(value.sourcePointCount),
  };
}

function sanitizedHierarchyCleanup(value) {
  if (value === null || typeof value !== "object") {
    return null;
  }
  return {
    disposed: value.disposed === true,
    hierarchyId: stringOrNull(value.hierarchyId),
    ...numericRecord(value, [
      "indexBytes",
      "retainedBytes",
      "rootRangeBytes",
    ]),
  };
}

function sanitizedViewerCore(value) {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const selection = value.selection?.selection;
  return {
    adopted: value.adopted === true,
    api: stringOrNull(value.api),
    contract: stringOrNull(value.contract),
    descriptorProtocolVersion: stringOrNull(
      value.descriptorProtocolVersion,
    ),
    disposed: value.disposed === true,
    host: {
      disposed: value.host?.disposed === true,
      eventCount: numberOrNull(value.host?.eventCount),
      kind: stringOrNull(value.host?.kind),
      lastEventType: stringOrNull(
        value.host?.lastEventType,
      ),
    },
    presentation: {
      borrowedSessionDisposed:
        value.presentation?.borrowedSessionDisposed === true,
      borrowedWorkerDisposed:
        value.presentation?.borrowedWorkerDisposed === true,
      disposalStatus: stringOrNull(
        value.presentation?.disposalStatus,
      ),
      disposed: value.presentation?.disposed === true,
    },
    protocolId: stringOrNull(value.protocolId),
    protocolVersion: stringOrNull(value.protocolVersion),
    selection: {
      reason: stringOrNull(value.selection?.reason),
      sequence: numberOrNull(value.selection?.sequence),
      identity: selection === null ||
        typeof selection !== "object"
          ? null
          : {
              expressId: numberOrNull(selection.expressId),
              globalId: stringOrNull(selection.globalId),
              kind: stringOrNull(selection.kind),
              nativeId: stringOrNull(selection.nativeId),
              renderId: stringOrNull(selection.renderId),
            },
    },
    source: {
      disposed: value.source?.disposed === true,
      rangeBytesRead: numberOrNull(
        value.source?.rangeBytesRead,
      ),
      rangeReads: numberOrNull(value.source?.rangeReads),
      sessionDisposed:
        value.source?.sessionDisposed === true,
      sessionOpened: value.source?.sessionOpened === true,
    },
    version: stringOrNull(value.version),
  };
}

function sanitizeGpuIdentity(value) {
  if (
    value?.schema !== "bim-explorer-webgl2-gpu-identity/1" ||
    value.webgl2 !== true
  ) {
    return null;
  }
  const attributes = value.contextAttributes;
  return {
    schema: "bim-explorer-webgl2-gpu-identity/1",
    webgl2: true,
    debugRendererInfo: value.debugRendererInfo === true,
    vendor: stringOrNull(value.vendor),
    renderer: stringOrNull(value.renderer),
    unmaskedVendor: value.unmaskedVendor === null
      ? null
      : stringOrNull(value.unmaskedVendor),
    unmaskedRenderer: value.unmaskedRenderer === null
      ? null
      : stringOrNull(value.unmaskedRenderer),
    version: stringOrNull(value.version),
    shadingLanguageVersion: stringOrNull(
      value.shadingLanguageVersion,
    ),
    contextAttributes: attributes === null ||
      typeof attributes !== "object"
      ? null
      : {
          alpha: attributes.alpha === true,
          antialias: attributes.antialias === true,
          depth: attributes.depth === true,
          desynchronized: attributes.desynchronized === true,
          failIfMajorPerformanceCaveat:
            attributes.failIfMajorPerformanceCaveat === true,
          powerPreference: stringOrNull(
            attributes.powerPreference,
          ),
          premultipliedAlpha:
            attributes.premultipliedAlpha === true,
          preserveDrawingBuffer:
            attributes.preserveDrawingBuffer === true,
          stencil: attributes.stencil === true,
          xrCompatible: attributes.xrCompatible === true,
        },
  };
}

function sourceFormat(uri) {
  const extension = path.extname(uri.path)
    .slice(1)
    .toLowerCase();
  if (!SOURCE_FORMATS.has(extension)) {
    throw new Error(
      "BIM Explorer supports local IFC, glTF, GLB, E57, LAS, and LAZ files",
    );
  }
  return extension;
}

function externalGltfResourceNames(bytes) {
  let document;
  try {
    document = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    throw stableError("SOURCE_GLTF_JSON_INVALID", false);
  }
  if (
    document === null ||
    typeof document !== "object" ||
    Array.isArray(document) ||
    !Array.isArray(document.buffers) ||
    document.buffers.length === 0 ||
    document.buffers.length > 16 ||
    (
      document.images !== undefined &&
      (
        !Array.isArray(document.images) ||
        document.images.length > 16
      )
    )
  ) {
    throw stableError("SOURCE_GLTF_BUNDLE_INVALID", false);
  }
  const names = [];
  const observed = new Set();
  const declared = [
    ...document.buffers.map((buffer) => ({
      kind: "buffer",
      value: buffer,
    })),
    ...(document.images ?? []).map((image) => ({
      kind: "image",
      value: image,
    })),
  ];
  for (const resource of declared) {
    const uri = resource.value?.uri;
    if (
      typeof uri !== "string" ||
      uri.startsWith("data:")
    ) {
      continue;
    }
    if (
      uri.length > 128 ||
      !EXTERNAL_GLTF_RESOURCE_NAME.test(uri) ||
      (
        resource.kind === "buffer" &&
        !uri.toLocaleLowerCase().endsWith(".bin")
      ) ||
      (
        resource.kind === "image" &&
        !/\.(?:jpe?g|png)$/u.test(uri.toLocaleLowerCase())
      ) ||
      uri.includes("..") ||
      observed.has(uri) ||
      names.length >= 16
    ) {
      throw stableError("SOURCE_GLTF_RESOURCE_URI_REJECTED", false);
    }
    observed.add(uri);
    names.push(uri);
  }
  return names;
}

function sanitizeReport(value) {
  if (
    value?.schema !== REPORT_SCHEMA ||
    value.hostKind !== "vscode-webview" ||
    typeof value.status !== "string"
  ) {
    return null;
  }
  const format = stringOrNull(value.source?.format);
  const pointSource = POINT_SOURCE_FORMATS.has(format);
  const source = value.source === undefined
    ? null
    : {
        fingerprint: stringOrNull(
          value.source?.fingerprint,
          /^sha256:[0-9a-f]{64}$/u,
        ),
        revisionId: stringOrNull(value.source?.revisionId),
        snapshotId: stringOrNull(value.source?.snapshotId),
        byteLength: numberOrNull(value.source?.byteLength),
        ifcSchema: stringOrNull(value.source?.ifcSchema),
        format,
        gltfVersion: stringOrNull(
          value.source?.gltfVersion,
        ),
        ...(value.source?.extensionsRequired === undefined
          ? {}
          : {
              extensionsRequired: stringArray(
                value.source.extensionsRequired,
                64,
              ),
            }),
        ...(value.source?.extensionsUsed === undefined
          ? {}
          : {
              extensionsUsed: stringArray(
                value.source.extensionsUsed,
                64,
              ),
            }),
        coordinateReferenceStatus: stringOrNull(
          value.source?.coordinateReferenceStatus,
        ),
        formatVersion: stringOrNull(
          value.source?.formatVersion,
        ),
        pointFormat:
          typeof value.source?.pointFormat === "number"
            ? numberOrNull(value.source.pointFormat)
            : stringOrNull(value.source?.pointFormat),
        profile: stringOrNull(value.source?.profile),
        resourceBundle:
          value.source?.resourceBundle === undefined
            ? null
            : {
                schema: stringOrNull(
                  value.source.resourceBundle?.schema,
                ),
                networkAtRuntime:
                  value.source.resourceBundle?.networkAtRuntime ===
                    false
                    ? false
                    : null,
                ...numericRecord(
                  value.source.resourceBundle,
                  [
                    "documentBytes",
                    "externalResourceBytes",
                    "externalResources",
                  ],
                ),
                ...(value.source.resourceBundle
                  ?.externalImageResources === undefined
                  ? {}
                  : numericRecord(
                      value.source.resourceBundle,
                      [
                        "externalBufferResources",
                        "externalImageResources",
                      ],
                    )),
                ...(value.source.resourceBundle
                  ?.embeddedImageResources === undefined
                  ? {}
                  : numericRecord(
                      value.source.resourceBundle,
                      [
                        "embeddedImageBytes",
                        "embeddedImageResources",
                      ],
                    )),
              },
        ...(value.source?.appearance === undefined
          ? {}
          : {
              appearance: {
                profile: stringOrNull(
                  value.source.appearance?.profile,
                ),
                textureCoordinateSet: numberOrNull(
                  value.source.appearance?.textureCoordinateSet,
                ),
                imageMediaTypes: stringArray(
                  value.source.appearance?.imageMediaTypes,
                  8,
                ),
                ...(value.source.appearance
                  ?.imageStorageProfiles === undefined
                  ? {}
                  : {
                      imageStorageProfiles: stringArray(
                        value.source.appearance
                          .imageStorageProfiles,
                        8,
                      ),
                    }),
                colorSpace: stringOrNull(
                  value.source.appearance?.colorSpace,
                ),
                ...numericRecord(value.source.appearance, [
                  "textureSourceBytes",
                  "textureDecodedBytes",
                  "textures",
                ]),
              },
            }),
        sourceRole: stringOrNull(
          value.source?.sourceRole,
        ),
        semanticAuthority:
          typeof value.source?.semanticAuthority === "boolean"
            ? value.source.semanticAuthority
            : null,
      };
  const reference = value.reference === undefined
    ? null
    : {
        globalId:
          value.reference?.globalId === null
            ? null
            : stringOrNull(value.reference?.globalId),
        selectedNativeId: stringOrNull(
          value.reference?.selectedNativeId,
        ),
        ...numericRecord(value.reference, [
          "treeRows",
          "maximumDomRows",
        ]),
      };
  const pointSelection =
    !pointSource || value.pointSelection == null
      ? null
      : {
          schema: stringOrNull(
            value.pointSelection?.schema,
          ),
          status: stringOrNull(
            value.pointSelection?.status,
          ),
          coordinates: {
            origin: stringOrNull(
              value.pointSelection?.coordinates?.origin,
            ),
            ...numericRecord(
              value.pointSelection?.coordinates,
              ["x", "y"],
            ),
          },
          identity:
            value.pointSelection?.identity === null
              ? null
              : {
                  authority: stringOrNull(
                    value.pointSelection?.identity?.authority,
                  ),
                  nativeId: stringOrNull(
                    value.pointSelection?.identity?.nativeId,
                    /^point:\d+$/u,
                  ),
                  pointIndex: numberOrNull(
                    value.pointSelection?.identity?.pointIndex,
                  ),
                  renderedPointIndex: numberOrNull(
                    value.pointSelection?.identity?.renderedPointIndex,
                  ),
                  rangeHandleId: stringOrNull(
                    value.pointSelection?.identity?.rangeHandleId,
                  ),
                  rangeSha256: stringOrNull(
                    value.pointSelection?.identity?.rangeSha256,
                    /^[0-9a-f]{64}$/u,
                  ),
                  renderedRangeHandleId: stringOrNull(
                    value.pointSelection?.identity
                      ?.renderedRangeHandleId,
                  ),
                  renderedRangeSha256: stringOrNull(
                    value.pointSelection?.identity
                      ?.renderedRangeSha256,
                    /^[0-9a-f]{64}$/u,
                  ),
                },
          worldPosition:
            value.pointSelection?.worldPosition === null
              ? null
              : numericArray(
                  value.pointSelection?.worldPosition,
                  3,
                ),
          backend: {
            actualGpu:
              value.pointSelection?.backend?.actualGpu === true,
            backendId: stringOrNull(
              value.pointSelection?.backend?.backendId,
            ),
            temporaryReleased:
              value.pointSelection?.backend?.temporaryReleased === true,
            ...numericRecord(
              value.pointSelection?.backend,
              [
                "drawCalls",
                "glError",
                "pointIndex",
                "temporaryTargetBytes",
                "x",
                "y",
              ],
            ),
          },
        };
  return Object.freeze({
    schema: REPORT_SCHEMA,
    status: value.status,
    hostKind: "vscode-webview",
    externalUpload: value.externalUpload === true,
    telemetry: value.telemetry === true,
    gpu: sanitizeGpuIdentity(value.gpu),
    source,
    model: numericRecord(
      value.model,
      pointSource
        ? [
            "points",
            "ranges",
            ...(value.model?.chunks === undefined
              ? []
              : ["chunks", "levels"]),
          ]
        : ["gltf", "glb"].includes(format)
        ? [
            "entities",
            "geometryRecords",
            "instances",
            "triangles",
            "ranges",
          ]
        : [
            "products",
            "treeNodes",
            "triangles",
            "ranges",
          ],
    ),
    performance: numericRecord(value.performance, [
      "artifactMs",
      "sourceMs",
      "totalMs",
    ]),
    resources: pointSource
      ? {
          ...numericRecord(value.resources, [
            "decodedPointBytes",
            "hierarchyIndexBytes",
            "hierarchyRetainedBytes",
            "initialPointRangeBytes",
            "pointRangeBytes",
            "pointRangePayloadBytes",
            "sourceBytes",
          ]),
          wasmHeapCapacityBytes:
            value.resources?.wasmHeapCapacityBytes === null
              ? null
              : numericRecord(
                  value.resources?.wasmHeapCapacityBytes,
                  [
                    "afterDecode",
                    "afterInitialization",
                    "peakObserved",
                  ],
                ),
        }
      : ["gltf", "glb"].includes(format)
        ? {
            ...numericRecord(value.resources, [
                "sourceBytes",
                "documentBytes",
                "externalResourceBytes",
                "externalResources",
                "geometryBytes",
                "metadataBytes",
                "detailBytes",
                "detailRanges",
                "largestDetailRangeBytes",
                "ranges",
                "products",
                "referenceEntities",
                "textureSourceBytes",
                "textureDecodedBytes",
                "textures",
                "wasmHeapCapacityBytes",
              ]),
            ...(value.resources?.externalImageResources === undefined
              ? {}
              : numericRecord(value.resources, [
                  "externalBufferResources",
                  "externalImageResources",
                ])),
            ...(value.resources?.embeddedImageResources === undefined
              ? {}
              : numericRecord(value.resources, [
                  "embeddedImageBytes",
                  "embeddedImageResources",
                ])),
          }
        : numericRecord(
            value.resources,
            [
                "sourceBytes",
                "geometryBytes",
                "metadataBytes",
                "detailBytes",
                "detailRanges",
                "largestDetailRangeBytes",
                "ranges",
                "products",
                "wasmHeapCapacityBytes",
              ],
          ),
    renderer: value.renderer === undefined
      ? null
      : {
          actualGpu: value.renderer?.actualGpu === true,
          ...numericRecord(value.renderer, [
            "nonBackgroundPixels",
            "sourceReadBytes",
            "uploadedBytes",
            "textureSourceBytes",
            "textureDecodedBytes",
            "textureGpuBytes",
            "textures",
            "gpuTextures",
          ]),
        },
    viewerCore: sanitizedViewerCore(value.viewerCore),
    semantic: numericRecord(value.semantic, [
      "selectedExpressId",
      "treeRows",
      "maximumDomRows",
    ]),
    reference,
    pointCloud: !pointSource || value.pointCloud === undefined
      ? null
      : {
          attributeProjection:
            value.pointCloud?.attributeProjection === undefined
              ? null
              : {
                  ignoredFields: stringArray(
                    value.pointCloud.attributeProjection
                      ?.ignoredFields,
                  ),
                  lossiness: stringOrNull(
                    value.pointCloud.attributeProjection?.lossiness,
                  ),
                  method: stringOrNull(
                    value.pointCloud.attributeProjection?.method,
                  ),
                },
          bounds: {
            min: numericArray(
              value.pointCloud?.bounds?.min,
              3,
            ),
            max: numericArray(
              value.pointCloud?.bounds?.max,
              3,
            ),
          },
          colorRange: {
            min: numericArray(
              value.pointCloud?.colorRange?.min,
              4,
            ),
            max: numericArray(
              value.pointCloud?.colorRange?.max,
              4,
            ),
          },
          coordinateReferenceStatus: stringOrNull(
            value.pointCloud?.coordinateReferenceStatus,
          ),
          coordinateRepresentation: stringOrNull(
            value.pointCloud?.coordinateRepresentation,
          ),
          decoder: value.pointCloud?.decoder === undefined
            ? null
            : {
                backend: stringOrNull(
                  value.pointCloud?.decoder?.backend,
                ),
                id: stringOrNull(
                  value.pointCloud?.decoder?.id,
                ),
                license: stringOrNull(
                  value.pointCloud?.decoder?.license,
                ),
                version: stringOrNull(
                  value.pointCloud?.decoder?.version,
                ),
                ...(value.pointCloud?.decoder?.reference ===
                  undefined
                  ? {}
                  : {
                      reference: {
                        commit: stringOrNull(
                          value.pointCloud.decoder.reference
                            ?.commit,
                          /^[0-9a-f]{40}$/u,
                        ),
                        id: stringOrNull(
                          value.pointCloud.decoder.reference?.id,
                        ),
                        license: stringOrNull(
                          value.pointCloud.decoder.reference
                            ?.license,
                        ),
                        version: stringOrNull(
                          value.pointCloud.decoder.reference
                            ?.version,
                        ),
                      },
                    }),
              },
          maximumProjectionError: numberOrNull(
            value.pointCloud?.maximumProjectionError,
          ),
          origin: numericArray(value.pointCloud?.origin, 3),
          pointPrimitive: stringOrNull(
            value.pointCloud?.pointPrimitive,
          ),
          pointSize: numberOrNull(
            value.pointCloud?.pointSize,
          ),
          rangeSha256: stringOrNull(
            value.pointCloud?.rangeSha256,
            /^[0-9a-f]{64}$/u,
          ),
          renderedRangeSha256: stringOrNull(
            value.pointCloud?.renderedRangeSha256,
            /^[0-9a-f]{64}$/u,
          ),
          hierarchy: sanitizedPointHierarchy(
            value.pointCloud?.hierarchy,
          ),
          lod: sanitizedPointLod(value.pointCloud?.lod),
        },
    lodTransitions: !pointSource || !Array.isArray(value.lodTransitions)
      ? []
      : value.lodTransitions.slice(0, 8).map((transition) => ({
          fromLevelId: stringOrNull(transition?.fromLevelId),
          hierarchyId: stringOrNull(transition?.hierarchyId),
          toLevelId: stringOrNull(transition?.toLevelId),
          ...numericRecord(transition, [
            "identityMapBytes",
            "points",
            "rangeBytes",
            "releasedBytes",
            "releasedIdentityMapBytes",
            "uploadedBytes",
          ]),
        })),
    pointSelection,
    productLifecycle: !pointSource
      ? null
      : {
          cpuPointRangeCleared:
            value.lifecycle?.cpuPointRangeCleared === true,
          sourceBufferCleared:
            value.lifecycle?.sourceBufferCleared === true,
          hierarchyCleanup: sanitizedHierarchyCleanup(
            value.lifecycle?.hierarchyCleanup,
          ),
          workerTerminatedAfterTransfer:
            value.lifecycle?.workerTerminatedAfterTransfer === true,
        },
    diagnostic: value.diagnostic === undefined
      ? null
      : {
          checkpoint: stringOrNull(
            value.diagnostic?.checkpoint,
          ),
          code: stringOrNull(value.diagnostic?.code),
          name: stringOrNull(value.diagnostic?.name),
          operation: stringOrNull(
            value.diagnostic?.operation,
          ),
          retryable: value.diagnostic?.retryable === true,
        },
  });
}

function uriKey(uri) {
  return uri.toString(true);
}

class BimExplorerDocument {
  #disposed = false;
  #disposables = [];
  #generation = 0;
  #panels = new Set();
  #resourceUriKeys = new Set();

  constructor(uri) {
    this.uri = uri;
  }

  nextGeneration() {
    if (this.#disposed) {
      throw new Error("BIM Explorer document is disposed");
    }
    this.#generation += 1;
    return this.#generation;
  }

  addDisposable(value) {
    this.#disposables.push(value);
  }

  attach(panel) {
    this.#panels.add(panel);
  }

  detach(panel) {
    this.#panels.delete(panel);
  }

  get panels() {
    return [...this.#panels];
  }

  setResourceUris(uris) {
    this.#resourceUriKeys = new Set(uris.map(uriKey));
  }

  hasResourceUri(uri) {
    return this.#resourceUriKeys.has(uriKey(uri));
  }

  dispose() {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#panels.clear();
    this.#resourceUriKeys.clear();
    for (const disposable of this.#disposables.splice(0)) {
      disposable.dispose();
    }
  }
}

class BimExplorerReadonlyEditorProvider {
  #activePanel = null;
  #context;
  #documents = new Map();
  #output;
  #reports = new Map();
  #runtimeRoot;
  #template = null;
  #vscode;

  constructor(vscode, context, {
    runtimeRoot = resolveRuntimeRoot(vscode, context),
  } = {}) {
    this.#vscode = vscode;
    this.#context = context;
    this.#runtimeRoot = runtimeRoot;
    this.#output = vscode.window.createOutputChannel(
      "BIM Explorer",
      { log: true },
    );
  }

  async #templateHtml() {
    if (this.#template === null) {
      const uri = this.#vscode.Uri.joinPath(
        this.#runtimeRoot,
        "apps",
        "bim-explorer-web",
        "index.html",
      );
      const bytes = await this.#vscode.workspace.fs.readFile(uri);
      this.#template = new TextDecoder().decode(bytes);
    }
    return this.#template;
  }

  async openCustomDocument(uri) {
    if (uri.scheme !== "file") {
      throw new Error(
        "BIM Explorer only opens explicit local file URIs",
      );
    }
    const format = sourceFormat(uri);
    const document = new BimExplorerDocument(uri);
    const fileName = uri.path.split("/").at(-1);
    const base = this.#vscode.Uri.joinPath(uri, "..");
    const watcher = this.#vscode.workspace.createFileSystemWatcher(
      new this.#vscode.RelativePattern(base, fileName),
    );
    const changed = async (changedUri) => {
      if (uriKey(changedUri) !== uriKey(document.uri)) {
        return;
      }
      for (const panel of document.panels) {
        await this.#sendSource(document, panel);
      }
    };
    document.addDisposable(watcher);
    document.addDisposable(watcher.onDidChange(changed));
    document.addDisposable(watcher.onDidCreate(changed));
    document.addDisposable(watcher.onDidDelete(async (deletedUri) => {
      if (uriKey(deletedUri) === uriKey(document.uri)) {
        for (const panel of document.panels) {
          await this.#post(panel, {
            type: "source-error",
            diagnostic: stableError(
              "SOURCE_FILE_REMOVED",
              true,
            ),
          });
        }
      }
    }));
    if (format === "gltf") {
      const resourceChanged = async (changedUri) => {
        if (!document.hasResourceUri(changedUri)) {
          return;
        }
        for (const panel of document.panels) {
          await this.#sendSource(document, panel);
        }
      };
      for (const pattern of [
        "*.bin",
        "*.jpg",
        "*.jpeg",
        "*.png",
      ]) {
        const resourceWatcher =
          this.#vscode.workspace.createFileSystemWatcher(
            new this.#vscode.RelativePattern(base, pattern),
          );
        document.addDisposable(resourceWatcher);
        document.addDisposable(
          resourceWatcher.onDidChange(resourceChanged),
        );
        document.addDisposable(
          resourceWatcher.onDidCreate(resourceChanged),
        );
        document.addDisposable(
          resourceWatcher.onDidDelete(resourceChanged),
        );
      }
    }
    this.#documents.set(uriKey(uri), document);
    return document;
  }

  async #readBounded(document) {
    const configured = settings(this.#vscode);
    const format = sourceFormat(document.uri);
    const maximumSourceBytes = POINT_SOURCE_FORMATS.has(format)
      ? Math.min(
          configured.maximumSourceBytes,
          pointMaximumSourceBytes(format),
        )
      : configured.maximumSourceBytes;
    const readStableFile = async (uri, resource = false) => {
      const before = await this.#vscode.workspace.fs.stat(uri);
      if (
        (before.type & this.#vscode.FileType.SymbolicLink) !== 0
      ) {
        throw stableError(
          resource
            ? "SOURCE_RESOURCE_SYMLINK_REJECTED"
            : "SOURCE_SYMLINK_REJECTED",
          false,
        );
      }
      if (
        (before.type & this.#vscode.FileType.File) === 0 ||
        before.size <= 0 ||
        before.size > maximumSourceBytes
      ) {
        throw stableError(
          resource
            ? "SOURCE_RESOURCE_LIMIT_REJECTED"
            : "SOURCE_FILE_LIMIT_REJECTED",
          false,
        );
      }
      const bytes = await this.#vscode.workspace.fs.readFile(uri);
      const after = await this.#vscode.workspace.fs.stat(uri);
      if (
        bytes.byteLength !== before.size ||
        after.size !== before.size ||
        after.mtime !== before.mtime
      ) {
        bytes.fill(0);
        throw stableError(
          resource
            ? "SOURCE_RESOURCE_CHANGED"
            : "SOURCE_FILE_CHANGED",
          true,
        );
      }
      return bytes;
    };
    const bytes = await readStableFile(document.uri);
    const resources = [];
    try {
      const resourceNames = format === "gltf"
        ? externalGltfResourceNames(bytes)
        : [];
      const base = this.#vscode.Uri.joinPath(document.uri, "..");
      const resourceUris = resourceNames.map((name) =>
        this.#vscode.Uri.joinPath(base, name));
      document.setResourceUris(resourceUris);
      let aggregateBytes = bytes.byteLength;
      for (let index = 0; index < resourceUris.length; index += 1) {
        const resourceBytes = await readStableFile(
          resourceUris[index],
          true,
        );
        aggregateBytes += resourceBytes.byteLength;
        if (aggregateBytes > maximumSourceBytes) {
          resourceBytes.fill(0);
          throw stableError(
            "SOURCE_BUNDLE_LIMIT_REJECTED",
            false,
          );
        }
        resources.push({
          uri: resourceNames[index],
          bytes: resourceBytes,
        });
      }
      return {
        bytes,
        configured: Object.freeze({
          ...configured,
          maximumSourceBytes,
        }),
        format,
        resources,
      };
    } catch (error) {
      bytes.fill(0);
      for (const resource of resources) {
        resource.bytes.fill(0);
      }
      throw error;
    }
  }

  async #post(panel, message) {
    return await panel.webview.postMessage({
      schema: HOST_MESSAGE,
      ...message,
    });
  }

  async #sendSource(document, panel) {
    let admitted = null;
    let messageBytes = null;
    let messageResources = [];
    try {
      admitted = await this.#readBounded(document);
      const generation = document.nextGeneration();
      messageBytes = admitted.bytes.slice().buffer;
      messageResources = admitted.resources.map((resource) => ({
        uri: resource.uri,
        bytes: resource.bytes.slice().buffer,
      }));
      await this.#post(panel, {
        type: "source-bytes",
        generation,
        bytes: messageBytes,
        resources: messageResources,
        format: admitted.format,
        profile: admitted.configured.profile,
        limits: {
          maximumSourceBytes:
            admitted.configured.maximumSourceBytes,
          openTimeoutMs:
            admitted.configured.openTimeoutMs,
        },
      });
    } catch (error) {
      const diagnostic =
        typeof error?.code === "string"
          ? error
          : stableError("SOURCE_FILE_READ_FAILED", true);
      await this.#post(panel, {
        type: "source-error",
        diagnostic,
      });
    } finally {
      admitted?.bytes.fill(0);
      for (const resource of admitted?.resources ?? []) {
        resource.bytes.fill(0);
      }
      if (messageBytes !== null) {
        new Uint8Array(messageBytes).fill(0);
      }
      for (const resource of messageResources) {
        new Uint8Array(resource.bytes).fill(0);
      }
    }
  }

  async #webviewHtml(document, webview) {
    const appRoot = this.#vscode.Uri.joinPath(
      this.#runtimeRoot,
      "apps",
      "bim-explorer-web",
    );
    const vendorRoot = this.#vscode.Uri.joinPath(
      this.#runtimeRoot,
      "node_modules",
      "web-ifc",
    );
    const pointVendorRoot = this.#vscode.Uri.joinPath(
      this.#runtimeRoot,
      "node_modules",
      "laz-perf",
      "lib",
      "worker",
    );
    const resource = (...segments) =>
      webview.asWebviewUri(
        this.#vscode.Uri.joinPath(appRoot, ...segments),
      ).toString(true);
    const wasmUri = webview.asWebviewUri(
      vendorRoot,
    ).toString(true).replace(/\/?$/u, "/");
    return renderBimExplorerWebviewHtml(
      await this.#templateHtml(),
      {
        appUri: resource("app.mjs"),
        cspSource: webview.cspSource,
        lazPerfScriptUri: resource(
          "laz-perf-worker-csp.js",
        ),
        lazPerfWasmUri: webview.asWebviewUri(
          this.#vscode.Uri.joinPath(
            pointVendorRoot,
            "laz-perf.wasm",
          ),
        ).toString(true),
        pointWorkerUri: resource(
          "point-source-worker.bundle.js",
        ),
        profile: settings(this.#vscode).profile,
        sourceUriText: document.uri.toString(true),
        stylesUri: resource("styles.css"),
        wasmUri,
        webIfcModuleUri: webview.asWebviewUri(
          this.#vscode.Uri.joinPath(
            vendorRoot,
            "web-ifc-api.js",
          ),
        ).toString(true),
        workerModuleUri: resource(
          "source-worker.bundle.mjs",
        ),
      },
    );
  }

  async resolveCustomEditor(document, panel) {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.#runtimeRoot],
    };
    panel.webview.html = await this.#webviewHtml(
      document,
      panel.webview,
    );
    document.attach(panel);
    this.#activePanel = panel;
    const receive = panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message?.schema !== HOST_MESSAGE) {
          return;
        }
        if (message.type === "ready" || message.type === "retry") {
          await this.#sendSource(document, panel);
        } else if (message.type === "report") {
          const report = sanitizeReport(message.report);
          if (report !== null) {
            this.#reports.set(uriKey(document.uri), report);
            this.#output.info(JSON.stringify(report));
          }
        }
      },
    );
    const viewState = panel.onDidChangeViewState?.((event) => {
      if (event.webviewPanel.active) {
        this.#activePanel = panel;
      }
    });
    const disposed = panel.onDidDispose(() => {
      document.detach(panel);
      receive.dispose();
      viewState?.dispose();
      if (this.#activePanel === panel) {
        this.#activePanel = null;
      }
      this.#reports.set(uriKey(document.uri), {
        schema: REPORT_SCHEMA,
        hostKind: "vscode-webview",
        status: "disposed",
        externalUpload: false,
        telemetry: false,
      });
    });
    this.#context.subscriptions.push(disposed);
  }

  async postActive(type) {
    if (this.#activePanel === null) {
      return false;
    }
    await this.#post(this.#activePanel, { type });
    return true;
  }

  showDiagnostics() {
    this.#output.show(true);
    return this.postActive("show-diagnostics");
  }

  qualificationReports() {
    return Object.freeze(
      [...this.#reports.values()].map((report) =>
        structuredClone(report)),
    );
  }

  dispose() {
    for (const document of this.#documents.values()) {
      document.dispose();
    }
    this.#documents.clear();
    this.#reports.clear();
    this.#output.dispose();
  }
}

function activateBimExplorerExtension(vscode, context) {
  const provider = new BimExplorerReadonlyEditorProvider(
    vscode,
    context,
  );
  const federationProvider =
    new FederatedBimSurfaceReadonlyEditorProvider(
      vscode,
      context,
    );
  const registration =
    vscode.window.registerCustomEditorProvider(
      VIEW_TYPE,
      provider,
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: {
          retainContextWhenHidden: false,
        },
      },
    );
  const federationRegistration =
    vscode.window.registerCustomEditorProvider(
      FEDERATION_VIEW_TYPE,
      federationProvider,
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: {
          retainContextWhenHidden: false,
        },
      },
    );
  const commands = [
    vscode.commands.registerCommand(
      "bimExplorer.openWith",
      async (uri) => {
        const selected = uri ??
          vscode.window.activeTextEditor?.document?.uri;
        if (selected === undefined) {
          throw new Error(
            "Choose a local IFC, glTF, GLB, LAS, or LAZ file first",
          );
        }
        return await vscode.commands.executeCommand(
          "vscode.openWith",
          selected,
          VIEW_TYPE,
        );
      },
    ),
    vscode.commands.registerCommand(
      "bimExplorer.cancel",
      () => provider.postActive("cancel"),
    ),
    vscode.commands.registerCommand(
      "bimExplorer.closeModel",
      () => provider.postActive("dispose"),
    ),
    vscode.commands.registerCommand(
      "bimExplorer.retry",
      () => provider.postActive("retry"),
    ),
    vscode.commands.registerCommand(
      "bimExplorer.showDiagnostics",
      () => provider.showDiagnostics(),
    ),
    vscode.commands.registerCommand(
      "bimExplorer.pickVisiblePoint",
      () => provider.postActive("pick-visible-point"),
    ),
    vscode.commands.registerCommand(
      "bimExplorer.refinePointLod",
      () => provider.postActive("refine-point-lod"),
    ),
    vscode.commands.registerCommand(
      "bimExplorer.openFederation",
      async (uri) => {
        const selected = uri ??
          vscode.window.activeTextEditor?.document?.uri;
        if (selected === undefined) {
          throw new Error(
            "Choose a local .bimfed.json file first",
          );
        }
        return await vscode.commands.executeCommand(
          "vscode.openWith",
          selected,
          FEDERATION_VIEW_TYPE,
        );
      },
    ),
    vscode.commands.registerCommand(
      "bimExplorer.verifyFederatedAnchors",
      () => federationProvider.postActive("verify-anchors"),
    ),
    vscode.commands.registerCommand(
      "bimExplorer.disposeFederatedSurface",
      () => federationProvider.postActive("dispose"),
    ),
  ];
  context.subscriptions.push(
    registration,
    federationRegistration,
    ...commands,
    provider,
    federationProvider,
  );
  return Object.freeze({
    qualificationReports() {
      return Object.freeze([
        ...provider.qualificationReports(),
        ...federationProvider.qualificationReports(),
      ]);
    },
  });
}

module.exports = {
  BimExplorerReadonlyEditorProvider,
  VIEW_TYPE,
  activateBimExplorerExtension,
  sanitizeReport,
};
