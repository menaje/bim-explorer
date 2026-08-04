import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createWebIfcSourceArtifact,
} from "../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../packages/bim-model-source/src/index.mjs";
import {
  BIM_SPATIAL_BRIDGE_DESCRIPTOR_SCHEMA,
  BIM_SPATIAL_CONTEXT_SCHEMA,
  BIM_SPATIAL_HANDOFF_SCHEMA,
  BIM_SPATIAL_INTEGRATION_CONTRACT,
  BIM_SPATIAL_RENDER_PROTOCOL_ID,
  BIM_SPATIAL_RENDER_PROTOCOL_PACKAGE_VERSION,
  BIM_SPATIAL_REVIEW_SCHEMA,
  BIM_SPATIAL_SELECTION_SCHEMA,
  BIM_SPATIAL_VIEWER_CORE_VERSION,
  BIM_SPATIAL_VIEWPOINT_SCHEMA,
  createBimSpatialIntegration,
} from "../packages/spatial-integration/src/index.mjs";
import {
  syntheticMappedIfc,
} from "./generate-synthetic-ifc.mjs";

const SOURCE_SHA256 =
  "400071d0a99f14ef37c46560bde1651965a378e0586b5f470be3fda81e585243";
const WORKSPACE_ID = "workspace:synthetic-bim-integration";
const FROM_REVISION_ID = "spatial-revision:synthetic:0";
const REVISION_ID = "spatial-revision:synthetic:1";
const RENDER_MAP_ID = "render-map:synthetic:1";
const CONTEXT_URI =
  "cadctx://local/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const EXPIRES_AT = "2026-08-04T06:00:00.000Z";

function deepFreeze(value) {
  if (
    value !== null &&
    typeof value === "object" &&
    !ArrayBuffer.isView(value) &&
    !Object.isFrozen(value)
  ) {
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
    Object.freeze(value);
  }
  return value;
}

export function syntheticSpatialBridge({
  mappingFingerprint = `sha256:${SOURCE_SHA256}`,
} = {}) {
  let currentRevisionId = REVISION_ID;
  let currentRenderMapId = RENDER_MAP_ID;
  let released = false;
  let contextRequest = null;
  let mappingRequests = 0;
  let contextRequests = 0;
  let reviewRequests = 0;
  const descriptor = () => deepFreeze({
    schema: BIM_SPATIAL_BRIDGE_DESCRIPTOR_SCHEMA,
    protocolVersion: "0.1.0",
    workspaceId: WORKSPACE_ID,
    revisionId: currentRevisionId,
    renderMapId: currentRenderMapId,
    capabilities: [
      "bim-external-identity-map",
      "context-create",
      "diff-descriptor",
      "layer-manifest",
    ],
    viewer: {
      viewerCorePackageVersion:
        BIM_SPATIAL_VIEWER_CORE_VERSION,
      renderProtocolPackageVersion:
        BIM_SPATIAL_RENDER_PROTOCOL_PACKAGE_VERSION,
      renderProtocolId: BIM_SPATIAL_RENDER_PROTOCOL_ID,
    },
  });
  return {
    get state() {
      return deepFreeze({
        released,
        mappingRequests,
        contextRequests,
        reviewRequests,
        contextRequest,
        currentRevisionId,
        currentRenderMapId,
      });
    },
    advanceRevision() {
      currentRevisionId = "spatial-revision:synthetic:2";
      currentRenderMapId = "render-map:synthetic:2";
    },
    async getDescriptor() {
      return descriptor();
    },
    async mapBimSelection(request) {
      mappingRequests += 1;
      return deepFreeze({
        schema:
          "bim-explorer-spatial-bridge-selection/0.1",
        protocolVersion: "0.1.0",
        workspaceId: WORKSPACE_ID,
        revisionId: REVISION_ID,
        renderMapId: RENDER_MAP_ID,
        sourceFingerprint: mappingFingerprint,
        sourceRevisionId: request.source.revisionId,
        externalIdentityToken:
          request.nativeIdentity.externalIdentityToken,
        mappingStatus: "exact",
        canonicalId: "entity:synthetic/main-wall",
        views: [
          {
            view: "2d",
            revisionId: REVISION_ID,
            renderMapId: RENDER_MAP_ID,
            layerId: "layer:spatial:plan-live",
            renderId: "render:spatial:plan:main-wall",
            pickId: "pick:spatial:plan:main-wall",
          },
          {
            view: "3d",
            revisionId: REVISION_ID,
            renderMapId: RENDER_MAP_ID,
            layerId: "layer:spatial:model-live",
            renderId: "render:spatial:model:main-wall",
            pickId: "pick:spatial:model:main-wall",
          },
        ],
      });
    },
    async createContextReference(request) {
      contextRequests += 1;
      contextRequest = structuredClone(request);
      return deepFreeze({
        schema: "bim-explorer-spatial-bridge-context/0.1",
        protocolVersion: "0.1.0",
        workspaceId: WORKSPACE_ID,
        revisionId: REVISION_ID,
        uri: CONTEXT_URI,
        expiresAt: EXPIRES_AT,
      });
    },
    async getReviewDescriptor(request) {
      reviewRequests += 1;
      return deepFreeze({
        schema: "bim-explorer-spatial-bridge-review/0.1",
        protocolVersion: "0.1.0",
        workspaceId: WORKSPACE_ID,
        fromRevisionId: request.fromRevisionId,
        toRevisionId: REVISION_ID,
        renderMapId: RENDER_MAP_ID,
        layers: [
          {
            layerId: "layer:spatial:plan-live",
            sourceId: "source:spatial:live",
            revisionId: REVISION_ID,
            kind: "live",
            representation: "2d",
            order: 100,
            visible: true,
            rangeHandleId: "range:spatial:plan-live",
          },
          {
            layerId: "layer:spatial:model-live",
            sourceId: "source:spatial:live",
            revisionId: REVISION_ID,
            kind: "live",
            representation: "3d",
            order: 101,
            visible: true,
            rangeHandleId: "range:spatial:model-live",
          },
          {
            layerId: "layer:spatial:model-modified",
            sourceId: "source:spatial:diff",
            revisionId: REVISION_ID,
            kind: "modified",
            representation: "3d",
            order: 200,
            visible: true,
            rangeHandleId: "range:spatial:model-modified",
          },
        ],
        diff: {
          semantic: {
            digest: `sha256:${"a".repeat(64)}`,
            changedEntities: 1,
          },
          geometry: {
            digest: `sha256:${"b".repeat(64)}`,
            changedEntities: 1,
          },
          representation: {
            digest: `sha256:${"c".repeat(64)}`,
            changedEntities: 1,
          },
          render: {
            digest: `sha256:${"d".repeat(64)}`,
            changedEntities: 1,
          },
          requirement: {
            digest: `sha256:${"e".repeat(64)}`,
            changedEntities: 1,
          },
        },
      });
    },
    async release() {
      if (released) {
        return false;
      }
      released = true;
      return true;
    },
  };
}

function selection(snapshot, expressId = 40) {
  const entity = snapshot.entities.find(
    (candidate) => candidate.expressId === expressId,
  );
  assert.ok(entity);
  return deepFreeze({
    sourceFingerprint: snapshot.source.fingerprint,
    revisionId: snapshot.revisionId,
    expressId: entity.expressId,
    globalId: entity.globalId,
    renderId: entity.renderId,
    pickId: entity.pickId,
    externalIdentityToken: entity.externalIdentityToken,
  });
}

function viewpoint(snapshot) {
  return deepFreeze({
    schema: BIM_SPATIAL_VIEWPOINT_SCHEMA,
    sourceFingerprint: snapshot.source.fingerprint,
    sourceRevisionId: snapshot.revisionId,
    projection: "perspective",
    position: [4, 5, 6],
    target: [2, 3, 1.5],
    up: [0, 0, 1],
    sectionPlanes: [
      {
        normal: [1, 0, 0],
        distance: -1,
      },
    ],
  });
}

async function rejected(operation, pattern) {
  await assert.rejects(operation, pattern);
  return true;
}

export async function qualifySpatialIntegration() {
  const artifact = await createWebIfcSourceArtifact(
    new TextEncoder().encode(syntheticMappedIfc()),
    { profile: "ReferenceView_V1.2" },
  );
  assert.equal(artifact.source.sha256, SOURCE_SHA256);
  const source = createBimModelSource(artifact);
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const activeSelection = selection(snapshot);
  const activeViewpoint = viewpoint(snapshot);

  const standalone = await createBimSpatialIntegration({
    snapshot,
  });
  const standaloneHandoff = standalone.createHandoff({
    selection: activeSelection,
    viewpoint: activeViewpoint,
  });
  const standaloneState = standalone.state;
  const standaloneDisposed = await standalone.dispose();

  const bridge = syntheticSpatialBridge();
  const integration = await createBimSpatialIntegration({
    snapshot,
    bridge,
  });
  const selectionSync = await integration.resolveSelection({
    selection: activeSelection,
    viewpoint: activeViewpoint,
  });
  const context = await integration.createContextReference({
    selectionSync,
    viewport: {
      representation: "3d",
      viewId: "view:synthetic:model",
      width: 1280,
      height: 720,
    },
  });
  const handoff = integration.createHandoff({
    selection: activeSelection,
    viewpoint: activeViewpoint,
    contextReference: context,
  });
  const review = await integration.loadReview({
    selectionSync,
    fromRevisionId: FROM_REVISION_ID,
  });
  const beforeStale = integration.state;
  bridge.advanceRevision();
  const staleSpatialRevisionRejected = await rejected(
    () => integration.createContextReference({
      selectionSync,
      viewport: {
        representation: "3d",
        viewId: "view:synthetic:model",
        width: 1280,
        height: 720,
      },
    }),
    /revision changed/u,
  );
  const integrationDisposed = await integration.dispose();

  const staleBridge = syntheticSpatialBridge({
    mappingFingerprint: `sha256:${"f".repeat(64)}`,
  });
  const staleIntegration =
    await createBimSpatialIntegration({
      snapshot,
      bridge: staleBridge,
    });
  const staleSourceRejected = await rejected(
    () => staleIntegration.resolveSelection({
      selection: activeSelection,
      viewpoint: activeViewpoint,
    }),
    /mapping is stale or invalid/u,
  );
  await staleIntegration.dispose();

  const sessionDisposed = await session.dispose();
  const sourceDisposed = await source.dispose();
  const report = {
    schema:
      "bim-explorer-spatial-integration-qualification/1",
    status: "passed-experimental",
    asOf: "2026-08-04",
    contract: {
      integration: BIM_SPATIAL_INTEGRATION_CONTRACT,
      handoff: BIM_SPATIAL_HANDOFF_SCHEMA,
      selection: BIM_SPATIAL_SELECTION_SCHEMA,
      context: BIM_SPATIAL_CONTEXT_SCHEMA,
      review: BIM_SPATIAL_REVIEW_SCHEMA,
      viewerCorePackageVersion:
        BIM_SPATIAL_VIEWER_CORE_VERSION,
      renderProtocolPackageVersion:
        BIM_SPATIAL_RENDER_PROTOCOL_PACKAGE_VERSION,
      renderProtocolId: BIM_SPATIAL_RENDER_PROTOCOL_ID,
      spatialProtocolVersion: "0.1.0",
    },
    source: {
      fingerprint: snapshot.source.fingerprint,
      revisionId: snapshot.revisionId,
      schema: snapshot.source.ifcSchema,
      profile: snapshot.source.profile,
      products: snapshot.entities.length,
    },
    standalone: {
      availability: standaloneState.availability,
      handoffSchema: standaloneHandoff.schema,
      contextReference:
        standaloneHandoff.contextReference,
      authority: standaloneHandoff.authority,
      disposed: standaloneDisposed,
    },
    selection: {
      canonicalId: selectionSync.canonicalId,
      mappingStatus: selectionSync.mappingStatus,
      views: selectionSync.views.map((view) => ({
        view: view.view,
        layerId: view.layerId,
        renderId: view.renderId,
        pickId: view.pickId,
      })),
      sourceFingerprint:
        selectionSync.sourceFingerprint,
      sourceRevisionId:
        selectionSync.sourceRevisionId,
      spatialRevisionId: selectionSync.revisionId,
    },
    context: {
      schema: context.schema,
      uri: context.uri,
      expiresAt: context.expiresAt,
      authority: context.authority,
      requestContainsCanonicalId:
        JSON.stringify(bridge.state.contextRequest)
          .includes(selectionSync.canonicalId),
      requestContainsPathOrCredential:
        /\/Users\/|\/Volumes\/|[A-Z]:\\|credential/iu.test(
          JSON.stringify(bridge.state.contextRequest),
        ),
    },
    review: {
      schema: review.schema,
      bimBaseLayers: review.bimBase.layers.length,
      spatialLayers: review.spatial.layers.map(
        (layer) => [
          layer.kind,
          layer.representation,
          layer.owner,
        ],
      ),
      diff: review.spatial.diff,
      authority: review.authority,
    },
    handoff: {
      schema: handoff.schema,
      byteLength: new TextEncoder().encode(
        JSON.stringify(handoff),
      ).byteLength,
      target: handoff.target,
      contextReference: handoff.contextReference,
      authority: handoff.authority,
      containsPathOrCredential:
        /\/Users\/|\/Volumes\/|[A-Z]:\\|credential/iu.test(
          JSON.stringify(handoff),
        ),
    },
    failClosed: {
      staleSourceRejected,
      staleSpatialRevisionRejected,
    },
    lifecycle: {
      beforeStale,
      bridge: bridge.state,
      integrationDisposed,
      sessionDisposed,
      sourceDisposed,
    },
    decision: {
      explorerProviderContract:
        "passed-synthetic-bridge",
      actualSpatialConsumer:
        "held-consumer-owned",
      publicBimPackage:
        "held-community-release",
      spatialBundleIndependence:
        "held-spatial-product-evidence",
      productionClaims: false,
    },
  };
  assert.equal(
    report.context.requestContainsCanonicalId,
    false,
  );
  assert.equal(
    report.context.requestContainsPathOrCredential,
    false,
  );
  assert.equal(
    report.handoff.containsPathOrCredential,
    false,
  );
  assert.doesNotMatch(
    JSON.stringify(report),
    /\/Users\/|\/Volumes\/|[A-Z]:\\/u,
  );
  return deepFreeze(report);
}

async function main() {
  process.stdout.write(
    `${JSON.stringify(await qualifySpatialIntegration(), null, 2)}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
