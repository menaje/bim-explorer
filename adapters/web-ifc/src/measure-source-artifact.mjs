import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "@bim-explorer/bim-model-source";

import {
  createWebIfcSourceArtifact,
} from "./create-source-artifact.mjs";

export const WEB_IFC_SOURCE_ARTIFACT_REPORT =
  "bim-explorer-web-ifc-source-artifact-report/1";

function parseArguments(values) {
  if (values.length !== 6) {
    throw new TypeError(
      "usage: node measure-source-artifact.mjs " +
        "--input <source.ifc> --fixture-id <id> --profile <profile>",
    );
  }
  const result = {
    input: null,
    fixtureId: null,
    profile: null,
  };
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (name === "--input" && value) {
      result.input = path.resolve(value);
    } else if (
      name === "--fixture-id" &&
      /^[a-z0-9][a-z0-9-]+$/u.test(value ?? "")
    ) {
      result.fixtureId = value;
    } else if (
      name === "--profile" &&
      /^[a-z0-9][a-z0-9-]+$/u.test(value ?? "")
    ) {
      result.profile = value;
    } else {
      throw new TypeError(`invalid source artifact argument ${name}`);
    }
  }
  if (
    result.input === null ||
    result.fixtureId === null ||
    result.profile === null
  ) {
    throw new TypeError("source artifact arguments must be unique");
  }
  return result;
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

async function readAndHashRange(session, handle) {
  const hash = createHash("sha256");
  let reads = 0;
  let bytesRead = 0;
  for (let offset = 0; offset < handle.byteLength;) {
    const length = Math.min(
      handle.maximumRequestBytes,
      handle.byteLength - offset,
    );
    const bytes = await session.readRange(handle, offset, length);
    hash.update(bytes);
    reads += 1;
    bytesRead += bytes.byteLength;
    offset += length;
  }
  return {
    reads,
    bytesRead,
    sha256: hash.digest("hex"),
  };
}

export async function measureWebIfcSourceArtifact(
  input,
  fixtureId,
  profile,
) {
  const totalStarted = performance.now();
  const readStarted = performance.now();
  const bytes = await readFile(input);
  const readMs = performance.now() - readStarted;
  const artifactStarted = performance.now();
  const artifact = await createWebIfcSourceArtifact(bytes, {
    profile,
  });
  const artifactMs = performance.now() - artifactStarted;
  const sourceStarted = performance.now();
  const source = createBimModelSource(artifact, {
    maximumRequestBytes: 1_048_576,
  });
  const sourceMs = performance.now() - sourceStarted;
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const requestContext = context(snapshot);
  const identityEntity = snapshot.entities.find((entity) =>
    entity.renderable &&
    (
      entity.semantics.propertySets.length > 0 ||
      entity.semantics.type !== null
    )) ?? snapshot.entities.find((entity) => entity.renderable);
  if (identityEntity === undefined) {
    throw new Error("source artifact has no renderable identity sample");
  }
  const treeNode = snapshot.tree.nodes.find(
    (node) => node.expressId === identityEntity.expressId,
  );
  const entityByGlobalId = await session.getEntity({
    ...requestContext,
    globalId: identityEntity.globalId,
  });
  const picked = await session.resolvePick({
    ...requestContext,
    renderId: identityEntity.renderId,
    pickId: identityEntity.pickId,
  });
  const nonRenderable = snapshot.entities.find(
    (entity) => !entity.renderable,
  ) ?? null;
  const nonRenderableByIdentity = nonRenderable === null
    ? null
    : await session.getEntity({
      ...requestContext,
      globalId: nonRenderable.globalId,
    });
  const staleRevisionRejected = await rejected(
    () => session.getEntity({
      ...requestContext,
      revisionId: `${snapshot.revisionId}:stale`,
      expressId: identityEntity.expressId,
    }),
    /revisionId is outside the snapshot/u,
  );
  const rangeHandles = snapshot.layers[0].rangeHandles;
  const firstHandle = rangeHandles.find((handle) =>
    snapshot.loadPlan.firstFrameRangeIds.includes(handle.handleId));
  if (firstHandle === undefined) {
    throw new Error("source artifact first range is unavailable");
  }
  const firstRangeRead = await readAndHashRange(session, firstHandle);
  const sourceStateAfterFirstRange = source.state;
  const identityDetails = await session.getEntityDetails({
    ...requestContext,
    expressId: identityEntity.expressId,
  });
  const detailHandle = snapshot.details.rangeHandles.find(
    (handle) =>
      handle.handleId ===
        identityDetails.receipt.handleId,
  );
  if (detailHandle === undefined) {
    throw new Error(
      "source artifact detail handle is unavailable",
    );
  }
  const sourceStateBeforeDispose = source.state;
  const memory = process.memoryUsage();
  const sessionDisposed = await session.dispose();
  const sourceDisposed = await source.dispose();

  return {
    schema: WEB_IFC_SOURCE_ARTIFACT_REPORT,
    status: "passed",
    engine: {
      id: "web-ifc",
      version: "0.0.77",
      backend: "node-wasm-isolated-source-artifact",
      license: "MPL-2.0",
    },
    fixture: {
      id: fixtureId,
      byteLength: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      schema: snapshot.source.ifcSchema,
      profile: snapshot.source.profile,
    },
    snapshot: {
      sourceFingerprint: snapshot.source.fingerprint,
      revisionId: snapshot.revisionId,
      cacheFingerprint: snapshot.cacheFingerprint,
      treeNodes: snapshot.tree.nodes.length,
      entities: snapshot.entities.length,
      geometry: snapshot.geometry,
      resources: snapshot.resources,
      loadPlan: {
        firstRangeIds: snapshot.loadPlan.firstFrameRangeIds,
        deferredRangeIds: snapshot.loadPlan.deferredRangeIds,
        deferredDetailRangeIds:
          snapshot.loadPlan.deferredDetailRangeIds,
      },
      ranges: rangeHandles.map((handle) => ({
        handleId: handle.handleId,
        byteLength: handle.byteLength,
        maximumRequestBytes: handle.maximumRequestBytes,
        sha256: handle.sha256,
      })),
      detailRanges: snapshot.details.rangeHandles.map(
        (handle) => ({
          handleId: handle.handleId,
          byteLength: handle.byteLength,
          maximumRequestBytes: handle.maximumRequestBytes,
          sha256: handle.sha256,
        }),
      ),
    },
    firstRangeRead: {
      handleId: firstHandle.handleId,
      ...firstRangeRead,
      digestValidated: firstRangeRead.sha256 === firstHandle.sha256,
      deferredRangesUnread:
        sourceStateAfterFirstRange.rangeBytesRead ===
          firstHandle.byteLength,
      deferredDetailRangesUnread:
        sourceStateAfterFirstRange.detailBytesRead === 0,
      remainingReadBytes:
        sourceStateAfterFirstRange.remainingReadBytes,
    },
    detailRangeRead: {
      handleId: detailHandle.handleId,
      rangeByteLength: detailHandle.byteLength,
      rangeSha256: detailHandle.sha256,
      maximumRequestBytes:
        detailHandle.maximumRequestBytes,
      receipt: identityDetails.receipt,
      reads: sourceStateBeforeDispose.detailReads,
      bytesRead: sourceStateBeforeDispose.detailBytesRead,
      remainingReadBytes:
        sourceStateBeforeDispose.remainingDetailReadBytes,
      schema: identityDetails.schema,
      expressId: identityDetails.expressId,
      globalId: identityDetails.globalId,
      quantityCount: Object.keys(
        identityDetails.semantics.quantities,
      ).length,
      materialCount:
        identityDetails.semantics.materials.length,
      classificationCount:
        identityDetails.semantics.classifications.length,
    },
    identity: {
      expressId: identityEntity.expressId,
      globalId: identityEntity.globalId,
      renderId: identityEntity.renderId,
      pickId: identityEntity.pickId,
      propertySetCount: identityEntity.semantics.propertySets.length,
      hasType: identityEntity.semantics.type !== null,
      hasContainer: identityEntity.semantics.container !== null,
      treeEntityMatch:
        treeNode?.globalId === identityEntity.globalId &&
        treeNode?.renderId === identityEntity.renderId &&
        treeNode?.pickId === identityEntity.pickId,
      globalIdLookupMatch:
        entityByGlobalId.expressId === identityEntity.expressId,
      pickLookupMatch:
        picked.expressId === identityEntity.expressId &&
        picked.globalId === identityEntity.globalId,
    },
    nonRenderable: {
      count: snapshot.geometry.nonRenderableProducts,
      samplePresent: nonRenderable !== null,
      sampleExpressId: nonRenderable?.expressId ?? null,
      sampleGlobalId: nonRenderable?.globalId ?? null,
      renderId: nonRenderable?.renderId ?? null,
      pickId: nonRenderable?.pickId ?? null,
      diagnosticCodes:
        nonRenderable?.diagnostics.map((value) => value.code) ?? [],
      sourceIdentityLookup:
        nonRenderableByIdentity?.expressId === nonRenderable?.expressId,
    },
    failClosed: {
      staleRevisionRejected,
    },
    performance: {
      readMs,
      artifactMs,
      sourceMs,
      totalMs: performance.now() - totalStarted,
    },
    processMemoryBytes: {
      maximumResidentSetSize:
        process.resourceUsage().maxRSS * 1024,
      residentSetSizeAfterFirstRange: memory.rss,
      heapUsedAfterFirstRange: memory.heapUsed,
    },
    cleanup: {
      adapterModelClosed: artifact.adapter.cleanup.modelClosed,
      adapterEngineDisposed: artifact.adapter.cleanup.engineDisposed,
      sessionDisposed,
      sourceDisposed,
    },
    diagnostics: [],
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = await measureWebIfcSourceArtifact(
    options.input,
    options.fixtureId,
    options.profile,
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
