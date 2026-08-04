import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createWebIfcSourceArtifact,
} from "../../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../../packages/bim-model-source/src/index.mjs";
import {
  syntheticMappedIfc,
} from "../../scripts/generate-synthetic-ifc.mjs";

function mappedBytes() {
  return new TextEncoder().encode(syntheticMappedIfc());
}

function multiGeometryBytes() {
  const rewrites = [
    [
      "#41=IFCMAPPEDITEM(#34,#36);",
      "#41=IFCEXTRUDEDAREASOLID(#30,#11,#31,2.);",
    ],
    [
      "#42=IFCSHAPEREPRESENTATION(#12,'Body'," +
        "'MappedRepresentation',(#41));",
      "#42=IFCSHAPEREPRESENTATION(#12,'Body'," +
        "'SweptSolid',(#41));",
    ],
  ];
  let fixture = syntheticMappedIfc();
  for (const [from, to] of rewrites) {
    if (!fixture.includes(from)) {
      throw new Error(`multi-geometry rewrite is unavailable: ${from}`);
    }
    fixture = fixture.replace(from, to);
  }
  return new TextEncoder().encode(fixture);
}

function requestContext(snapshot) {
  return {
    protocolVersion: snapshot.protocolVersion,
    sessionId: snapshot.sessionId,
    sourceId: snapshot.sourceId,
    revisionId: snapshot.revisionId,
    snapshotId: snapshot.snapshotId,
    layerId: snapshot.layerId,
  };
}

test("web-ifc artifact preserves shared geometry, tree, and semantics", async () => {
  const artifact = await createWebIfcSourceArtifact(mappedBytes(), {
    profile: "ReferenceView_V1.2",
  });

  assert.deepEqual(artifact.adapter.cleanup, {
    modelClosed: true,
    engineDisposed: true,
  });
  assert.deepEqual(artifact.geometry, {
    products: 2,
    renderableProducts: 2,
    nonRenderableProducts: 0,
    placements: 2,
    primitives: 2,
    uniqueGeometries: 1,
    emptyUniqueGeometries: 0,
    skippedEmptyGeometries: 0,
    vertices: 34,
    instancedVertices: 68,
    triangles: 24,
    bounds: {
      min: [0, 0.9, 0],
      max: [4, 5.1, 3],
    },
  });
  assert.deepEqual(artifact.resources, {
    limits: {
      maximumSourceBytes: 67_108_864,
      maximumProducts: 100_000,
      maximumGeometryBytes: 268_435_456,
      maximumRangeBytes: 4_194_304,
      maximumRanges: 4_096,
      maximumRelationEntries: 500_000,
      maximumTreeNodes: 200_000,
      maximumMetadataBytes: 67_108_864,
    },
    observed: {
      sourceBytes: 4_028,
      geometryBytes: 996,
      ranges: 1,
      largestRangeBytes: 996,
      metadataBytes: 2_886,
      products: 2,
      relationEntries: 12,
      treeNodes: 7,
    },
  });
  assert.equal(artifact.tree.roots.length, 1);
  assert.deepEqual(
    artifact.tree.nodes.map((node) => [
      node.expressId,
      node.parentExpressId,
    ]),
    [
      [13, null],
      [15, 13],
      [17, 15],
      [19, 17],
      [21, 19],
      [40, 19],
      [44, 19],
    ],
  );
  assert.equal(
    artifact.entities[0].primitives[0].slice.offset,
    artifact.entities[1].primitives[0].slice.offset,
  );
  assert.deepEqual(artifact.entities[0].semantics, {
    container: {
      expressId: 19,
      globalId: "0AAAAAAAAAAAAAAAAAAA14",
      ifcClass: "IFCBUILDINGSTOREY",
      name: "Level 01",
    },
    type: {
      expressId: 55,
      globalId: "0AAAAAAAAAAAAAAAAAAA1G",
      ifcClass: "IFCWALLTYPE",
      name: "MappedWallType-01",
    },
    propertySets: [
      "Pset_WallCommon",
      "Pset_WallTypeCommon",
    ],
    quantities: {
      GrossSideArea: 12,
      GrossVolume: 2.4,
      Length: 4,
    },
    materials: ["Concrete"],
    classifications: [
      {
        identification: "BE-WALL",
        name: "Synthetic Wall Class",
        source: "Synthetic Classification",
      },
    ],
  });
  assert.equal(artifact.ranges[0].bytes.byteLength, 996);
  assert.equal(
    new TextDecoder().decode(artifact.ranges[0].bytes.slice(0, 8)),
    "BEXGEO01",
  );
});

test("web-ifc partitions atomic geometry into first and deferred ranges", async () => {
  const artifact = await createWebIfcSourceArtifact(
    multiGeometryBytes(),
    {
      maximumRangeBytes: 996,
      profile: "ReferenceView_V1.2",
    },
  );
  assert.equal(artifact.geometry.products, 2);
  assert.equal(artifact.geometry.uniqueGeometries, 2);
  assert.deepEqual(
    artifact.ranges.map((range) => [
      range.rangeId,
      range.bytes.byteLength,
    ]),
    [
      ["range:ifc:geometry:0", 996],
      ["range:ifc:geometry:1", 996],
    ],
  );
  assert.deepEqual(
    artifact.entities.map((entity) =>
      entity.primitives[0].slice.rangeId),
    [
      "range:ifc:geometry:0",
      "range:ifc:geometry:1",
    ],
  );
  assert.equal(artifact.resources.observed.geometryBytes, 1_992);
  assert.equal(artifact.resources.observed.ranges, 2);
  assert.equal(artifact.resources.observed.largestRangeBytes, 996);

  const source = createBimModelSource(artifact, {
    maximumRequestBytes: 996,
  });
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  assert.deepEqual(snapshot.loadPlan, {
    firstFrameRangeIds: ["range:ifc:geometry:0"],
    deferredRangeIds: ["range:ifc:geometry:1"],
  });
  const [first, deferred] = snapshot.layers[0].rangeHandles;
  assert.equal(
    (await session.readRange(first, 0, first.byteLength)).byteLength,
    996,
  );
  assert.equal(source.state.remainingReadBytes, 996);
  assert.equal(
    (await session.readRange(
      deferred,
      0,
      deferred.byteLength,
    )).byteLength,
    996,
  );
  assert.equal(source.state.remainingReadBytes, 0);
  await session.dispose();
  await source.dispose();
});

test("BimModelSource binds tree, entity, render, and pick to one revision", async () => {
  const artifact = await createWebIfcSourceArtifact(mappedBytes(), {
    profile: "ReferenceView_V1.2",
  });
  const source = createBimModelSource(artifact, {
    maximumRequestBytes: 128,
  });
  artifact.ranges[0].bytes.fill(0);
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const context = requestContext(snapshot);
  const wall = snapshot.entities[0];
  const treeWall = snapshot.tree.nodes.find(
    (node) => node.expressId === wall.expressId,
  );

  assert.equal(snapshot.sequence, 0);
  assert.equal(snapshot.source.fingerprint, source.sourceFingerprint);
  assert.match(snapshot.revisionId, /^source-snapshot:sha256:/u);
  assert.match(snapshot.cacheFingerprint, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(treeWall.globalId, wall.globalId);
  assert.equal(treeWall.renderId, wall.renderId);
  assert.equal(treeWall.pickId, wall.pickId);
  for (const identity of [
    { expressId: wall.expressId },
    { globalId: wall.globalId },
    { renderId: wall.renderId },
    { pickId: wall.pickId },
  ]) {
    assert.equal(
      (await session.getEntity({ ...context, ...identity })).expressId,
      wall.expressId,
    );
  }
  const picked = await session.resolvePick({
    ...context,
    renderId: wall.renderId,
    pickId: wall.pickId,
  });
  assert.deepEqual(
    {
      expressId: picked.expressId,
      globalId: picked.globalId,
      externalIdentityToken: picked.externalIdentityToken,
    },
    {
      expressId: wall.expressId,
      globalId: wall.globalId,
      externalIdentityToken:
        `ifc-globalid:${source.sourceFingerprint}:${wall.globalId}`,
    },
  );

  const handle = snapshot.layers[0].rangeHandles[0];
  await assert.rejects(
    session.readRange(
      {
        ...handle,
        maximumRequestBytes: handle.byteLength,
      },
      0,
      129,
    ),
    /range handle is outside the snapshot/u,
  );
  const chunks = [];
  for (let offset = 0; offset < handle.byteLength;) {
    const length = Math.min(
      handle.maximumRequestBytes,
      handle.byteLength - offset,
    );
    chunks.push(await session.readRange(handle, offset, length));
    offset += length;
  }
  const geometryBytes = Buffer.concat(chunks);
  assert.equal(geometryBytes.byteLength, handle.byteLength);
  assert.equal(
    createHash("sha256").update(geometryBytes).digest("hex"),
    handle.sha256,
  );
  await assert.rejects(
    session.readRange(handle, 0, 1),
    /read budget is exhausted/u,
  );
  await assert.rejects(
    session.getEntity({
      ...context,
      revisionId: `${snapshot.revisionId}:stale`,
      expressId: wall.expressId,
    }),
    /revisionId is outside the snapshot/u,
  );
  await assert.rejects(
    session.resolvePick({
      ...context,
      renderId: snapshot.entities[1].renderId,
      pickId: wall.pickId,
    }),
    /pick identity is outside the snapshot/u,
  );
  assert.deepEqual(source.state, {
    opened: true,
    sessionDisposed: false,
    disposed: false,
    rangeReads: 8,
    rangeBytesRead: 996,
    remainingReadBytes: 0,
    entityReads: 4,
    pickResolutions: 1,
  });
  assert.equal(await session.dispose(), true);
  assert.equal(await session.dispose(), false);
  await assert.rejects(session.getSnapshot(), /session is disposed/u);
  assert.equal(await source.dispose(), true);
  assert.equal(await source.dispose(), false);
});

test("BimModelSource pages tree, search, and typed relations", async () => {
  const artifact = await createWebIfcSourceArtifact(mappedBytes(), {
    profile: "ReferenceView_V1.2",
  });
  const source = createBimModelSource(artifact);
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const context = requestContext(snapshot);

  const storeyChildren = await session.queryTree({
    ...context,
    parentExpressId: 19,
    limit: 10,
  });
  assert.equal(
    storeyChildren.schema,
    "bim-explorer-bim-source-semantic-query-result/0.1",
  );
  assert.deepEqual(
    storeyChildren.items.map((item) => [
      item.expressId,
      item.parentRelation,
    ]),
    [
      [21, "decomposition"],
      [40, "spatial-containment"],
      [44, "spatial-containment"],
    ],
  );
  assert.equal(storeyChildren.page.hasMore, false);

  const firstSearchPage = await session.searchEntities({
    ...context,
    query: "wall",
    limit: 1,
  });
  const secondSearchPage = await session.searchEntities({
    ...context,
    query: "wall",
    limit: 1,
    cursor: firstSearchPage.page.nextCursor,
  });
  assert.equal(firstSearchPage.page.total, 2);
  assert.equal(firstSearchPage.page.remaining, 1);
  assert.equal(firstSearchPage.items[0].expressId, 40);
  assert.equal(secondSearchPage.items[0].expressId, 44);
  assert.equal(secondSearchPage.page.nextCursor, null);
  await assert.rejects(
    session.searchEntities({
      ...context,
      query: "Concrete",
      limit: 1,
      cursor: firstSearchPage.page.nextCursor,
    }),
    /cursor is stale or mismatched/u,
  );

  const propertySearch = await session.searchEntities({
    ...context,
    query: "Pset_WallCommon",
    limit: 10,
  });
  assert.equal(propertySearch.page.total, 2);
  assert.deepEqual(
    propertySearch.items[0].matchedFields,
    ["propertySet"],
  );

  const wallRelations = await session.queryRelations({
    ...context,
    expressId: 40,
    limit: 100,
  });
  assert.ok(wallRelations.items.some((relation) =>
    relation.kind === "spatial-container" &&
    relation.target.expressId === 19));
  assert.ok(wallRelations.items.some((relation) =>
    relation.kind === "type-definition" &&
    relation.target.expressId === 55));
  assert.ok(wallRelations.items.some((relation) =>
    relation.kind === "property-set" &&
    relation.name === "Pset_WallCommon"));
  assert.ok(wallRelations.items.some((relation) =>
    relation.kind === "quantity" &&
    relation.name === "GrossVolume" &&
    relation.value === 2.4));
  assert.ok(wallRelations.informationCoverage.unavailable.some(
    (item) =>
      item.capability === "connection-relation" &&
      item.status === "opaque",
  ));

  const typeRelations = await session.queryRelations({
    ...context,
    expressId: 55,
    limit: 10,
  });
  assert.equal(typeRelations.query.identityKind, "type");
  assert.deepEqual(
    typeRelations.items
      .filter((relation) =>
        relation.kind === "typed-occurrence")
      .map((relation) => relation.target.expressId),
    [40, 44],
  );

  await assert.rejects(
    session.queryTree({
      ...context,
      revisionId: `${snapshot.revisionId}:stale`,
      parentExpressId: 19,
    }),
    /revisionId is outside the snapshot/u,
  );
  await session.dispose();
  await source.dispose();
});

test("BimModelSource cache fingerprint is deterministic and path-free", async () => {
  const firstArtifact = await createWebIfcSourceArtifact(mappedBytes(), {
    profile: "ReferenceView_V1.2",
  });
  const secondArtifact = await createWebIfcSourceArtifact(mappedBytes(), {
    profile: "ReferenceView_V1.2",
  });
  const first = createBimModelSource(firstArtifact);
  const second = createBimModelSource(secondArtifact);

  assert.equal(first.sourceFingerprint, second.sourceFingerprint);
  assert.equal(first.revisionId, second.revisionId);
  assert.equal(first.cacheFingerprint, second.cacheFingerprint);
  assert.equal(
    first.sourceFingerprint,
    "sha256:400071d0a99f14ef37c46560bde1651965a378e0586b5f470be3fda81e585243",
  );
  assert.doesNotMatch(
    JSON.stringify({
      sourceFingerprint: first.sourceFingerprint,
      revisionId: first.revisionId,
      cacheFingerprint: first.cacheFingerprint,
    }),
    /\/Volumes\/|\/Users\/|[A-Z]:\\/u,
  );
  await first.dispose();
  await second.dispose();
});

test("non-renderable products keep semantic identity without Render/Pick IDs", async () => {
  const artifact = await createWebIfcSourceArtifact(mappedBytes());
  const entity = artifact.entities[1];
  entity.renderable = false;
  entity.triangles = 0;
  entity.bounds = null;
  entity.primitives = [];
  entity.diagnostics = [
    {
      code: "empty-tessellation",
      geometryExpressId: 9_999,
    },
  ];
  Object.assign(artifact.geometry, {
    renderableProducts: 1,
    nonRenderableProducts: 1,
    primitives: 1,
    emptyUniqueGeometries: 1,
    skippedEmptyGeometries: 1,
    instancedVertices: 34,
    triangles: 12,
  });
  artifact.resources.observed.metadataBytes = new TextEncoder()
    .encode(JSON.stringify({
      tree: artifact.tree,
      entities: artifact.entities,
    }))
    .byteLength;

  const source = createBimModelSource(artifact);
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const context = requestContext(snapshot);
  const nonRenderable = snapshot.entities[1];
  const treeNode = snapshot.tree.nodes.find(
    (node) => node.expressId === nonRenderable.expressId,
  );

  assert.equal(nonRenderable.renderable, false);
  assert.equal(nonRenderable.renderId, null);
  assert.equal(nonRenderable.pickId, null);
  assert.equal(treeNode.renderId, null);
  assert.equal(treeNode.pickId, null);
  assert.equal(
    (await session.getEntity({
      ...context,
      globalId: nonRenderable.globalId,
    })).expressId,
    nonRenderable.expressId,
  );
  await assert.rejects(
    session.resolvePick({
      ...context,
      renderId: null,
      pickId: null,
    }),
    /pick identity is outside the snapshot/u,
  );
  await session.dispose();
  await source.dispose();
});

test("BIM source admission fails closed on limits and malformed artifacts", async () => {
  const bytes = mappedBytes();
  await assert.rejects(
    createWebIfcSourceArtifact(bytes, {
      maximumSourceBytes: bytes.byteLength - 1,
    }),
    /exceeds the configured byte limit/u,
  );
  await assert.rejects(
    createWebIfcSourceArtifact(bytes, {
      maximumGeometryBytes: 995,
    }),
    /geometry exceeds the configured byte limit/u,
  );
  await assert.rejects(
    createWebIfcSourceArtifact(bytes, {
      maximumRangeBytes: 995,
    }),
    /exceeds the configured range byte limit/u,
  );
  await assert.rejects(
    createWebIfcSourceArtifact(multiGeometryBytes(), {
      maximumRangeBytes: 996,
      maximumRanges: 1,
    }),
    /range count limit/u,
  );
  await assert.rejects(
    createWebIfcSourceArtifact(bytes, {
      maximumRelationEntries: 11,
    }),
    /relation index exceeds the configured limit/u,
  );
  await assert.rejects(
    createWebIfcSourceArtifact(bytes, {
      maximumTreeNodes: 6,
    }),
    /spatial tree exceeds the configured node limit/u,
  );
  await assert.rejects(
    createWebIfcSourceArtifact(bytes, {
      maximumMetadataBytes: 2_815,
    }),
    /metadata exceeds the configured byte limit/u,
  );

  const artifact = await createWebIfcSourceArtifact(bytes);
  const badDigest = structuredClone(artifact);
  badDigest.ranges[0].bytes[20] ^= 0xff;
  assert.throws(
    () => createBimModelSource(badDigest),
    /digest does not match/u,
  );

  const badStructure = structuredClone(artifact);
  badStructure.ranges[0].bytes[0] ^= 0xff;
  badStructure.ranges[0].sha256 = createHash("sha256")
    .update(badStructure.ranges[0].bytes)
    .digest("hex");
  assert.throws(
    () => createBimModelSource(badStructure),
    /geometry magic is invalid/u,
  );

  const duplicateIdentity = structuredClone(artifact);
  duplicateIdentity.entities[1].globalId =
    duplicateIdentity.entities[0].globalId;
  assert.throws(
    () => createBimModelSource(duplicateIdentity),
    /GlobalId values must be unique/u,
  );

  const staleSlice = structuredClone(artifact);
  staleSlice.entities[0].primitives[0].slice.byteLength =
    staleSlice.ranges[0].bytes.byteLength;
  assert.throws(
    () => createBimModelSource(staleSlice),
    /slice exceeds/u,
  );
});
