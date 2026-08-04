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
  BIM_SPATIAL_HANDOFF_SCHEMA,
  BIM_SPATIAL_REVIEW_SCHEMA,
  BIM_SPATIAL_VIEWPOINT_SCHEMA,
  createBimSpatialIntegration,
} from "../../packages/spatial-integration/src/index.mjs";
import {
  syntheticMappedIfc,
} from "../../scripts/generate-synthetic-ifc.mjs";
import {
  syntheticSpatialBridge,
} from "../../scripts/qualify-spatial-integration.mjs";

async function fixture() {
  const artifact = await createWebIfcSourceArtifact(
    new TextEncoder().encode(syntheticMappedIfc()),
    { profile: "ReferenceView_V1.2" },
  );
  const source = createBimModelSource(artifact);
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const entity = snapshot.entities.find(
    (candidate) => candidate.expressId === 40,
  );
  return {
    source,
    session,
    snapshot,
    selection: {
      sourceFingerprint: snapshot.source.fingerprint,
      revisionId: snapshot.revisionId,
      expressId: entity.expressId,
      globalId: entity.globalId,
      renderId: entity.renderId,
      pickId: entity.pickId,
      externalIdentityToken: entity.externalIdentityToken,
    },
    viewpoint: {
      schema: BIM_SPATIAL_VIEWPOINT_SCHEMA,
      sourceFingerprint: snapshot.source.fingerprint,
      sourceRevisionId: snapshot.revisionId,
      projection: "perspective",
      position: [4, 5, 6],
      target: [2, 3, 1.5],
      up: [0, 0, 1],
      sectionPlanes: [],
    },
  };
}

test("standalone Explorer creates an authority-free optional handoff", async () => {
  const current = await fixture();
  const integration = await createBimSpatialIntegration({
    snapshot: current.snapshot,
  });
  assert.equal(integration.state.availability, "standalone");
  const handoff = integration.createHandoff({
    selection: current.selection,
    viewpoint: current.viewpoint,
  });
  assert.equal(handoff.schema, BIM_SPATIAL_HANDOFF_SCHEMA);
  assert.equal(handoff.contextReference, null);
  assert.deepEqual(handoff.authority, {
    grants: [],
    acceptance: false,
    publish: false,
    sourceMutation: false,
  });
  await assert.rejects(
    integration.resolveSelection({
      selection: current.selection,
      viewpoint: current.viewpoint,
    }),
    /optional and unavailable/u,
  );
  await integration.dispose();
  await current.session.dispose();
  await current.source.dispose();
});

test("Spatial bridge maps BIM identity, Context Reference, and diff layers", async () => {
  const current = await fixture();
  const bridge = syntheticSpatialBridge();
  const integration = await createBimSpatialIntegration({
    snapshot: current.snapshot,
    bridge,
  });
  const selection = await integration.resolveSelection({
    selection: current.selection,
    viewpoint: current.viewpoint,
  });
  assert.equal(selection.mappingStatus, "exact");
  assert.deepEqual(
    selection.views.map((view) => view.view),
    ["2d", "3d"],
  );
  const context = await integration.createContextReference({
    selectionSync: structuredClone(selection),
    viewport: {
      representation: "3d",
      viewId: "view:test",
      width: 800,
      height: 600,
    },
  });
  assert.match(context.uri, /^cadctx:\/\/local\//u);
  assert.equal(
    JSON.stringify(bridge.state.contextRequest)
      .includes(selection.canonicalId),
    false,
  );
  const handoff = integration.createHandoff({
    selection: current.selection,
    viewpoint: current.viewpoint,
    contextReference: structuredClone(context),
  });
  assert.equal(handoff.contextReference.uri, context.uri);
  const review = await integration.loadReview({
    selectionSync: structuredClone(selection),
    fromRevisionId: "spatial-revision:synthetic:0",
  });
  assert.equal(review.schema, BIM_SPATIAL_REVIEW_SCHEMA);
  assert.equal(review.bimBase.layers[0].owner, "bim-explorer");
  assert.ok(
    review.spatial.layers.every(
      (layer) => layer.owner === "coni-spatial",
    ),
  );
  assert.equal(review.spatial.diff.semantic.changedEntities, 1);
  assert.equal(review.spatial.diff.render.changedEntities, 1);
  assert.equal(review.authority.acceptPublish, "not-granted");
  await integration.dispose();
  assert.equal(bridge.state.released, true);
  await current.session.dispose();
  await current.source.dispose();
});

test("Spatial integration rejects stale source and revision state", async () => {
  const current = await fixture();
  const staleSourceBridge = syntheticSpatialBridge({
    mappingFingerprint: `sha256:${"f".repeat(64)}`,
  });
  const staleSource = await createBimSpatialIntegration({
    snapshot: current.snapshot,
    bridge: staleSourceBridge,
  });
  await assert.rejects(
    staleSource.resolveSelection({
      selection: current.selection,
      viewpoint: current.viewpoint,
    }),
    /mapping is stale or invalid/u,
  );
  await staleSource.dispose();

  const bridge = syntheticSpatialBridge();
  const integration = await createBimSpatialIntegration({
    snapshot: current.snapshot,
    bridge,
  });
  const selection = await integration.resolveSelection({
    selection: current.selection,
    viewpoint: current.viewpoint,
  });
  bridge.advanceRevision();
  await assert.rejects(
    integration.createContextReference({
      selectionSync: selection,
      viewport: {
        representation: "3d",
        viewId: "view:test",
        width: 800,
        height: 600,
      },
    }),
    /revision changed/u,
  );
  const staleViewpoint = {
    ...current.viewpoint,
    sourceRevisionId:
      `${current.snapshot.revisionId}:stale`,
  };
  await assert.rejects(
    Promise.resolve().then(() =>
      integration.createHandoff({
        selection: current.selection,
        viewpoint: staleViewpoint,
      })),
    /outside the source snapshot/u,
  );
  await integration.dispose();
  await current.session.dispose();
  await current.source.dispose();
});

test("incompatible Spatial bridge pin is released before admission", async () => {
  const current = await fixture();
  const bridge = syntheticSpatialBridge();
  const descriptor = await bridge.getDescriptor();
  bridge.getDescriptor = async () => ({
    ...descriptor,
    viewer: {
      ...descriptor.viewer,
      viewerCorePackageVersion: "0.1.1",
    },
  });
  await assert.rejects(
    createBimSpatialIntegration({
      snapshot: current.snapshot,
      bridge,
    }),
    /package pin is incompatible/u,
  );
  assert.equal(bridge.state.released, true);
  await current.session.dispose();
  await current.source.dispose();
});
