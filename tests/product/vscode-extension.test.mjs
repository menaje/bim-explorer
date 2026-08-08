import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  prepareVscodeExtensionStage,
} from "../../scripts/package-vscode-extension.mjs";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const {
  BimExplorerReadonlyEditorProvider,
  sanitizeReport,
} = require(
  "../../apps/bim-explorer-vscode/src/provider.js",
);
const {
  renderBimExplorerWebviewHtml,
} = require(
  "../../apps/bim-explorer-vscode/src/webview-html.js",
);

class FakeUri {
  constructor(filePath) {
    this.scheme = "file";
    this.fsPath = path.resolve(filePath);
    this.path = this.fsPath;
  }

  toString() {
    return `file://${this.path}`;
  }
}

function disposable() {
  return {
    dispose() {},
  };
}

function fakeWatcher() {
  return {
    dispose() {},
    onDidChange() {
      return disposable();
    },
    onDidCreate() {
      return disposable();
    },
    onDidDelete() {
      return disposable();
    },
  };
}

function fakeVscode({
  sourcePath = "/private/customer/acme-building.ifc",
  sourceBytes = new TextEncoder().encode(
    "ISO-10303-21;\nEND-ISO-10303-21;\n",
  ),
  sourceType = 1,
} = {}) {
  const sourceUri = new FakeUri(sourcePath);
  const output = [];
  const configuration = {
    ifcProfile: "ReferenceView_V1.2",
    maximumSourceBytes: 64 * 1024 * 1024,
    openTimeoutMs: 30_000,
  };
  class RelativePattern {
    constructor(base, pattern) {
      this.base = base;
      this.pattern = pattern;
    }
  }
  const vscode = {
    FileType: {
      File: 1,
      SymbolicLink: 64,
    },
    RelativePattern,
    Uri: {
      file(value) {
        return new FakeUri(value);
      },
      joinPath(uri, ...segments) {
        return new FakeUri(path.join(uri.fsPath, ...segments));
      },
    },
    window: {
      createOutputChannel() {
        return {
          dispose() {},
          info(value) {
            output.push(value);
          },
          show() {},
        };
      },
    },
    workspace: {
      createFileSystemWatcher() {
        return fakeWatcher();
      },
      fs: {
        async readFile(uri) {
          if (uri.fsPath.endsWith("index.html")) {
            return new Uint8Array(
              await readFile(uri.fsPath),
            );
          }
          assert.equal(uri.toString(), sourceUri.toString());
          return Uint8Array.from(sourceBytes);
        },
        async stat(uri) {
          assert.equal(uri.toString(), sourceUri.toString());
          return {
            type: sourceType,
            size: sourceBytes.byteLength,
            mtime: 42,
          };
        },
      },
      getConfiguration() {
        return {
          get(name) {
            return configuration[name];
          },
        };
      },
    },
  };
  return {
    output,
    sourceUri,
    vscode,
  };
}

function fakePanel() {
  const posted = [];
  let receive = null;
  let disposePanel = null;
  const panel = {
    active: true,
    onDidChangeViewState() {
      return disposable();
    },
    onDidDispose(listener) {
      disposePanel = listener;
      return disposable();
    },
    webview: {
      cspSource: "vscode-webview://unit-test",
      html: "",
      options: {},
      asWebviewUri(uri) {
        return {
          toString() {
            return `vscode-webview://unit-test${uri.path}`;
          },
        };
      },
      onDidReceiveMessage(listener) {
        receive = listener;
        return disposable();
      },
      async postMessage(message) {
        posted.push(structuredClone(message));
        return true;
      },
    },
  };
  return {
    dispose() {
      disposePanel?.();
    },
    panel,
    posted,
    receive(message) {
      return receive(message);
    },
  };
}

test("VS Code manifest associates bounded BIM sources with a read-only product host", async () => {
  const manifest = JSON.parse(
    await readFile(
      path.join(
        ROOT,
        "apps",
        "bim-explorer-vscode",
        "package.json",
      ),
      "utf8",
    ),
  );
  assert.equal(manifest.main, "./extension.js");
  assert.equal(
    manifest.contributes.customEditors[0].viewType,
    "bimExplorer.ifcEditor",
  );
  assert.deepEqual(
    manifest.contributes.customEditors[0].selector,
    [
      { filenamePattern: "*.ifc" },
      { filenamePattern: "*.gltf" },
      { filenamePattern: "*.glb" },
      { filenamePattern: "*.e57" },
      { filenamePattern: "*.las" },
      { filenamePattern: "*.laz" },
    ],
  );
  assert.equal(
    manifest.contributes.customEditors[0].priority,
    "default",
  );
  assert.equal(manifest.dependencies["web-ifc"], "0.0.77");
  assert.equal(manifest.dependencies["laz-perf"], "0.0.6");
});

test("webview HTML uses the shared app with strict path-free CSP", async () => {
  const template = await readFile(
    path.join(
      ROOT,
      "apps",
      "bim-explorer-web",
      "index.html",
    ),
    "utf8",
  );
  const sourceUriText =
    "file:///private/customer/acme-building.ifc";
  const html = renderBimExplorerWebviewHtml(template, {
    appUri: "vscode-webview://test/app.mjs",
    cspSource: "vscode-webview://test",
    lazPerfScriptUri:
      "vscode-webview://test/vendor/laz-perf.js",
    lazPerfWasmUri:
      "vscode-webview://test/vendor/laz-perf.wasm",
    pointWorkerUri:
      "vscode-webview://test/point-source-worker.bundle.js",
    profile: "ReferenceView_V1.2",
    sourceUriText,
    stylesUri: "vscode-webview://test/styles.css",
    wasmUri: "vscode-webview://test/vendor/",
    webIfcModuleUri:
      "vscode-webview://test/vendor/web-ifc-api.js",
    workerModuleUri:
      "vscode-webview://test/source-worker.bundle.mjs",
  });
  assert.match(
    html,
    /name="bim-host-kind" content="vscode-webview"/u,
  );
  assert.match(html, /source-worker\.bundle\.mjs/u);
  assert.match(html, /point-source-worker\.bundle\.js/u);
  assert.match(html, /vendor\/laz-perf\.js/u);
  assert.match(html, /vendor\/laz-perf\.wasm/u);
  assert.match(
    html,
    /Content-Security-Policy/u,
  );
  assert.match(
    html,
    /worker-src vscode-webview:\/\/test blob:/u,
  );
  assert.doesNotMatch(html, /unsafe-inline/u);
  assert.equal(html.includes("'unsafe-eval'"), false);
  assert.equal(html.includes(sourceUriText), false);
  assert.equal(html.includes("acme-building.ifc"), false);
});

test("Custom Editor sends bounded bytes but never the source URI", async () => {
  const { sourceUri, vscode } = fakeVscode();
  const context = {
    extensionUri: new FakeUri(
      path.join(ROOT, "apps", "bim-explorer-vscode"),
    ),
    subscriptions: [],
  };
  const provider = new BimExplorerReadonlyEditorProvider(
    vscode,
    context,
    {
      runtimeRoot: new FakeUri(ROOT),
    },
  );
  const document = await provider.openCustomDocument(
    sourceUri,
  );
  const host = fakePanel();
  await provider.resolveCustomEditor(document, host.panel);
  assert.equal(
    host.panel.webview.html.includes(sourceUri.toString()),
    false,
  );
  await host.receive({
    schema: "bim-explorer-product-host-message/0.1",
    type: "ready",
  });
  const sourceMessage = host.posted.find(
    (message) => message.type === "source-bytes",
  );
  assert.equal(sourceMessage.generation, 1);
  assert.equal(sourceMessage.format, "ifc");
  assert.ok(sourceMessage.bytes instanceof ArrayBuffer);
  assert.equal(sourceMessage.bytes.byteLength > 0, true);
  assert.equal(
    JSON.stringify(sourceMessage).includes(sourceUri.toString()),
    false,
  );
  assert.deepEqual(sourceMessage.limits, {
    maximumSourceBytes: 64 * 1024 * 1024,
    openTimeoutMs: 30_000,
  });
  host.dispose();
  document.dispose();
  provider.dispose();
});

test("Custom Editor sends only the normalized GLB format hint", async () => {
  const { sourceUri, vscode } = fakeVscode({
    sourcePath: "/private/customer/acme-reference.glb",
    sourceBytes: Uint8Array.from([
      0x67, 0x6c, 0x54, 0x46,
    ]),
  });
  const context = {
    extensionUri: new FakeUri(
      path.join(ROOT, "apps", "bim-explorer-vscode"),
    ),
    subscriptions: [],
  };
  const provider = new BimExplorerReadonlyEditorProvider(
    vscode,
    context,
    {
      runtimeRoot: new FakeUri(ROOT),
    },
  );
  const document = await provider.openCustomDocument(
    sourceUri,
  );
  const host = fakePanel();
  await provider.resolveCustomEditor(document, host.panel);
  await host.receive({
    schema: "bim-explorer-product-host-message/0.1",
    type: "ready",
  });
  const sourceMessage = host.posted.find(
    (message) => message.type === "source-bytes",
  );
  assert.equal(sourceMessage.format, "glb");
  assert.equal(
    JSON.stringify(sourceMessage).includes("acme-reference"),
    false,
  );
  document.dispose();
  provider.dispose();
});

test("Custom Editor sends bounded LAS with the point-source cap", async () => {
  const { sourceUri, vscode } = fakeVscode({
    sourcePath: "/private/customer/acme-observation.las",
    sourceBytes: Uint8Array.from({ length: 227 }, () => 1),
  });
  const context = {
    extensionUri: new FakeUri(
      path.join(ROOT, "apps", "bim-explorer-vscode"),
    ),
    subscriptions: [],
  };
  const provider = new BimExplorerReadonlyEditorProvider(
    vscode,
    context,
    {
      runtimeRoot: new FakeUri(ROOT),
    },
  );
  const document = await provider.openCustomDocument(
    sourceUri,
  );
  const host = fakePanel();
  await provider.resolveCustomEditor(document, host.panel);
  await host.receive({
    schema: "bim-explorer-product-host-message/0.1",
    type: "ready",
  });
  const sourceMessage = host.posted.find(
    (message) => message.type === "source-bytes",
  );
  assert.equal(sourceMessage.format, "las");
  assert.equal(
    sourceMessage.limits.maximumSourceBytes,
    8 * 1024 * 1024,
  );
  assert.equal(
    JSON.stringify(sourceMessage).includes("acme-observation"),
    false,
  );
  document.dispose();
  provider.dispose();
});

test("Custom Editor sends bounded E57 with the point-source cap", async () => {
  const { sourceUri, vscode } = fakeVscode({
    sourcePath: "/private/customer/acme-scan.e57",
    sourceBytes: Uint8Array.from({ length: 1_024 }, () => 1),
  });
  const context = {
    extensionUri: new FakeUri(
      path.join(ROOT, "apps", "bim-explorer-vscode"),
    ),
    subscriptions: [],
  };
  const provider = new BimExplorerReadonlyEditorProvider(
    vscode,
    context,
    {
      runtimeRoot: new FakeUri(ROOT),
    },
  );
  const document = await provider.openCustomDocument(sourceUri);
  const host = fakePanel();
  await provider.resolveCustomEditor(document, host.panel);
  await host.receive({
    schema: "bim-explorer-product-host-message/0.1",
    type: "ready",
  });
  const sourceMessage = host.posted.find(
    (message) => message.type === "source-bytes",
  );
  assert.equal(sourceMessage.format, "e57");
  assert.equal(
    sourceMessage.limits.maximumSourceBytes,
    32 * 1024 * 1024,
  );
  assert.equal(
    JSON.stringify(sourceMessage).includes("acme-scan"),
    false,
  );
  document.dispose();
  provider.dispose();
});

test("Custom Editor rejects symlinks before reading source bytes", async () => {
  const { sourceUri, vscode } = fakeVscode({
    sourceType: 1 | 64,
  });
  const context = {
    extensionUri: new FakeUri(
      path.join(ROOT, "apps", "bim-explorer-vscode"),
    ),
    subscriptions: [],
  };
  const provider = new BimExplorerReadonlyEditorProvider(
    vscode,
    context,
    {
      runtimeRoot: new FakeUri(ROOT),
    },
  );
  const document = await provider.openCustomDocument(
    sourceUri,
  );
  const host = fakePanel();
  await provider.resolveCustomEditor(document, host.panel);
  await host.receive({
    schema: "bim-explorer-product-host-message/0.1",
    type: "ready",
  });
  assert.deepEqual(
    host.posted.at(-1).diagnostic,
    {
      code: "SOURCE_SYMLINK_REJECTED",
      retryable: false,
    },
  );
  assert.equal(host.posted.at(-1).type, "source-error");
  document.dispose();
  provider.dispose();
});

test("extension diagnostics sanitize arbitrary webview fields", () => {
  const report = sanitizeReport({
    schema: "bim-explorer-product-shell-report/0.1",
    status: "ready",
    hostKind: "vscode-webview",
    externalUpload: false,
    telemetry: false,
    source: {
      fingerprint: `sha256:${"a".repeat(64)}`,
      revisionId: "revision:test",
      snapshotId: "snapshot:test",
      byteLength: 1024,
      ifcSchema: "IFC4",
      path: "/private/customer/acme.ifc",
    },
    path: "/private/customer/acme.ifc",
    model: {
      products: 1,
      treeNodes: 7,
      triangles: 12,
      ranges: 1,
    },
  });
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("/private"), false);
  assert.equal(serialized.includes("path"), false);
  assert.equal(
    report.source.fingerprint,
    `sha256:${"a".repeat(64)}`,
  );
});

test("extension diagnostics preserve bounded reference identity only", () => {
  const report = sanitizeReport({
    schema: "bim-explorer-product-shell-report/0.1",
    status: "ready",
    hostKind: "vscode-webview",
    externalUpload: false,
    telemetry: false,
    source: {
      fingerprint: `sha256:${"b".repeat(64)}`,
      revisionId: "source-snapshot:test",
      snapshotId: "snapshot:test",
      byteLength: 1664,
      format: "glb",
      gltfVersion: "2.0",
      profile: "gltf-2.0-bounded-reference-mesh-v0.1",
      sourceRole: "derived-or-reference-mesh",
      semanticAuthority: false,
      path: "/private/customer/acme.glb",
    },
    model: {
      entities: 1,
      geometryRecords: 1,
      instances: 1,
      triangles: 12,
      ranges: 1,
    },
    reference: {
      globalId: null,
      selectedNativeId: "node:1/mesh:0/primitive:0",
      treeRows: 1,
      maximumDomRows: 64,
    },
  });
  assert.equal(report.source.format, "glb");
  assert.equal(report.source.semanticAuthority, false);
  assert.equal(report.reference.globalId, null);
  assert.equal(
    report.reference.selectedNativeId,
    "node:1/mesh:0/primitive:0",
  );
  assert.equal(
    JSON.stringify(report).includes("/private"),
    false,
  );
});

test("extension diagnostics preserve bounded point evidence only", () => {
  const report = sanitizeReport({
    schema: "bim-explorer-product-shell-report/0.1",
    status: "ready",
    hostKind: "vscode-webview",
    externalUpload: false,
    telemetry: false,
    source: {
      fingerprint: `sha256:${"c".repeat(64)}`,
      revisionId: "source-snapshot:test",
      byteLength: 53_952,
      coordinateReferenceStatus: "unqualified",
      format: "laz",
      formatVersion: "1.2",
      pointFormat: 3,
      semanticAuthority: false,
      sourceRole: "derived-or-reference-points",
      path: "/private/customer/acme.laz",
    },
    model: { points: 10_201, ranges: 1 },
    resources: {
      decodedPointBytes: 346_834,
      pointRangeBytes: 163_264,
      pointRangePayloadBytes: 163_216,
      sourceBytes: 53_952,
      wasmHeapCapacityBytes: {
        afterDecode: 4_063_232,
        afterInitialization: 262_144,
        peakObserved: 4_063_232,
      },
    },
    pointCloud: {
      attributeProjection: {
        ignoredFields: ["intensity"],
        lossiness: "lossy",
        method:
          "decode-for-stream-alignment-without-semantic-authority",
      },
      bounds: { min: [-5, -5, -1], max: [5, 5, 1] },
      colorRange: {
        min: [0, 68, 0, 255],
        max: [254, 198, 63, 255],
      },
      coordinateReferenceStatus: "unqualified",
      coordinateRepresentation: "spherical",
      decoder: {
        backend: "browser-wasm-worker-product-source",
        id: "laz-perf",
        license: "Apache-2.0",
        version: "0.0.6",
      },
      maximumProjectionError: 1e-8,
      origin: [0, 0, 0],
      pointPrimitive: "POINTS",
      pointSize: 3,
      rangeSha256: "d".repeat(64),
    },
    pointSelection: {
      schema:
        "bim-explorer-bounded-point-renderer-pick-receipt/0.1",
      status: "hit",
      coordinates: {
        origin: "canvas-top-left",
        x: 320,
        y: 240,
      },
      identity: {
        authority: "derived-point-range-order",
        nativeId: "point:42",
        pointIndex: 42,
        rangeHandleId: "range:laz:points:test",
        rangeSha256: "d".repeat(64),
      },
      worldPosition: [1, 2, 3],
      backend: {
        actualGpu: true,
        backendId: "webgl2-points",
        drawCalls: 1,
        glError: 0,
        pointIndex: 42,
        temporaryReleased: true,
        temporaryTargetBytes: 1_843_200,
        x: 320,
        y: 240,
      },
    },
    lifecycle: {
      cpuPointRangeCleared: true,
      sourceBufferCleared: true,
      workerTerminatedAfterTransfer: true,
    },
  });
  assert.deepEqual(report.model, { points: 10_201, ranges: 1 });
  assert.equal(report.resources.wasmHeapCapacityBytes.peakObserved, 4_063_232);
  assert.equal(report.pointCloud.decoder.id, "laz-perf");
  assert.deepEqual(
    report.pointCloud.attributeProjection.ignoredFields,
    ["intensity"],
  );
  assert.equal(
    report.pointCloud.coordinateRepresentation,
    "spherical",
  );
  assert.equal(report.productLifecycle.cpuPointRangeCleared, true);
  assert.equal(report.pointSelection.identity.nativeId, "point:42");
  assert.deepEqual(report.pointSelection.worldPosition, [1, 2, 3]);
  assert.equal(report.pointSelection.backend.temporaryReleased, true);
  assert.equal(JSON.stringify(report).includes("/private"), false);
});

test("extension staging is complete and independently path-safe", async () => {
  const destination = await mkdtemp(
    path.join(tmpdir(), "bim-explorer-stage-test-"),
  );
  try {
    const staged = await prepareVscodeExtensionStage(
      destination,
    );
    for (const relative of [
      "extension.js",
      "src/provider.js",
      "apps/bim-explorer-web/app.mjs",
      "apps/bim-explorer-web/laz-perf-worker-csp.js",
      "apps/bim-explorer-web/point-source-client.mjs",
      "apps/bim-explorer-web/point-source-worker.bundle.js",
      "apps/bim-explorer-web/point-source-worker.mjs",
      "apps/bim-explorer-web/reference-mesh-explorer.mjs",
      "apps/bim-explorer-web/source-worker.mjs",
      "adapters/web-ifc/src/create-source-artifact.mjs",
      "packages/bim-model-source/src/index.mjs",
      "packages/gltf-reference-source/src/index.mjs",
      "packages/e57-point-source/src/format.mjs",
      "packages/e57-point-source/src/index.mjs",
      "packages/las-laz-point-source/src/header.mjs",
      "packages/las-laz-point-source/src/index.mjs",
      "packages/bim-renderer-3d/src/index.mjs",
      "packages/bim-renderer-3d/src/point-cloud-lod.mjs",
      "packages/bim-renderer-3d/src/point-cloud.mjs",
      "packages/bim-renderer-3d/src/point-cloud-webgl2-backend.mjs",
      "packages/bim-semantic-explorer/src/index.mjs",
      "node_modules/web-ifc/web-ifc-api.js",
      "node_modules/web-ifc/web-ifc.wasm",
      "node_modules/web-ifc/LICENSE.md",
      "node_modules/laz-perf/lib/worker/laz-perf.wasm",
      "node_modules/laz-perf/package.json",
      "LICENSES/e57-rs-MIT.txt",
      "specs/LICENSE",
      "LICENSE",
      "NOTICE",
      "SOURCE_OFFER.md",
      "THIRD_PARTY_NOTICES.md",
      "TRADEMARKS.md",
    ]) {
      assert.equal(
        (await stat(path.join(destination, relative))).isFile(),
        true,
        relative,
      );
      assert.equal(staged.files.includes(relative), true);
    }
    const manifest = JSON.parse(
      await readFile(
        path.join(destination, "package.json"),
        "utf8",
      ),
    );
    assert.equal(manifest.private, false);
    assert.equal(manifest.dependencies["web-ifc"], "0.0.77");
    assert.equal(manifest.dependencies["laz-perf"], "0.0.6");
    assert.equal(
      staged.files.some((relative) =>
        /\.(?:ifc|ifczip|ifcxml)$/iu.test(relative)),
      false,
    );
  } finally {
    await rm(destination, {
      force: true,
      recursive: true,
    });
  }
});
