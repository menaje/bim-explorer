import {
  createBimRenderer3dHost,
  createBounded3dRenderer,
  createBoundedPointCloudRenderer,
  createPointCloudWebGl2Backend,
  createWebGl2Backend,
} from "../../packages/bim-renderer-3d/src/index.mjs";
import {
  createBimSemanticExplorer,
} from "../../packages/bim-semantic-explorer/src/index.mjs";
import {
  createReferenceMeshExplorer,
} from "./reference-mesh-explorer.mjs";
import {
  createBimProductSourceWorkerClient,
} from "./worker-source-client.mjs";
import {
  createPointSourceWorkerClient,
} from "./point-source-client.mjs";

const HOST_MESSAGE =
  "bim-explorer-product-host-message/0.1";
const REPORT_SCHEMA =
  "bim-explorer-product-shell-report/0.1";
const MAXIMUM_SOURCE_BYTES = 64 * 1024 * 1024;
const MAXIMUM_E57_SOURCE_BYTES = 32 * 1024 * 1024;
const MAXIMUM_LAS_LAZ_SOURCE_BYTES = 8 * 1024 * 1024;
const POINT_SOURCE_FORMATS = new Set(["e57", "las", "laz"]);
const MULTIPLE_SCAN_E57_RENDERER_LIMITS = Object.freeze({
  maximumCpuStagingBytes: 32 * 1024 * 1024,
  maximumGpuBytes: 32 * 1024 * 1024,
  maximumPointPayloadBytes: 32 * 1024 * 1024,
  maximumPoints: 2_000_000,
  maximumRangeBytes: 32 * 1024 * 1024,
  maximumPointSize: 16,
});
const PRODUCT_SCALE_GLTF_RENDERER_LIMITS = Object.freeze({
  maximumRangeBytes: 32 * 1024 * 1024,
  maximumSourceReadBytes: 32 * 1024 * 1024,
  maximumGeometryPayloadBytes: 24 * 1024 * 1024,
  maximumInstancedTriangles: 4_000_000,
  maximumCpuStagingBytes: 32 * 1024 * 1024,
  maximumGpuCacheBytes: 32 * 1024 * 1024,
});

function rendererLimits(format, snapshot) {
  const requiresProductScaleBudget =
    format !== "ifc" &&
    snapshot.layers.some((layer) =>
      layer.rangeHandles.some((handle) =>
        handle.byteLength > 4 * 1024 * 1024));
  return requiresProductScaleBudget
    ? PRODUCT_SCALE_GLTF_RENDERER_LIMITS
    : {};
}

function pointSourceMaximumBytes(format) {
  return format === "e57"
    ? MAXIMUM_E57_SOURCE_BYTES
    : MAXIMUM_LAS_LAZ_SOURCE_BYTES;
}

const elements = {
  cancel: document.querySelector("#cancel-open"),
  canvas: document.querySelector("#model-canvas"),
  close: document.querySelector("#close-model"),
  diagBytes: document.querySelector("#diag-bytes"),
  diagGpu: document.querySelector("#diag-gpu"),
  diagHost: document.querySelector("#diag-host"),
  diagLife: document.querySelector("#diag-life"),
  diagSource: document.querySelector("#diag-source"),
  diagTime: document.querySelector("#diag-time"),
  diagnostics: document.querySelector(".diagnostics"),
  file: document.querySelector("#source-file"),
  fixture: document.querySelector("#open-fixture"),
  inspector: document.querySelector("#inspector-content"),
  isolateResults: document.querySelector("#isolate-results"),
  moreResults: document.querySelector("#more-results"),
  openSource: document.querySelector("#open-source"),
  pick: document.querySelector("#pick-model"),
  results: document.querySelector("#search-results"),
  retry: document.querySelector("#retry-open"),
  searchForm: document.querySelector("#search-form"),
  searchInput: document.querySelector("#search-input"),
  searchLabel: document.querySelector("#search-label"),
  searchOmission: document.querySelector("#search-omission"),
  selectionOrigin: document.querySelector("#selection-origin"),
  showAll: document.querySelector("#show-all"),
  sourceIdentity: document.querySelector("#source-identity"),
  status: document.querySelector("#status"),
  subtitle: document.querySelector("#product-subtitle"),
  tree: document.querySelector("#model-tree"),
  treeCount: document.querySelector("#tree-count"),
  treeTitle: document.querySelector("#tree-title"),
  treeOmission: document.querySelector("#tree-omission"),
  inspectorTitle: document.querySelector("#inspector-title"),
};

function meta(name) {
  const value = document.querySelector(
    `meta[name="${name}"]`,
  )?.content;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`BIM Explorer runtime ${name} is missing`);
  }
  return value;
}

const hostKind = meta("bim-host-kind");
if (!["browser", "vscode-webview"].includes(hostKind)) {
  throw new Error("BIM Explorer host kind is invalid");
}
const runtime = Object.freeze({
  fixtureEnabled:
    meta("bim-fixture-enabled") === "true",
  hostKind,
  profile: meta("bim-profile"),
  wasmPath: new URL(
    meta("bim-wasm-path"),
    globalThis.location.href,
  ).href,
  webIfcModuleUrl: new URL(
    meta("bim-web-ifc-module"),
    globalThis.location.href,
  ).href,
  pointWorkerUrl: new URL(
    meta("bim-point-worker"),
    globalThis.location.href,
  ).href,
  lazPerfScriptUrl: new URL(
    meta("bim-laz-perf-script"),
    globalThis.location.href,
  ).href,
  lazPerfWasmUrl: new URL(
    meta("bim-laz-perf-wasm"),
    globalThis.location.href,
  ).href,
  workerModuleUrl: new URL(
    meta("bim-worker-module"),
    globalThis.location.href,
  ).href,
});

const vscodeApi =
  typeof globalThis.acquireVsCodeApi === "function"
    ? globalThis.acquireVsCodeApi()
    : null;
let active = null;
let lastFailedBytes = null;
let lastFailedFormat = "ifc";
let openingClient = null;
let openingSequence = 0;
let hostGeneration = 0;
let latestSourceCheckpoint = "not-started";
let vscodeWorkerRuntimePromise = null;
let vscodePointWorkerRuntimePromise = null;
let wasmBlobUrl = null;
let webIfcBlobUrl = null;
let pointLazPerfBlobUrl = null;
let pointLazPerfWasmBlobUrl = null;

function localStorageAdapter() {
  if (vscodeApi !== null) {
    return {
      getItem(key) {
        return vscodeApi.getState()?.savedViews?.[key] ?? null;
      },
      removeItem(key) {
        const state = vscodeApi.getState() ?? {};
        const savedViews = {
          ...(state.savedViews ?? {}),
        };
        delete savedViews[key];
        vscodeApi.setState({
          ...state,
          savedViews,
        });
      },
      setItem(key, value) {
        const state = vscodeApi.getState() ?? {};
        vscodeApi.setState({
          ...state,
          savedViews: {
            ...(state.savedViews ?? {}),
            [key]: value,
          },
        });
      },
    };
  }
  try {
    const storage = globalThis.localStorage;
    const probe = "bim-explorer-storage-probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function clear(element) {
  element.replaceChildren();
}

function text(tag, value, className = null) {
  const element = document.createElement(tag);
  element.textContent = String(value);
  if (className !== null) {
    element.className = className;
  }
  return element;
}

function propertySetLabel(propertySet) {
  const values = (propertySet.properties ?? []).map(
    (property) => {
      const nominalValue = property.nominalValue;
      const value = nominalValue?.status === "value"
        ? String(nominalValue.value)
        : nominalValue?.status ?? "opaque";
      return `${property.name}: ${value}`;
    },
  );
  return [
    propertySet.name,
    propertySet.valueStatus,
    ...values,
  ].join(" · ");
}

function setStatus(state, message) {
  elements.status.dataset.state = state;
  elements.status.textContent = message;
}

function controls(state) {
  const ready = state === "ready";
  const opening = state === "opening";
  const pointCloud = active?.kind === "point-cloud";
  elements.cancel.disabled = !opening;
  elements.close.disabled = !ready;
  elements.pick.disabled = !ready || pointCloud;
  elements.showAll.disabled = !ready || pointCloud;
  elements.searchInput.disabled = !ready || pointCloud;
  elements.retry.disabled =
    state !== "failed" ||
    (lastFailedBytes === null && vscodeApi === null);
}

function inspectorSection(title, items, renderItem) {
  const section = document.createElement("section");
  section.append(text("h3", title));
  if (items.length === 0) {
    section.append(text("p", "Not available", "empty"));
    return section;
  }
  const list = document.createElement("ul");
  for (const item of items) {
    const row = document.createElement("li");
    row.append(renderItem(item));
    list.append(row);
  }
  section.append(list);
  return section;
}

function renderTree(state) {
  clear(elements.tree);
  elements.treeCount.textContent =
    `${state.tree.rows.length}/${state.tree.visibleLoadedRows}`;
  elements.treeOmission.textContent =
    state.tree.omittedDomRows > 0
      ? `${state.tree.omittedDomRows} rows omitted by the ` +
        `${state.tree.maximumDomRows}-row DOM bound.`
      : "";
  for (const row of state.tree.rows) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.childCount = String(row.childCount);
    button.dataset.depth = String(row.depth);
    button.dataset.expressId = String(row.expressId);
    if (typeof row.nativeId === "string") {
      button.dataset.nativeId = row.nativeId;
    }
    button.setAttribute("role", "treeitem");
    button.setAttribute("aria-level", String(row.depth + 1));
    button.setAttribute(
      "aria-selected",
      String(row.selected),
    );
    if (row.childCount > 0) {
      button.setAttribute(
        "aria-expanded",
        String(row.expanded),
      );
    }
    button.append(
      text(
        "span",
        `${row.ifcClass} · ${row.parentRelation}`,
        "meta",
      ),
      text("span", row.name, "name"),
    );
    button.addEventListener("click", async () => {
      await selectExpressId(row.expressId, "tree");
    });
    elements.tree.append(button);
  }
}

function renderResults(state) {
  clear(elements.results);
  for (const item of state.search.items) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.expressId = String(item.expressId);
    button.setAttribute("role", "option");
    button.setAttribute(
      "aria-selected",
      String(
        state.selection?.expressId === item.expressId,
      ),
    );
    button.append(
      text(
        "span",
        `${item.ifcClass} · ${item.matchedFields.join(", ")}`,
        "meta",
      ),
      text("span", item.name, "name"),
    );
    button.addEventListener("click", async () => {
      await selectExpressId(item.expressId, "search");
    });
    elements.results.append(button);
  }
  elements.searchOmission.textContent =
    state.search.query.length === 0
      ? "Results are bounded and report every omission."
      : `${state.search.loaded}/${state.search.total} loaded · ` +
        `${state.search.omitted} omitted`;
  elements.moreResults.disabled = !state.search.hasMore;
  elements.isolateResults.disabled =
    state.search.items.every((item) =>
      item.renderId === null);
}

function renderInspector(state) {
  clear(elements.inspector);
  elements.selectionOrigin.textContent =
    state.selection?.origin ?? "none";
  const inspector = state.inspector;
  if (inspector === null) {
    elements.inspector.append(
      text(
        "p",
        "Select a tree, search, relation, or 3D object.",
        "empty",
      ),
    );
    return;
  }
  elements.inspector.append(
    inspectorSection("Identity", [inspector.identity], (item) =>
      text(
        "span",
        item.nativeId === undefined
          ? `${item.ifcClass} · ${item.name} · #${item.expressId}`
          : `${item.ifcClass} · ${item.name} · ${item.nativeId}`,
      )),
    inspectorSection(
      "Container",
      inspector.groups.containment,
      (item) => text("span", `${item.ifcClass} · ${item.name}`),
    ),
    inspectorSection(
      "Type",
      inspector.groups.type,
      (item) => text("span", `${item.ifcClass} · ${item.name}`),
    ),
    inspectorSection(
      "Property sets",
      inspector.groups.propertySets,
      (item) => text("span", propertySetLabel(item)),
    ),
    inspectorSection(
      "Quantities",
      inspector.groups.quantities,
      (item) => text("span", `${item.name}: ${item.value}`),
    ),
    inspectorSection(
      "Materials",
      inspector.groups.materials,
      (item) => text("span", item.name),
    ),
    inspectorSection(
      "Classifications",
      inspector.groups.classifications,
      (item) => text(
        "span",
        `${item.identification} · ${item.name}`,
      ),
    ),
    ...(Array.isArray(
      inspector.groups.referenceMetadata,
    )
      ? [inspectorSection(
          "Reference metadata",
          inspector.groups.referenceMetadata,
          (item) => text(
            "span",
            `${item.label}: ${item.value}`,
          ),
        )]
      : []),
    inspectorSection(
      "Relations",
      inspector.groups.relations,
      (item) => {
        if (item.target === undefined) {
          return text(
            "span",
            `${item.kind} · ${item.name ?? "value"}`,
          );
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "relation-button";
        button.textContent =
          `${item.kind} · ${item.target.name}`;
        button.addEventListener("click", async () => {
          await active.explorer.selectRelation({
            kind: item.kind,
            targetExpressId: item.target.expressId,
          });
          await applySelectionView();
          render();
        });
        return button;
      },
    ),
    inspectorSection(
      "Information limits",
      inspector.coverage.limitations,
      (item) => text(
        "span",
        `${item.capability} · ${item.status}`,
        "limitation",
      ),
    ),
  );
}

function renderPointCloud() {
  const artifact = active.opened.artifact;
  const mount = active.mount;
  clear(elements.tree);
  clear(elements.results);
  clear(elements.inspector);
  elements.treeTitle.textContent = "Point source";
  elements.treeCount.textContent = "1";
  elements.treeOmission.textContent =
    "Per-point identity and hierarchy are not available.";
  elements.searchLabel.textContent =
    "Point metadata search is not available";
  elements.searchOmission.textContent =
    "This bounded profile does not index individual points.";
  elements.moreResults.disabled = true;
  elements.isolateResults.disabled = true;
  elements.inspectorTitle.textContent = "Point cloud profile";
  elements.selectionOrigin.textContent = "not applicable";
  elements.subtitle.textContent =
    "Open bounded LAS/LAZ point observations locally.";
  const summary = document.createElement("dl");
  for (const [label, value] of [
    ["Format", artifact.source.format.toUpperCase()],
    ["Version", artifact.source.formatVersion],
    ["Point format", artifact.source.pointFormat],
    ["Points", artifact.model.points],
    ["Point primitive", mount.backend.pointPrimitive],
    ["CRS authority", "unqualified"],
    ["Semantic authority", "none"],
  ]) {
    const row = document.createElement("div");
    row.append(text("dt", label), text("dd", value));
    summary.append(row);
  }
  elements.inspector.append(
    summary,
    text(
      "p",
      "Read-only display only; point picking, identity, LOD and " +
        "surveyed coordinate claims are outside this profile.",
      "limitation",
    ),
  );
}

function render() {
  if (active === null) {
    return;
  }
  if (active.kind === "point-cloud") {
    renderPointCloud();
    return;
  }
  const state = active.explorer.state;
  const reference = active.format !== "ifc";
  elements.treeTitle.textContent =
    reference ? "Reference nodes" : "Model tree";
  elements.searchLabel.textContent =
    reference
      ? "Search reference node and mesh metadata"
      : "Search model semantics";
  elements.inspectorTitle.textContent =
    reference ? "Reference metadata" : "Properties";
  elements.subtitle.textContent =
    reference
      ? "Open bounded glTF/GLB reference geometry locally."
      : "Open IFC spatial structure, semantics, and 3D locally.";
  renderTree(state);
  renderResults(state);
  renderInspector(state);
}

function contextLabel(snapshot) {
  const format = snapshot.source.format ?? "ifc";
  const schema = format === "ifc"
    ? snapshot.source.ifcSchema
    : `glTF ${snapshot.source.gltfVersion}`;
  return snapshot.source.fingerprint.slice(0, 23) +
    `… · ${schema}`;
}

function updateDiagnostics(opened, mount) {
  const snapshot = opened.snapshot;
  const report = opened.report;
  const reference =
    snapshot.source.sourceRole ===
      "derived-or-reference-mesh";
  elements.diagHost.textContent = runtime.hostKind;
  elements.diagSource.textContent =
    snapshot.source.fingerprint.slice(0, 20) + "…";
  elements.diagTime.textContent =
    `${report.performance.totalMs.toFixed(1)} ms`;
  elements.diagBytes.textContent =
    `${report.resources.sourceBytes} source · ` +
    `${report.resources.geometryBytes} geometry · ` +
    `${report.resources.metadataBytes} metadata · ` +
    (
      reference
        ? `${snapshot.entities.length} reference entities`
        : `${report.resources.detailBytes} deferred detail`
    );
  elements.diagGpu.textContent =
    `${mount.renderer.backend.uploadedBytes} bytes · ` +
    `${mount.renderer.backend.nonBackgroundPixels} pixels`;
  elements.diagLife.textContent =
    "source session + Worker + GPU active";
}

function publishReport(status, additions = {}) {
  const report = Object.freeze({
    schema: REPORT_SCHEMA,
    status,
    hostKind: runtime.hostKind,
    externalUpload: false,
    telemetry: false,
    ...additions,
  });
  globalThis.__bimExplorerProductReport = report;
  if (vscodeApi !== null) {
    vscodeApi.postMessage({
      schema: HOST_MESSAGE,
      type: "report",
      report,
    });
  }
  return report;
}

async function applySelectionView() {
  if (active?.explorer.state.selection === null) {
    return null;
  }
  const command = await active.explorer.setVisibility("show-all");
  return active.host.renderView({
    camera: active.camera,
    ...command,
  });
}

async function selectExpressId(expressId, origin) {
  await active.explorer.selectExpressId(expressId, {
    origin,
  });
  await applySelectionView();
  render();
}

function firstRenderable(snapshot) {
  return snapshot.entities.find((entity) =>
    entity.renderId !== null) ?? null;
}

async function revealFirstProduct(explorer, snapshot, entity) {
  if (!Array.isArray(snapshot.tree?.nodes)) {
    await explorer.selectExpressId(entity.expressId, {
      origin: "tree",
    });
    return;
  }
  const nodeById = new Map(
    snapshot.tree.nodes.map((node) => [
      node.expressId,
      node,
    ]),
  );
  const lineage = [];
  let node = nodeById.get(entity.expressId);
  while (node?.parentExpressId !== null) {
    node = nodeById.get(node.parentExpressId);
    if (node !== undefined) {
      lineage.unshift(node.expressId);
    }
  }
  for (const expressId of lineage) {
    await explorer.expand(expressId);
  }
  await explorer.selectExpressId(entity.expressId, {
    origin: "tree",
  });
}

async function disposeActive(reason) {
  if (active === null) {
    return null;
  }
  const current = active;
  active = null;
  if (current.kind === "point-cloud") {
    let rendererDisposed = false;
    let clientDisposed = false;
    try {
      rendererDisposed = await current.renderer.dispose();
    } finally {
      clientDisposed = await current.client.dispose();
    }
    elements.diagLife.textContent = "disposed";
    return {
      backend: current.backend.state,
      client: current.client.state,
      clientDisposed,
      pointRangeCleared: current.pointRangeCleared,
      reason,
      rendererDisposed,
      workerTerminatedAfterTransfer:
        current.opened.cleanup.workerTerminatedAfterTransfer,
    };
  }
  let explorerDisposed = false;
  let hostReceipt = null;
  let clientDisposed = false;
  try {
    explorerDisposed = await current.explorer.dispose();
  } finally {
    try {
      hostReceipt = await current.host.dispose({ reason });
    } finally {
      clientDisposed = await current.client.dispose();
    }
  }
  elements.diagLife.textContent = "disposed";
  return {
    clientDisposed,
    explorerDisposed,
    hostReceipt,
    backend: current.backend.state,
    client: current.client.state,
  };
}

async function responseText(url, label, maximumBytes) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`${label} is unavailable`);
  }
  const source = await response.text();
  if (source.length === 0 || source.length > maximumBytes) {
    throw new RangeError(`${label} exceeds its byte limit`);
  }
  return source;
}

async function responseBytes(url, label, maximumBytes) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`${label} is unavailable`);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
    throw new RangeError(`${label} exceeds its byte limit`);
  }
  return bytes;
}

async function vscodeWorkerRuntime() {
  if (runtime.hostKind !== "vscode-webview") {
    return null;
  }
  vscodeWorkerRuntimePromise ??= Promise.all([
    responseText(
      runtime.workerModuleUrl,
      "VS Code Worker bundle",
      1024 * 1024,
    ),
    responseText(
      runtime.webIfcModuleUrl,
      "VS Code web-ifc module",
      8 * 1024 * 1024,
    ),
    responseBytes(
      new URL("web-ifc.wasm", runtime.wasmPath).href,
      "VS Code web-ifc WASM",
      32 * 1024 * 1024,
    ),
  ]).then(([workerBundle, webIfcSource, wasmBytes]) => {
    webIfcBlobUrl = URL.createObjectURL(
      new Blob([webIfcSource], {
        type: "text/javascript",
      }),
    );
    wasmBlobUrl = URL.createObjectURL(
      new Blob([wasmBytes], {
        type: "application/wasm",
      }),
    );
    return Object.freeze({
      wasmUrl: wasmBlobUrl,
      webIfcModuleUrl: webIfcBlobUrl,
      workerBundle,
    });
  });
  return vscodeWorkerRuntimePromise;
}

async function vscodePointWorkerRuntime() {
  if (runtime.hostKind !== "vscode-webview") {
    return null;
  }
  vscodePointWorkerRuntimePromise ??= Promise.all([
    responseText(
      runtime.pointWorkerUrl,
      "VS Code point Worker bundle",
      1024 * 1024,
    ),
    responseText(
      runtime.lazPerfScriptUrl,
      "VS Code laz-perf Worker runtime",
      1024 * 1024,
    ),
    responseBytes(
      runtime.lazPerfWasmUrl,
      "VS Code laz-perf WASM",
      32 * 1024 * 1024,
    ),
  ]).then(([workerBundle, lazPerfSource, lazPerfWasm]) => {
    pointLazPerfBlobUrl = URL.createObjectURL(
      new Blob([lazPerfSource], {
        type: "text/javascript",
      }),
    );
    pointLazPerfWasmBlobUrl = URL.createObjectURL(
      new Blob([lazPerfWasm], {
        type: "application/wasm",
      }),
    );
    return Object.freeze({
      lazPerfScriptUrl: pointLazPerfBlobUrl,
      lazPerfWasmUrl: pointLazPerfWasmBlobUrl,
      workerBundle,
    });
  });
  return vscodePointWorkerRuntimePromise;
}

async function client({
  maximumSourceBytes = MAXIMUM_SOURCE_BYTES,
  openTimeoutMs = 30_000,
} = {}) {
  const boundedSourceBytes =
    Number.isSafeInteger(maximumSourceBytes) &&
    maximumSourceBytes > 0
      ? Math.min(
          maximumSourceBytes,
          MAXIMUM_SOURCE_BYTES,
        )
      : MAXIMUM_SOURCE_BYTES;
  const boundedOpenTimeout =
    Number.isSafeInteger(openTimeoutMs) &&
    openTimeoutMs >= 1_000 &&
    openTimeoutMs <= 120_000
      ? openTimeoutMs
      : 30_000;
  const workerRuntime = await vscodeWorkerRuntime();
  const workerFactory = workerRuntime !== null
    ? (url) => {
        const bootstrapUrl = URL.createObjectURL(
          new Blob(
            [workerRuntime.workerBundle],
            {
              type: "text/javascript",
            },
          ),
        );
        const worker = new Worker(bootstrapUrl, {
          name: "bim-explorer-source",
          type: "module",
        });
        let revoked = false;
        const revoke = () => {
          if (!revoked) {
            revoked = true;
            URL.revokeObjectURL(bootstrapUrl);
          }
        };
        return {
          addEventListener(...args) {
            return worker.addEventListener(...args);
          },
          postMessage(...args) {
            return worker.postMessage(...args);
          },
          terminate() {
            revoke();
            return worker.terminate();
          },
        };
      }
    : undefined;
  const value = createBimProductSourceWorkerClient({
    limits: {
      maximumSourceBytes: boundedSourceBytes,
      openTimeoutMs: boundedOpenTimeout,
      operationTimeoutMs: 10_000,
    },
    wasmPath: runtime.wasmPath,
    wasmUrl: workerRuntime?.wasmUrl ?? null,
    webIfcModuleUrl:
      workerRuntime?.webIfcModuleUrl ??
      runtime.webIfcModuleUrl,
    ...(workerFactory === undefined
      ? {}
      : { workerFactory }),
    workerUrl: runtime.workerModuleUrl,
  });
  value.onProgress((event) => {
    const labels = {
      "source-admitted": "Source admitted; starting isolated conversion…",
      "artifact-created": "Source indexed; creating immutable snapshot…",
      "gltf-validating": "Validating bounded glTF reference profile…",
      "snapshot-ready": "Snapshot ready; mounting WebGL2…",
      "web-ifc-imported": "web-ifc ready; initializing WASM…",
      "web-ifc-importing": "Loading local web-ifc module…",
      "worker-ready": "Source Worker ready…",
    };
    latestSourceCheckpoint = event.phase;
    setStatus(
      "opening",
      labels[event.phase] ?? "Opening source locally…",
    );
  });
  return value;
}

async function pointClient({
  format,
  maximumSourceBytes = pointSourceMaximumBytes(format),
  openTimeoutMs = 15_000,
} = {}) {
  if (!POINT_SOURCE_FORMATS.has(format)) {
    throw new TypeError("Point source client format is unsupported");
  }
  const formatMaximumSourceBytes = pointSourceMaximumBytes(format);
  const boundedSourceBytes =
    Number.isSafeInteger(maximumSourceBytes) &&
    maximumSourceBytes > 0
      ? Math.min(
          maximumSourceBytes,
          formatMaximumSourceBytes,
        )
      : formatMaximumSourceBytes;
  const boundedOpenTimeout =
    Number.isSafeInteger(openTimeoutMs) &&
    openTimeoutMs >= 1_000 &&
    openTimeoutMs <= 120_000
      ? openTimeoutMs
      : 15_000;
  const workerRuntime = await vscodePointWorkerRuntime();
  const workerFactory = workerRuntime === null
    ? undefined
    : () => {
        const bootstrapUrl = URL.createObjectURL(
          new Blob([workerRuntime.workerBundle], {
            type: "text/javascript",
          }),
        );
        const worker = new Worker(bootstrapUrl, {
          name: "bim-explorer-point-source",
        });
        let revoked = false;
        const revoke = () => {
          if (!revoked) {
            revoked = true;
            URL.revokeObjectURL(bootstrapUrl);
          }
        };
        return {
          addEventListener(...args) {
            return worker.addEventListener(...args);
          },
          postMessage(...args) {
            return worker.postMessage(...args);
          },
          terminate() {
            revoke();
            return worker.terminate();
          },
        };
      };
  const value = createPointSourceWorkerClient({
    lazPerfScriptUrl:
      workerRuntime?.lazPerfScriptUrl ??
      runtime.lazPerfScriptUrl,
    lazPerfWasmUrl:
      workerRuntime?.lazPerfWasmUrl ??
      runtime.lazPerfWasmUrl,
    limits: {
      maximumSourceBytes: boundedSourceBytes,
      openTimeoutMs: boundedOpenTimeout,
    },
    ...(workerFactory === undefined
      ? {}
      : { workerFactory }),
    workerUrl: runtime.pointWorkerUrl,
  });
  value.onProgress((event) => {
    const labels = {
      "source-admitted":
        "Point source admitted; validating header…",
      "decoder-initializing":
        "Initializing the isolated LAZ decoder…",
      "point-range-created":
        "Point range ready; mounting WebGL2…",
    };
    latestSourceCheckpoint = event.phase;
    setStatus(
      "opening",
      labels[event.phase] ?? "Opening point source locally…",
    );
  });
  return value;
}

async function openPointBytes(bytesValue, {
  format,
  limits = {},
  origin,
} = {}) {
  if (
    !(bytesValue instanceof Uint8Array) ||
    bytesValue.byteLength === 0 ||
    !POINT_SOURCE_FORMATS.has(format) ||
    bytesValue.byteLength > pointSourceMaximumBytes(format)
  ) {
    throw new RangeError(
      "Selected point source exceeds its bounded profile",
    );
  }
  const sequence = openingSequence + 1;
  openingSequence = sequence;
  controls("opening");
  latestSourceCheckpoint = "point-client-creating";
  setStatus(
    "opening",
    `Opening ${format.toUpperCase()} locally…`,
  );
  elements.diagLife.textContent = "opening isolated point Worker";
  const priorCleanup = await disposeActive("source-switch");
  if (sequence !== openingSequence) {
    return null;
  }
  if (openingClient !== null) {
    openingClient.terminate();
    await openingClient.dispose();
  }
  if (sequence !== openingSequence) {
    return null;
  }
  const sourceClient = await pointClient({
    ...limits,
    format,
  });
  if (sequence !== openingSequence) {
    await sourceClient.dispose();
    return null;
  }
  openingClient = sourceClient;
  let backend = null;
  let opened = null;
  let pointRangeCleared = false;
  let renderer = null;
  let phase = "point-source-open";
  try {
    opened = await sourceClient.open(bytesValue, { format });
    if (sequence !== openingSequence) {
      opened.artifact.range.bytes.fill(0);
      await sourceClient.dispose();
      return null;
    }
    phase = "point-renderer-create";
    backend = createPointCloudWebGl2Backend({
      canvas: elements.canvas,
      height: 450,
      width: 800,
    });
    renderer = createBoundedPointCloudRenderer({
      backend,
      limits: format === "e57" &&
        opened.artifact.source.pointFormat.endsWith("-multiple-scan")
        ? MULTIPLE_SCAN_E57_RENDERER_LIMITS
        : {},
      pointSize: 3,
    });
    phase = "point-renderer-mount";
    const mount = await renderer.mount({
      range: opened.artifact.range,
      source: opened.artifact.source,
    });
    if (sequence !== openingSequence) {
      opened.artifact.range.bytes.fill(0);
      await renderer.dispose();
      await sourceClient.dispose();
      if (openingClient === sourceClient) {
        openingClient = null;
      }
      return null;
    }
    opened.artifact.range.bytes.fill(0);
    pointRangeCleared = opened.artifact.range.bytes.every(
      (value) => value === 0,
    );
    active = {
      backend,
      client: sourceClient,
      format,
      kind: "point-cloud",
      mount,
      opened,
      origin,
      pointRangeCleared,
      renderer,
    };
    if (openingClient === sourceClient) {
      openingClient = null;
    }
    lastFailedBytes?.fill(0);
    lastFailedBytes = null;
    lastFailedFormat = "ifc";
    render();
    const artifact = opened.artifact;
    elements.diagHost.textContent = runtime.hostKind;
    elements.diagSource.textContent =
      artifact.source.fingerprint.slice(0, 20) + "…";
    elements.diagTime.textContent =
      `${opened.performance.totalMs.toFixed(1)} ms`;
    elements.diagBytes.textContent =
      `${artifact.resources.inputBytes} source · ` +
      `${artifact.resources.pointRangeBytes} point range · ` +
      `${artifact.model.points} points`;
    elements.diagGpu.textContent =
      `${mount.backend.uploadedBytes} bytes · ` +
      `${mount.backend.nonBackgroundPixels} pixels`;
    elements.diagLife.textContent =
      "source Worker released + GPU active";
    elements.sourceIdentity.textContent =
      artifact.source.fingerprint.slice(0, 23) +
      `… · ${format.toUpperCase()} ` +
      `${artifact.source.formatVersion} · CRS unqualified`;
    setStatus(
      "ready",
      `Ready: local ${format.toUpperCase()} points are open read-only.`,
    );
    controls("ready");
    publishReport("ready", {
      source: {
        byteLength: artifact.source.byteLength,
        coordinateReferenceStatus:
          artifact.source.coordinateReferenceStatus,
        fingerprint: artifact.source.fingerprint,
        format: artifact.source.format,
        formatVersion: artifact.source.formatVersion,
        pointFormat: artifact.source.pointFormat,
        revisionId: artifact.source.revisionId,
        semanticAuthority: false,
        sourceRole: artifact.source.sourceRole,
      },
      model: {
        points: artifact.model.points,
        ranges: artifact.model.ranges,
      },
      performance: {
        artifactMs:
          artifact.performance.sourceProjectionMs,
        sourceMs: 0,
        totalMs: opened.performance.totalMs,
      },
      resources: {
        decodedPointBytes:
          artifact.resources.decodedPointBytes,
        pointRangeBytes:
          artifact.resources.pointRangeBytes,
        pointRangePayloadBytes:
          artifact.resources.pointRangePayloadBytes,
        sourceBytes: artifact.resources.inputBytes,
        wasmHeapCapacityBytes:
          artifact.resources.wasmHeapCapacityBytes,
      },
      renderer: {
        actualGpu: mount.backend.actualGpu,
        nonBackgroundPixels:
          mount.backend.nonBackgroundPixels,
        sourceReadBytes: mount.metrics.rangeBytes,
        uploadedBytes: mount.backend.uploadedBytes,
      },
      pointCloud: {
        ...(artifact.profile.attributeProjection === undefined
          ? {}
          : {
              attributeProjection:
                artifact.profile.attributeProjection,
            }),
        bounds: mount.geometry.bounds,
        colorRange: mount.geometry.colorRange,
        ...(artifact.profile.coordinateProjection
          .sourceRepresentation === undefined
          ? {}
          : {
              coordinateRepresentation:
                artifact.profile.coordinateProjection
                  .sourceRepresentation,
            }),
        coordinateReferenceStatus: "unqualified",
        decoder: artifact.profile.decoder,
        maximumProjectionError:
          artifact.profile.coordinateProjection
            .maximumAbsoluteError,
        origin: mount.geometry.origin,
        pointPrimitive: mount.backend.pointPrimitive,
        pointSize: mount.backend.pointSize,
        rangeSha256: artifact.range.sha256,
      },
      lifecycle: {
        cpuPointRangeCleared: pointRangeCleared,
        sourceBufferCleared:
          opened.cleanup.sourceBufferCleared,
        workerTerminatedAfterTransfer:
          opened.cleanup.workerTerminatedAfterTransfer,
      },
      priorCleanup,
    });
    return active;
  } catch (error) {
    opened?.artifact.range.bytes.fill(0);
    try {
      await renderer?.dispose();
    } finally {
      await sourceClient.dispose();
    }
    if (openingClient === sourceClient) {
      openingClient = null;
    }
    if (sequence !== openingSequence) {
      return null;
    }
    const code = typeof error?.code === "string"
      ? error.code
      : phase === "point-source-open"
        ? "POINT_SOURCE_OPEN_FAILED"
        : phase === "point-renderer-create"
          ? "POINT_RENDERER_CREATE_FAILED"
          : "POINT_RENDERER_MOUNT_FAILED";
    setStatus("failed", `Open failed: ${code}`);
    elements.diagLife.textContent =
      "failed; point Worker and GPU resources released";
    controls("failed");
    publishReport("failed", {
      diagnostic: {
        checkpoint: latestSourceCheckpoint,
        code,
        name: typeof error?.name === "string"
          ? error.name
          : "Error",
        operation: phase,
        retryable: true,
      },
    });
    throw error;
  }
}

async function openBytes(bytesValue, {
  format = "ifc",
  limits = {},
  origin,
  profile = runtime.profile,
} = {}) {
  if (POINT_SOURCE_FORMATS.has(format)) {
    return openPointBytes(bytesValue, {
      format,
      limits,
      origin,
    });
  }
  if (
    !(bytesValue instanceof Uint8Array) ||
    bytesValue.byteLength === 0 ||
    bytesValue.byteLength > MAXIMUM_SOURCE_BYTES
  ) {
    throw new RangeError(
      "Selected source exceeds the 64 MiB local admission limit",
    );
  }
  if (!["ifc", "gltf", "glb"].includes(format)) {
    throw new TypeError("Selected source format is unsupported");
  }
  const sequence = openingSequence + 1;
  openingSequence = sequence;
  controls("opening");
  latestSourceCheckpoint = "client-creating";
  setStatus(
    "opening",
    `Opening ${format.toUpperCase()} locally…`,
  );
  elements.diagLife.textContent = "opening isolated Worker";
  const priorCleanup = await disposeActive("source-switch");
  if (openingClient !== null) {
    openingClient.terminate();
    await openingClient.dispose();
  }
  const sourceClient = await client(limits);
  latestSourceCheckpoint = "worker-creating";
  openingClient = sourceClient;
  let phase = "source-open";
  try {
    const opened = await sourceClient.open(bytesValue, {
      format,
      profile,
    });
    if (sequence !== openingSequence) {
      await opened.session.dispose();
      await opened.workerLease.dispose();
      await sourceClient.dispose();
      return null;
    }
    phase = "renderer-create";
    const backend = createWebGl2Backend({
      canvas: elements.canvas,
      height: 450,
      width: 800,
    });
    const renderer = createBounded3dRenderer({
      backend,
      limits: rendererLimits(format, opened.snapshot),
    });
    const host = createBimRenderer3dHost({
      kind: runtime.hostKind,
      renderer,
    });
    phase = "renderer-mount";
    const mount = await host.mount({
      session: opened.session,
      snapshot: opened.snapshot,
      workerLease: opened.workerLease,
    });
    phase = "semantic-initialize";
    const reference =
      opened.snapshot.source.sourceRole ===
        "derived-or-reference-mesh";
    const explorer = reference
      ? createReferenceMeshExplorer({
          session: opened.session,
          snapshot: opened.snapshot,
          limits: {
            maximumDomRows: 64,
            maximumSearchResults: 500,
            searchPageSize: 25,
          },
        })
      : createBimSemanticExplorer({
          session: opened.session,
          snapshot: opened.snapshot,
          storage: localStorageAdapter(),
          limits: {
            maximumDomRows: 64,
            maximumLoadedTreeItems: 2_000,
            maximumRelations: 100,
            maximumSearchResults: 500,
            searchPageSize: 25,
            treePageSize: 25,
          },
        });
    await explorer.initialize();
    const entity = firstRenderable(opened.snapshot);
    if (entity !== null) {
      await revealFirstProduct(
        explorer,
        opened.snapshot,
        entity,
      );
    }
    active = {
      backend,
      camera: mount.renderer.backend.camera,
      client: sourceClient,
      explorer,
      format,
      host,
      mount,
      opened,
      origin,
    };
    openingClient = null;
    lastFailedBytes?.fill(0);
    lastFailedBytes = null;
    lastFailedFormat = "ifc";
    render();
    updateDiagnostics(opened, mount);
    elements.sourceIdentity.textContent =
      contextLabel(opened.snapshot);
    setStatus(
      "ready",
      `Ready: local ${format.toUpperCase()} is open read-only.`,
    );
    controls("ready");
    const sourceReport = reference
      ? {
          fingerprint:
            opened.snapshot.source.fingerprint,
          revisionId: opened.snapshot.revisionId,
          snapshotId: opened.snapshot.snapshotId,
          byteLength: opened.snapshot.source.byteLength,
          format: opened.snapshot.source.format,
          gltfVersion:
            opened.snapshot.source.gltfVersion,
          profile: opened.snapshot.source.profile,
          sourceRole:
            opened.snapshot.source.sourceRole,
          semanticAuthority:
            opened.snapshot.source.semanticAuthority,
        }
      : {
          fingerprint:
            opened.snapshot.source.fingerprint,
          revisionId: opened.snapshot.revisionId,
          snapshotId: opened.snapshot.snapshotId,
          byteLength: opened.snapshot.source.byteLength,
          ifcSchema: opened.snapshot.source.ifcSchema,
        };
    const modelReport = reference
      ? {
          entities: opened.snapshot.entities.length,
          geometryRecords:
            opened.snapshot.geometry.records,
          instances: opened.snapshot.geometry.instances,
          triangles: opened.snapshot.geometry.triangles,
          ranges:
            opened.snapshot.layers[0].rangeHandles.length,
        }
      : {
          products: opened.snapshot.geometry.products,
          treeNodes: opened.snapshot.tree.nodes.length,
          triangles: opened.snapshot.geometry.triangles,
          ranges:
            opened.snapshot.layers[0].rangeHandles.length,
        };
    publishReport("ready", {
      source: sourceReport,
      model: modelReport,
      performance: opened.report.performance,
      resources: opened.report.resources,
      renderer: {
        actualGpu: mount.renderer.backend.actualGpu,
        nonBackgroundPixels:
          mount.renderer.backend.nonBackgroundPixels,
        sourceReadBytes: mount.renderer.metrics.sourceReadBytes,
        uploadedBytes: mount.renderer.backend.uploadedBytes,
      },
      ...(reference
        ? {
            reference: {
              globalId:
                explorer.state.selection?.globalId ?? null,
              selectedNativeId:
                explorer.state.selection?.nativeId ?? null,
              treeRows: explorer.state.tree.rows.length,
              maximumDomRows:
                explorer.state.tree.maximumDomRows,
            },
          }
        : {
            semantic: {
              selectedExpressId:
                explorer.state.selection?.expressId ?? null,
              treeRows: explorer.state.tree.rows.length,
              maximumDomRows:
                explorer.state.tree.maximumDomRows,
            },
          }),
      priorCleanup,
    });
    return active;
  } catch (error) {
    if (sequence !== openingSequence) {
      return null;
    }
    sourceClient.terminate();
    await sourceClient.dispose();
    openingClient = null;
    const code = typeof error?.code === "string"
      ? error.code
      : phase === "source-open"
        ? "SOURCE_OPEN_FAILED"
        : phase === "renderer-create"
          ? "RENDERER_CREATE_FAILED"
          : phase === "renderer-mount"
            ? "RENDERER_MOUNT_FAILED"
            : "SEMANTIC_INITIALIZE_FAILED";
    setStatus(
      "failed",
      `Open failed: ${code}`,
    );
    elements.diagLife.textContent = "failed; resources released";
    controls("failed");
    publishReport("failed", {
      diagnostic: {
        checkpoint: latestSourceCheckpoint,
        code,
        name:
          typeof error?.name === "string"
            ? error.name
            : "Error",
        operation: phase,
        retryable: true,
      },
    });
    throw error;
  }
}

function localFileFormat(file) {
  const extension = file.name
    .toLocaleLowerCase()
    .match(/\.([a-z0-9]+)$/u)?.[1] ?? "";
  if (
    !["ifc", "gltf", "glb", "e57", "las", "laz"].includes(
      extension,
    )
  ) {
    throw new TypeError(
      "Selected file must be IFC, glTF, GLB, E57, LAS, or LAZ",
    );
  }
  return extension;
}

async function readLocalFile(file) {
  const format = localFileFormat(file);
  const maximumBytes = POINT_SOURCE_FORMATS.has(format)
    ? pointSourceMaximumBytes(format)
    : MAXIMUM_SOURCE_BYTES;
  if (
    file.size <= 0 ||
    file.size > maximumBytes
  ) {
    throw new RangeError(
      "Selected source exceeds its local admission limit",
    );
  }
  const buffer = await file.arrayBuffer();
  if (
    buffer.byteLength !== file.size ||
    buffer.byteLength > maximumBytes
  ) {
    throw new RangeError(
      "Selected source changed during local admission",
    );
  }
  return {
    bytes: new Uint8Array(buffer),
    format,
  };
}

elements.file.addEventListener("change", async () => {
  const file = elements.file.files?.[0] ?? null;
  elements.file.value = "";
  if (file === null) {
    return;
  }
  lastFailedBytes?.fill(0);
  lastFailedBytes = null;
  lastFailedFormat = "ifc";
  let admitted = null;
  try {
    admitted = await readLocalFile(file);
    lastFailedBytes = Uint8Array.from(admitted.bytes);
    lastFailedFormat = admitted.format;
    await openBytes(admitted.bytes, {
      format: admitted.format,
      origin: "local-file",
    });
  } catch (error) {
    if (elements.status.dataset.state !== "failed") {
      setStatus(
        "failed",
        "Open failed: LOCAL_FILE_ADMISSION_FAILED",
      );
      controls("failed");
    }
  } finally {
    admitted?.bytes.fill(0);
  }
});

elements.fixture.addEventListener("click", async () => {
  lastFailedBytes?.fill(0);
  lastFailedBytes = null;
  lastFailedFormat = "ifc";
  try {
    const response = await fetch("/qualification-fixture.ifc", {
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok) {
      throw new Error("qualification fixture is unavailable");
    }
    const bytes = new Uint8Array(
      await response.arrayBuffer(),
    );
    lastFailedBytes = Uint8Array.from(bytes);
    await openBytes(bytes, {
      format: "ifc",
      origin: "qualification-fixture",
    });
  } catch {
    setStatus(
      "failed",
      "Open failed: QUALIFICATION_FIXTURE_UNAVAILABLE",
    );
    controls("failed");
  }
});

elements.cancel.addEventListener("click", async () => {
  openingSequence += 1;
  openingClient?.terminate();
  await openingClient?.dispose();
  openingClient = null;
  setStatus("idle", "Open cancelled; Worker terminated.");
  elements.diagLife.textContent = "cancelled; Worker terminated";
  controls("idle");
  publishReport("cancelled", {
    cleanup: {
      workerTerminated: true,
    },
  });
});

elements.retry.addEventListener("click", async () => {
  if (vscodeApi !== null) {
    vscodeApi.postMessage({
      schema: HOST_MESSAGE,
      type: "retry",
    });
    return;
  }
  if (lastFailedBytes !== null) {
    try {
      await openBytes(lastFailedBytes, {
        format: lastFailedFormat,
        origin: "retry",
      });
    } catch {
      // openBytes already published a stable path-free diagnostic.
    }
  }
});

elements.close.addEventListener("click", async () => {
  const cleanup = await disposeActive("user-close");
  elements.sourceIdentity.textContent = "No active source";
  setStatus("idle", "Model closed; local resources released.");
  controls("idle");
  publishReport("disposed", {
    cleanup,
  });
});

elements.searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (active === null || active.kind === "point-cloud") {
    return;
  }
  await active.explorer.search(elements.searchInput.value);
  render();
});

elements.moreResults.addEventListener("click", async () => {
  if (active?.kind === "point-cloud") {
    return;
  }
  await active?.explorer.loadMoreSearch();
  render();
});

elements.isolateResults.addEventListener("click", async () => {
  if (active === null || active.kind === "point-cloud") {
    return;
  }
  const command = await active.explorer.setVisibility(
    "isolate-results",
  );
  await active.host.renderView({
    camera: active.camera,
    ...command,
  });
  render();
});

elements.showAll.addEventListener("click", async () => {
  if (active === null || active.kind === "point-cloud") {
    return;
  }
  const command = await active.explorer.setVisibility("show-all");
  await active.host.renderView({
    camera: active.camera,
    ...command,
  });
});

async function pickVisible() {
  const coordinates = [
    [400, 225],
    [400, 150],
    [400, 300],
    [275, 225],
    [525, 225],
  ];
  for (const [x, y] of coordinates) {
    const receipt = await active.host.pick({ x, y });
    if (receipt.status === "hit") {
      return receipt;
    }
  }
  throw new Error("no visible BIM object was picked");
}

elements.pick.addEventListener("click", async () => {
  if (active === null || active.kind === "point-cloud") {
    return;
  }
  const pick = await pickVisible();
  await active.explorer.selectPick(pick);
  await applySelectionView();
  render();
});

elements.tree.addEventListener("keydown", async (event) => {
  const target = event.target.closest('[role="treeitem"]');
  if (
    target === null ||
    active === null ||
    active.kind === "point-cloud"
  ) {
    return;
  }
  const buttons = [
    ...elements.tree.querySelectorAll('[role="treeitem"]'),
  ];
  const index = buttons.indexOf(target);
  const expressId = Number(target.dataset.expressId);
  if (event.key === "ArrowDown") {
    event.preventDefault();
    buttons[Math.min(index + 1, buttons.length - 1)]?.focus();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    buttons[Math.max(index - 1, 0)]?.focus();
  } else if (
    event.key === "ArrowRight" &&
    Number(target.dataset.childCount) > 0
  ) {
    event.preventDefault();
    await active.explorer.expand(expressId);
    render();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    await active.explorer.collapse(expressId);
    render();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    await selectExpressId(expressId, "tree");
  }
});

globalThis.addEventListener("message", async (event) => {
  const message = event.data;
  if (
    vscodeApi === null ||
    message?.schema !== HOST_MESSAGE
  ) {
    return;
  }
  if (message.type === "source-bytes") {
    if (
      !Number.isSafeInteger(message.generation) ||
      message.generation <= hostGeneration
    ) {
      return;
    }
    hostGeneration = message.generation;
    let bytes;
    if (message.bytes instanceof ArrayBuffer) {
      bytes = new Uint8Array(message.bytes);
    } else if (ArrayBuffer.isView(message.bytes)) {
      bytes = new Uint8Array(
        message.bytes.buffer,
        message.bytes.byteOffset,
        message.bytes.byteLength,
      );
    } else if (Array.isArray(message.bytes)) {
      bytes = Uint8Array.from(message.bytes);
    } else {
      setStatus("failed", "Open failed: HOST_BYTES_INVALID");
      controls("failed");
      return;
    }
    try {
      await openBytes(bytes, {
        format: message.format ?? "ifc",
        limits: message.limits ?? {},
        origin: "vscode-custom-editor",
        profile: message.profile ?? runtime.profile,
      });
    } catch {
      // openBytes already published a stable path-free diagnostic.
    } finally {
      bytes.fill(0);
    }
  } else if (message.type === "cancel") {
    openingSequence += 1;
    openingClient?.terminate();
    await openingClient?.dispose();
    openingClient = null;
    setStatus("idle", "Open cancelled; Worker terminated.");
    controls("idle");
    publishReport("cancelled", {
      cleanup: {
        workerTerminated: true,
      },
    });
  } else if (message.type === "source-error") {
    openingSequence += 1;
    openingClient?.terminate();
    await openingClient?.dispose();
    openingClient = null;
    const code =
      typeof message.diagnostic?.code === "string"
        ? message.diagnostic.code
        : "SOURCE_FILE_READ_FAILED";
    setStatus("failed", `Open failed: ${code}`);
    elements.diagLife.textContent =
      "failed before source admission";
    controls("failed");
    publishReport("failed", {
      diagnostic: {
        code,
        retryable:
          message.diagnostic?.retryable === true,
      },
    });
  } else if (message.type === "show-diagnostics") {
    elements.diagnostics.open = true;
    elements.diagnostics.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  } else if (message.type === "dispose") {
    const cleanup = await disposeActive("editor-close");
    publishReport("disposed", { cleanup });
  }
});

globalThis.addEventListener("pagehide", () => {
  openingClient?.terminate();
  if (webIfcBlobUrl !== null) {
    URL.revokeObjectURL(webIfcBlobUrl);
    webIfcBlobUrl = null;
  }
  if (wasmBlobUrl !== null) {
    URL.revokeObjectURL(wasmBlobUrl);
    wasmBlobUrl = null;
  }
  if (pointLazPerfBlobUrl !== null) {
    URL.revokeObjectURL(pointLazPerfBlobUrl);
    pointLazPerfBlobUrl = null;
  }
  if (pointLazPerfWasmBlobUrl !== null) {
    URL.revokeObjectURL(pointLazPerfWasmBlobUrl);
    pointLazPerfWasmBlobUrl = null;
  }
  if (active !== null) {
    void disposeActive("pagehide");
  }
});

elements.diagHost.textContent = runtime.hostKind;
elements.fixture.hidden =
  runtime.hostKind !== "browser" ||
  !runtime.fixtureEnabled;
if (runtime.hostKind === "vscode-webview") {
  elements.openSource.hidden = true;
  elements.fixture.hidden = true;
  setStatus("opening", "Waiting for the read-only editor source…");
  controls("opening");
  vscodeApi.postMessage({
    schema: HOST_MESSAGE,
    type: "ready",
  });
} else {
  controls("idle");
  publishReport("idle");
}
