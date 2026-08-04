import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createWebIfcSourceArtifact,
} from "../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  BIM_PROPERTY_SET_VALUES_SCHEMA,
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../packages/bim-model-source/src/index.mjs";
import {
  syntheticGeoreferencedIfc,
  syntheticMappedIfc,
} from "./generate-synthetic-ifc.mjs";

const FIXTURE_SHA256 =
  "34e3038d63a3334f9c60b9c072ea7324fec238034bbe096da0d7fced751c8348";

function context(snapshot) {
  return Object.fromEntries(
    [
      "protocolVersion",
      "sessionId",
      "sourceId",
      "revisionId",
      "snapshotId",
      "layerId",
    ].map((field) => [field, snapshot[field]]),
  );
}

async function rejected(operation, pattern) {
  try {
    await operation();
  } catch (error) {
    assert.match(String(error?.message), pattern);
    return true;
  }
  throw new Error(`operation did not reject with ${pattern}`);
}

async function runSource(artifact) {
  const source = createBimModelSource(artifact);
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const values = await session.getPropertySetValues({
    ...context(snapshot),
    expressId: 40,
  });
  const repeatedValues = await session.getPropertySetValues({
    ...context(snapshot),
    expressId: 40,
  });
  assert.equal(values, repeatedValues);
  const state = source.state;
  const sessionDisposed = await session.dispose();
  const sourceDisposed = await source.dispose();
  return {
    snapshot,
    values,
    state,
    cleanup: {
      sessionDisposed,
      sourceDisposed,
    },
  };
}

export async function qualifyBimSourceMetadata() {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(syntheticGeoreferencedIfc());
  assert.equal(bytes.byteLength, 4_191);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    FIXTURE_SHA256,
  );
  const firstArtifact = await createWebIfcSourceArtifact(bytes, {
    profile: "ReferenceView_V1.2",
  });
  const secondArtifact = await createWebIfcSourceArtifact(bytes, {
    profile: "ReferenceView_V1.2",
  });
  const [first, second] = await Promise.all([
    runSource(firstArtifact),
    runSource(secondArtifact),
  ]);
  assert.equal(
    first.snapshot.cacheFingerprint,
    second.snapshot.cacheFingerprint,
  );
  assert.equal(
    first.snapshot.semanticCacheFingerprint,
    second.snapshot.semanticCacheFingerprint,
  );
  assert.deepEqual(
    firstArtifact.propertyDetails.slices,
    secondArtifact.propertyDetails.slices,
  );
  assert.deepEqual(
    firstArtifact.georeferencing,
    secondArtifact.georeferencing,
  );

  const absentArtifact = await createWebIfcSourceArtifact(
    encoder.encode(syntheticMappedIfc()),
    { profile: "ReferenceView_V1.2" },
  );
  assert.deepEqual(absentArtifact.georeferencing, {
    status: "absent",
    reason: "no-ifc-map-conversion",
  });

  const limitedSource = createBimModelSource(
    secondArtifact,
    { propertyReadBudgetBytes: 496 },
  );
  const limitedSession = await limitedSource.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const limitedSnapshot = await limitedSession.getSnapshot();
  const propertyReadBudgetRejected = await rejected(
    () => limitedSession.getPropertySetValues({
      ...context(limitedSnapshot),
      expressId: 40,
    }),
    /property detail range exceeds its read budget/u,
  );
  await limitedSession.dispose();
  await limitedSource.dispose();

  const badPropertyDigest = structuredClone(secondArtifact);
  badPropertyDigest.propertyDetails.ranges[0].bytes[24] ^= 0xff;
  const malformedPropertyDigestRejected = await rejected(
    () => Promise.resolve(
      createBimModelSource(badPropertyDigest),
    ),
    /digest does not match its bytes/u,
  );
  const invalidMap = structuredClone(secondArtifact);
  invalidMap.georeferencing.mapConversion.scale = -1;
  const invalidMapConversionRejected = await rejected(
    () => Promise.resolve(createBimModelSource(invalidMap)),
    /map conversion identity or scale is invalid/u,
  );

  const propertySets = first.values.propertySets.map(
    (propertySet) => ({
      expressId: propertySet.expressId,
      name: propertySet.name,
      scope: propertySet.scope,
      properties: propertySet.properties.map((property) => ({
        expressId: property.expressId,
        name: property.name,
        propertyClass: property.propertyClass,
        nominalValue: property.nominalValue,
        unit: property.unit,
      })),
    }),
  );
  const report = {
    schema:
      "bim-explorer-bim-source-metadata-qualification/1",
    status: "passed-experimental",
    asOf: "2026-08-04",
    fixture: {
      id: "synthetic-georeferenced-ifc4",
      byteLength: bytes.byteLength,
      sha256: FIXTURE_SHA256,
      schema: "IFC4",
      profile: "ReferenceView_V1.2",
      artifactCommitted: false,
      thirdPartyContent: false,
    },
    contract: {
      sourceProtocol: BIM_SOURCE_PROTOCOL_VERSION,
      propertySchema: BIM_PROPERTY_SET_VALUES_SCHEMA,
      propertyMediaType:
        first.snapshot.propertyDetails.mediaType,
    },
    snapshot: {
      sourceFingerprint: first.snapshot.source.fingerprint,
      cacheFingerprint: first.snapshot.cacheFingerprint,
      semanticCacheFingerprint:
        first.snapshot.semanticCacheFingerprint,
      deterministicBaseCache:
        first.snapshot.cacheFingerprint ===
          second.snapshot.cacheFingerprint,
      deterministicSemanticCache:
        first.snapshot.semanticCacheFingerprint ===
          second.snapshot.semanticCacheFingerprint,
    },
    propertyDetails: {
      resources:
        firstArtifact.propertyDetails.resources,
      range: {
        handleId:
          first.snapshot.propertyDetails
            .rangeHandles[0].handleId,
        byteLength:
          first.snapshot.propertyDetails
            .rangeHandles[0].byteLength,
        sha256:
          first.snapshot.propertyDetails
            .rangeHandles[0].sha256,
      },
      selectedEntity: {
        expressId: first.values.expressId,
        globalId: first.values.globalId,
        schema: first.values.schema,
        propertySets,
        receipt: first.values.receipt,
      },
      reads: first.state.propertyReads,
      bytesRead: first.state.propertyBytesRead,
      repeatedReadCacheHit: first.state.propertyReads === 1,
      geometryBytesRead: first.state.rangeBytesRead,
      legacyDetailBytesRead: first.state.detailBytesRead,
    },
    georeferencing: {
      mapped: first.snapshot.georeferencing,
      absent: absentArtifact.georeferencing,
    },
    geometryRepresentations:
      first.snapshot.geometryRepresentations,
    failClosed: {
      propertyReadBudgetRejected,
      malformedPropertyDigestRejected,
      invalidMapConversionRejected,
    },
    cleanup: {
      adapterModelClosed:
        firstArtifact.adapter.cleanup.modelClosed &&
        secondArtifact.adapter.cleanup.modelClosed &&
        absentArtifact.adapter.cleanup.modelClosed,
      adapterEngineDisposed:
        firstArtifact.adapter.cleanup.engineDisposed &&
        secondArtifact.adapter.cleanup.engineDisposed &&
        absentArtifact.adapter.cleanup.engineDisposed,
      first: first.cleanup,
      second: second.cleanup,
    },
    decision: {
      propertySetValuePayload:
        "passed-deferred-bounded",
      georeferencingMapConversion:
        "passed-ifc4-synthetic",
      sourcePrecisionDisplaySeparation: "passed-contract",
      sourcePrecisionGeometryExport: "blocked",
      writeMutation: "blocked",
      productionClaims: false,
    },
  };
  assert.doesNotMatch(
    JSON.stringify(report),
    /\/Users\/|\/Volumes\/|[A-Z]:\\/u,
  );
  await createBimModelSource(absentArtifact).dispose();
  return Object.freeze(report);
}

async function main() {
  process.stdout.write(
    `${JSON.stringify(await qualifyBimSourceMetadata(), null, 2)}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
