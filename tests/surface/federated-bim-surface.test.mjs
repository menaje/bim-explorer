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
  createBounded3dRenderer,
  createHeadless3dBackend,
} from "../../packages/bim-renderer-3d/src/index.mjs";
import {
  createExplicitAlignment,
} from "../../packages/bim-federation/src/index.mjs";
import {
  BIM_FEDERATED_SURFACE_CONTRACT,
  BIM_FEDERATED_SURFACE_REFRESH_SCHEMA,
  createFederatedBimSurface,
} from "../../packages/federated-bim-surface/src/index.mjs";
import {
  BIM_SURFACE_HIT_SCHEMA,
} from "../../packages/bim-surface-hit/src/index.mjs";
import {
  createGltfReferenceSource,
} from "../../packages/gltf-reference-source/src/index.mjs";
import {
  syntheticGlbBytes,
} from "../../scripts/generate-synthetic-gltf.mjs";
import {
  syntheticMappedIfc,
} from "../../scripts/generate-synthetic-ifc.mjs";

const IDENTITY = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

class PickableBackend {
  #active = null;
  #disposed = false;
  #mounts = 0;
  #picks = 0;

  get state() {
    return {
      active: this.#active !== null,
      disposed: this.#disposed,
      mounts: this.#mounts,
      picks: this.#picks,
    };
  }

  async mount(plan) {
    this.#mounts += 1;
    const handleId = `pickable:${this.#mounts}`;
    const uploadedBytes =
      plan.metrics.geometryPayloadBytes + plan.metrics.instanceBytes;
    const identities = plan.instances.map((instance) => ({
      expressId: instance.expressId,
      globalId: instance.globalId,
      nativeId: instance.nativeId,
      renderId: instance.renderId,
      pickId: instance.pickId,
      externalIdentityToken: instance.externalIdentityToken,
    }));
    const first = identities.find((identity) =>
      identity.nativeId.startsWith("federated:0:"));
    const second = identities.find((identity) =>
      identity.nativeId.startsWith("federated:1:"));
    this.#active = {
      handleId,
      uploadedBytes,
      drawCalls: identities.length,
      pickOrder: [first, second].filter(Boolean),
    };
    return {
      handleId,
      receipt: {
        backendId: "pickable-headless",
        frameId: `mount:${this.#mounts}`,
        rendered: false,
        geometryBytes: plan.metrics.geometryPayloadBytes,
        instanceBytes: plan.metrics.instanceBytes,
        uploadedBytes,
        drawCalls: plan.metrics.drawCalls,
      },
    };
  }

  async pick(handleId, { x, y }) {
    assert.equal(handleId, this.#active.handleId);
    const identity = this.#active.pickOrder[
      this.#picks % this.#active.pickOrder.length
    ];
    this.#picks += 1;
    return {
      receipt: {
        backendId: "pickable-headless",
        frameId: `pick:${this.#mounts}:${this.#picks}`,
        hit: true,
        x,
        y,
        drawCalls: this.#active.drawCalls,
        temporaryTargetBytes: 16,
        temporaryReleased: true,
        frameMs: 0,
        glError: 0,
        identity,
        depth: 0.5,
        worldPosition: [0, 0, 0],
      },
    };
  }

  async unmount(handleId) {
    assert.equal(handleId, this.#active.handleId);
    const releasedBytes = this.#active.uploadedBytes;
    this.#active = null;
    return {
      released: true,
      releasedBytes,
    };
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#active = null;
    this.#disposed = true;
    return true;
  }
}

class FailingRenderer {
  disposed = false;

  get state() {
    return { disposed: this.disposed };
  }

  async mount() {
    throw new Error("intentional renderer mount failure");
  }

  async pick() {
    throw new Error("renderer is not mounted");
  }

  async dispose() {
    if (this.disposed) {
      return false;
    }
    this.disposed = true;
    return true;
  }
}

class VerifiedSurfaceHitRenderer {
  #disposed = false;
  #snapshot = null;

  get state() {
    return {
      disposed: this.#disposed,
      mounted: this.#snapshot !== null,
      retainedGeometryBytes: 0,
    };
  }

  async mount({ snapshot }) {
    this.#snapshot = snapshot;
    return {
      backend: {
        backendId: "verified-surface-hit",
      },
    };
  }

  async pick({ x, y }) {
    const entity = this.#snapshot.entities.find((candidate) =>
      candidate.renderable === true);
    assert.ok(entity);
    const point = [12, 26, 18];
    return {
      schema: "bim-explorer-bim-renderer-3d-pick-receipt/0.1",
      status: "hit",
      source: {
        fingerprint: this.#snapshot.source.fingerprint,
        revisionId: this.#snapshot.revisionId,
      },
      viewRevision: 0,
      coordinates: {
        x,
        y,
        origin: "canvas-top-left",
      },
      identity: {
        expressId: entity.expressId,
        nativeId: entity.nativeId,
        pickId: entity.pickId,
      },
      worldPosition: point,
      backend: {
        actualGpu: true,
        context: "webgl2",
        temporaryReleased: true,
      },
      surfaceHitCapability: "resolved-exact-triangle",
      surfaceHit: {
        schema: BIM_SURFACE_HIT_SCHEMA,
        status: "resolved",
        coordinateSpace: "projection-local",
        projection: {
          fingerprint: this.#snapshot.source.fingerprint,
          revisionId: this.#snapshot.revisionId,
        },
        identity: {
          expressId: entity.expressId,
          nativeId: entity.nativeId,
          pickId: entity.pickId,
        },
        point,
        normal: [0, 0, 1],
        locator: {
          kind: "triangle-barycentric",
          primitiveId: "primitive:projection:1:0:1",
          triangleIndex: 4,
          barycentric: [0.25, 0.25, 0.5],
        },
        verification: {
          actualGpuDepth: true,
          exactGeometryDigest: true,
          identityBound: true,
          nearestUniqueTriangle: true,
        },
        resources: {
          retainedGeometryBytes: 0,
          temporaryGeometryReleased: true,
        },
        authority: {
          nativeFace: false,
          sourcePrecision: false,
          coordinateReference: false,
          mutation: false,
        },
      },
    };
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#snapshot = null;
    this.#disposed = true;
    return true;
  }
}

class WorkerLease {
  disposed = false;

  async dispose() {
    if (this.disposed) {
      return false;
    }
    this.disposed = true;
    return true;
  }
}

function alignment(snapshot, reference) {
  return createExplicitAlignment({
    sourceRevisionId: snapshot.revisionId,
    sourceCoordinateSystem:
      snapshot.coordinateSystem.source,
    federationCoordinateSystem: "federation-local",
    sourceToFederation: IDENTITY,
    reference,
  });
}

async function ifcFixture() {
  const artifact = await createWebIfcSourceArtifact(
    new TextEncoder().encode(syntheticMappedIfc()),
    { profile: "ReferenceView_V1.2" },
  );
  const source = createBimModelSource(artifact);
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  return { source, session, snapshot };
}

async function glbFixture(secondNodeX = 3) {
  const source = await createGltfReferenceSource(
    syntheticGlbBytes({ secondNodeX }),
  );
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  return { source, session, snapshot };
}

function slots(ifc, glb, lifecycleOwnership = "borrowed") {
  return [
    {
      federationSourceId: "source-slot:a-reference",
      sourceRole: "geometric-reference",
      lifecycleOwnership,
      session: glb.session,
      snapshot: glb.snapshot,
      alignment: alignment(
        glb.snapshot,
        "qualification:reference-identity",
      ),
      discipline: "reference",
      owner: "external-reference",
    },
    {
      federationSourceId: "source-slot:z-semantic",
      sourceRole: "semantic-base",
      lifecycleOwnership,
      session: ifc.session,
      snapshot: ifc.snapshot,
      alignment: alignment(
        ifc.snapshot,
        "qualification:semantic-identity",
      ),
      discipline: "architecture",
      owner: "external-bim",
    },
  ];
}

async function disposeFixture(fixture) {
  await fixture.session.dispose();
  await fixture.source.dispose();
}

function nativeSelection(slotId, snapshot, entity) {
  return {
    federationSourceId: slotId,
    sourceRevisionId: snapshot.revisionId,
    nativeIdentity: entity.nativeId === undefined
      ? {
        expressId: entity.expressId,
        globalId: entity.globalId,
        externalIdentityToken: entity.externalIdentityToken,
      }
      : {
        nativeId: entity.nativeId,
        globalId: null,
        externalIdentityToken: entity.externalIdentityToken,
      },
    occurrencePath: [],
  };
}

test("federated Surface opens source-scoped semantics and preserves borrowed sessions", async () => {
  const ifc = await ifcFixture();
  const glb = await glbFixture();
  const surface = createFederatedBimSurface({
    renderer: createBounded3dRenderer({
      backend: createHeadless3dBackend(),
      limits: {
        maximumFirstFrameRanges: 2,
      },
    }),
  });
  try {
    const opened = await surface.open({
      federationId: "federation:surface-borrowed",
      sources: slots(ifc, glb),
    });

    assert.equal(opened.contract, BIM_FEDERATED_SURFACE_CONTRACT);
    assert.equal(opened.projection.sourceCount, 2);
    assert.deepEqual(
      opened.sources.map((source) => source.sourceRole),
      ["geometric-reference", "semantic-base"],
    );
    assert.equal(opened.sources[0].semanticAvailable, false);
    assert.equal(opened.sources[1].semanticAvailable, true);
    assert.ok(Object.values(opened.authority).every((value) => !value));
    const search = await surface.search({
      federationSourceId: "source-slot:z-semantic",
      query: "wall",
    });
    assert.equal(search.items.length, 2);
    assert.throws(
      () => surface.getSemanticExplorer(
        "source-slot:a-reference",
      ),
      /no admitted bounded semantic projection/u,
    );

    const disposed = await surface.dispose();
    assert.equal(disposed.status, "disposed");
    assert.ok(disposed.cleanup.sourceReceipts.every((receipt) =>
      receipt.lifecycleOwnership === "borrowed" &&
      receipt.resources.every((resource) => !resource.released)));
    assert.equal(
      (await ifc.session.getSnapshot()).revisionId,
      ifc.snapshot.revisionId,
    );
    assert.equal(
      (await glb.session.getSnapshot()).revisionId,
      glb.snapshot.revisionId,
    );
    assert.equal(await surface.dispose(), false);
  } finally {
    await disposeFixture(ifc);
    await disposeFixture(glb);
  }
});

test("federated Surface keeps source-local anchors scoped across one-source refresh", async () => {
  const ifc = await ifcFixture();
  const glb = await glbFixture();
  const replacement = await glbFixture(4);
  const backend = new PickableBackend();
  const surface = createFederatedBimSurface({
    renderer: createBounded3dRenderer({
      backend,
      limits: {
        maximumFirstFrameRanges: 2,
      },
    }),
  });
  try {
    await surface.open({
      federationId: "federation:surface-refresh",
      sources: slots(ifc, glb),
    });
    const referencePick = await surface.pick({ x: 1, y: 1 });
    assert.equal(
      referencePick.federationSourceId,
      "source-slot:a-reference",
    );
    const unsupported = await surface.createAnchor({
      pick: referencePick,
    });
    assert.equal(unsupported.status, "unsupported");
    assert.equal(
      unsupported.diagnostic,
      "source-local-surface-hit-unavailable",
    );
    const referenceAnchor = (await surface.createAnchor({
      pick: referencePick,
      sourceLocalHit: {
        coordinateSpace: "source-local",
        point: [0, 0, 0],
        normal: [0, 0, 1],
      },
      stability: "point-only",
    })).anchor;

    const semanticPick = await surface.pick({ x: 2, y: 2 });
    assert.equal(
      semanticPick.federationSourceId,
      "source-slot:z-semantic",
    );
    const semanticAnchor = (await surface.createAnchor({
      pick: semanticPick,
      sourceLocalHit: {
        coordinateSpace: "source-local",
        point: [0, 0, 0],
        normal: [0, 1, 0],
      },
      stability: "point-only",
    })).anchor;

    const glbEntity = glb.snapshot.entities[0];
    const ifcEntity = ifc.snapshot.entities.find((entity) =>
      entity.renderable === true);
    const selection = surface.createSelection({
      items: [
        nativeSelection(
          "source-slot:a-reference",
          glb.snapshot,
          glbEntity,
        ),
        nativeSelection(
          "source-slot:z-semantic",
          ifc.snapshot,
          ifcEntity,
        ),
      ],
    });
    assert.equal(selection.items.length, 2);
    surface.saveView({
      viewId: "view:before-reference-refresh",
      camera: { projection: "perspective" },
    });

    const refreshed = await surface.refreshSource({
      federationSourceId: "source-slot:a-reference",
      expectedRevisionId: glb.snapshot.revisionId,
      session: replacement.session,
      snapshot: replacement.snapshot,
      alignment: alignment(
        replacement.snapshot,
        "qualification:replacement-identity",
      ),
      lifecycleOwnership: "borrowed",
    });

    assert.equal(
      refreshed.schema,
      BIM_FEDERATED_SURFACE_REFRESH_SCHEMA,
    );
    assert.deepEqual(refreshed.invalidated, {
      selectionItems: 1,
      anchors: 1,
      savedViews: 1,
    });
    assert.equal(surface.state.selection.items.length, 1);
    assert.equal(
      surface.state.selection.items[0].federationSourceId,
      "source-slot:z-semantic",
    );
    assert.deepEqual(surface.state.anchors, {
      active: 1,
      stale: 1,
    });
    assert.deepEqual(surface.state.savedViews, {
      active: 0,
      stale: 1,
    });
    assert.equal(
      (await surface.evaluateAnchor(referenceAnchor)).status,
      "stale",
    );
    assert.equal(
      (await surface.evaluateAnchor(semanticAnchor)).status,
      "current",
    );
    assert.equal(backend.state.mounts, 2);

    await surface.dispose();
    assert.equal(
      (await replacement.session.getSnapshot()).revisionId,
      replacement.snapshot.revisionId,
    );
  } finally {
    await disposeFixture(ifc);
    await disposeFixture(glb);
    await disposeFixture(replacement);
  }
});

test("federated Surface converts verified projection hits into source-local anchors", async () => {
  const glb = await glbFixture();
  const renderer = new VerifiedSurfaceHitRenderer();
  const surface = createFederatedBimSurface({ renderer });
  const sourceToFederation = [
    2, 0, 0, 0,
    0, 3, 0, 0,
    0, 0, -4, 0,
    10, 20, 30, 1,
  ];
  try {
    await surface.open({
      federationId: "federation:verified-surface-hit",
      sources: [{
        federationSourceId: "source-slot:reference",
        sourceRole: "geometric-reference",
        lifecycleOwnership: "borrowed",
        session: glb.session,
        snapshot: glb.snapshot,
        alignment: createExplicitAlignment({
          sourceRevisionId: glb.snapshot.revisionId,
          sourceCoordinateSystem:
            glb.snapshot.coordinateSystem.source,
          federationCoordinateSystem: "federation-local",
          sourceToFederation,
          reference: "test:reflected-nonuniform-placement",
        }),
      }],
    });

    const pick = await surface.pick({ x: 4, y: 5 });
    assert.equal(pick.anchorCapability, "source-local-surface-hit");
    const result = await surface.createAnchor({ pick });
    assert.equal(result.status, "created");
    assert.deepEqual(result.anchor.hit.point, [1, 2, 3]);
    assert.deepEqual(result.anchor.hit.normal, [0, 0, 1]);
    assert.equal(result.anchor.stability, "derived");
    assert.deepEqual(result.anchor.locator, {
      kind: "triangle-barycentric",
      primitiveId: "primitive:projection:1:0:1",
      triangleIndex: 4,
      barycentric: [0.25, 0.25, 0.5],
    });
    assert.ok(
      Object.values(result.anchor.authority).every((value) => !value),
    );
    assert.equal(
      (await surface.evaluateAnchor(result.anchor)).status,
      "current",
    );
  } finally {
    await surface.dispose();
    await disposeFixture(glb);
  }
});

test("single-source open failure releases only transferred resources", async () => {
  const ifc = await ifcFixture();
  const workerLease = new WorkerLease();
  const renderer = new FailingRenderer();
  const surface = createFederatedBimSurface({ renderer });
  try {
    const source = {
      federationSourceId: "source-slot:z-semantic",
      sourceRole: "semantic-base",
      lifecycleOwnership: "transferred",
      session: ifc.session,
      snapshot: ifc.snapshot,
      alignment: alignment(
        ifc.snapshot,
        "qualification:single-source-identity",
      ),
      discipline: "architecture",
      owner: "external-bim",
      workerLease,
    };

    await assert.rejects(
      surface.open({
        federationId: "federation:single-source-failure",
        sources: [source],
      }),
      /intentional renderer mount failure/u,
    );
    assert.equal(surface.state.lifecycle, "failed");
    assert.equal(renderer.disposed, true);
    assert.equal(workerLease.disposed, true);
    assert.equal(ifc.source.state.sessionDisposed, true);
    assert.equal(await surface.dispose(), false);
  } finally {
    await ifc.source.dispose();
  }
});
