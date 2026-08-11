import {
  createBimRenderer3dHost,
  createBimSurface,
  createBounded3dRenderer,
  createWebGl2Backend,
} from "../../packages/bim-surface/runtime/index.mjs";
import {
  createBoundedPointCloudRenderer,
} from "../../packages/bim-renderer-3d/src/point-cloud.mjs";
import {
  createPointCloudWebGl2Backend,
} from "../../packages/bim-renderer-3d/src/point-cloud-webgl2-backend.mjs";
import {
  createReferenceMeshExplorer,
} from "./reference-mesh-explorer.mjs";
import {
  openBimProductViewerCore,
} from "../../packages/viewer-core-consumer/runtime/product.mjs";
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
const EXTERNAL_GLTF_RESOURCE_NAME =
  /^[A-Za-z0-9][A-Za-z0-9._-]*\.bin$/u;
const MULTIPLE_SCAN_E57_RENDERER_LIMITS = Object.freeze({
  maximumCpuStagingBytes: 32 * 1024 * 1024,
  maximumGpuBytes: 32 * 1024 * 1024,
  maximumIdentityMapBytes: 8 * 1024 * 1024,
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
let lastFailedResources = [];
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
  elements.pick.disabled = !ready;
  elements.showAll.disabled = !ready || (
    pointCloud && nextPointLodLevel() === null
  );
  elements.searchInput.disabled = !ready || pointCloud;
  elements.retry.disabled =
    state !== "failed" ||
    (lastFailedBytes === null && vscodeApi === null);
}

function nextPointLodLevel() {
  if (active?.kind !== "point-cloud") {
    return null;
  }
  const levels = active.opened.artifact.hierarchy?.levels ?? [];
  const current = active.mount.lod?.levelIndex ?? levels.length - 1;
  return levels[current + 1] ?? null;
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
  const selection = active.selection;
  const hierarchy = artifact.hierarchy ?? null;
  const chunks = hierarchy?.chunks ?? [];
  const maximumChunkRows = 64;
  clear(elements.tree);
  clear(elements.results);
  clear(elements.inspector);
  elements.treeTitle.textContent = hierarchy === null
    ? "Point source"
    : "Point hierarchy";
  elements.treeCount.textContent = String(
    hierarchy === null ? 1 : chunks.length,
  );
  if (hierarchy === null) {
    elements.treeOmission.textContent =
      "Point identity is scoped to this exact source revision and " +
      "derived range.";
  } else {
    for (const chunk of chunks.slice(0, maximumChunkRows)) {
      const row = document.createElement("button");
      row.type = "button";
      row.disabled = true;
      row.setAttribute("role", "treeitem");
      row.setAttribute("aria-level", "1");
      row.append(
        text("span", chunk.id, "meta"),
        text("span", `${chunk.pointCount} source-order points`, "name"),
      );
      elements.tree.append(row);
    }
    const omitted = Math.max(0, chunks.length - maximumChunkRows);
    elements.treeOmission.textContent =
      `${hierarchy.depth}-deep derived octree · ` +
      `${hierarchy.levels.length} LOD levels · ` +
      `${omitted} chunk rows omitted by the ${maximumChunkRows}-row DOM bound.`;
  }
  elements.searchLabel.textContent =
    "Point metadata search is not available";
  elements.searchOmission.textContent =
    "This bounded profile does not index individual points.";
  elements.moreResults.disabled = true;
  elements.isolateResults.disabled = true;
  elements.inspectorTitle.textContent = "Point cloud profile";
  elements.selectionOrigin.textContent =
    selection === null ? "none" : "3d";
  elements.subtitle.textContent =
    "Open bounded E57, LAS, or LAZ point observations locally.";
  elements.pick.textContent = "Pick visible point";
  elements.showAll.textContent = nextPointLodLevel() === null
    ? "Full point detail"
    : "Refine point detail";
  const summary = document.createElement("dl");
  for (const [label, value] of [
    ["Format", artifact.source.format.toUpperCase()],
    ["Version", artifact.source.formatVersion],
    ["Point format", artifact.source.pointFormat],
    ["Points", artifact.model.points],
    ["Displayed points", mount.metrics.points],
    ["LOD", mount.lod?.levelId ?? "full"],
    ["Spatial chunks", chunks.length || 1],
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
    ...(selection === null
      ? []
      : [
          text("h3", "Selected point"),
          text(
            "p",
            `${selection.identity.nativeId} · ` +
              selection.worldPosition
                .map((value) => value.toPrecision(12))
                .join(", "),
          ),
          text(
            "p",
            "Derived range-order identity; coordinates retain the " +
              "source values but have no qualified CRS authority.",
            "limitation",
          ),
        ]),
    text(
      "p",
      hierarchy === null
        ? "Read-only display and point selection only; surveyed " +
          "coordinate claims are outside this profile."
        : "Read-only derived octree/chunk LOD; source-native point " +
          "semantics and surveyed coordinate claims remain outside " +
          "this profile.",
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
  elements.pick.textContent = "Pick center";
  const reference = active.format !== "ifc";
  elements.showAll.textContent = "Show all";
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

function webGl2GpuIdentity(canvas) {
  const gl = canvas.getContext("webgl2");
  if (gl === null) {
    throw new Error("BIM Explorer WebGL2 identity is unavailable");
  }
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const parameter = (name) => {
    const value = gl.getParameter(name);
    if (typeof value !== "string" || value.length === 0) {
      throw new Error("BIM Explorer GPU identity is invalid");
    }
    return value;
  };
  return Object.freeze({
    schema: "bim-explorer-webgl2-gpu-identity/1",
    webgl2: true,
    debugRendererInfo: debug !== null,
    vendor: parameter(gl.VENDOR),
    renderer: parameter(gl.RENDERER),
    unmaskedVendor: debug === null
      ? null
      : parameter(debug.UNMASKED_VENDOR_WEBGL),
    unmaskedRenderer: debug === null
      ? null
      : parameter(debug.UNMASKED_RENDERER_WEBGL),
    version: parameter(gl.VERSION),
    shadingLanguageVersion: parameter(
      gl.SHADING_LANGUAGE_VERSION,
    ),
    contextAttributes: gl.getContextAttributes(),
  });
}

function publishReport(status, additions = {}) {
  const report = Object.freeze({
    schema: REPORT_SCHEMA,
    status,
    hostKind: runtime.hostKind,
    externalUpload: false,
    telemetry: false,
    ...additions,
    ...(status === "ready"
      ? { gpu: webGl2GpuIdentity(elements.canvas) }
      : {}),
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
  active.viewerCore.publishSelection(
    active.explorer.state.selection,
    { reason: origin },
  );
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
      hierarchyCleanup:
        current.client.state.hierarchyCleanup,
      pointRangeCleared: current.pointRangeCleared,
      reason,
      rendererDisposed,
      workerTerminatedAfterTransfer:
        current.client.state.workerActive === false,
    };
  }
  let explorerDisposed = false;
  let hostReceipt = null;
  let clientDisposed = false;
  try {
    await current.viewerCore.dispose();
    explorerDisposed =
      current.product.disposal?.explorerDisposed === true;
    hostReceipt = current.product.disposal?.hostReceipt ?? null;
  } finally {
    clientDisposed = await current.client.dispose();
  }
  elements.diagLife.textContent = "disposed";
  return {
    clientDisposed,
    explorerDisposed,
    hostReceipt,
    backend: current.backend.state,
    client: current.client.state,
    reason,
    viewerCore: current.viewerCore.state,
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
      "point-hierarchy-creating":
        "Building bounded point hierarchy and LOD chunks…",
      "point-lod-ready":
        "Initial point LOD ready; mounting WebGL2…",
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
    opened = await sourceClient.open(bytesValue, {
      format,
      hierarchy: true,
    });
    if (sequence !== openingSequence) {
      opened.artifact.range.bytes.fill(0);
      opened.artifact.range.pointIndices?.fill(0);
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
      opened.artifact.range.pointIndices?.fill(0);
      await renderer.dispose();
      await sourceClient.dispose();
      if (openingClient === sourceClient) {
        openingClient = null;
      }
      return null;
    }
    opened.artifact.range.bytes.fill(0);
    opened.artifact.range.pointIndices?.fill(0);
    pointRangeCleared = opened.artifact.range.bytes.every(
      (value) => value === 0,
    ) && (
      opened.artifact.range.pointIndices === null ||
      opened.artifact.range.pointIndices === undefined ||
      opened.artifact.range.pointIndices.every((value) => value === 0)
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
      lodTransitions: [],
      hierarchyCleanup: null,
      report: null,
      renderer,
      selection: null,
    };
    if (openingClient === sourceClient) {
      openingClient = null;
    }
    lastFailedBytes?.fill(0);
    lastFailedBytes = null;
    lastFailedFormat = "ifc";
    for (const resource of lastFailedResources) {
      resource.bytes.fill(0);
    }
    lastFailedResources = [];
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
      `${mount.metrics.rangeBytes} displayed range · ` +
      `${artifact.model.points} points`;
    elements.diagGpu.textContent =
      `${mount.backend.uploadedBytes} bytes · ` +
      `${mount.backend.nonBackgroundPixels} pixels`;
    elements.diagLife.textContent =
      (sourceClient.state.hierarchyActive
        ? "LOD Worker retained + GPU active"
        : "source Worker released + GPU active");
    elements.sourceIdentity.textContent =
      artifact.source.fingerprint.slice(0, 23) +
      `… · ${format.toUpperCase()} ` +
      `${artifact.source.formatVersion} · CRS unqualified`;
    setStatus(
      "ready",
      `Ready: local ${format.toUpperCase()} points are open read-only.`,
    );
    controls("ready");
    active.report = publishReport("ready", {
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
        chunks: artifact.hierarchy?.chunks.length ?? 1,
        levels: artifact.hierarchy?.levels.length ?? 1,
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
        hierarchyIndexBytes:
          artifact.resources.hierarchyIndexBytes ?? 0,
        hierarchyRetainedBytes:
          artifact.resources.hierarchyRetainedBytes ?? 0,
        initialPointRangeBytes:
          artifact.resources.initialPointRangeBytes ??
          artifact.resources.pointRangeBytes,
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
        rangeSha256:
          artifact.rootRange?.sha256 ?? artifact.range.sha256,
        renderedRangeSha256: artifact.range.sha256,
        hierarchy: artifact.hierarchy ?? null,
        lod: mount.lod,
      },
      lifecycle: {
        cpuPointRangeCleared: pointRangeCleared,
        sourceBufferCleared:
          opened.cleanup.sourceBufferCleared,
        workerTerminatedAfterTransfer:
          opened.cleanup.workerTerminatedAfterTransfer,
      },
      lodTransitions: [],
      pointSelection: null,
      priorCleanup,
    });
    return active;
  } catch (error) {
    opened?.artifact.range.bytes.fill(0);
    opened?.artifact.range.pointIndices?.fill(0);
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
  resources = [],
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
      resources,
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
    const reference =
      opened.snapshot.source.sourceRole ===
        "derived-or-reference-mesh";
    phase = "viewer-core-open";
    const viewerCore = await openBimProductViewerCore({
      kind: runtime.hostKind,
      opened,
      mountProduct: async ({
        publishSelection,
        session,
        signal,
        snapshot,
        workerLease,
      }) => {
        if (!reference) {
          phase = "surface-open";
          const surface = createBimSurface({
            kind: runtime.hostKind,
            renderer,
            storage: localStorageAdapter(),
            semanticLimits: {
              maximumDomRows: 64,
              maximumLoadedTreeItems: 2_000,
              maximumRelations: 100,
              maximumSearchResults: 500,
              searchPageSize: 25,
              treePageSize: 25,
            },
          });
          const receipt = await surface.open({
            session,
            signal,
            snapshot,
            workerLease,
          });
          publishSelection(surface.explorer.state.selection, {
            reason: "surface-open",
          });
          let disposal = null;
          return {
            explorer: surface.explorer,
            get disposal() {
              return disposal;
            },
            host: surface.host,
            mount: receipt.mount,
            surface,
            async dispose() {
              const surfaceReceipt = await surface.dispose({
                reason: "viewer-core-runtime-dispose",
              });
              disposal = Object.freeze({
                explorerDisposed:
                  surfaceReceipt.explorerDisposed,
                hostReceipt: surfaceReceipt.hostReceipt,
              });
              return disposal;
            },
          };
        }

        const host = createBimRenderer3dHost({
          kind: runtime.hostKind,
          renderer,
        });
        let explorer = null;
        try {
          phase = "renderer-mount";
          const mount = await host.mount({
            session,
            signal,
            snapshot,
            workerLease,
          });
          phase = "semantic-initialize";
          explorer = createReferenceMeshExplorer({
            session,
            snapshot,
            limits: {
              maximumDomRows: 64,
              maximumSearchResults: 500,
              searchPageSize: 25,
            },
          });
          await explorer.initialize();
          const entity = firstRenderable(snapshot);
          if (entity !== null) {
            await revealFirstProduct(
              explorer,
              snapshot,
              entity,
            );
          }
          publishSelection(explorer.state.selection, {
            reason: "surface-open",
          });
          let disposal = null;
          return {
            explorer,
            get disposal() {
              return disposal;
            },
            host,
            mount,
            surface: null,
            async dispose() {
              let explorerDisposed = false;
              let hostReceipt = null;
              try {
                explorerDisposed = await explorer.dispose();
              } finally {
                hostReceipt = await host.dispose({
                  reason: "viewer-core-runtime-dispose",
                });
              }
              disposal = Object.freeze({
                explorerDisposed,
                hostReceipt,
              });
              return disposal;
            },
          };
        } catch (error) {
          await Promise.allSettled([
            explorer?.dispose(),
            host.dispose({ reason: "viewer-core-mount-failed" }),
          ]);
          throw error;
        }
      },
    });
    const product = viewerCore.product;
    const {
      explorer,
      host,
      mount,
      surface,
    } = product;
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
      product,
      surface,
      viewerCore,
    };
    openingClient = null;
    lastFailedBytes?.fill(0);
    lastFailedBytes = null;
    lastFailedFormat = "ifc";
    for (const resource of lastFailedResources) {
      resource.bytes.fill(0);
    }
    lastFailedResources = [];
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
          resourceBundle: {
            ...opened.snapshot.referenceMetadata.resourceBundle,
          },
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
      viewerCore: viewerCore.state,
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
          : phase === "viewer-core-open"
            ? "VIEWER_CORE_OPEN_FAILED"
          : phase === "renderer-mount"
            ? "RENDERER_MOUNT_FAILED"
            : phase === "surface-open"
              ? "BIM_SURFACE_OPEN_FAILED"
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

function localExternalResourceName(file) {
  if (
    typeof file?.name !== "string" ||
    file.name.length > 128 ||
    !EXTERNAL_GLTF_RESOURCE_NAME.test(file.name) ||
    file.name.includes("..")
  ) {
    throw new TypeError(
      "External glTF resources must be same-folder .bin files",
    );
  }
  return file.name;
}

async function readLocalFiles(fileList) {
  const files = [...fileList];
  if (files.length === 0 || files.length > 17) {
    throw new RangeError(
      "Select one source and at most 16 local resources",
    );
  }
  const sourceFiles = files.filter((file) =>
    !file.name.toLocaleLowerCase().endsWith(".bin"));
  if (sourceFiles.length !== 1) {
    throw new TypeError("Select exactly one BIM source file");
  }
  const file = sourceFiles[0];
  const resourceFiles = files.filter((item) => item !== file);
  const format = localFileFormat(file);
  if (resourceFiles.length > 0 && format !== "gltf") {
    throw new TypeError(
      "External .bin resources are only valid with glTF JSON",
    );
  }
  const maximumBytes = POINT_SOURCE_FORMATS.has(format)
    ? pointSourceMaximumBytes(format)
    : MAXIMUM_SOURCE_BYTES;
  const resourceNames = new Set();
  let aggregateBytes = file.size;
  for (const resource of resourceFiles) {
    const name = localExternalResourceName(resource);
    if (resourceNames.has(name)) {
      throw new TypeError("External glTF resource name is duplicated");
    }
    resourceNames.add(name);
    if (resource.size <= 0 || resource.size > maximumBytes) {
      throw new RangeError(
        "External glTF resource exceeds its local admission limit",
      );
    }
    aggregateBytes += resource.size;
  }
  if (
    file.size <= 0 ||
    file.size > maximumBytes ||
    aggregateBytes > maximumBytes
  ) {
    throw new RangeError(
      "Selected source exceeds its local admission limit",
    );
  }
  const [buffer, ...resourceBuffers] = await Promise.all([
    file.arrayBuffer(),
    ...resourceFiles.map((resource) => resource.arrayBuffer()),
  ]);
  const bytes = new Uint8Array(buffer);
  const resourceBytes = resourceBuffers.map((value) =>
    new Uint8Array(value));
  if (
    buffer.byteLength !== file.size ||
    buffer.byteLength > maximumBytes ||
    resourceBuffers.some((resourceBuffer, index) =>
      resourceBuffer.byteLength !== resourceFiles[index].size) ||
    buffer.byteLength + resourceBuffers.reduce(
      (total, resourceBuffer) =>
        total + resourceBuffer.byteLength,
      0,
    ) > maximumBytes
  ) {
    bytes.fill(0);
    for (const value of resourceBytes) {
      value.fill(0);
    }
    throw new RangeError(
      "Selected source changed during local admission",
    );
  }
  return {
    bytes,
    format,
    resources: resourceFiles.map((resource, index) => ({
      uri: resource.name,
      bytes: resourceBytes[index],
    })),
  };
}

elements.file.addEventListener("change", async () => {
  const files = elements.file.files === null
    ? []
    : [...elements.file.files];
  elements.file.value = "";
  if (files.length === 0) {
    return;
  }
  lastFailedBytes?.fill(0);
  lastFailedBytes = null;
  lastFailedFormat = "ifc";
  for (const resource of lastFailedResources) {
    resource.bytes.fill(0);
  }
  lastFailedResources = [];
  let admitted = null;
  try {
    admitted = await readLocalFiles(files);
    lastFailedBytes = Uint8Array.from(admitted.bytes);
    lastFailedFormat = admitted.format;
    lastFailedResources = admitted.resources.map((resource) => ({
      uri: resource.uri,
      bytes: Uint8Array.from(resource.bytes),
    }));
    await openBytes(admitted.bytes, {
      format: admitted.format,
      origin: "local-file",
      resources: admitted.resources,
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
    for (const resource of admitted?.resources ?? []) {
      resource.bytes.fill(0);
    }
  }
});

elements.fixture.addEventListener("click", async () => {
  lastFailedBytes?.fill(0);
  lastFailedBytes = null;
  lastFailedFormat = "ifc";
  for (const resource of lastFailedResources) {
    resource.bytes.fill(0);
  }
  lastFailedResources = [];
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
        resources: lastFailedResources,
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
    viewerCore: cleanup?.viewerCore ?? null,
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

async function refinePointLod() {
  if (active?.kind !== "point-cloud" || active.refining === true) {
    return null;
  }
  const next = nextPointLodLevel();
  if (next === null) {
    return null;
  }
  const current = active;
  current.refining = true;
  controls("opening");
  setStatus(
    "opening",
    `Loading ${next.id} point detail from the retained local hierarchy…`,
  );
  let detail = null;
  try {
    detail = await current.client.readLod(next.id);
    const release = await current.renderer.unmount();
    const mount = await current.renderer.mount({
      range: detail.range,
      source: current.opened.artifact.source,
    });
    detail.range.bytes.fill(0);
    detail.range.pointIndices?.fill(0);
    current.pointRangeCleared = current.pointRangeCleared &&
      detail.range.bytes.every((value) => value === 0) &&
      (
        detail.range.pointIndices === null ||
        detail.range.pointIndices.every((value) => value === 0)
      );
    const transition = Object.freeze({
      fromLevelId: current.mount.lod?.levelId ?? "full",
      hierarchyId: mount.lod.hierarchyId,
      identityMapBytes: mount.metrics.identityMapBytes,
      points: mount.metrics.points,
      rangeBytes: mount.metrics.rangeBytes,
      releasedBytes: release.releasedBytes,
      releasedIdentityMapBytes:
        release.releasedIdentityMapBytes,
      toLevelId: mount.lod.levelId,
      uploadedBytes: mount.backend.uploadedBytes,
    });
    current.lodTransitions.push(transition);
    current.mount = mount;
    current.selection = null;
    if (mount.lod.fullDetail) {
      current.hierarchyCleanup =
        await current.client.releaseHierarchy();
    }
    elements.diagGpu.textContent =
      `${mount.backend.uploadedBytes} bytes · ` +
      `${mount.backend.nonBackgroundPixels} pixels`;
    elements.diagLife.textContent = mount.lod.fullDetail
      ? "LOD hierarchy released + full-detail GPU active"
      : "LOD Worker retained + GPU active";
    current.report = publishReport("ready", {
      ...current.report,
      renderer: {
        actualGpu: mount.backend.actualGpu,
        nonBackgroundPixels: mount.backend.nonBackgroundPixels,
        sourceReadBytes: mount.metrics.rangeBytes,
        uploadedBytes: mount.backend.uploadedBytes,
      },
      pointCloud: {
        ...current.report.pointCloud,
        bounds: mount.geometry.bounds,
        colorRange: mount.geometry.colorRange,
        lod: mount.lod,
        origin: mount.geometry.origin,
        renderedRangeSha256: mount.range.sha256,
      },
      lifecycle: {
        ...current.report.lifecycle,
        cpuPointRangeCleared: current.pointRangeCleared,
        hierarchyCleanup: current.hierarchyCleanup,
        workerTerminatedAfterTransfer:
          current.client.state.workerActive === false,
      },
      lodTransitions: [...current.lodTransitions],
      pointSelection: null,
    });
    render();
    setStatus(
      "ready",
      mount.lod.fullDetail
        ? "Ready: full point detail is active read-only."
        : `Ready: ${mount.lod.levelId} point detail is active read-only.`,
    );
    return transition;
  } catch (error) {
    detail?.range.bytes.fill(0);
    detail?.range.pointIndices?.fill(0);
    setStatus("failed", "Point LOD refinement failed closed.");
    publishReport("failed", {
      diagnostic: {
        code: "POINT_LOD_REFINE_FAILED",
        operation: "point-lod-refine",
        retryable: true,
      },
    });
    throw error;
  } finally {
    current.refining = false;
    controls(elements.status.dataset.state);
  }
}

elements.showAll.addEventListener("click", async () => {
  if (active === null) {
    return;
  }
  if (active.kind === "point-cloud") {
    await refinePointLod();
    return;
  }
  const command = await active.explorer.setVisibility("show-all");
  await active.host.renderView({
    camera: active.camera,
    ...command,
  });
});

async function pickVisible() {
  if (active.kind === "point-cloud") {
    const coordinates =
      active.mount.backend.suggestedPickCoordinates;
    if (coordinates === null) {
      throw new Error("no visible point was available for picking");
    }
    const receipt = await active.renderer.pick(coordinates);
    if (receipt.status !== "hit") {
      throw new Error("the visible point pick did not resolve");
    }
    return receipt;
  }
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

async function selectVisible() {
  if (active === null) {
    return null;
  }
  const pick = await pickVisible();
  if (active.kind === "point-cloud") {
    active.selection = pick;
    render();
    setStatus(
      "ready",
      `Selected ${pick.identity.nativeId} in the active source revision.`,
    );
    active.report = publishReport("ready", {
      ...active.report,
      pointSelection: pick,
    });
    return pick;
  }
  await active.explorer.selectPick(pick);
  active.viewerCore.publishSelection(
    active.explorer.state.selection,
    { reason: "3d" },
  );
  await applySelectionView();
  render();
  return pick;
}

elements.pick.addEventListener("click", async () => {
  await selectVisible();
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
    const resources = [];
    if (message.resources !== undefined) {
      if (!Array.isArray(message.resources)) {
        bytes.fill(0);
        setStatus("failed", "Open failed: HOST_RESOURCES_INVALID");
        controls("failed");
        return;
      }
      for (const resource of message.resources) {
        let resourceBytes;
        if (resource?.bytes instanceof ArrayBuffer) {
          resourceBytes = new Uint8Array(resource.bytes);
        } else if (ArrayBuffer.isView(resource?.bytes)) {
          resourceBytes = new Uint8Array(
            resource.bytes.buffer,
            resource.bytes.byteOffset,
            resource.bytes.byteLength,
          );
        } else if (Array.isArray(resource?.bytes)) {
          resourceBytes = Uint8Array.from(resource.bytes);
        } else {
          bytes.fill(0);
          for (const admitted of resources) {
            admitted.bytes.fill(0);
          }
          setStatus("failed", "Open failed: HOST_RESOURCES_INVALID");
          controls("failed");
          return;
        }
        resources.push({
          uri: resource.uri,
          bytes: resourceBytes,
        });
      }
    }
    try {
      await openBytes(bytes, {
        format: message.format ?? "ifc",
        limits: message.limits ?? {},
        origin: "vscode-custom-editor",
        profile: message.profile ?? runtime.profile,
        resources,
      });
    } catch {
      // openBytes already published a stable path-free diagnostic.
    } finally {
      bytes.fill(0);
      for (const resource of resources) {
        resource.bytes.fill(0);
      }
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
  } else if (message.type === "pick-visible-point") {
    await selectVisible();
  } else if (message.type === "refine-point-lod") {
    await refinePointLod();
  } else if (message.type === "dispose") {
    const cleanup = await disposeActive("editor-close");
    publishReport("disposed", {
      cleanup,
      viewerCore: cleanup?.viewerCore ?? null,
    });
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
