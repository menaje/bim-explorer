import assert from "node:assert/strict";
import test from "node:test";

import {
  createReferenceMeshExplorer,
} from "../../apps/bim-explorer-web/reference-mesh-explorer.mjs";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createGltfReferenceSource,
} from "../../packages/gltf-reference-source/src/index.mjs";
import {
  syntheticGlbBytes,
} from "../../scripts/generate-synthetic-gltf.mjs";

async function fixture() {
  const source = await createGltfReferenceSource(
    syntheticGlbBytes(),
  );
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  return {
    session,
    snapshot: await session.getSnapshot(),
    source,
  };
}

test("reference mesh explorer keeps native identity out of BIM semantics", async () => {
  const current = await fixture();
  const explorer = createReferenceMeshExplorer({
    session: current.session,
    snapshot: current.snapshot,
  });
  const initialized = await explorer.initialize();
  assert.equal(initialized.tree.rows.length, 2);
  assert.equal(initialized.tree.rows[0].kind, "reference");
  assert.equal(initialized.selection, null);

  const entity = current.snapshot.entities[0];
  const selected = await explorer.selectExpressId(
    entity.expressId,
  );
  assert.equal(selected.nativeId, entity.nativeId);
  assert.equal(selected.globalId, null);
  assert.equal(selected.origin, "tree");
  assert.equal(
    explorer.state.inspector.coverage.limitations[0].status,
    "not-authoritative",
  );
  assert.ok(
    explorer.state.inspector.groups.referenceMetadata.some(
      (item) =>
        item.label === "Native ID" &&
        item.value === entity.nativeId,
    ),
  );

  const search = await explorer.search("primitive");
  assert.equal(search.total, 2);
  assert.equal(search.items.length, 2);
  const visibility = await explorer.setVisibility(
    "isolate-results",
  );
  assert.deepEqual(
    visibility.isolateRenderIds,
    current.snapshot.entities.map((item) => item.renderId),
  );

  const picked = await explorer.selectPick({
    schema:
      "bim-explorer-bim-renderer-3d-pick-receipt/0.1",
    status: "hit",
    source: {
      fingerprint: current.snapshot.source.fingerprint,
      revisionId: current.snapshot.revisionId,
    },
    identity: {
      expressId: entity.expressId,
      globalId: null,
      nativeId: entity.nativeId,
      renderId: entity.renderId,
      pickId: entity.pickId,
    },
  });
  assert.equal(picked.origin, "3d");
  assert.equal(picked.nativeId, entity.nativeId);

  assert.equal(await explorer.dispose(), true);
  assert.throws(
    () => explorer.state,
    /disposed/u,
  );
  await current.session.dispose();
  await current.source.dispose();
});

test("reference mesh explorer rejects forged semantic authority", async () => {
  const current = await fixture();
  const overclaim = structuredClone(current.snapshot);
  overclaim.source.semanticAuthority = true;
  assert.throws(
    () => createReferenceMeshExplorer({
      session: current.session,
      snapshot: overclaim,
    }),
    /source profile is invalid/u,
  );
  await current.session.dispose();
  await current.source.dispose();
});

test("reference mesh search reports bounded omissions", async () => {
  const current = await fixture();
  const explorer = createReferenceMeshExplorer({
    session: current.session,
    snapshot: current.snapshot,
    limits: {
      maximumSearchResults: 1,
      searchPageSize: 1,
    },
  });
  await explorer.initialize();
  const search = await explorer.search("primitive");
  assert.equal(search.total, 2);
  assert.equal(search.loaded, 1);
  assert.equal(search.omitted, 1);
  assert.equal(search.limitedByExplorer, true);
  assert.equal(search.hasMore, false);
  await explorer.dispose();
  await current.session.dispose();
  await current.source.dispose();
});
