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
    !relationIndexBudgetRejected ||
    !treeNodeBudgetRejected ||
    !metadataBudgetRejected ||
    !identityConverged ||
    !treeEntityRenderPickIdentity ||
    !sessionDisposed ||
    !sourceDisposed
  ) {
    throw new Error("BIM model source qualification did not pass");
  }

  return {
    schema: "bim-explorer-bim-model-source-evidence/0.1",
    asOf: "2026-08-03",
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
    failClosed: {
      sourceSizeLimitConfiguredBytes: 64 * 1024 * 1024,
      sourceSizeLimitRejected,
      geometryBudgetRejected,
      relationIndexBudgetRejected,
      treeNodeBudgetRejected,
      metadataBudgetRejected,
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
