import {
  createBimSurface,
} from "../../packages/bim-surface/runtime/index.mjs";
import {
  attachCameraControls3d,
  createBimRenderer3dHost,
  createBounded3dRenderer,
  createFitCamera3d,
  createWebGl2Backend,
  validateCamera3d,
} from "../../packages/bim-renderer-3d/src/index.mjs";
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
  /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:bin|jpe?g|png)$/u;
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
  activeTool: document.querySelector("#active-tool"),
  cancel: document.querySelector("#cancel-open"),
  canvas: document.querySelector("#model-canvas"),
  cameraHelp: document.querySelector("#camera-help"),
  clearMeasurement: document.querySelector("#clear-measurement"),
  clearSection: document.querySelector("#clear-section"),
  clearSelection: document.querySelector("#clear-selection"),
  clipX: document.querySelector("#clip-x"),
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
  fitAll: document.querySelector("#fit-all"),
  fitSelection: document.querySelector("#fit-selection"),
  hideSelection: document.querySelector("#hide-selection"),
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
  isolateSelection: document.querySelector("#isolate-selection"),
  measureAngle: document.querySelector("#measure-angle"),
  measureArea: document.querySelector("#measure-area"),
  measureDistance: document.querySelector("#measure-distance"),
  measurementResult: document.querySelector("#measurement-result"),
  projectionState: document.querySelector("#projection-state"),
  resetView: document.querySelector("#reset-view"),
  reviewToolbar: document.querySelector("#review-toolbar"),
  sectionBox: document.querySelector("#section-box"),
  standardViews: [
    ...document.querySelectorAll("[data-standard-view]"),
  ],
  toggleFocusMode: document.querySelector("#toggle-focus-mode"),
  toggleProjection: document.querySelector("#toggle-projection"),
  togglePropertiesPanel: document.querySelector(
    "#toggle-properties-panel",
  ),
  toggleTreePanel: document.querySelector("#toggle-tree-panel"),
  workspace: document.querySelector(".workspace"),
};

const layoutState = {
  focusMode: false,
  propertiesVisible: true,
  treeVisible: true,
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

function effectiveSelection(current = active) {
  if (
    current === null ||
    current.kind === "point-cloud" ||
    current.selectionSuppressed === true
  ) {
    return null;
  }
  return current.explorer.state.selection;
}

function displayedExplorerState(current) {
  const state = current.explorer.state;
  if (current.selectionSuppressed !== true) {
    return state;
  }
  return {
    ...state,
    inspector: null,
    selection: null,
    tree: {
      ...state.tree,
      rows: state.tree.rows.map((row) =>
        row.selected
          ? {
              ...row,
              selected: false,
            }
          : row),
    },
  };
}

function renderLayout() {
  elements.workspace.dataset.focusMode = String(
    layoutState.focusMode,
  );
  elements.workspace.dataset.propertiesVisible = String(
    layoutState.propertiesVisible,
  );
  elements.workspace.dataset.treeVisible = String(
    layoutState.treeVisible,
  );
  elements.toggleFocusMode.setAttribute(
    "aria-pressed",
    String(layoutState.focusMode),
  );
  elements.togglePropertiesPanel.setAttribute(
    "aria-pressed",
    String(
      layoutState.propertiesVisible && !layoutState.focusMode,
    ),
  );
  elements.toggleTreePanel.setAttribute(
    "aria-pressed",
    String(layoutState.treeVisible && !layoutState.focusMode),
  );
  elements.togglePropertiesPanel.disabled = layoutState.focusMode;
  elements.toggleTreePanel.disabled = layoutState.focusMode;
}

function measurementText(review) {
  const measurement = review?.measurement?.measurement;
  if (measurement === undefined) {
    return "No measurement";
  }
  if (measurement.type === "angle") {
    return `Angle ${measurement.degrees.toFixed(2)}°`;
  }
  const value = measurement.value.toPrecision(6);
  return measurement.type === "area"
    ? `Area ${value} source-coordinate units² (unqualified)`
    : `Distance ${value} source-coordinate units (unqualified)`;
}

function reviewSectionMode(current) {
  if (current === null || current.kind === "point-cloud") {
    return "none";
  }
  if (current.view.sectionBox !== null) {
    return "section-box";
  }
  return current.view.clippingPlanes.length > 0
    ? "clip-x"
    : "none";
}

function renderReviewControls(state) {
  const ready = state === "ready";
  const pointCloud = active?.kind === "point-cloud";
  const meshReady = ready && active !== null && !pointCloud;
  const selection = effectiveSelection();
  const hasSelection =
    typeof selection?.renderId === "string";
  const review = meshReady ? active.review : null;
  const sectionMode = meshReady
    ? reviewSectionMode(active)
    : "none";
  elements.fitAll.disabled = !meshReady;
  elements.fitSelection.disabled = !meshReady || !hasSelection;
  elements.resetView.disabled = !meshReady;
  elements.toggleProjection.disabled = !meshReady;
  elements.hideSelection.disabled = !meshReady || !hasSelection;
  elements.isolateSelection.disabled = !meshReady || !hasSelection;
  elements.clearSelection.disabled = !meshReady || !hasSelection;
  elements.clipX.disabled = !meshReady;
  elements.sectionBox.disabled = !meshReady;
  elements.clearSection.disabled =
    !meshReady || sectionMode === "none";
  elements.measureDistance.disabled = !meshReady;
  elements.measureAngle.disabled = !meshReady;
  elements.measureArea.disabled = !meshReady;
  elements.clearMeasurement.disabled = !meshReady || (
    review.measurement === null &&
    review.measurementPicks.length === 0 &&
    review.tool === "select"
  );
  for (const button of elements.standardViews) {
    button.disabled = !meshReady;
    button.setAttribute(
      "aria-pressed",
      String(
        meshReady &&
        button.dataset.standardView === review.standardView
      ),
    );
  }
  elements.clipX.setAttribute(
    "aria-pressed",
    String(sectionMode === "clip-x"),
  );
  elements.sectionBox.setAttribute(
    "aria-pressed",
    String(sectionMode === "section-box"),
  );
  for (const [button, tool] of [
    [elements.measureDistance, "measure-distance"],
    [elements.measureAngle, "measure-angle"],
    [elements.measureArea, "measure-area"],
  ]) {
    button.setAttribute(
      "aria-pressed",
      String(review?.tool === tool),
    );
  }
  const projection = meshReady
    ? active.camera.projection
    : pointCloud
      ? "points"
      : "inactive";
  elements.projectionState.textContent = projection;
  elements.toggleProjection.textContent =
    `Projection: ${projection}`;
  elements.toggleProjection.setAttribute(
    "aria-pressed",
    String(projection === "orthographic"),
  );
  if (review === null) {
    elements.activeTool.textContent = pointCloud
      ? "Tool: Point select"
      : "Tool: Select";
    elements.measurementResult.textContent = "No measurement";
    delete elements.canvas.dataset.reviewTool;
  } else {
    const expected = review.tool === "measure-distance" ? 2 : 3;
    elements.activeTool.textContent = review.tool === "select"
      ? "Tool: Select"
      : `Tool: ${review.tool.slice("measure-".length)} · ` +
        `${review.measurementPicks.length}/${expected} points`;
    elements.measurementResult.textContent =
      measurementText(review);
    elements.canvas.dataset.reviewTool = review.tool;
    elements.cameraHelp.textContent = review.tool === "select"
      ? "Click select · drag orbit · Shift/right/middle drag pan · " +
        "wheel or +/- zoom · arrows orbit · Shift+arrows pan · " +
        "F/Shift+F fit · 1–6 views · P projection · D/G/A measure"
      : "Click visible model points to measure · Escape cancels the " +
        "active measurement tool · source-coordinate units are not " +
        "interpreted as an engineering unit.";
  }
  renderLayout();
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
  renderReviewControls(state);
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

function selectedTreeRow(state) {
  const selection = state.selection;
  if (selection === null || active === null) {
    return null;
  }
  const nodes = active.opened.snapshot.tree?.nodes ?? [];
  const node = nodes.find((item) =>
    item.expressId === selection.expressId);
  if (node !== undefined) {
    let depth = 0;
    let parentExpressId = node.parentExpressId;
    while (parentExpressId !== null) {
      const parent = nodes.find((item) =>
        item.expressId === parentExpressId);
      if (parent === undefined) {
        break;
      }
      depth += 1;
      parentExpressId = parent.parentExpressId;
    }
    return {
      ...structuredClone(node),
      depth,
      expanded: state.tree.expandedExpressIds.includes(
        node.expressId,
      ),
      pinnedSelection: true,
      selected: true,
    };
  }
  const entity = active.opened.snapshot.entities.find((item) =>
    item.expressId === selection.expressId);
  return entity === undefined
    ? null
    : {
        ...structuredClone(entity),
        childCount: 0,
        depth: 0,
        expanded: false,
        parentRelation: "selected reference",
        pinnedSelection: true,
        selected: true,
      };
}

function boundedTreeRows(state) {
  if (
    state.selection === null ||
    state.tree.rows.some((row) => row.selected)
  ) {
    return {
      pinned: false,
      rows: state.tree.rows,
    };
  }
  const selected = selectedTreeRow(state);
  if (selected === null) {
    return {
      pinned: false,
      rows: state.tree.rows,
    };
  }
  return {
    pinned: true,
    rows: [
      ...state.tree.rows.slice(
        0,
        Math.max(0, state.tree.maximumDomRows - 1),
      ),
      selected,
    ],
  };
}

function renderTree(state) {
  clear(elements.tree);
  const bounded = boundedTreeRows(state);
  elements.treeCount.textContent =
    `${bounded.rows.length}/${state.tree.visibleLoadedRows}`;
  elements.treeOmission.textContent =
    state.tree.omittedDomRows > 0
      ? `${state.tree.omittedDomRows} rows omitted by the ` +
        `${state.tree.maximumDomRows}-row DOM bound.` +
        (bounded.pinned
          ? " The selected item is pinned in the final row."
          : "")
      : "";
  for (const row of bounded.rows) {
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
        `${row.ifcClass} · ${row.parentRelation}` +
          (row.pinnedSelection ? " · selected pin" : ""),
        "meta",
      ),
      text("span", row.name, "name"),
    );
    button.addEventListener("click", async () => {
      await selectExpressId(row.expressId, "tree");
    });
    elements.tree.append(button);
  }
  if (bounded.pinned) {
    elements.tree.scrollTop = elements.tree.scrollHeight;
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
          const current = active;
          if (current === null || current.kind === "point-cloud") {
            return;
          }
          await current.explorer.selectRelation({
            kind: item.kind,
            targetExpressId: item.target.expressId,
          });
          if (active !== current) {
            return;
          }
          current.selectionSuppressed = false;
          await revealExplorerItem(
            current.explorer,
            current.opened.snapshot,
            item.target.expressId,
          );
          if (active !== current) {
            return;
          }
          current.viewerCore.publishSelection(
            current.explorer.state.selection,
            { reason: "relation" },
          );
          await applySelectionView(current);
          if (active !== current) {
            return;
          }
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
  elements.cameraHelp.textContent =
    "Point navigation controls are not available in this bounded profile.";
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
    renderReviewControls(elements.status.dataset.state);
    return;
  }
  const state = displayedExplorerState(active);
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
  renderReviewControls(elements.status.dataset.state);
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

function initialRendererView(explorer) {
  const pickId = explorer.state.selection?.pickId;
  return {
    clippingPlanes: [],
    hiddenRenderIds: [],
    isolateRenderIds: null,
    sectionBox: null,
    selectedPickIds:
      typeof pickId === "string" ? [pickId] : [],
  };
}

function nextRendererView(current, command = {}) {
  const next = {
    ...current.view,
  };
  for (const key of [
    "clippingPlanes",
    "hiddenRenderIds",
    "isolateRenderIds",
    "sectionBox",
    "selectedPickIds",
  ]) {
    if (Object.hasOwn(command, key)) {
      next[key] = command[key];
    }
  }
  if (
    Object.hasOwn(command, "isolateRenderIds") &&
    command.isolateRenderIds !== null
  ) {
    next.hiddenRenderIds = [];
  }
  if (
    Object.hasOwn(command, "hiddenRenderIds") &&
    command.hiddenRenderIds.length > 0
  ) {
    next.isolateRenderIds = null;
  }
  return next;
}

function rendererViewFromReceipt(receipt) {
  return {
    clippingPlanes: [...receipt.clipping.planes],
    hiddenRenderIds:
      receipt.visibility.mode === "isolate"
        ? []
        : [...receipt.visibility.hiddenRenderIds],
    isolateRenderIds:
      receipt.visibility.mode === "isolate"
        ? [...receipt.visibility.isolatedRenderIds]
        : null,
    sectionBox: receipt.clipping.sectionBox,
    selectedPickIds: [
      ...receipt.selection.selectedPickIds,
    ],
  };
}

async function renderMeshView(current, {
  camera = current.camera,
  command = {},
} = {}) {
  const view = nextRendererView(current, command);
  const receipt = await current.host.renderView({
    camera,
    ...view,
  });
  current.camera = receipt.camera;
  current.view = rendererViewFromReceipt(receipt);
  updateLiveCameraReport(current);
  return receipt;
}

function cameraInteractionReport(current) {
  const state = current.cameraControls?.state ?? null;
  return Object.freeze({
    schema: "bim-explorer-product-camera-interaction/1",
    enabled: state !== null,
    disposed: state?.disposed ?? true,
    keyboardUpdates: state?.keyboardUpdates ?? 0,
    orbitUpdates: state?.orbitUpdates ?? 0,
    panUpdates: state?.panUpdates ?? 0,
    programmaticUpdates: state?.programmaticUpdates ?? 0,
    resetUpdates: state?.resetUpdates ?? 0,
    zoomUpdates: state?.zoomUpdates ?? 0,
    renderedUpdates: current.cameraRenderedUpdates ?? 0,
    selectionFitUpdates: current.selectionFitUpdates ?? 0,
    selectedPickIds: [...current.view.selectedPickIds],
    visibilityMode:
      current.view.isolateRenderIds === null
        ? current.view.hiddenRenderIds.length === 0
          ? "show-all"
          : "hide"
        : "isolate",
    camera: current.camera,
  });
}

function reviewToolsReport(current) {
  return Object.freeze({
    schema: "bim-explorer-product-review-tools/1",
    fitAllUpdates: current.review.fitAllUpdates,
    hiddenRenderIds: [...current.view.hiddenRenderIds],
    layout: Object.freeze({ ...layoutState }),
    measurement:
      current.review.measurement?.measurement ?? null,
    measurementPicks: current.review.measurementPicks.length,
    projection: current.camera.projection,
    projectionUpdates: current.review.projectionUpdates,
    resetViewUpdates: current.review.resetViewUpdates,
    sectionMode: reviewSectionMode(current),
    selectionSuppressed: current.selectionSuppressed,
    standardView: current.review.standardView,
    standardViewUpdates: current.review.standardViewUpdates,
    tool: current.review.tool,
    visibilityMode:
      current.view.isolateRenderIds === null
        ? current.view.hiddenRenderIds.length === 0
          ? "show-all"
          : "hide"
        : "isolate",
  });
}

function updateLiveCameraReport(current) {
  const report = globalThis.__bimExplorerProductReport;
  if (
    active !== current ||
    report?.status !== "ready"
  ) {
    return;
  }
  globalThis.__bimExplorerProductReport = Object.freeze({
    ...report,
    cameraInteraction: cameraInteractionReport(current),
    meshPicking: Object.freeze({
      attempts: current.meshPickAttempts,
      lastStatus: current.lastMeshPickStatus,
      misses: current.meshPickMisses,
    }),
    meshSelection: current.lastMeshPick,
    reviewTools: reviewToolsReport(current),
  });
}

function canvasPickCoordinates({ clientX, clientY } = {}) {
  const bounds = elements.canvas.getBoundingClientRect();
  if (
    typeof clientX !== "number" ||
    !Number.isFinite(clientX) ||
    typeof clientY !== "number" ||
    !Number.isFinite(clientY) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    clientX < bounds.left ||
    clientX > bounds.right ||
    clientY < bounds.top ||
    clientY > bounds.bottom
  ) {
    return null;
  }
  return Object.freeze({
    x: Math.min(
      elements.canvas.width - 1,
      Math.max(
        0,
        Math.floor(
          (clientX - bounds.left) /
            bounds.width * elements.canvas.width,
        ),
      ),
    ),
    y: Math.min(
      elements.canvas.height - 1,
      Math.max(
        0,
        Math.floor(
          (clientY - bounds.top) /
            bounds.height * elements.canvas.height,
        ),
      ),
    ),
  });
}

async function selectionViewCommand(current) {
  const selection = effectiveSelection(current);
  if (selection === null) {
    return { selectedPickIds: [] };
  }
  if (typeof selection.pickId !== "string") {
    return { selectedPickIds: [] };
  }
  const hidden = current.view.hiddenRenderIds.includes(
    selection.renderId,
  );
  const outsideIsolation =
    current.view.isolateRenderIds !== null &&
    !current.view.isolateRenderIds.includes(selection.renderId);
  if (hidden || outsideIsolation) {
    const visibility = await current.explorer.setVisibility("show-all");
    return {
      ...visibility,
      hiddenRenderIds: [],
    };
  }
  return {
    selectedPickIds: [selection.pickId],
  };
}

async function selectCanvasPointer(current, pointer) {
  if (active !== current) {
    return null;
  }
  const coordinates = canvasPickCoordinates(pointer);
  if (coordinates === null) {
    return null;
  }
  current.meshPickAttempts += 1;
  const pick = await current.host.pick(coordinates);
  if (active !== current) {
    return null;
  }
  if (pick.status !== "hit") {
    current.lastMeshPickStatus = "miss";
    current.meshPickMisses += 1;
    updateLiveCameraReport(current);
    setStatus(
      "ready",
      "No visible object at that point; selection is unchanged.",
    );
    return pick;
  }
  await current.explorer.selectPick(pick);
  if (active !== current) {
    return null;
  }
  current.selectionSuppressed = false;
  await revealExplorerItem(
    current.explorer,
    current.opened.snapshot,
    current.explorer.state.selection.expressId,
  );
  if (active !== current) {
    return null;
  }
  current.lastMeshPick = pick;
  current.lastMeshPickStatus = "hit";
  const command = await selectionViewCommand(current);
  if (active !== current) {
    return null;
  }
  await renderMeshView(current, { command });
  if (active !== current) {
    return null;
  }
  current.viewerCore.publishSelection(
    current.explorer.state.selection,
    { reason: "3d" },
  );
  render();
  setStatus(
    "ready",
    "Selected the clicked object in the active source revision.",
  );
  return pick;
}

function attachActiveCameraControls(current) {
  const bounds = elements.canvas.getBoundingClientRect();
  elements.canvas.dataset.cameraControls = "active";
  current.cameraControls = attachCameraControls3d({
    camera: current.camera,
    element: elements.canvas,
    height: Math.max(
      1,
      Math.round(bounds.height || elements.canvas.height),
    ),
    width: Math.max(
      1,
      Math.round(bounds.width || elements.canvas.width),
    ),
    async onCamera(camera, interaction) {
      if (active !== current) {
        return;
      }
      try {
        await renderMeshView(current, { camera });
        current.cameraRenderedUpdates += 1;
        if (![
          "fit-selection",
          "review-fit-all",
          "review-projection",
          "review-reset",
          "review-standard-view",
        ].includes(interaction.kind)) {
          current.review.standardView = null;
        }
        updateLiveCameraReport(current);
        renderReviewControls(elements.status.dataset.state);
      } catch (error) {
        current.cameraInteractionError = error;
        updateLiveCameraReport(current);
        if (
          interaction.kind === "fit-selection" ||
          interaction.kind.startsWith("review-")
        ) {
          throw error;
        }
      }
    },
    async onPrimaryClick(pointer) {
      try {
        if (current.review.tool.startsWith("measure-")) {
          await captureMeasurementPointer(current, pointer);
        } else {
          await selectCanvasPointer(current, pointer);
        }
      } catch (error) {
        current.cameraInteractionError = error;
        updateLiveCameraReport(current);
        if (active === current) {
          setStatus(
            "ready",
            "Object selection failed closed; the model remains open.",
          );
        }
      }
    },
  });
  return current.cameraControls;
}

async function settleCameraControls(current) {
  await current.cameraControls?.whenIdle();
}

function selectedRenderableEntity(current) {
  const selection = effectiveSelection(current);
  if (typeof selection?.renderId !== "string") {
    return null;
  }
  return current.opened.snapshot.entities.find((entity) =>
    entity.expressId === selection.expressId &&
    entity.renderId === selection.renderId) ?? null;
}

function selectedFitCamera(current, entity) {
  const bounds = elements.canvas.getBoundingClientRect();
  const width = bounds.width || elements.canvas.width;
  const height = bounds.height || elements.canvas.height;
  const fitted = createFitCamera3d(entity.bounds, {
    aspect: width / height,
    projection: current.camera.projection,
  });
  return validateCamera3d({
    ...fitted,
    pitch: current.camera.pitch,
    yaw: current.camera.yaw,
  });
}

function modelFitCamera(current, {
  pitch = current.camera.pitch,
  projection = current.camera.projection,
  yaw = current.camera.yaw,
} = {}) {
  const bounds = elements.canvas.getBoundingClientRect();
  const width = bounds.width || elements.canvas.width;
  const height = bounds.height || elements.canvas.height;
  const fitted = createFitCamera3d(
    current.opened.snapshot.geometry.bounds,
    {
      aspect: width / height,
      projection,
    },
  );
  return validateCamera3d({
    ...fitted,
    pitch,
    yaw,
  });
}

function focusCanvas() {
  try {
    elements.canvas.focus({ preventScroll: true });
  } catch {
    elements.canvas.focus();
  }
}

async function setReviewCamera(
  current,
  camera,
  {
    kind,
    status,
  },
) {
  await settleCameraControls(current);
  if (active !== current || current.cameraControls === null) {
    return null;
  }
  current.cameraInteractionError = null;
  await current.cameraControls.setCamera(camera, { kind });
  if (active !== current) {
    return null;
  }
  if (current.cameraInteractionError !== null) {
    throw current.cameraInteractionError;
  }
  updateLiveCameraReport(current);
  render();
  focusCanvas();
  setStatus("ready", status);
  return current.camera;
}

async function fitWholeModel() {
  const current = active;
  if (current === null || current.kind === "point-cloud") {
    return null;
  }
  const camera = modelFitCamera(current);
  const updated = await setReviewCamera(current, camera, {
    kind: "review-fit-all",
    status: "Fitted the full model bounds in the 3D view.",
  });
  if (updated !== null) {
    current.review.fitAllUpdates += 1;
    current.review.standardView = null;
    updateLiveCameraReport(current);
  }
  return updated;
}

async function resetReviewView() {
  const current = active;
  if (current === null || current.kind === "point-cloud") {
    return null;
  }
  const updated = await setReviewCamera(
    current,
    current.initialCamera,
    {
      kind: "review-reset",
      status: "Reset the 3D camera to the source-open view.",
    },
  );
  if (updated !== null) {
    current.review.resetViewUpdates += 1;
    current.review.standardView = null;
    updateLiveCameraReport(current);
  }
  return updated;
}

const STANDARD_VIEWS = Object.freeze({
  back: Object.freeze({ pitch: 0, yaw: Math.PI }),
  bottom: Object.freeze({
    pitch: -(Math.PI / 2 - 0.01),
    yaw: 0,
  }),
  front: Object.freeze({ pitch: 0, yaw: 0 }),
  left: Object.freeze({ pitch: 0, yaw: -Math.PI / 2 }),
  right: Object.freeze({ pitch: 0, yaw: Math.PI / 2 }),
  top: Object.freeze({
    pitch: Math.PI / 2 - 0.01,
    yaw: 0,
  }),
});

async function setStandardView(name) {
  const current = active;
  const orientation = STANDARD_VIEWS[name];
  if (
    current === null ||
    current.kind === "point-cloud" ||
    orientation === undefined
  ) {
    return null;
  }
  const camera = modelFitCamera(current, orientation);
  const updated = await setReviewCamera(current, camera, {
    kind: "review-standard-view",
    status: `Applied the ${name} standard view and fitted the model.`,
  });
  if (updated !== null) {
    current.review.standardView = name;
    current.review.standardViewUpdates += 1;
    updateLiveCameraReport(current);
    renderReviewControls("ready");
  }
  return updated;
}

async function toggleProjection() {
  const current = active;
  if (current === null || current.kind === "point-cloud") {
    return null;
  }
  const projection = current.camera.projection === "perspective"
    ? "orthographic"
    : "perspective";
  const camera = validateCamera3d({
    ...current.camera,
    projection,
  });
  const updated = await setReviewCamera(current, camera, {
    kind: "review-projection",
    status: `Switched the 3D camera to ${projection} projection.`,
  });
  if (updated !== null) {
    current.review.projectionUpdates += 1;
    updateLiveCameraReport(current);
    renderReviewControls("ready");
  }
  return updated;
}

async function applyReviewViewCommand(current, command, status) {
  await settleCameraControls(current);
  if (active !== current) {
    return null;
  }
  const receipt = await renderMeshView(current, { command });
  if (active !== current) {
    return null;
  }
  updateLiveCameraReport(current);
  render();
  setStatus("ready", status);
  return receipt;
}

async function clearProductSelection({ status = true } = {}) {
  const current = active;
  if (current === null || current.kind === "point-cloud") {
    return null;
  }
  current.selectionSuppressed = true;
  current.lastMeshPick = null;
  current.viewerCore.publishSelection(null, {
    reason: "clear-selection",
  });
  return applyReviewViewCommand(
    current,
    { selectedPickIds: [] },
    status
      ? "Cleared the product selection and 3D highlight."
      : elements.status.textContent,
  );
}

async function hideSelectedObject() {
  const current = active;
  const selection = effectiveSelection(current);
  if (
    current === null ||
    current.kind === "point-cloud" ||
    typeof selection?.renderId !== "string"
  ) {
    return null;
  }
  const hiddenRenderIds = [
    ...new Set([
      ...current.view.hiddenRenderIds,
      selection.renderId,
    ]),
  ];
  current.selectionSuppressed = true;
  current.lastMeshPick = null;
  current.viewerCore.publishSelection(null, {
    reason: "hide-selection",
  });
  return applyReviewViewCommand(
    current,
    {
      hiddenRenderIds,
      selectedPickIds: [],
    },
    "Hid the selected object and cleared its product selection.",
  );
}

async function isolateSelectedObject() {
  const current = active;
  if (
    current === null ||
    current.kind === "point-cloud" ||
    effectiveSelection(current) === null
  ) {
    return null;
  }
  const command = await current.explorer.setVisibility(
    "isolate-selection",
  );
  return applyReviewViewCommand(
    current,
    command,
    "Isolated the selected object in the 3D view.",
  );
}

async function showAllObjects() {
  const current = active;
  if (current === null || current.kind === "point-cloud") {
    return null;
  }
  const visibility = await current.explorer.setVisibility("show-all");
  const command = {
    ...visibility,
    hiddenRenderIds: [],
    ...(current.selectionSuppressed
      ? { selectedPickIds: [] }
      : {}),
  };
  return applyReviewViewCommand(
    current,
    command,
    "Restored all model objects in the 3D view.",
  );
}

function insetSectionBox(bounds) {
  const modelScale = Math.max(
    0.001,
    ...bounds.max.map(
      (value, axis) => value - bounds.min[axis],
    ),
  );
  const minimum = [];
  const maximum = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const extent = bounds.max[axis] - bounds.min[axis];
    if (extent > 0) {
      minimum.push(bounds.min[axis] + extent * 0.08);
      maximum.push(bounds.max[axis] - extent * 0.08);
    } else {
      minimum.push(bounds.min[axis] - modelScale * 0.001);
      maximum.push(bounds.max[axis] + modelScale * 0.001);
    }
  }
  return {
    min: minimum,
    max: maximum,
  };
}

async function applySectionMode(mode) {
  const current = active;
  if (current === null || current.kind === "point-cloud") {
    return null;
  }
  const bounds = current.opened.snapshot.geometry.bounds;
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const command = mode === "clip-x"
    ? {
        clippingPlanes: [{
          constant: -centerX,
          normal: [1, 0, 0],
        }],
        sectionBox: null,
      }
    : mode === "section-box"
      ? {
          clippingPlanes: [],
          sectionBox: insetSectionBox(bounds),
        }
      : {
          clippingPlanes: [],
          sectionBox: null,
        };
  return applyReviewViewCommand(
    current,
    command,
    mode === "clip-x"
      ? "Applied an X-axis clipping plane through the model center."
      : mode === "section-box"
        ? "Applied an inset section box to the active model."
        : "Cleared the active clipping plane or section box.",
  );
}

function measurementExpectedPoints(tool) {
  return tool === "measure-distance" ? 2 : 3;
}

function activateMeasurementTool(type) {
  const current = active;
  if (current === null || current.kind === "point-cloud") {
    return;
  }
  const tool = `measure-${type}`;
  current.review.tool = current.review.tool === tool
    ? "select"
    : tool;
  current.review.measurement = null;
  current.review.measurementPicks = [];
  updateLiveCameraReport(current);
  renderReviewControls("ready");
  focusCanvas();
  setStatus(
    "ready",
    current.review.tool === "select"
      ? "Cancelled the measurement tool."
      : `Measure ${type}: select ` +
        `${measurementExpectedPoints(tool)} visible model points.`,
  );
}

function clearMeasurement() {
  const current = active;
  if (current === null || current.kind === "point-cloud") {
    return;
  }
  current.review.measurement = null;
  current.review.measurementPicks = [];
  current.review.tool = "select";
  updateLiveCameraReport(current);
  renderReviewControls("ready");
  setStatus("ready", "Cleared the measurement and active measure tool.");
}

async function captureMeasurementPointer(current, pointer) {
  if (active !== current || current.review.tool === "select") {
    return null;
  }
  const coordinates = canvasPickCoordinates(pointer);
  if (coordinates === null) {
    return null;
  }
  const pick = await current.host.pick(coordinates);
  if (active !== current) {
    return null;
  }
  if (pick.status !== "hit") {
    setStatus(
      "ready",
      "Measurement point missed visible geometry; existing points remain.",
    );
    return pick;
  }
  current.review.measurementPicks.push(pick);
  const expected = measurementExpectedPoints(current.review.tool);
  if (current.review.measurementPicks.length < expected) {
    updateLiveCameraReport(current);
    renderReviewControls("ready");
    setStatus(
      "ready",
      `Measurement point ${current.review.measurementPicks.length}/` +
        `${expected} captured in the active source revision.`,
    );
    return pick;
  }
  const type = current.review.tool.slice("measure-".length);
  try {
    current.review.measurement = current.renderer.measure({
      picks: current.review.measurementPicks,
      type,
    });
    current.review.measurementPicks = [];
    current.review.tool = "select";
    updateLiveCameraReport(current);
    renderReviewControls("ready");
    setStatus(
      "ready",
      "Measurement completed in source coordinates; unit authority " +
        "was not interpreted.",
    );
  } catch (error) {
    current.review.measurementPicks = [];
    current.review.tool = "select";
    updateLiveCameraReport(current);
    renderReviewControls("ready");
    setStatus(
      "ready",
      "Measurement failed closed; choose distinct valid model points.",
    );
    current.review.measurementError = error;
    return null;
  }
  return pick;
}

async function fitSelectedObject() {
  const current = active;
  if (current === null || current.kind === "point-cloud") {
    return null;
  }
  if (current.cameraControls === null) {
    return null;
  }
  await settleCameraControls(current);
  if (active !== current) {
    return null;
  }
  const entity = selectedRenderableEntity(current);
  if (entity === null) {
    return null;
  }
  const camera = selectedFitCamera(current, entity);
  current.cameraInteractionError = null;
  await current.cameraControls.setCamera(camera, {
    kind: "fit-selection",
  });
  if (active !== current) {
    return null;
  }
  if (current.cameraInteractionError !== null) {
    throw current.cameraInteractionError;
  }
  current.selectionFitUpdates += 1;
  updateLiveCameraReport(current);
  try {
    elements.canvas.focus({ preventScroll: true });
  } catch {
    elements.canvas.focus();
  }
  setStatus(
    "ready",
    "Fitted the active source-revision selection in the 3D view.",
  );
  return camera;
}

async function applySelectionView(current = active) {
  if (
    current === null ||
    effectiveSelection(current) === null
  ) {
    return null;
  }
  await settleCameraControls(current);
  if (active !== current) {
    return null;
  }
  const command = await selectionViewCommand(current);
  if (active !== current) {
    return null;
  }
  return renderMeshView(current, { command });
}

async function selectExpressId(expressId, origin) {
  const current = active;
  if (current === null || current.kind === "point-cloud") {
    return null;
  }
  await current.explorer.selectExpressId(expressId, {
    origin,
  });
  if (active !== current) {
    return null;
  }
  current.selectionSuppressed = false;
  await revealExplorerItem(
    current.explorer,
    current.opened.snapshot,
    expressId,
  );
  if (active !== current) {
    return null;
  }
  current.viewerCore.publishSelection(
    current.explorer.state.selection,
    { reason: origin },
  );
  await applySelectionView(current);
  if (active !== current) {
    return null;
  }
  render();
  return current.explorer.state.selection;
}

function firstRenderable(snapshot) {
  return snapshot.entities.find((entity) =>
    entity.renderId !== null) ?? null;
}

async function revealFirstProduct(explorer, snapshot, entity) {
  await revealExplorerItem(
    explorer,
    snapshot,
    entity.expressId,
  );
  await explorer.selectExpressId(entity.expressId, {
    origin: "tree",
  });
}

async function revealExplorerItem(
  explorer,
  snapshot,
  expressId,
) {
  if (!Array.isArray(snapshot.tree?.nodes)) {
    return;
  }
  const nodeById = new Map(
    snapshot.tree.nodes.map((node) => [
      node.expressId,
      node,
    ]),
  );
  const lineage = [];
  let node = nodeById.get(expressId);
  while (node?.parentExpressId !== null) {
    node = nodeById.get(node.parentExpressId);
    if (node !== undefined) {
      lineage.unshift(node.expressId);
    }
  }
  for (const expressId of lineage) {
    await explorer.expand(expressId);
  }
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
  const cameraControlsDisposed =
    current.cameraControls?.dispose() ?? false;
  delete elements.canvas.dataset.cameraControls;
  await settleCameraControls(current);
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
    cameraControls: cameraInteractionReport(current),
    cameraControlsDisposed,
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
      cameraControls: null,
      cameraInteractionError: null,
      cameraRenderedUpdates: 0,
      client: sourceClient,
      explorer,
      format,
      host,
      lastMeshPick: null,
      lastMeshPickStatus: null,
      meshPickAttempts: 0,
      meshPickMisses: 0,
      mount,
      opened,
      origin,
      product,
      renderer,
      initialCamera: mount.renderer.backend.camera,
      review: {
        fitAllUpdates: 0,
        measurement: null,
        measurementPicks: [],
        projectionUpdates: 0,
        resetViewUpdates: 0,
        standardView: null,
        standardViewUpdates: 0,
        tool: "select",
      },
      selectionSuppressed: false,
      selectionFitUpdates: 0,
      surface,
      view: initialRendererView(explorer),
      viewerCore,
    };
    attachActiveCameraControls(active);
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
      reference &&
        opened.snapshot.referenceMetadata
          .appearanceOmissions !== undefined
        ? `Ready: local ${format.toUpperCase()} geometry is open; ` +
          `${opened.snapshot.referenceMetadata.appearanceOmissions
            .materialFeatures} optional appearance features were omitted.`
        : `Ready: local ${format.toUpperCase()} is open read-only.`,
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
          extensionsRequired: [
            ...opened.snapshot.referenceMetadata
              .extensionsRequired,
          ],
          extensionsUsed: [
            ...opened.snapshot.referenceMetadata.extensionsUsed,
          ],
          profile: opened.snapshot.source.profile,
          resourceBundle: {
            ...opened.snapshot.referenceMetadata.resourceBundle,
          },
          ...(opened.snapshot.referenceMetadata.appearance === null
            ? {}
            : {
                appearance: {
                  ...opened.snapshot.referenceMetadata.appearance,
                },
              }),
          ...(opened.snapshot.referenceMetadata
            .appearanceOmissions === undefined
            ? {}
            : {
                appearanceOmissions: {
                  ...opened.snapshot.referenceMetadata
                    .appearanceOmissions,
                  reasons: {
                    ...opened.snapshot.referenceMetadata
                      .appearanceOmissions.reasons,
                  },
                  roles: {
                    ...opened.snapshot.referenceMetadata
                      .appearanceOmissions.roles,
                  },
                },
              }),
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
        ...(mount.renderer.metrics.textures === undefined
          ? {}
          : {
              textures: mount.renderer.metrics.textures,
              textureSourceBytes:
                mount.renderer.metrics.textureSourceBytes,
              textureDecodedBytes:
                mount.renderer.metrics.textureDecodedBytes,
              textureGpuBytes:
                mount.renderer.metrics.textureGpuBytes,
              gpuTextures:
                mount.renderer.backend.gpuTextures ?? 0,
            }),
      },
      viewerCore: viewerCore.state,
      cameraInteraction: cameraInteractionReport(active),
      reviewTools: reviewToolsReport(active),
      meshSelection: null,
      meshPicking: {
        attempts: 0,
        lastStatus: null,
        misses: 0,
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
      "External glTF resources must be same-folder .bin, .jpg, .jpeg, or .png files",
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
    !/\.(?:bin|jpe?g|png)$/u.test(file.name.toLocaleLowerCase()));
  if (sourceFiles.length !== 1) {
    throw new TypeError("Select exactly one BIM source file");
  }
  const file = sourceFiles[0];
  const resourceFiles = files.filter((item) => item !== file);
  const format = localFileFormat(file);
  if (resourceFiles.length > 0 && format !== "gltf") {
    throw new TypeError(
      "External .bin, .jpg, .jpeg, or .png resources are only valid with glTF JSON",
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
  const current = active;
  await settleCameraControls(current);
  const visibility = await current.explorer.setVisibility(
    "isolate-results",
  );
  const command = current.selectionSuppressed
    ? {
        ...visibility,
        selectedPickIds: [],
      }
    : visibility;
  await renderMeshView(current, { command });
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

async function runReviewAction(action, failureMessage) {
  try {
    return await action();
  } catch {
    if (active !== null) {
      setStatus("ready", failureMessage);
    }
    return null;
  }
}

elements.showAll.addEventListener("click", async () => {
  if (active?.kind === "point-cloud") {
    await refinePointLod();
    return;
  }
  await runReviewAction(
    showAllObjects,
    "Show all failed closed; the current view is unchanged.",
  );
});

elements.fitAll.addEventListener("click", async () => {
  await runReviewAction(
    fitWholeModel,
    "Model fit failed closed; the current view is unchanged.",
  );
});

elements.fitSelection.addEventListener("click", async () => {
  await runReviewAction(
    fitSelectedObject,
    "Selection fit failed closed; the current view is unchanged.",
  );
});

elements.resetView.addEventListener("click", async () => {
  await runReviewAction(
    resetReviewView,
    "View reset failed closed; the current view is unchanged.",
  );
});

elements.toggleProjection.addEventListener("click", async () => {
  await runReviewAction(
    toggleProjection,
    "Projection change failed closed; the current view is unchanged.",
  );
});

for (const button of elements.standardViews) {
  button.addEventListener("click", async () => {
    await runReviewAction(
      () => setStandardView(button.dataset.standardView),
      "Standard view failed closed; the current view is unchanged.",
    );
  });
}

elements.hideSelection.addEventListener("click", async () => {
  await runReviewAction(
    hideSelectedObject,
    "Hide selected failed closed; the current view is unchanged.",
  );
});

elements.isolateSelection.addEventListener("click", async () => {
  await runReviewAction(
    isolateSelectedObject,
    "Isolate selected failed closed; the current view is unchanged.",
  );
});

elements.clearSelection.addEventListener("click", async () => {
  await runReviewAction(
    clearProductSelection,
    "Clear selection failed closed; the current view is unchanged.",
  );
});

elements.clipX.addEventListener("click", async () => {
  await runReviewAction(
    () => applySectionMode(
      reviewSectionMode(active) === "clip-x" ? "none" : "clip-x",
    ),
    "Clipping plane change failed closed; the view is unchanged.",
  );
});

elements.sectionBox.addEventListener("click", async () => {
  await runReviewAction(
    () => applySectionMode(
      reviewSectionMode(active) === "section-box"
        ? "none"
        : "section-box",
    ),
    "Section box change failed closed; the view is unchanged.",
  );
});

elements.clearSection.addEventListener("click", async () => {
  await runReviewAction(
    () => applySectionMode("none"),
    "Section clear failed closed; the view is unchanged.",
  );
});

elements.measureDistance.addEventListener("click", () => {
  activateMeasurementTool("distance");
});

elements.measureAngle.addEventListener("click", () => {
  activateMeasurementTool("angle");
});

elements.measureArea.addEventListener("click", () => {
  activateMeasurementTool("area");
});

elements.clearMeasurement.addEventListener("click", () => {
  clearMeasurement();
});

elements.toggleTreePanel.addEventListener("click", () => {
  layoutState.treeVisible = !layoutState.treeVisible;
  renderLayout();
  if (active !== null && active.kind !== "point-cloud") {
    updateLiveCameraReport(active);
  }
});

elements.togglePropertiesPanel.addEventListener("click", () => {
  layoutState.propertiesVisible = !layoutState.propertiesVisible;
  renderLayout();
  if (active !== null && active.kind !== "point-cloud") {
    updateLiveCameraReport(active);
  }
});

elements.toggleFocusMode.addEventListener("click", () => {
  layoutState.focusMode = !layoutState.focusMode;
  renderLayout();
  if (active !== null && active.kind !== "point-cloud") {
    updateLiveCameraReport(active);
  }
  if (layoutState.focusMode) {
    focusCanvas();
  }
});

elements.reviewToolbar.addEventListener("click", (event) => {
  if (event.target.closest("button") !== null) {
    event.target.closest("details")?.removeAttribute("open");
  }
});

elements.canvas.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const standardView = ({
    "1": "front",
    "2": "back",
    "3": "left",
    "4": "right",
    "5": "top",
    "6": "bottom",
  })[key];
  let action = null;
  if (key === "f") {
    action = event.shiftKey ? fitSelectedObject : fitWholeModel;
  } else if (key === "0") {
    action = resetReviewView;
  } else if (key === "p") {
    action = toggleProjection;
  } else if (standardView !== undefined) {
    action = () => setStandardView(standardView);
  } else if (key === "d") {
    action = () => activateMeasurementTool("distance");
  } else if (key === "g") {
    action = () => activateMeasurementTool("angle");
  } else if (key === "a") {
    action = () => activateMeasurementTool("area");
  } else if (key === "escape") {
    action = clearMeasurement;
  }
  if (action === null) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  void runReviewAction(
    action,
    "Review shortcut failed closed; the current state is unchanged.",
  );
});

async function pickVisible(current = active) {
  if (current === null) {
    return null;
  }
  if (current.kind === "point-cloud") {
    const coordinates =
      current.mount.backend.suggestedPickCoordinates;
    if (coordinates === null) {
      throw new Error("no visible point was available for picking");
    }
    const receipt = await current.renderer.pick(coordinates);
    if (active !== current) {
      return null;
    }
    if (receipt.status !== "hit") {
      throw new Error("the visible point pick did not resolve");
    }
    return receipt;
  }
  await settleCameraControls(current);
  if (active !== current) {
    return null;
  }
  const coordinates = [
    [400, 225],
    [400, 150],
    [400, 300],
    [275, 225],
    [525, 225],
  ];
  for (const [x, y] of coordinates) {
    const receipt = await current.host.pick({ x, y });
    if (active !== current) {
      return null;
    }
    if (receipt.status === "hit") {
      return receipt;
    }
  }
  throw new Error("no visible BIM object was picked");
}

async function selectVisible() {
  const current = active;
  if (current === null) {
    return null;
  }
  const pick = await pickVisible(current);
  if (pick === null || active !== current) {
    return null;
  }
  if (current.kind === "point-cloud") {
    current.selection = pick;
    render();
    setStatus(
      "ready",
      `Selected ${pick.identity.nativeId} in the active source revision.`,
    );
    current.report = publishReport("ready", {
      ...current.report,
      pointSelection: pick,
    });
    return pick;
  }
  await current.explorer.selectPick(pick);
  if (active !== current) {
    return null;
  }
  current.selectionSuppressed = false;
  await revealExplorerItem(
    current.explorer,
    current.opened.snapshot,
    current.explorer.state.selection.expressId,
  );
  if (active !== current) {
    return null;
  }
  current.lastMeshPick = pick;
  current.viewerCore.publishSelection(
    current.explorer.state.selection,
    { reason: "3d" },
  );
  await applySelectionView(current);
  if (active !== current) {
    return null;
  }
  render();
  setStatus(
    "ready",
    "Selected a visible object in the active source revision.",
  );
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
renderLayout();
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
