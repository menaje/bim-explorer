"use strict";

const { existsSync } = require("node:fs");
const path = require("node:path");

const {
  renderBimExplorerWebviewHtml,
} = require("./webview-html.js");

const VIEW_TYPE = "bimExplorer.ifcEditor";
const HOST_MESSAGE =
  "bim-explorer-product-host-message/0.1";
const REPORT_SCHEMA =
  "bim-explorer-product-shell-report/0.1";
const PRODUCT_MAXIMUM_SOURCE_BYTES = 64 * 1024 * 1024;
const DEFAULTS = Object.freeze({
  maximumSourceBytes: PRODUCT_MAXIMUM_SOURCE_BYTES,
  openTimeoutMs: 30_000,
  profile: "ReferenceView_V1.2",
});
const SOURCE_FORMATS = new Set(["ifc", "gltf", "glb"]);

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

function sourceFormat(uri) {
  const extension = path.extname(uri.path)
    .slice(1)
    .toLowerCase();
  if (!SOURCE_FORMATS.has(extension)) {
    throw new Error(
      "BIM Explorer supports local IFC, glTF, and GLB files",
    );
  }
  return extension;
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
        profile: stringOrNull(value.source?.profile),
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
  return Object.freeze({
    schema: REPORT_SCHEMA,
    status: value.status,
    hostKind: "vscode-webview",
    externalUpload: value.externalUpload === true,
    telemetry: value.telemetry === true,
    source,
    model: numericRecord(
      value.model,
      ["gltf", "glb"].includes(format)
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
    resources: numericRecord(
      value.resources,
      ["gltf", "glb"].includes(format)
        ? [
            "sourceBytes",
            "geometryBytes",
            "metadataBytes",
            "detailBytes",
            "detailRanges",
            "largestDetailRangeBytes",
            "ranges",
            "products",
            "referenceEntities",
            "wasmHeapCapacityBytes",
          ]
        : [
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
          ]),
        },
    semantic: numericRecord(value.semantic, [
      "selectedExpressId",
      "treeRows",
      "maximumDomRows",
    ]),
    reference,
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

  dispose() {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#panels.clear();
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
    sourceFormat(uri);
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
    this.#documents.set(uriKey(uri), document);
    return document;
  }

  async #readBounded(document) {
    const configured = settings(this.#vscode);
    const before = await this.#vscode.workspace.fs.stat(
      document.uri,
    );
    if (
      (before.type & this.#vscode.FileType.SymbolicLink) !== 0
    ) {
      throw stableError("SOURCE_SYMLINK_REJECTED", false);
    }
    if (
      (before.type & this.#vscode.FileType.File) === 0 ||
      before.size <= 0 ||
      before.size > configured.maximumSourceBytes
    ) {
      throw stableError(
        "SOURCE_FILE_LIMIT_REJECTED",
        false,
      );
    }
    const bytes = await this.#vscode.workspace.fs.readFile(
      document.uri,
    );
    const after = await this.#vscode.workspace.fs.stat(
      document.uri,
    );
    if (
      bytes.byteLength !== before.size ||
      after.size !== before.size ||
      after.mtime !== before.mtime
    ) {
      bytes.fill(0);
      throw stableError("SOURCE_FILE_CHANGED", true);
    }
    return {
      bytes,
      configured,
      format: sourceFormat(document.uri),
    };
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
    try {
      admitted = await this.#readBounded(document);
      const generation = document.nextGeneration();
      messageBytes = admitted.bytes.slice().buffer;
      await this.#post(panel, {
        type: "source-bytes",
        generation,
        bytes: messageBytes,
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
      if (messageBytes !== null) {
        new Uint8Array(messageBytes).fill(0);
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
  const commands = [
    vscode.commands.registerCommand(
      "bimExplorer.openWith",
      async (uri) => {
        const selected = uri ??
          vscode.window.activeTextEditor?.document?.uri;
        if (selected === undefined) {
          throw new Error(
            "Choose a local IFC, glTF, or GLB file first",
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
      "bimExplorer.retry",
      () => provider.postActive("retry"),
    ),
    vscode.commands.registerCommand(
      "bimExplorer.showDiagnostics",
      () => provider.showDiagnostics(),
    ),
  ];
  context.subscriptions.push(
    registration,
    ...commands,
    provider,
  );
  return provider;
}

module.exports = {
  BimExplorerReadonlyEditorProvider,
  VIEW_TYPE,
  activateBimExplorerExtension,
  sanitizeReport,
};
