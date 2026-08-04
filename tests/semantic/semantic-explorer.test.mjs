import assert from "node:assert/strict";
import test from "node:test";

import {
  createWebIfcSourceArtifact,
} from "../../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../../packages/bim-model-source/src/index.mjs";
import {
  BIM_SEMANTIC_EXPLORER_CONTRACT,
  BIM_SEMANTIC_SAVED_VIEW_SCHEMA,
  createBimSemanticExplorer,
} from "../../packages/bim-semantic-explorer/src/index.mjs";
import {
  syntheticSemanticIfc,
} from "../../scripts/generate-synthetic-ifc.mjs";

function semanticBytes() {
  return new TextEncoder().encode(syntheticSemanticIfc());
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

async function semanticSource() {
  const artifact = await createWebIfcSourceArtifact(
    semanticBytes(),
    {
      profile: "ReferenceView_V1.2",
    },
  );
  const source = createBimModelSource(artifact);
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  return {
    session,
    snapshot,
    source,
  };
}

function pickReceipt(snapshot, expressId, revisions = {}) {
  const entity = snapshot.entities.find((item) =>
    item.expressId === expressId);
  return {
    schema:
      "bim-explorer-bim-renderer-3d-pick-receipt/0.1",
    status: "hit",
    source: {
      fingerprint:
        revisions.fingerprint ?? snapshot.source.fingerprint,
      revisionId:
        revisions.revisionId ?? snapshot.revisionId,
    },
    identity: {
      expressId: entity.expressId,
      globalId: entity.globalId,
      renderId: entity.renderId,
      pickId: entity.pickId,
    },
  };
}

test("semantic explorer round-trips spatial, occurrence, type, panels, and 3D", async () => {
  const {
    session,
    snapshot,
    source,
  } = await semanticSource();
  const storage = memoryStorage();
  const explorer = createBimSemanticExplorer({
    session,
    snapshot,
    storage,
    limits: {
      treePageSize: 1,
      searchPageSize: 1,
      maximumDomRows: 16,
      maximumLoadedTreeItems: 32,
      maximumRelations: 100,
      maximumSearchResults: 10,
    },
  });

  const initialized = await explorer.initialize();
  assert.equal(
    initialized.contract,
    BIM_SEMANTIC_EXPLORER_CONTRACT,
  );
  assert.deepEqual(
    initialized.tree.rows.map((row) => row.expressId),
    [13],
  );

  for (const expressId of [13, 15, 17, 19, 21]) {
    await explorer.expand(expressId);
  }
  assert.deepEqual(
    explorer.state.tree.rows.map((row) => [
      row.expressId,
      row.parentRelation,
    ]),
    [
      [13, "root"],
      [15, "decomposition"],
      [17, "decomposition"],
      [19, "decomposition"],
      [21, "decomposition"],
      [40, "spatial-containment"],
    ],
  );
  await explorer.loadMoreTree(21);
  assert.deepEqual(
    explorer.state.tree.rows.slice(-2).map((row) =>
      row.expressId),
    [40, 44],
  );

  const wall = await explorer.selectExpressId(40);
  assert.deepEqual(
    {
      expressId: wall.expressId,
      origin: wall.origin,
      revisionId: wall.revisionId,
    },
    {
      expressId: 40,
      origin: "tree",
      revisionId: snapshot.revisionId,
    },
  );
  assert.equal(explorer.state.tree.selectedRevealed, true);
  assert.deepEqual(
    explorer.state.inspector.groups.containment.map((item) =>
      item.expressId),
    [21],
  );
  assert.deepEqual(
    explorer.state.inspector.groups.type.map((item) =>
      item.expressId),
    [55],
  );
  assert.ok(
    explorer.state.inspector.groups.propertySets.some((item) =>
      item.name === "Pset_WallCommon" &&
      item.valueStatus === "name-only"),
  );
  assert.ok(
    explorer.state.inspector.groups.quantities.some((item) =>
      item.name === "GrossVolume" && item.value === 2.4),
  );
  assert.deepEqual(
    explorer.state.inspector.groups.materials,
    [{ name: "Concrete" }],
  );
  assert.ok(
    explorer.state.inspector.groups.classifications.some(
      (item) => item.identification === "BE-WALL",
    ),
  );
  assert.ok(
    explorer.state.inspector.coverage.limitations.some(
      (item) =>
        item.capability === "host-void-fill-relation" &&
        item.status === "opaque",
    ),
  );
  assert.ok(
    explorer.state.inspector.coverage.limitations.some(
      (item) =>
        item.capability === "property-value" &&
        item.status === "lossy",
    ),
  );

  const type = await explorer.selectRelation({
    kind: "type-definition",
    targetExpressId: 55,
  });
  assert.equal(type.expressId, 55);
  assert.equal(type.kind, "type");
  assert.deepEqual(
    explorer.state.inspector.groups.relations
      .filter((item) => item.kind === "typed-occurrence")
      .map((item) => item.target.expressId),
    [40, 44],
  );
  const occurrence = await explorer.selectRelation({
    kind: "typed-occurrence",
    targetExpressId: 40,
  });
  assert.equal(occurrence.expressId, 40);
  assert.equal(occurrence.origin, "relation");

  const firstSearch = await explorer.search("wall");
  assert.deepEqual(
    {
      expressId: firstSearch.items[0].expressId,
      loaded: firstSearch.loaded,
      omitted: firstSearch.omitted,
      total: firstSearch.total,
      hasMore: firstSearch.hasMore,
    },
    {
      expressId: 40,
      loaded: 1,
      omitted: 1,
      total: 2,
      hasMore: true,
    },
  );
  const completeSearch = await explorer.loadMoreSearch();
  assert.deepEqual(
    completeSearch.items.map((item) => item.expressId),
    [40, 44],
  );
  assert.equal(completeSearch.omitted, 0);

  const picked = await explorer.selectPick(
    pickReceipt(snapshot, 44),
  );
  assert.equal(picked.expressId, 44);
  assert.equal(picked.origin, "3d");
  assert.equal(explorer.state.tree.selectedRevealed, true);
  await assert.rejects(
    explorer.selectPick(pickReceipt(snapshot, 40, {
      revisionId: `${snapshot.revisionId}:stale`,
    })),
    /outside the active snapshot/u,
  );

  const isolated = await explorer.setVisibility(
    "isolate-results",
  );
  assert.deepEqual(
    isolated.isolateRenderIds,
    snapshot.entities.map((entity) => entity.renderId),
  );
  assert.deepEqual(
    isolated.selectedPickIds,
    [snapshot.entities[1].pickId],
  );
  const shown = await explorer.setVisibility("show-all");
  assert.equal(shown.isolateRenderIds, null);

  await explorer.setVisibility("isolate-results");
  const saved = await explorer.saveView({
    camera: {
      projection: "perspective",
      target: [2, 3, 1.5],
    },
  });
  assert.equal(saved.schema, BIM_SEMANTIC_SAVED_VIEW_SCHEMA);
  assert.equal(saved.selectedIdentity.expressId, 44);

  const restoredExplorer = createBimSemanticExplorer({
    session,
    snapshot,
    storage,
    limits: {
      treePageSize: 1,
      searchPageSize: 1,
      maximumDomRows: 16,
      maximumLoadedTreeItems: 32,
      maximumRelations: 100,
      maximumSearchResults: 10,
    },
  });
  await restoredExplorer.initialize();
  const restored = await restoredExplorer.restoreView();
  assert.equal(restored.restored, true);
  assert.equal(restored.state.selection.expressId, 44);
  assert.equal(restored.state.selection.origin, "saved-view");
  assert.equal(
    restored.state.selection.revisionId,
    snapshot.revisionId,
  );
  assert.equal(
    restored.state.visibility.mode,
    "isolate-results",
  );
  assert.deepEqual(restored.camera.target, [2, 3, 1.5]);

  assert.equal(await restoredExplorer.dispose(), true);
  assert.equal(await restoredExplorer.dispose(), false);
  assert.equal(await explorer.dispose(), true);
  await assert.rejects(
    explorer.search("wall"),
    /disposed/u,
  );
  await session.dispose();
  await source.dispose();
});

test("semantic explorer bounds DOM and aggregate search with explicit omission", async () => {
  const {
    session,
    snapshot,
    source,
  } = await semanticSource();
  const explorer = createBimSemanticExplorer({
    session,
    snapshot,
    storage: null,
    limits: {
      treePageSize: 1,
      searchPageSize: 1,
      maximumDomRows: 3,
      maximumLoadedTreeItems: 6,
      maximumRelations: 5,
      maximumSearchResults: 1,
    },
  });

  await explorer.initialize();
  await explorer.selectExpressId(40, {
    origin: "3d",
  });
  assert.equal(explorer.state.tree.rows.length, 3);
  assert.equal(explorer.state.tree.visibleLoadedRows, 6);
  assert.equal(explorer.state.tree.omittedDomRows, 3);
  assert.equal(explorer.state.tree.selectedRevealed, false);
  assert.equal(explorer.state.tree.loadedItems, 6);

  const search = await explorer.search("wall");
  assert.equal(search.loaded, 1);
  assert.equal(search.total, 2);
  assert.equal(search.omitted, 1);
  assert.equal(search.hasMore, false);
  assert.equal(search.limitedByExplorer, true);
  assert.equal(
    (await explorer.loadMoreSearch()).loaded,
    1,
  );
  await assert.rejects(
    explorer.saveView(),
    /storage is unavailable/u,
  );

  await explorer.dispose();
  await session.dispose();
  await source.dispose();
});
