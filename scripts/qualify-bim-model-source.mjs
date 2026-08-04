import { createHash } from "node:crypto";

import {
  createWebIfcSourceArtifact,
} from "../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../packages/bim-model-source/src/index.mjs";
import {
  syntheticMappedIfc,
} from "./generate-synthetic-ifc.mjs";

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

async function rejected(operation, pattern) {
  try {
    await operation();
  } catch (error) {
    if (pattern.test(String(error?.message))) {
      return true;
    }
    throw error;
  }
  return false;
}

function context(snapshot) {
  return {
    protocolVersion: snapshot.protocolVersion,
    sessionId: snapshot.sessionId,
    sourceId: snapshot.sourceId,
    revisionId: snapshot.revisionId,
    snapshotId: snapshot.snapshotId,
    layerId: snapshot.layerId,
  };
}

async function qualify() {
  const bytes = new TextEncoder().encode(syntheticMappedIfc());
  const firstArtifact = await createWebIfcSourceArtifact(bytes, {
    profile: "ReferenceView_V1.2",
  });
  const secondArtifact = await createWebIfcSourceArtifact(bytes, {
    profile: "ReferenceView_V1.2",
  });
  const source = createBimModelSource(firstArtifact, {
    maximumRequestBytes: 128,
  });
  const repeatedSource = createBimModelSource(secondArtifact, {
    maximumRequestBytes: 128,
  });
  const deterministicCacheFingerprint =
    source.cacheFingerprint === repeatedSource.cacheFingerprint;
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const requestContext = context(snapshot);
  const wall = snapshot.entities[0];
  const treeWall = snapshot.tree.nodes.find(
    (node) => node.expressId === wall.expressId,
  );
  const byExpressId = await session.getEntity({
    ...requestContext,
    expressId: wall.expressId,
  });
  const byGlobalId = await session.getEntity({
    ...requestContext,
    globalId: wall.globalId,
  });
  const byRenderId = await session.getEntity({
    ...requestContext,
    renderId: wall.renderId,
  });
  const byPickId = await session.getEntity({
    ...requestContext,
    pickId: wall.pickId,
  });
  const pick = await session.resolvePick({
    ...requestContext,
    renderId: wall.renderId,
    pickId: wall.pickId,
  });
  const firstTreePage = await session.queryTree({
    ...requestContext,
    parentExpressId: 19,
    limit: 1,
  });
  const secondTreePage = await session.queryTree({
    ...requestContext,
    parentExpressId: 19,
    limit: 1,
    cursor: firstTreePage.page.nextCursor,
  });
  const firstSearchPage = await session.searchEntities({
    ...requestContext,
    query: "wall",
    limit: 1,
  });
  const secondSearchPage = await session.searchEntities({
    ...requestContext,
    query: "wall",
    limit: 1,
    cursor: firstSearchPage.page.nextCursor,
  });
  const wallRelations = await session.queryRelations({
    ...requestContext,
    expressId: 40,
    limit: 100,
  });
  const typeRelations = await session.queryRelations({
    ...requestContext,
    expressId: 55,
    limit: 100,
  });
  const semanticCursorMismatchRejected = await rejected(
    () => session.searchEntities({
      ...requestContext,
      query: "Concrete",
      limit: 1,
      cursor: firstSearchPage.page.nextCursor,
    }),
    /cursor is stale or mismatched/u,
  );

  const handle = snapshot.layers[0].rangeHandles[0];
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
  const geometryDigest = createHash("sha256")
    .update(geometryBytes)
    .digest("hex");
  const budgetExhaustionRejected = await rejected(
    () => session.readRange(handle, 0, 1),
    /read budget is exhausted/u,
  );
  const staleRevisionRejected = await rejected(
    () => session.getEntity({
      ...requestContext,
      revisionId: `${snapshot.revisionId}:stale`,
      expressId: wall.expressId,
    }),
    /revisionId is outside the snapshot/u,
  );
  const mismatchedPickRejected = await rejected(
    () => session.resolvePick({
      ...requestContext,
      renderId: snapshot.entities[1].renderId,
      pickId: wall.pickId,
    }),
    /pick identity is outside the snapshot/u,
  );
  const badDigest = structuredClone(firstArtifact);
  badDigest.ranges[0].bytes[20] ^= 0xff;
  const malformedRangeDigestRejected = await rejected(
    () => Promise.resolve(createBimModelSource(badDigest)),
    /digest does not match/u,
  );
  const badStructure = structuredClone(firstArtifact);
  badStructure.ranges[0].bytes[0] ^= 0xff;
  badStructure.ranges[0].sha256 = createHash("sha256")
    .update(badStructure.ranges[0].bytes)
    .digest("hex");
  const malformedRangeStructureRejected = await rejected(
    () => Promise.resolve(createBimModelSource(badStructure)),
    /geometry magic is invalid/u,
  );
  const duplicateIdentity = structuredClone(firstArtifact);
  duplicateIdentity.entities[1].globalId =
    duplicateIdentity.entities[0].globalId;
  const duplicateGlobalIdRejected = await rejected(
    () => Promise.resolve(createBimModelSource(duplicateIdentity)),
    /GlobalId values must be unique/u,
  );
  const sourceSizeLimitRejected = await rejected(
    () => createWebIfcSourceArtifact(bytes, {
      maximumSourceBytes: bytes.byteLength - 1,
    }),
    /exceeds the configured byte limit/u,
  );
  const geometryBudgetRejected = await rejected(
    () => createWebIfcSourceArtifact(bytes, {
      maximumGeometryBytes: 995,
    }),
    /geometry exceeds the configured byte limit/u,
  );
  const rangeByteLimitRejected = await rejected(
    () => createWebIfcSourceArtifact(bytes, {
      maximumRangeBytes: 995,
    }),
    /exceeds the configured range byte limit/u,
  );
  const rangeCountLimitRejected = await rejected(
    () => createWebIfcSourceArtifact(multiGeometryBytes(), {
      maximumRangeBytes: 996,
      maximumRanges: 1,
    }),
    /range count limit/u,
  );
  const relationIndexBudgetRejected = await rejected(
    () => createWebIfcSourceArtifact(bytes, {
      maximumRelationEntries: 11,
    }),
    /relation index exceeds the configured limit/u,
  );
  const treeNodeBudgetRejected = await rejected(
    () => createWebIfcSourceArtifact(bytes, {
      maximumTreeNodes: 6,
    }),
    /spatial tree exceeds the configured node limit/u,
  );
  const metadataBudgetRejected = await rejected(
    () => createWebIfcSourceArtifact(bytes, {
      maximumMetadataBytes: 2_815,
    }),
    /metadata exceeds the configured byte limit/u,
  );

  const sessionDisposed = await session.dispose();
  const sourceDisposed = await source.dispose();
  await repeatedSource.dispose();
  const identityValues = [
    byExpressId,
    byGlobalId,
    byRenderId,
    byPickId,
  ].map((entity) => entity.expressId);
  const identityConverged = identityValues.every(
    (expressId) => expressId === wall.expressId,
  );
  const treeEntityRenderPickIdentity =
    treeWall?.globalId === wall.globalId &&
    treeWall?.renderId === wall.renderId &&
    treeWall?.pickId === wall.pickId &&
    pick.expressId === wall.expressId &&
    pick.globalId === wall.globalId;

  if (
    !deterministicCacheFingerprint ||
    geometryDigest !== handle.sha256 ||
    !budgetExhaustionRejected ||
    !staleRevisionRejected ||
    !mismatchedPickRejected ||
    !malformedRangeDigestRejected ||
    !malformedRangeStructureRejected ||
    !duplicateGlobalIdRejected ||
    !sourceSizeLimitRejected ||
    !geometryBudgetRejected ||
    !rangeByteLimitRejected ||
    !rangeCountLimitRejected ||
    !relationIndexBudgetRejected ||
    !treeNodeBudgetRejected ||
    !metadataBudgetRejected ||
    !semanticCursorMismatchRejected ||
    !identityConverged ||
    !treeEntityRenderPickIdentity ||
    !sessionDisposed ||
    !sourceDisposed
  ) {
    throw new Error("BIM model source qualification did not pass");
  }

  return {
    schema: "bim-explorer-bim-model-source-evidence/0.1",
    asOf: "2026-08-04",
    status: "passed-synthetic-only",
    environment: {
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
    },
    fixture: {
      id: "synthetic-mapped-ifc4",
      kind: "repository-authored-generated",
      artifactCommitted: false,
      thirdPartyContent: false,
      byteLength: bytes.byteLength,
      sha256: firstArtifact.source.sha256,
      ifcSchema: firstArtifact.source.ifcSchema,
      profile: firstArtifact.source.profile,
    },
    adapter: firstArtifact.adapter,
    contract: {
      artifactSchema: firstArtifact.schema,
      sourceProtocol: BIM_SOURCE_PROTOCOL_VERSION,
      geometryMediaType: handle.mediaType,
      viewerCoreConformance: false,
    },
    sourceSnapshot: {
      sourceFingerprint: source.sourceFingerprint,
      revisionId: source.revisionId,
      snapshotId: snapshot.snapshotId,
      cacheFingerprint: source.cacheFingerprint,
      deterministicCacheFingerprint,
      treeNodes: snapshot.tree.nodes.length,
      geometry: snapshot.geometry,
      resources: snapshot.resources,
    },
    geometryRange: {
      byteLength: handle.byteLength,
      sha256: handle.sha256,
      maximumRequestBytes: handle.maximumRequestBytes,
      sessionReadBudgetBytes: source.sessionReadBudgetBytes,
      rangeReads: chunks.length,
      bytesRead: geometryBytes.byteLength,
      digestValidated: geometryDigest === handle.sha256,
      sharedSliceOffset:
        snapshot.entities[0].primitives[0].slice.offset,
    },
    identity: {
      expressId: wall.expressId,
      globalId: wall.globalId,
      renderId: wall.renderId,
      pickId: wall.pickId,
      externalIdentityToken: pick.externalIdentityToken,
      lookupModes: [
        "expressId",
        "globalId",
        "renderId",
        "pickId",
      ],
      lookupsConverged: identityConverged,
      treeEntityRenderPickIdentity,
    },
    semantics: wall.semantics,
    semanticQueries: {
      schema: firstTreePage.schema,
      capabilities: session.descriptor.capabilities.filter(
        (capability) => capability.startsWith("bounded-"),
      ),
      tree: {
        total: firstTreePage.page.total,
        firstExpressId: firstTreePage.items[0].expressId,
        firstParentRelation:
          firstTreePage.items[0].parentRelation,
        secondExpressId: secondTreePage.items[0].expressId,
        secondParentRelation:
          secondTreePage.items[0].parentRelation,
      },
      search: {
        total: firstSearchPage.page.total,
        firstExpressId: firstSearchPage.items[0].expressId,
        secondExpressId: secondSearchPage.items[0].expressId,
        firstRemaining: firstSearchPage.page.remaining,
        finalRemaining: secondSearchPage.page.remaining,
      },
      relations: {
        wallKinds: [
          ...new Set(
            wallRelations.items.map((item) => item.kind),
          ),
        ].sort(),
        typeOccurrences: typeRelations.items
          .filter((item) => item.kind === "typed-occurrence")
          .map((item) => item.target.expressId),
        unavailable: wallRelations.informationCoverage.unavailable,
      },
    },
    failClosed: {
      sourceSizeLimitConfiguredBytes: 64 * 1024 * 1024,
      sourceSizeLimitRejected,
      geometryBudgetRejected,
      rangeByteLimitRejected,
      rangeCountLimitRejected,
      relationIndexBudgetRejected,
      treeNodeBudgetRejected,
      metadataBudgetRejected,
      semanticCursorMismatchRejected,
      budgetExhaustionRejected,
      staleRevisionRejected,
      mismatchedPickRejected,
      malformedRangeDigestRejected,
      malformedRangeStructureRejected,
      duplicateGlobalIdRejected,
    },
    cleanup: {
      adapterModelClosed: firstArtifact.adapter.cleanup.modelClosed,
      adapterEngineDisposed:
        firstArtifact.adapter.cleanup.engineDisposed,
      sessionDisposed,
      sourceDisposed,
    },
    decision: {
      internalSourceContract: "passed-synthetic-only",
      publicRepresentativeSourceArtifact: "held",
      multiRangeDeferredLoading: "held",
      viewerCoreConformance: "blocked-unresolved-upstream",
      productionClaims: false,
    },
  };
}

process.stdout.write(`${JSON.stringify(await qualify(), null, 2)}\n`);
