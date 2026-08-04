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

test("VS Code manifest associates IFC and glTF with a read-only product host", async () => {
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
    ],
  );
  assert.equal(
    manifest.contributes.customEditors[0].priority,
    "default",
  );
  assert.equal(manifest.dependencies["web-ifc"], "0.0.77");
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
  assert.match(
    html,
    /Content-Security-Policy/u,
  );
  assert.match(
    html,
    /worker-src vscode-webview:\/\/test blob:/u,
  );
  assert.doesNotMatch(html, /unsafe-inline/u);
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
      "apps/bim-explorer-web/reference-mesh-explorer.mjs",
      "apps/bim-explorer-web/source-worker.mjs",
      "adapters/web-ifc/src/create-source-artifact.mjs",
      "packages/bim-model-source/src/index.mjs",
      "packages/gltf-reference-source/src/index.mjs",
      "packages/bim-renderer-3d/src/index.mjs",
      "packages/bim-semantic-explorer/src/index.mjs",
      "node_modules/web-ifc/web-ifc-api.js",
      "node_modules/web-ifc/web-ifc.wasm",
      "node_modules/web-ifc/LICENSE.md",
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
