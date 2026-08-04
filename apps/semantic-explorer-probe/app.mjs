import {
  createBounded3dRenderer,
  createWebGl2Backend,
} from "/bim-renderer-3d.mjs";
import {
  createBimSemanticExplorer,
} from "/bim-semantic-explorer.mjs";
import {
  BrowserSemanticRangeSession,
} from "./source-session.mjs";

const elements = {
  canvas: document.querySelector("#model-canvas"),
  finalize: document.querySelector("#finalize-probe"),
  inspector: document.querySelector("#inspector-content"),
  isolateResults: document.querySelector("#isolate-results"),
  moreResults: document.querySelector("#more-results"),
  pickModel: document.querySelector("#pick-model"),
  receipt: document.querySelector("#receipt"),
  searchForm: document.querySelector("#search-form"),
  searchInput: document.querySelector("#search-input"),
  searchOmission: document.querySelector("#search-omission"),
  searchResults: document.querySelector("#search-results"),
  selectionOrigin: document.querySelector("#selection-origin"),
  status: document.querySelector("#status"),
  tree: document.querySelector("#model-tree"),
  treeCount: document.querySelector("#tree-count"),
  treeOmission: document.querySelector("#tree-omission"),
};

const keyboardEvents = [];
let backend;
let explorer;
let input;
let lastPick;
let mountReceipt;
let renderer;
let rendererCamera;
let session;
let scenario;

async function json(route) {
  const response = await fetch(route, {
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`probe resource ${route} is unavailable`);
  }
  return await response.json();
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
      ? `${state.tree.omittedDomRows} visible loaded rows omitted by ` +
        `the ${state.tree.maximumDomRows}-row DOM bound.`
      : "";
  for (const row of state.tree.rows) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.expressId = String(row.expressId);
    button.dataset.childCount = String(row.childCount);
    button.dataset.depth = String(row.depth);
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
        "relation",
      ),
      text("span", row.name, "name"),
    );
    button.addEventListener("click", async () => {
      await explorer.selectExpressId(row.expressId, {
        origin: "tree",
      });
      render();
    });
    elements.tree.append(button);
  }
}

function renderSearch(state) {
  clear(elements.searchResults);
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
        "relation",
      ),
      text("span", item.name, "name"),
    );
    button.addEventListener("click", async () => {
      await explorer.selectExpressId(item.expressId, {
        origin: "search",
      });
      render();
    });
    elements.searchResults.append(button);
  }
  elements.searchOmission.textContent =
    state.search.query.length === 0
      ? "Search GlobalId, name, IFC class, property, quantity, " +
        "material, classification, type, or container."
      : `${state.search.loaded}/${state.search.total} loaded · ` +
        `${state.search.omitted} explicitly omitted`;
  elements.moreResults.disabled = !state.search.hasMore;
  elements.isolateResults.disabled =
    state.search.items.every((item) => item.renderId === null);
}

function renderInspector(state) {
  clear(elements.inspector);
  elements.selectionOrigin.textContent =
    state.selection?.origin ?? "none";
  const inspector = state.inspector;
  if (inspector === null) {
    elements.inspector.append(
      text("p", "Select a tree, search, relation, or 3D item.", "empty"),
    );
    return;
  }
  elements.inspector.append(
    inspectorSection("Identity", [inspector.identity], (item) =>
      text(
        "span",
        `${item.ifcClass} · ${item.name} · #${item.expressId}`,
      )),
    inspectorSection(
      "Container",
      inspector.groups.containment,
      (item) => text(
        "span",
        `${item.ifcClass} · ${item.name}`,
      ),
    ),
    inspectorSection(
      "Type",
      inspector.groups.type,
      (item) => text(
        "span",
        `${item.ifcClass} · ${item.name}`,
      ),
    ),
    inspectorSection(
      "Property sets",
      inspector.groups.propertySets,
      (item) => text(
        "span",
        `${item.name} · ${item.valueStatus}`,
      ),
    ),
    inspectorSection(
      "Quantities",
      inspector.groups.quantities,
      (item) => text(
        "span",
        `${item.name}: ${item.value}`,
      ),
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
        button.dataset.kind = item.kind;
        button.dataset.targetExpressId =
          String(item.target.expressId);
        button.textContent =
          `${item.kind} · ${item.target.name}`;
        button.addEventListener("click", async () => {
          await explorer.selectRelation({
            kind: item.kind,
            targetExpressId: item.target.expressId,
          });
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

function render() {
  const state = explorer.state;
  renderTree(state);
  renderSearch(state);
  renderInspector(state);
}

function treeButtons() {
  return [...elements.tree.querySelectorAll(
    '[role="treeitem"]',
  )];
}

elements.tree.addEventListener("keydown", async (event) => {
  const target = event.target.closest('[role="treeitem"]');
  if (target === null) {
    return;
  }
  const buttons = treeButtons();
  const index = buttons.indexOf(target);
  const expressId = Number(target.dataset.expressId);
  if (event.key === "ArrowDown") {
    event.preventDefault();
    keyboardEvents.push("ArrowDown");
    buttons[Math.min(buttons.length - 1, index + 1)]?.focus();
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    keyboardEvents.push("ArrowUp");
    buttons[Math.max(0, index - 1)]?.focus();
    return;
  }
  if (
    event.key === "ArrowRight" &&
    Number(target.dataset.childCount) > 0
  ) {
    event.preventDefault();
    keyboardEvents.push("ArrowRight");
    await explorer.expand(expressId);
    render();
    elements.tree.querySelector(
      `[data-express-id="${expressId}"]`,
    )?.focus();
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    keyboardEvents.push("ArrowLeft");
    await explorer.collapse(expressId);
    render();
    elements.tree.querySelector(
      `[data-express-id="${expressId}"]`,
    )?.focus();
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    keyboardEvents.push(event.key);
    await explorer.selectExpressId(expressId, {
      origin: "tree",
    });
    render();
    elements.tree.querySelector(
      `[data-express-id="${expressId}"]`,
    )?.focus();
  }
});

elements.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    keyboardEvents.push("SearchEnter");
  }
});

elements.searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await explorer.search(elements.searchInput.value);
  render();
});

elements.moreResults.addEventListener("click", async () => {
  await explorer.loadMoreSearch();
  render();
});

async function applyVisibility(mode) {
  const command = await explorer.setVisibility(mode);
  await renderer.renderView({
    camera: rendererCamera,
    ...command,
  });
  render();
  return command;
}

elements.isolateResults.addEventListener("click", async () => {
  await applyVisibility("isolate-results");
});

async function pickVisible() {
  const coordinates = [
    [320, 180],
    [320, 120],
    [320, 240],
    [220, 180],
    [420, 180],
  ];
  for (const [x, y] of coordinates) {
    const receipt = await renderer.pick({ x, y });
    if (receipt.status === "hit") {
      return receipt;
    }
  }
  throw new Error(
    "semantic explorer probe could not pick visible geometry",
  );
}

elements.pickModel.addEventListener("click", async () => {
  lastPick = await pickVisible();
  await explorer.selectPick(lastPick);
  await applyVisibility("show-all");
});

function accessibleRoleAssertions() {
  const rows = treeButtons();
  const options = elements.searchResults.querySelectorAll(
    '[role="option"]',
  );
  return {
    labelledCanvas:
      elements.canvas.getAttribute("aria-label") !== null,
    labelledInspector:
      document.querySelector("#inspector")
        ?.getAttribute("aria-labelledby") ===
        "inspector-title",
    liveStatus:
      elements.status.getAttribute("aria-live") === "polite",
    searchRole:
      elements.searchForm.getAttribute("role") === "search",
    treeItems:
      rows.length > 0 &&
      rows.every((row) =>
        row.hasAttribute("aria-level") &&
        row.hasAttribute("aria-selected")),
    treeRole:
      elements.tree.getAttribute("role") === "tree",
    resultListbox:
      elements.searchResults.getAttribute("role") === "listbox" &&
      options.length > 0,
  };
}

async function finish() {
  if (
    globalThis.__bimSemanticProbeReport?.status === "passed"
  ) {
    return globalThis.__bimSemanticProbeReport;
  }
  const state = explorer.state;
  const roles = accessibleRoleAssertions();
  const beforeCleanup = {
    backend: backend.state,
    explorer: state.lifecycle,
    session: session.state,
  };
  const savedKey = state.savedView.key;
  await explorer.dispose();
  const rendererDisposed = await renderer.dispose();
  const sessionDisposed = await session.dispose();
  localStorage.removeItem(savedKey);
  const assertions = {
    accessibleRoles:
      Object.values(roles).every(Boolean),
    actualBrowser:
      typeof navigator.userAgent === "string" &&
      navigator.userAgent.length > 0,
    actualRendererPick:
      lastPick?.status === "hit" &&
      Number.isSafeInteger(lastPick.identity?.expressId),
    boundedDom:
      treeButtons().length <= state.tree.maximumDomRows &&
      state.tree.maximumDomRows === 8,
    boundedSearch:
      scenario.search.first.loaded === 1 &&
      scenario.search.first.omitted === 1 &&
      scenario.search.complete.loaded === 2,
    decompositionAndContainment:
      scenario.hierarchy.some((row) =>
        row.expressId === 21 &&
        row.parentRelation === "decomposition") &&
      scenario.hierarchy.some((row) =>
        row.expressId === 40 &&
        row.parentRelation === "spatial-containment"),
    deterministicCleanup:
      rendererDisposed === true &&
      sessionDisposed === true &&
      backend.state.activeBytes === 0 &&
      backend.state.disposed === true &&
      session.state.disposed === true,
    informationLimitsVisible:
      scenario.panels.limitations.includes(
        "host-void-fill-relation:opaque",
      ) &&
      scenario.panels.limitations.includes(
        "property-value:lossy",
      ),
    keyboardTreeNavigation:
      keyboardEvents.includes("ArrowDown") &&
      keyboardEvents.includes("Enter") &&
      keyboardEvents.includes("SearchEnter"),
    panelCoverage:
      scenario.panels.propertySets.includes(
        "Pset_WallCommon",
      ) &&
      scenario.panels.quantities.includes(
        "GrossVolume",
      ) &&
      scenario.panels.materials.includes("Concrete") &&
      scenario.panels.classifications.includes("BE-WALL"),
    revisionBoundSelection:
      scenario.pick.selectionExpressId ===
        scenario.pick.receiptExpressId &&
      scenario.pick.selectionRevisionId ===
        input.snapshot.revisionId &&
      scenario.pick.sourceFingerprint ===
        input.snapshot.source.fingerprint,
    savedLocalView:
      scenario.savedView.restored === true &&
      scenario.savedView.selectionExpressId ===
        scenario.pick.selectionExpressId,
    spatialRoundTrip:
      JSON.stringify(
        scenario.hierarchy.map((row) => row.expressId),
      ) === JSON.stringify([13, 15, 17, 19, 21, 40, 44]),
    typeOccurrenceRoundTrip:
      scenario.type.expressId === 55 &&
      JSON.stringify(scenario.type.occurrences) ===
        JSON.stringify([40, 44]) &&
      scenario.type.returnedOccurrence === 40,
    visibilityScope:
      scenario.visibility.renderIds.length === 2 &&
      scenario.visibility.viewMode === "isolate",
    webGl2:
      mountReceipt.backend.actualGpu === true &&
      mountReceipt.backend.context === "webgl2" &&
      mountReceipt.backend.nonBackgroundPixels > 0,
  };
  const report = {
    schema:
      "bim-explorer-semantic-explorer-browser-report/1",
    status: Object.values(assertions).every(Boolean)
      ? "passed"
      : "failed",
    fixture: input.fixture,
    source: {
      fingerprint: input.snapshot.source.fingerprint,
      revisionId: input.snapshot.revisionId,
      snapshotId: input.snapshot.snapshotId,
    },
    renderer: {
      actualGpu: mountReceipt.backend.actualGpu,
      context: mountReceipt.backend.context,
      nonBackgroundPixels:
        mountReceipt.backend.nonBackgroundPixels,
      sourceReadBytes: mountReceipt.metrics.sourceReadBytes,
      pick: lastPick,
    },
    semantic: scenario,
    browser: {
      userAgent: navigator.userAgent,
      keyboardEvents: [...keyboardEvents],
      roles,
      renderedTreeRows: treeButtons().length,
      maximumDomRows: state.tree.maximumDomRows,
    },
    beforeCleanup,
    cleanup: {
      backend: backend.state,
      explorerDisposed: explorer.state.lifecycle.disposed,
      rendererDisposed,
      session: session.state,
      sessionDisposed,
    },
    assertions,
  };
  assertions.pathFreeReport =
    !/\/Volumes\/|\/Users\/|[A-Z]:\\/u.test(
      JSON.stringify(report),
    );
  report.status = Object.values(assertions).every(Boolean)
    ? "passed"
    : "failed";
  globalThis.__bimSemanticProbeReport =
    Object.freeze(report);
  elements.receipt.textContent = JSON.stringify(report, null, 2);
  elements.status.dataset.state = report.status;
  elements.status.textContent = report.status === "passed"
    ? "Passed: semantic explorer disposed cleanly"
    : "Failed: semantic explorer assertion";
  return report;
}

async function prepareScenario() {
  for (const expressId of [13, 15, 17, 19, 21]) {
    await explorer.expand(expressId);
  }
  const hierarchy = explorer.state.tree.rows.map((row) => ({
    expressId: row.expressId,
    parentRelation: row.parentRelation,
  }));
  const wall = await explorer.selectExpressId(40);
  const panelState = explorer.state.inspector;
  const panels = {
    classifications:
      panelState.groups.classifications.map((item) =>
        item.identification),
    limitations:
      panelState.coverage.limitations.map((item) =>
        `${item.capability}:${item.status}`),
    materials: panelState.groups.materials.map((item) =>
      item.name),
    propertySets: panelState.groups.propertySets.map((item) =>
      item.name),
    quantities: panelState.groups.quantities.map((item) =>
      item.name),
  };
  const type = await explorer.selectRelation({
    kind: "type-definition",
    targetExpressId: 55,
  });
  const occurrences = explorer.state.inspector.groups.relations
    .filter((item) => item.kind === "typed-occurrence")
    .map((item) => item.target.expressId);
  const returned = await explorer.selectRelation({
    kind: "typed-occurrence",
    targetExpressId: 40,
  });
  const firstSearch = await explorer.search("wall");
  const completeSearch = await explorer.loadMoreSearch();
  lastPick = await pickVisible();
  const pickedSelection = await explorer.selectPick(lastPick);
  const visibilityCommand =
    await explorer.setVisibility("isolate-results");
  const visibilityView = await renderer.renderView({
    camera: rendererCamera,
    ...visibilityCommand,
  });
  await explorer.saveView({
    camera: rendererCamera,
  });
  const restored = await explorer.restoreView();
  return {
    hierarchy,
    panels,
    pick: {
      receiptExpressId: lastPick.identity.expressId,
      selectionExpressId: pickedSelection.expressId,
      selectionRevisionId: pickedSelection.revisionId,
      sourceFingerprint:
        pickedSelection.sourceFingerprint,
    },
    savedView: {
      restored: restored.restored,
      selectionExpressId:
        restored.state.selection.expressId,
    },
    search: {
      first: {
        loaded: firstSearch.loaded,
        omitted: firstSearch.omitted,
        total: firstSearch.total,
      },
      complete: {
        loaded: completeSearch.loaded,
        omitted: completeSearch.omitted,
        total: completeSearch.total,
      },
    },
    selectionBeforeType: wall.expressId,
    type: {
      expressId: type.expressId,
      occurrences,
      returnedOccurrence: returned.expressId,
    },
    visibility: {
      renderIds: visibilityCommand.isolateRenderIds,
      viewMode: visibilityView.visibility.mode,
    },
  };
}

elements.finalize.addEventListener("click", async () => {
  await finish();
});

async function run() {
  elements.status.dataset.state = "running";
  globalThis.__bimSemanticProbeReport = Object.freeze({
    schema:
      "bim-explorer-semantic-explorer-browser-report/1",
    status: "running",
  });
  try {
    input = await json("/probe-input.json");
    if (
      input.schema !==
        "bim-explorer-semantic-explorer-probe-input/1"
    ) {
      throw new Error(
        "semantic explorer probe input schema is invalid",
      );
    }
    session = new BrowserSemanticRangeSession(
      input.snapshot,
    );
    explorer = createBimSemanticExplorer({
      session,
      snapshot: input.snapshot,
      limits: {
        maximumDomRows: 8,
        maximumLoadedTreeItems: 32,
        maximumRelations: 100,
        maximumSearchResults: 10,
        searchPageSize: 1,
        treePageSize: 2,
      },
    });
    await explorer.initialize();
    backend = createWebGl2Backend({
      canvas: elements.canvas,
      height: 360,
      width: 640,
    });
    renderer = createBounded3dRenderer({ backend });
    mountReceipt = await renderer.mount({
      session,
      snapshot: input.snapshot,
    });
    rendererCamera = mountReceipt.backend.camera;
    scenario = await prepareScenario();
    render();
    elements.status.dataset.state = "ready";
    elements.status.textContent =
      "Ready: use tree and search keyboard controls, then finalize";
    elements.receipt.textContent = JSON.stringify({
      status: "ready",
      scenario,
    }, null, 2);
    globalThis.__bimSemanticProbeFinish = finish;
    globalThis.__bimSemanticProbe = Object.freeze({
      finish,
      getState: () => explorer.state,
    });
    globalThis.__bimSemanticProbeReport = Object.freeze({
      schema:
        "bim-explorer-semantic-explorer-browser-report/1",
      status: "ready",
    });
  } catch (error) {
    try {
      await explorer?.dispose();
      await renderer?.dispose();
      await session?.dispose();
    } catch {
      // Preserve the primary failure.
    }
    const report = {
      schema:
        "bim-explorer-semantic-explorer-browser-report/1",
      status: "failed",
      error: {
        name: error?.name ?? "Error",
        message:
          error?.message ?? "semantic explorer probe failed",
      },
    };
    globalThis.__bimSemanticProbeReport =
      Object.freeze(report);
    elements.receipt.textContent = JSON.stringify(
      report,
      null,
      2,
    );
    elements.status.dataset.state = "failed";
    elements.status.textContent =
      "Failed: semantic explorer setup";
  }
}

await run();
