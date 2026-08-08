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
  BIM_FEDERATED_RENDERER_PROJECTION_SCHEMA,
  createExplicitAlignment,
  createFederatedRendererProjection,
  createProjectedCrsAlignment,
  createUnalignedSource,
} from "../../packages/bim-federation/src/index.mjs";
import {
  createGltfReferenceSource,
} from "../../packages/gltf-reference-source/src/index.mjs";
import {
  syntheticGeoreferencedIfc,
} from "../../scripts/generate-synthetic-ifc.mjs";
import {
  syntheticGlbBytes,
} from "../../scripts/generate-synthetic-gltf.mjs";

const IDENTITY = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

async function fixtures() {
  const ifcArtifact = await createWebIfcSourceArtifact(
    new TextEncoder().encode(syntheticGeoreferencedIfc()),
    { profile: "ReferenceView_V1.2" },
  );
  const ifcSource = createBimModelSource(ifcArtifact);
  const ifcSession = await ifcSource.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const ifcSnapshot = await ifcSession.getSnapshot();
  const gltfSource = await createGltfReferenceSource(
    syntheticGlbBytes(),
  );
  const gltfSession = await gltfSource.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const gltfSnapshot = await gltfSession.getSnapshot();
  return {
    ifc: {
      source: ifcSource,
      session: ifcSession,
      snapshot: ifcSnapshot,
      alignment: createProjectedCrsAlignment({
        snapshot: ifcSnapshot,
        federationCoordinateSystem: "EPSG:32652",
        federationOrigin: [500000, 4100000, 100],
      }),
    },
    gltf: {
      source: gltfSource,
      session: gltfSession,
      snapshot: gltfSnapshot,
      alignment: createExplicitAlignment({
        sourceRevisionId: gltfSnapshot.revisionId,
        sourceCoordinateSystem: "gltf-local-meter-y-up",
        federationCoordinateSystem: "federation-local",
        sourceToFederation: [
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          8, 0, 0, 1,
        ],
        reference: "qualification:generated-reference-offset",
      }),
    },
  };
}

async function disposeFixtures(current) {
  await current.ifc.session.dispose();
  await current.ifc.source.dispose();
  await current.gltf.session.dispose();
  await current.gltf.source.dispose();
}

function projectionSources(current) {
  return [
    {
      federationSourceId: "source-slot:architecture",
      ...current.ifc,
    },
    {
      federationSourceId: "source-slot:reference",
      ...current.gltf,
    },
  ];
}

test("federated renderer mounts aligned IFC and GLB in one frame", async () => {
  const current = await fixtures();
  let projection;
  let renderer;
  try {
    projection = await createFederatedRendererProjection({
      federationId: "federation:renderer-test",
      sources: projectionSources(current),
    });
    assert.equal(
      projection.schema,
      BIM_FEDERATED_RENDERER_PROJECTION_SCHEMA,
    );
    assert.equal(projection.snapshot.geometry.sources, 2);
    assert.equal(projection.snapshot.geometry.entities, 4);
    assert.equal(projection.snapshot.geometry.instances, 4);
    assert.equal(
      projection.snapshot.loadPlan.firstFrameRangeIds.length,
      2,
    );
    assert.deepEqual(projection.snapshot.federation.limits, {
      maximumSources: 8,
      maximumEntities: 100_000,
      maximumInstances: 100_000,
    });
    assert.deepEqual(
      projection.snapshot.coordinateSystem.sourceFromStorage,
      IDENTITY,
    );
    assert.equal(
      new Set(
        projection.identityMap.map((entry) =>
          entry.compositeNativeId),
      ).size,
      4,
    );
    assert.deepEqual(
      [...new Set(
        projection.identityMap.map((entry) =>
          entry.federationSourceId),
      )],
      ["source-slot:architecture", "source-slot:reference"],
    );

    const backend = createHeadless3dBackend();
    renderer = createBounded3dRenderer({
      backend,
      limits: {
        maximumFirstFrameRanges: 2,
      },
    });
    const mount = await renderer.mount({
      session: projection.session,
      snapshot: projection.snapshot,
    });
    assert.equal(mount.metrics.geometryRecords, 2);
    assert.equal(mount.metrics.instances, 4);
    assert.equal(mount.metrics.uniqueTriangles, 13);
    assert.equal(mount.metrics.instancedTriangles, 26);
    assert.equal(mount.backend.rendered, false);
    assert.equal(projection.session.state.rangeReads, 2);
    const release = await renderer.unmount();
    assert.equal(release.released, true);
    assert.equal(await renderer.dispose(), true);
    assert.equal(await projection.session.dispose(), true);
    assert.equal(projection.session.state.ownsSourceSessions, false);
    assert.equal(
      (await current.ifc.session.getSnapshot()).revisionId,
      current.ifc.snapshot.revisionId,
    );
    assert.equal(
      (await current.gltf.session.getSnapshot()).revisionId,
      current.gltf.snapshot.revisionId,
    );

    const reordered = await createFederatedRendererProjection({
      federationId: "federation:renderer-test",
      sources: projectionSources(current).reverse(),
    });
    assert.equal(
      reordered.snapshot.source.fingerprint,
      projection.snapshot.source.fingerprint,
    );
    assert.equal(await reordered.session.dispose(), true);
  } finally {
    if (renderer?.state.disposed === false) {
      await renderer.dispose();
    }
    if (projection?.session.state.disposed === false) {
      await projection.session.dispose();
    }
    await disposeFixtures(current);
  }
});

test("federated renderer rejects unaligned and duplicate sources", async () => {
  const current = await fixtures();
  try {
    const unaligned = projectionSources(current);
    unaligned[1].alignment = createUnalignedSource({
      sourceRevisionId: current.gltf.snapshot.revisionId,
      reason: "no shared coordinate evidence",
    });
    await assert.rejects(
      createFederatedRendererProjection({
        federationId: "federation:unaligned-test",
        sources: unaligned,
      }),
      /must be explicitly aligned/u,
    );

    const duplicate = projectionSources(current);
    duplicate[1].federationSourceId =
      duplicate[0].federationSourceId;
    await assert.rejects(
      createFederatedRendererProjection({
        federationId: "federation:duplicate-test",
        sources: duplicate,
      }),
      /source ID is duplicated/u,
    );

    await assert.rejects(
      createFederatedRendererProjection({
        federationId: "federation:bounded-test",
        sources: projectionSources(current),
        maximumEntities: 3,
      }),
      /exceeds its entity or instance bound/u,
    );
  } finally {
    await disposeFixtures(current);
  }
});
