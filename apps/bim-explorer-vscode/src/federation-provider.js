"use strict";

const { existsSync } = require("node:fs");
const { lstat } = require("node:fs/promises");
const path = require("node:path");

const {
  renderFederatedBimSurfaceWebviewHtml,
} = require("./federation-webview-html.js");

const FEDERATION_VIEW_TYPE =
  "bimExplorer.federationEditor";
const FEDERATION_DOCUMENT_SCHEMA =
  "bim-explorer-federation-document/0.1";
const FEDERATION_HOST_MESSAGE =
  "bim-explorer-federated-product-host-message/0.1";
const FEDERATION_REPORT_SCHEMA =
  "bim-explorer-federated-vscode-surface-report/1";
const MAXIMUM_MANIFEST_BYTES = 64 * 1024;
const MAXIMUM_SOURCE_BYTES = 64 * 1024 * 1024;
const MAXIMUM_AGGREGATE_SOURCE_BYTES = 64 * 1024 * 1024;
const MAXIMUM_SOURCES = 8;
const SOURCE_FORMATS = new Set(["ifc", "gltf", "glb"]);
const SOURCE_ROLES = new Set([
  "semantic-base",
  "geometric-reference",
  "observation-reference",
  "consumer-overlay",
]);
const LOCAL_PATH_PATTERN =
  /(?:file:|\/(?:Users|Volumes|private|tmp|home)\/|[A-Z]:\\)/iu;
const REPORT_STATUSES = new Set([
  "ready",
  "qualified",
  "disposed",
  "failed",
  "editor-closed",
]);

function stableError(code, retryable = false) {
  return Object.freeze({ code, retryable });
}

function boundedInteger(value, fallback, minimum, maximum) {
  return Number.isSafeInteger(value)
    ? Math.max(minimum, Math.min(value, maximum))
    : fallback;
}

function boundedString(value, label, maximum = 256) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    LOCAL_PATH_PATTERN.test(value) ||
    value.startsWith("/") ||
    value.includes("\\")
  ) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

function optionalString(value, label, fallback) {
  return value === undefined
    ? fallback
    : boundedString(value, label);
}

function leafFile(value, label) {
  const file = boundedString(value, label, 192);
  if (
    file === "." ||
    file === ".." ||
    file.includes("/") ||
    file.includes("\\")
  ) {
    throw new TypeError(`${label} must be a leaf file name`);
  }
  const format = path.extname(file).slice(1).toLowerCase();
  if (!SOURCE_FORMATS.has(format)) {
    throw new TypeError(`${label} format is unsupported`);
  }
  return { file, format };
}

function matrix16(value, label) {
  if (
    !Array.isArray(value) ||
    value.length !== 16 ||
    value.some((item) =>
      typeof item !== "number" || !Number.isFinite(item))
  ) {
    throw new TypeError(`${label} must be a finite 4x4 matrix`);
  }
  return Object.freeze([...value]);
}

function validateFederationDocument(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schema !== FEDERATION_DOCUMENT_SCHEMA
  ) {
    throw new TypeError("federation document schema is invalid");
  }
  const federationId = boundedString(
    value.federationId,
    "federation document ID",
  );
  if (
    !Array.isArray(value.sources) ||
    value.sources.length === 0 ||
    value.sources.length > MAXIMUM_SOURCES
  ) {
    throw new RangeError("federation document requires 1..8 sources");
  }
  const sources = value.sources.map((source, index) => {
    if (
      source === null ||
      typeof source !== "object" ||
      Array.isArray(source)
    ) {
      throw new TypeError(`federation source ${index} is invalid`);
    }
    const federationSourceId = boundedString(
      source.federationSourceId,
      `federation source ${index} ID`,
    );
    if (!SOURCE_ROLES.has(source.sourceRole)) {
      throw new TypeError(
        `federation source ${index} role is unsupported`,
      );
    }
    const admittedFile = leafFile(
      source.file,
      `federation source ${index} file`,
    );
    return Object.freeze({
      federationSourceId,
      sourceRole: source.sourceRole,
      file: admittedFile.file,
      format: admittedFile.format,
      sourceToFederation: matrix16(
        source.sourceToFederation,
        `federation source ${index} alignment`,
      ),
      reference: optionalString(
        source.reference,
        `federation source ${index} reference`,
        `manifest:source-${index + 1}`,
      ),
      discipline: optionalString(
        source.discipline,
        `federation source ${index} discipline`,
        source.sourceRole,
      ),
      owner: optionalString(
        source.owner,
        `federation source ${index} owner`,
        "external-source",
      ),
    });
  });
  if (
    new Set(sources.map((source) => source.federationSourceId))
      .size !== sources.length
  ) {
    throw new RangeError("federation source IDs must be unique");
  }
  return Object.freeze({
    schema: FEDERATION_DOCUMENT_SCHEMA,
    federationId,
    sources: Object.freeze(sources),
  });
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function stringOrNull(value, pattern = null) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 512 &&
    !LOCAL_PATH_PATTERN.test(value) &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    (pattern === null || pattern.test(value))
    ? value
    : null;
}

function stringArray(value, maximum = MAXIMUM_SOURCES) {
  if (!Array.isArray(value) || value.length > maximum) {
    return [];
  }
  return value.map((item) => stringOrNull(item));
}

function booleanAuthority(value) {
  if (value === null || typeof value !== "object") {
    return null;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => /^[a-z][a-zA-Z]{0,63}$/u.test(key))
      .slice(0, 16)
      .map(([key, item]) => [key, item === true]),
  );
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

function sanitizePick(value) {
  if (value === null || typeof value !== "object") {
    return null;
  }
  return {
    sourceSlot: stringOrNull(value.sourceSlot),
    sourceRevisionId: stringOrNull(value.sourceRevisionId),
    nativeId: value.nativeId === null
      ? null
      : stringOrNull(value.nativeId),
    globalId: value.globalId === null
      ? null
      : stringOrNull(value.globalId),
    surfaceHitCapability: stringOrNull(
      value.surfaceHitCapability,
    ),
    coordinateSpace: stringOrNull(value.coordinateSpace),
    locator: value.locator === null ||
      typeof value.locator !== "object"
      ? null
      : {
          kind: stringOrNull(value.locator.kind),
          triangleIndex: numberOrNull(
            value.locator.triangleIndex,
          ),
          barycentric: Array.isArray(value.locator.barycentric) &&
            value.locator.barycentric.length === 3
            ? value.locator.barycentric.map(numberOrNull)
            : null,
        },
    verification: value.verification === null ||
      typeof value.verification !== "object"
      ? null
      : {
          actualGpuDepth:
            value.verification.actualGpuDepth === true,
          exactGeometryDigest:
            value.verification.exactGeometryDigest === true,
          nearestUniqueTriangle:
            value.verification.nearestUniqueTriangle === true,
        },
    resources: value.resources === null ||
      typeof value.resources !== "object"
      ? null
      : {
          retainedGeometryBytes: numberOrNull(
            value.resources.retainedGeometryBytes,
          ),
          temporaryGeometryReleased:
            value.resources.temporaryGeometryReleased === true,
        },
    authority: booleanAuthority(value.authority),
  };
}

function sanitizeAnchor(value) {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const point3 = (candidate) =>
    Array.isArray(candidate) && candidate.length === 3
      ? candidate.map(numberOrNull)
      : null;
  return {
    sourceSlot: stringOrNull(value.sourceSlot),
    format: stringOrNull(value.format),
    identityKind: stringOrNull(value.identityKind),
    nativeId: value.nativeId === null
      ? null
      : stringOrNull(value.nativeId),
    globalId: value.globalId === null
      ? null
      : stringOrNull(value.globalId),
    point: point3(value.point),
    normal: point3(value.normal),
    stability: stringOrNull(value.stability),
    locator: sanitizePick({ locator: value.locator })?.locator,
    alignmentFingerprint: stringOrNull(
      value.alignmentFingerprint,
    ),
    projectionFingerprint: stringOrNull(
      value.projectionFingerprint,
    ),
    authority: booleanAuthority(value.authority),
  };
}

function sanitizeFederationReport(value) {
  if (
    value?.schema !== FEDERATION_REPORT_SCHEMA ||
    value.hostKind !== "vscode-webview" ||
    !REPORT_STATUSES.has(value.status)
  ) {
    return null;
  }
  const composition = value.composition === null ||
    typeof value.composition !== "object"
    ? null
    : {
        federationId: stringOrNull(value.composition.federationId),
        sourceCount: numberOrNull(value.composition.sourceCount),
        formats: stringArray(value.composition.formats),
        sourceRoles: stringArray(value.composition.sourceRoles),
        semanticAvailability: Array.isArray(
          value.composition.semanticAvailability,
        )
          ? value.composition.semanticAvailability
              .slice(0, MAXIMUM_SOURCES)
              .map((item) => item === true)
          : [],
        projectionFingerprint: stringOrNull(
          value.composition.projectionFingerprint,
        ),
        sourceProjectionFingerprints: stringArray(
          value.composition.sourceProjectionFingerprints,
        ),
        identityMerged: value.composition.identityMerged === true,
      };
  const semantics = value.semantics === null ||
    typeof value.semantics !== "object"
    ? null
    : {
        queriedSource: stringOrNull(value.semantics.queriedSource),
        query: stringOrNull(value.semantics.query),
        returned: numberOrNull(value.semantics.returned),
        referenceSemanticsRejected:
          value.semantics.referenceSemanticsRejected === true,
      };
  const selection = value.selection === null ||
    typeof value.selection !== "object"
    ? null
    : {
        items: numberOrNull(value.selection.items),
        sourceSlots: stringArray(value.selection.sourceSlots),
        distinctKeys: numberOrNull(value.selection.distinctKeys),
        mergeAcrossSources:
          value.selection.mergeAcrossSources === true,
        savedView: stringOrNull(value.selection.savedView),
      };
  const renderer = value.renderer === null ||
    typeof value.renderer !== "object"
    ? null
    : {
        backend: stringOrNull(value.renderer.backend),
        actualGpu: value.renderer.actualGpu === true,
        context: stringOrNull(value.renderer.context),
        nonBackgroundPixels: numberOrNull(
          value.renderer.nonBackgroundPixels,
        ),
        uploadedBytes: numberOrNull(value.renderer.uploadedBytes),
        surfaceHits: numberOrNull(value.renderer.surfaceHits),
        surfaceMisses: numberOrNull(value.renderer.surfaceMisses),
        retainedGeometryBytes: numberOrNull(
          value.renderer.retainedGeometryBytes,
        ),
      };
  const ranges = value.ranges === null ||
    typeof value.ranges !== "object"
    ? null
    : {
        sources: Array.isArray(value.ranges.sources)
          ? value.ranges.sources.slice(0, MAXIMUM_SOURCES)
              .map((source) => ({
                sourceSlot: stringOrNull(source?.sourceSlot),
                reads: numberOrNull(source?.reads),
                bytesRead: numberOrNull(source?.bytesRead),
              }))
          : [],
        unchangedBySurfaceResolution:
          value.ranges.unchangedBySurfaceResolution === true,
      };
  const cleanup = value.cleanup === null ||
    typeof value.cleanup !== "object"
    ? null
    : {
        surfaceStatus: stringOrNull(value.cleanup.surfaceStatus),
        rendererDisposed: value.cleanup.rendererDisposed === true,
        backendDisposed: value.cleanup.backendDisposed === true,
        backendActiveBytes: numberOrNull(
          value.cleanup.backendActiveBytes,
        ),
        backendResidentRanges: numberOrNull(
          value.cleanup.backendResidentRanges,
        ),
        retainedGeometryBytes: numberOrNull(
          value.cleanup.retainedGeometryBytes,
        ),
        projectionCachesReleased:
          value.cleanup.projectionCachesReleased === true,
        transferredSessionsReleased:
          value.cleanup.transferredSessionsReleased === true,
        sourceSessionsDisposed:
          value.cleanup.sourceSessionsDisposed === true,
        workersTerminated:
          value.cleanup.workersTerminated === true,
        clientsDisposed: value.cleanup.clientsDisposed === true,
        runtimeUrlsRevoked:
          value.cleanup.runtimeUrlsRevoked === true,
        repeatedDispose: value.cleanup.repeatedDispose === true,
      };
  return Object.freeze({
    schema: FEDERATION_REPORT_SCHEMA,
    status: value.status,
    hostKind: "vscode-webview",
    externalUpload: value.externalUpload === true,
    telemetry: value.telemetry === true,
    contract: stringOrNull(value.contract),
    composition,
    semantics,
    selection,
    gpu: sanitizeGpuIdentity(value.gpu),
    renderer,
    picks: Array.isArray(value.picks)
      ? value.picks.slice(0, MAXIMUM_SOURCES)
          .map(sanitizePick).filter(Boolean)
      : [],
    anchors: Array.isArray(value.anchors)
      ? value.anchors.slice(0, MAXIMUM_SOURCES)
          .map(sanitizeAnchor).filter(Boolean)
      : [],
    ranges,
    cleanup,
    authority: booleanAuthority(value.authority),
    diagnostic: value.diagnostic === null ||
      typeof value.diagnostic !== "object"
      ? null
      : {
          code: stringOrNull(value.diagnostic.code),
          name: stringOrNull(value.diagnostic.name),
          operation: stringOrNull(value.diagnostic.operation),
          retryable: value.diagnostic.retryable === true,
        },
    editorClosed: value.editorClosed === true,
  });
}

function resolveRuntimeRoot(vscode, context) {
  const packaged = vscode.Uri.joinPath(
    context.extensionUri,
    "apps",
    "federated-bim-surface-vscode",
    "index.html",
  );
  if (existsSync(packaged.fsPath)) {
    return context.extensionUri;
  }
  return vscode.Uri.joinPath(context.extensionUri, "..", "..");
}

function settings(vscode) {
  const configuration =
    vscode.workspace.getConfiguration("bimExplorer");
  return Object.freeze({
    maximumSourceBytes: boundedInteger(
      configuration.get("maximumSourceBytes"),
      MAXIMUM_SOURCE_BYTES,
      1,
      MAXIMUM_SOURCE_BYTES,
    ),
    openTimeoutMs: boundedInteger(
      configuration.get("openTimeoutMs"),
      30_000,
      1_000,
      120_000,
    ),
    profile: configuration.get("ifcProfile") ===
      "ReferenceView_V1.2"
      ? "ReferenceView_V1.2"
      : "ReferenceView_V1.2",
  });
}

function uriKey(uri) {
  return uri.toString(true);
}

class FederatedBimSurfaceDocument {
  #disposed = false;
  #generation = 0;

  constructor(uri) {
    this.uri = uri;
  }

  nextGeneration() {
    if (this.#disposed) {
      throw new Error("federation document is disposed");
    }
    this.#generation += 1;
    return this.#generation;
  }

  dispose() {
    this.#disposed = true;
  }
}

class FederatedBimSurfaceReadonlyEditorProvider {
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
      "BIM Explorer · Federated Surface",
      { log: true },
    );
  }

  async #templateHtml() {
    if (this.#template === null) {
      const uri = this.#vscode.Uri.joinPath(
        this.#runtimeRoot,
        "apps",
        "federated-bim-surface-vscode",
        "index.html",
      );
      this.#template = new TextDecoder().decode(
        await this.#vscode.workspace.fs.readFile(uri),
      );
    }
    return this.#template;
  }

  async openCustomDocument(uri) {
    if (
      uri.scheme !== "file" ||
      !uri.path.toLowerCase().endsWith(".bimfed.json")
    ) {
      throw new Error(
        "BIM Explorer only opens explicit local .bimfed.json files",
      );
    }
    const document = new FederatedBimSurfaceDocument(uri);
    this.#documents.set(uriKey(uri), document);
    return document;
  }

  async #readStableFile(uri, maximumBytes, emptyAllowed = false) {
    const before = await lstat(uri.fsPath);
    if (before.isSymbolicLink()) {
      throw stableError("FEDERATION_SYMLINK_REJECTED");
    }
    if (
      !before.isFile() ||
      (!emptyAllowed && before.size <= 0) ||
      before.size > maximumBytes
    ) {
      throw stableError("FEDERATION_FILE_LIMIT_REJECTED");
    }
    const bytes = await this.#vscode.workspace.fs.readFile(uri);
    const after = await lstat(uri.fsPath);
    if (
      after.isSymbolicLink() ||
      !after.isFile() ||
      bytes.byteLength !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.dev !== before.dev ||
      after.ino !== before.ino
    ) {
      bytes.fill(0);
      throw stableError("FEDERATION_FILE_CHANGED", true);
    }
    return bytes;
  }

  async #readFederation(document) {
    let manifestBytes = null;
    const admitted = [];
    let completed = false;
    try {
      manifestBytes = await this.#readStableFile(
        document.uri,
        MAXIMUM_MANIFEST_BYTES,
      );
      let value;
      try {
        value = JSON.parse(new TextDecoder().decode(manifestBytes));
      } catch {
        throw stableError("FEDERATION_MANIFEST_INVALID");
      }
      const manifest = validateFederationDocument(value);
      const configured = settings(this.#vscode);
      const base = this.#vscode.Uri.joinPath(document.uri, "..");
      let aggregateBytes = 0;
      for (const source of manifest.sources) {
        const sourceUri = this.#vscode.Uri.joinPath(base, source.file);
        const bytes = await this.#readStableFile(
          sourceUri,
          configured.maximumSourceBytes,
        );
        aggregateBytes += bytes.byteLength;
        if (aggregateBytes > MAXIMUM_AGGREGATE_SOURCE_BYTES) {
          bytes.fill(0);
          throw stableError("FEDERATION_AGGREGATE_LIMIT_REJECTED");
        }
        admitted.push({
          federationSourceId: source.federationSourceId,
          sourceRole: source.sourceRole,
          format: source.format,
          sourceToFederation: source.sourceToFederation,
          reference: source.reference,
          discipline: source.discipline,
          owner: source.owner,
          bytes,
        });
      }
      completed = true;
      return {
        configured,
        federationId: manifest.federationId,
        sources: admitted,
      };
    } finally {
      manifestBytes?.fill(0);
      if (!completed) {
        for (const source of admitted) {
          source.bytes.fill(0);
        }
      }
    }
  }

  async #post(panel, message) {
    return await panel.webview.postMessage({
      schema: FEDERATION_HOST_MESSAGE,
      ...message,
    });
  }

  async #sendFederation(document, panel) {
    let admitted = null;
    const transferred = [];
    try {
      admitted = await this.#readFederation(document);
      const sources = admitted.sources.map((source) => {
        const messageBytes = source.bytes.slice().buffer;
        transferred.push(messageBytes);
        return {
          federationSourceId: source.federationSourceId,
          sourceRole: source.sourceRole,
          format: source.format,
          sourceToFederation: source.sourceToFederation,
          reference: source.reference,
          discipline: source.discipline,
          owner: source.owner,
          bytes: messageBytes,
        };
      });
      await this.#post(panel, {
        type: "federation-sources",
        generation: document.nextGeneration(),
        federationId: admitted.federationId,
        profile: admitted.configured.profile,
        limits: {
          maximumSourceBytes:
            admitted.configured.maximumSourceBytes,
          maximumAggregateSourceBytes:
            MAXIMUM_AGGREGATE_SOURCE_BYTES,
          openTimeoutMs: admitted.configured.openTimeoutMs,
        },
        sources,
      });
    } catch (error) {
      const diagnostic = typeof error?.code === "string"
        ? error
        : stableError("FEDERATION_FILE_READ_FAILED", true);
      await this.#post(panel, {
        type: "federation-error",
        diagnostic,
      });
    } finally {
      for (const source of admitted?.sources ?? []) {
        source.bytes.fill(0);
      }
      for (const buffer of transferred) {
        new Uint8Array(buffer).fill(0);
      }
    }
  }

  async #webviewHtml(document, webview) {
    const appRoot = this.#vscode.Uri.joinPath(
      this.#runtimeRoot,
      "apps",
      "federated-bim-surface-vscode",
    );
    const sourceAppRoot = this.#vscode.Uri.joinPath(
      this.#runtimeRoot,
      "apps",
      "bim-explorer-web",
    );
    const vendorRoot = this.#vscode.Uri.joinPath(
      this.#runtimeRoot,
      "node_modules",
      "web-ifc",
    );
    const resource = (root, ...segments) =>
      webview.asWebviewUri(
        this.#vscode.Uri.joinPath(root, ...segments),
      ).toString(true);
    return renderFederatedBimSurfaceWebviewHtml(
      await this.#templateHtml(),
      {
        appUri: resource(appRoot, "app.mjs"),
        cspSource: webview.cspSource,
        manifestUriText: document.uri.toString(true),
        profile: settings(this.#vscode).profile,
        stylesUri: resource(appRoot, "styles.css"),
        wasmUri: webview.asWebviewUri(vendorRoot)
          .toString(true).replace(/\/?$/u, "/"),
        webIfcModuleUri: webview.asWebviewUri(
          this.#vscode.Uri.joinPath(
            vendorRoot,
            "web-ifc-api.js",
          ),
        ).toString(true),
        workerModuleUri: resource(
          sourceAppRoot,
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
    this.#activePanel = panel;
    const receive = panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message?.schema !== FEDERATION_HOST_MESSAGE) {
          return;
        }
        if (message.type === "ready") {
          await this.#sendFederation(document, panel);
        } else if (message.type === "report") {
          const report = sanitizeFederationReport(message.report);
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
      receive.dispose();
      viewState?.dispose();
      if (this.#activePanel === panel) {
        this.#activePanel = null;
      }
      const key = uriKey(document.uri);
      const prior = this.#reports.get(key);
      this.#reports.set(key, Object.freeze({
        ...(prior ?? {
          schema: FEDERATION_REPORT_SCHEMA,
          status: "editor-closed",
          hostKind: "vscode-webview",
          externalUpload: false,
          telemetry: false,
        }),
        editorClosed: true,
      }));
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

module.exports = {
  FEDERATION_DOCUMENT_SCHEMA,
  FEDERATION_HOST_MESSAGE,
  FEDERATION_REPORT_SCHEMA,
  FEDERATION_VIEW_TYPE,
  FederatedBimSurfaceReadonlyEditorProvider,
  sanitizeFederationReport,
  validateFederationDocument,
};
