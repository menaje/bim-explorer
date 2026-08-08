import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import {
  createWebIfcSourceArtifact,
} from "../../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../../packages/bim-model-source/src/index.mjs";
import {
  BIM_FEDERATION_SAVED_VIEW_SCHEMA,
  BIM_FEDERATION_SELECTION_SCHEMA,
  createBimFederation,
  createExplicitAlignment,
  createProjectedCrsAlignment,
  createUnalignedSource,
  getReferenceFormatCapability,
  getReferenceFormatRegistry,
} from "../../packages/bim-federation/src/index.mjs";
import {
  syntheticGeoreferencedIfc,
} from "../../scripts/generate-synthetic-ifc.mjs";
import {
  createBimFederationBrowserProbeServer,
} from "../../scripts/serve-bim-federation-browser-probe.mjs";

async function sourceFixture(label) {
  const sourceText = syntheticGeoreferencedIfc().replace(
    "synthetic-mapped.ifc",
    `federation-${label}.ifc`,
  );
  const artifact = await createWebIfcSourceArtifact(
    new TextEncoder().encode(sourceText),
    { profile: "ReferenceView_V1.2" },
  );
  const source = createBimModelSource(artifact);
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const wall = snapshot.entities.find(
    (entity) => entity.expressId === 40,
  );
  return {
    source,
    session,
    snapshot,
    wall,
    alignment: createProjectedCrsAlignment({
      snapshot,
      federationCoordinateSystem: "EPSG:32652",
      federationOrigin: [500000, 4100000, 100],
    }),
  };
}

function selectionItem(federationSourceId, current) {
  return {
    federationSourceId,
    sourceRevisionId: current.snapshot.revisionId,
    nativeIdentity: {
      expressId: current.wall.expressId,
      globalId: current.wall.globalId,
      externalIdentityToken:
        current.wall.externalIdentityToken,
    },
  };
}

function camera() {
  return {
    projection: "perspective",
    position: [20, 15, 10],
    target: [0, 0, 0],
    up: [0, 0, 1],
    sectionPlanes: [],
  };
}

async function disposeFixture(current) {
  await current.session.dispose();
  await current.source.dispose();
}

test("multi-IFC federation keeps duplicate GlobalIds source-bound", async () => {
  const architecture = await sourceFixture("architecture");
  const mechanical = await sourceFixture("mechanical");
  const federation = createBimFederation({
    federationId: "federation:synthetic-campus",
  });

  federation.addIfcSource({
    federationSourceId: "source-slot:architecture",
    snapshot: architecture.snapshot,
    discipline: "architecture",
    owner: "external-document:architecture",
    alignment: architecture.alignment,
  });
  federation.addIfcSource({
    federationSourceId: "source-slot:mechanical",
    snapshot: mechanical.snapshot,
    discipline: "mechanical",
    owner: "external-document:mechanical",
    alignment: mechanical.alignment,
  });
  const descriptor = federation.getDescriptor();
  assert.equal(descriptor.sources.length, 2);
  assert.notEqual(
    descriptor.sources[0].nativeDocument.fingerprint,
    descriptor.sources[1].nativeDocument.fingerprint,
  );
  assert.equal(
    architecture.wall.globalId,
    mechanical.wall.globalId,
  );
  assert.ok(
    descriptor.sources.every(
      (source) =>
        source.identityPolicy.mergeAcrossSources === false,
    ),
  );

  const selection = federation.createSelection({
    items: [
      selectionItem(
        "source-slot:architecture",
        architecture,
      ),
      selectionItem(
        "source-slot:mechanical",
        mechanical,
      ),
    ],
  });
  assert.equal(
    selection.schema,
    BIM_FEDERATION_SELECTION_SCHEMA,
  );
  assert.equal(selection.items.length, 2);
  assert.notEqual(
    selection.items[0].key,
    selection.items[1].key,
  );
  assert.equal(
    selection.identityPolicy.mergeAcrossSources,
    false,
  );

  const origin = federation.transformPoint({
    federationSourceId: "source-slot:architecture",
    sourceRevisionId: architecture.snapshot.revisionId,
    point: [0, 0, 0],
  });
  assert.deepEqual(origin, [0, 0, 0]);

  federation.setSourceVisibility({
    federationSourceId: "source-slot:mechanical",
    sourceRevisionId: mechanical.snapshot.revisionId,
    visible: false,
  });
  const savedView = federation.createSavedView({
    viewId: "view:cross-source-review",
    camera: camera(),
    selection,
  });
  assert.equal(
    savedView.schema,
    BIM_FEDERATION_SAVED_VIEW_SCHEMA,
  );
  assert.deepEqual(
    savedView.sourceStates.map((source) => source.visible),
    [true, false],
  );
  assert.equal(savedView.selection.items.length, 2);

  const receipt = await federation.dispose();
  assert.equal(receipt.releasedSources, 2);
  await disposeFixture(architecture);
  await disposeFixture(mechanical);
});

test("partial, stale and incremental refresh invalidate one source revision", async () => {
  const architecture = await sourceFixture("architecture-refresh");
  const mechanical = await sourceFixture("mechanical-before");
  const refreshed = await sourceFixture("mechanical-after");
  const federation = createBimFederation({
    federationId: "federation:incremental-refresh",
  });
  federation.addIfcSource({
    federationSourceId: "source-slot:architecture",
    snapshot: architecture.snapshot,
    discipline: "architecture",
    owner: "external-document:architecture",
    alignment: architecture.alignment,
  });
  federation.addIfcSource({
    federationSourceId: "source-slot:mechanical",
    snapshot: mechanical.snapshot,
    discipline: "mechanical",
    owner: "external-document:mechanical",
    alignment: mechanical.alignment,
  });
  federation.setSourceState({
    federationSourceId: "source-slot:mechanical",
    sourceRevisionId: mechanical.snapshot.revisionId,
    state: "partial",
    reason: "bounded ranges are still loading",
  });
  assert.equal(
    federation.getDescriptor().sources.find(
      (source) =>
        source.federationSourceId ===
        "source-slot:mechanical",
    ).state,
    "partial",
  );
  federation.setSourceState({
    federationSourceId: "source-slot:mechanical",
    sourceRevisionId: mechanical.snapshot.revisionId,
    state: "stale",
    reason: "a newer external document revision is available",
  });

  const selection = federation.createSelection({
    items: [
      selectionItem(
        "source-slot:architecture",
        architecture,
      ),
      selectionItem(
        "source-slot:mechanical",
        mechanical,
      ),
    ],
  });
  const savedView = federation.createSavedView({
    viewId: "view:before-refresh",
    camera: camera(),
    selection,
  });
  const receipt = federation.refreshIfcSource({
    federationSourceId: "source-slot:mechanical",
    expectedRevisionId: mechanical.snapshot.revisionId,
    snapshot: refreshed.snapshot,
    alignment: refreshed.alignment,
  });
  assert.equal(receipt.unchangedFederationSources, 1);
  assert.equal(
    receipt.priorIdentityPolicy,
    "all-prior-source-selections-are-stale",
  );
  assert.throws(
    () => federation.applySavedView(savedView),
    /revision is stale or unavailable/u,
  );
  assert.throws(
    () => federation.createSelection({
      items: [
        selectionItem(
          "source-slot:mechanical",
          mechanical,
        ),
      ],
    }),
    /revision is stale or unavailable/u,
  );
  const descriptor = federation.getDescriptor();
  assert.equal(descriptor.sources.length, 2);
  assert.equal(
    descriptor.sources.find(
      (source) =>
        source.federationSourceId ===
        "source-slot:architecture",
    ).nativeDocument.revisionId,
    architecture.snapshot.revisionId,
  );
  assert.equal(
    descriptor.sources.find(
      (source) =>
        source.federationSourceId ===
        "source-slot:mechanical",
    ).nativeDocument.revisionId,
    refreshed.snapshot.revisionId,
  );

  await federation.dispose();
  await disposeFixture(architecture);
  await disposeFixture(mechanical);
  await disposeFixture(refreshed);
});

test("coordinate alignment is explicit and never claims datum conversion", async () => {
  const current = await sourceFixture("coordinate-policy");
  assert.equal(current.alignment.numericPrecision, "float64");
  assert.equal(
    current.alignment.datumTransformation,
    "not-performed",
  );
  assert.throws(
    () => createProjectedCrsAlignment({
      snapshot: current.snapshot,
      federationCoordinateSystem: "EPSG:3857",
      federationOrigin: [0, 0, 0],
    }),
    /one exact mapped CRS/u,
  );
  const explicit = createExplicitAlignment({
    sourceRevisionId: current.snapshot.revisionId,
    sourceCoordinateSystem: "source-local",
    federationCoordinateSystem: "federation-local",
    sourceToFederation: [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      10, 20, 30, 1,
    ],
    reference: "user-confirmed-control-point-set:synthetic",
  });
  assert.equal(explicit.method, "explicit");
  assert.equal(
    explicit.provenance.kind,
    "explicit-user-input",
  );

  const federation = createBimFederation({
    federationId: "federation:unaligned-policy",
  });
  federation.addIfcSource({
    federationSourceId: "source-slot:local-only",
    snapshot: current.snapshot,
    discipline: "architecture",
    owner: "external-document:local-only",
    alignment: createUnalignedSource({
      sourceRevisionId: current.snapshot.revisionId,
      reason: "source has no admitted shared coordinate evidence",
    }),
  });
  assert.throws(
    () => federation.transformPoint({
      federationSourceId: "source-slot:local-only",
      sourceRevisionId: current.snapshot.revisionId,
      point: [0, 0, 0],
    }),
    /no shared coordinate/u,
  );
  await federation.dispose();
  await disposeFixture(current);
});

test("reference format registry admits only qualified reference profiles", () => {
  const registry = getReferenceFormatRegistry();
  assert.equal(registry.formats.length, 9);
  const ifc = getReferenceFormatCapability("IFC");
  assert.equal(ifc.admitted, true);
  assert.match(ifc.capabilities.view, /^qualified-/u);
  assert.match(ifc.capabilities.write, /^blocked-/u);
  assert.match(ifc.capabilities.roundTrip, /^blocked-/u);

  for (const format of ["gltf", "glb"]) {
    const capability = getReferenceFormatCapability(format);
    assert.equal(capability.admitted, true);
    assert.equal(
      capability.sourceRole,
      "derived-or-reference-mesh",
    );
    assert.match(capability.capabilities.view, /^qualified-/u);
    assert.match(capability.capabilities.write, /^blocked-/u);
    assert.match(
      capability.capabilities.roundTrip,
      /^blocked-/u,
    );
  }

  for (const format of [
    "las",
    "laz",
    "e57",
    "3d-tiles",
    "rvt",
    "dgn",
  ]) {
    const capability = getReferenceFormatCapability(format);
    assert.equal(capability.admitted, false);
    assert.notEqual(
      capability.authority.semantics,
      "external-source-document",
    );
    assert.match(capability.capabilities.view, /^held-/u);
    assert.match(capability.capabilities.write, /^blocked-/u);
    assert.match(
      capability.capabilities.roundTrip,
      /^blocked-/u,
    );
  }

  const federation = createBimFederation({
    federationId: "federation:format-gate",
  });
  assert.throws(
    () => federation.addReferenceSource({ format: "las" }),
    /source is held/u,
  );
  assert.throws(
    () => getReferenceFormatCapability("nwd"),
    /not registered/u,
  );
});

test("federation Browser probe serves the complete renderer module graph", async () => {
  const layerId = "federation-probe:test-layer";
  const server = createBimFederationBrowserProbeServer({
    input: {
      schema: "bim-explorer-federation-browser-probe-input/1",
      snapshot: {
        layerId,
        layers: [{ layerId, rangeHandles: [] }],
      },
    },
    ranges: new Map(),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(
      `${origin}/point-cloud-lod.mjs`,
    );
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) =>
        error === undefined ? resolve() : reject(error));
    });
  }
});
