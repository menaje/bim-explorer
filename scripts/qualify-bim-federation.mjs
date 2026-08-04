import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
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
  createGltfReferenceSource,
} from "../packages/gltf-reference-source/src/index.mjs";
import {
  BIM_FEDERATION_ALIGNMENT_SCHEMA,
  BIM_FEDERATION_CONTRACT,
  BIM_FEDERATION_SAVED_VIEW_SCHEMA,
  BIM_FEDERATION_SELECTION_SCHEMA,
  BIM_FEDERATION_SOURCE_SCHEMA,
  BIM_REFERENCE_FORMAT_REGISTRY_SCHEMA,
  createBimFederation,
  createExplicitAlignment,
  createProjectedCrsAlignment,
  createUnalignedSource,
  getReferenceFormatRegistry,
} from "../packages/bim-federation/src/index.mjs";
import {
  syntheticGeoreferencedIfc,
} from "./generate-synthetic-ifc.mjs";
import {
  syntheticGlbBytes,
} from "./generate-synthetic-gltf.mjs";

const EVIDENCE_PATH =
  "compatibility/evidence/" +
  "bim-federation-synthetic-2026-08-04.json";
const FEDERATION_ID = "federation:synthetic-campus";
const ARCHITECTURE_SLOT = "source-slot:architecture";
const MEP_SLOT = "source-slot:mep";
const REFERENCE_SLOT = "source-slot:glb-reference";
const CRS = "EPSG:32652";
const ORIGIN = Object.freeze([500000, 4100000, 100]);

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
  const entity = snapshot.entities.find(
    (candidate) => candidate.expressId === 40,
  );
  assert.ok(entity);
  return {
    source,
    session,
    snapshot,
    entity,
    alignment: createProjectedCrsAlignment({
      snapshot,
      federationCoordinateSystem: CRS,
      federationOrigin: ORIGIN,
    }),
  };
}

async function referenceFixture() {
  const source = await createGltfReferenceSource(
    syntheticGlbBytes(),
  );
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  return {
    source,
    session,
    snapshot,
    entity: snapshot.entities[0],
    alignment: createUnalignedSource({
      sourceRevisionId: snapshot.revisionId,
      reason: "reference mesh has no shared coordinate evidence",
    }),
  };
}

function selectionItem(federationSourceId, current) {
  return {
    federationSourceId,
    sourceRevisionId: current.snapshot.revisionId,
    nativeIdentity: {
      expressId: current.entity.expressId,
      globalId: current.entity.globalId,
      externalIdentityToken:
        current.entity.externalIdentityToken,
    },
  };
}

function referenceSelectionItem(current) {
  return {
    federationSourceId: REFERENCE_SLOT,
    sourceRevisionId: current.snapshot.revisionId,
    nativeIdentity: {
      nativeId: current.entity.nativeId,
      globalId: null,
      externalIdentityToken:
        current.entity.externalIdentityToken,
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

async function rejected(action, pattern) {
  try {
    await action();
  } catch (error) {
    assert.match(error.message, pattern);
    return true;
  }
  assert.fail("expected operation to fail closed");
}

export async function qualifyBimFederation() {
  const architecture = await sourceFixture("architecture");
  const mepBefore = await sourceFixture("mep-before");
  const mepAfter = await sourceFixture("mep-after");
  const reference = await referenceFixture();
  const federation = createBimFederation({
    federationId: FEDERATION_ID,
    maximumSources: 8,
    maximumSelectionItems: 32,
  });

  const architectureSource = federation.addIfcSource({
    federationSourceId: ARCHITECTURE_SLOT,
    snapshot: architecture.snapshot,
    discipline: "architecture",
    owner: "external-document:architecture",
    alignment: architecture.alignment,
  });
  federation.addIfcSource({
    federationSourceId: MEP_SLOT,
    snapshot: mepBefore.snapshot,
    discipline: "mep",
    owner: "external-document:mep",
    alignment: mepBefore.alignment,
  });
  const referenceSource = federation.addReferenceSource({
    format: "glb",
    federationSourceId: REFERENCE_SLOT,
    snapshot: reference.snapshot,
    discipline: "reference",
    owner: "external-reference:glb",
    alignment: reference.alignment,
  });
  const initialDescriptor = federation.getDescriptor();
  assert.equal(initialDescriptor.sources.length, 3);
  assert.equal(
    architecture.entity.globalId,
    mepBefore.entity.globalId,
  );
  const explicitAlignment = createExplicitAlignment({
    sourceRevisionId: architecture.snapshot.revisionId,
    sourceCoordinateSystem: "source-local",
    federationCoordinateSystem: "federation-local",
    sourceToFederation: [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      10, 20, 30, 1,
    ],
    reference:
      "user-confirmed-control-point-set:synthetic",
  });

  const selection = federation.createSelection({
    items: [
      selectionItem(ARCHITECTURE_SLOT, architecture),
      selectionItem(MEP_SLOT, mepBefore),
      referenceSelectionItem(reference),
    ],
  });
  assert.equal(new Set(
    selection.items.map((item) => item.key),
  ).size, 3);
  federation.setSourceVisibility({
    federationSourceId: MEP_SLOT,
    sourceRevisionId: mepBefore.snapshot.revisionId,
    visible: false,
  });
  const savedView = federation.createSavedView({
    viewId: "view:cross-source-review",
    camera: camera(),
    selection,
  });
  const architectureOrigin = federation.transformPoint({
    federationSourceId: ARCHITECTURE_SLOT,
    sourceRevisionId: architecture.snapshot.revisionId,
    point: [0, 0, 0],
  });

  const partial = federation.setSourceState({
    federationSourceId: MEP_SLOT,
    sourceRevisionId: mepBefore.snapshot.revisionId,
    state: "partial",
    reason: "bounded ranges are still loading",
  });
  const stale = federation.setSourceState({
    federationSourceId: MEP_SLOT,
    sourceRevisionId: mepBefore.snapshot.revisionId,
    state: "stale",
    reason: "a newer external document revision is available",
  });
  const refresh = federation.refreshIfcSource({
    federationSourceId: MEP_SLOT,
    expectedRevisionId: mepBefore.snapshot.revisionId,
    snapshot: mepAfter.snapshot,
    alignment: mepAfter.alignment,
  });
  const staleSavedViewRejected = await rejected(
    async () => federation.applySavedView(savedView),
    /revision is stale or unavailable/u,
  );
  const staleSelectionRejected = await rejected(
    async () => federation.createSelection({
      items: [selectionItem(MEP_SLOT, mepBefore)],
    }),
    /revision is stale or unavailable/u,
  );
  const postRefreshDescriptor = federation.getDescriptor();
  assert.equal(
    postRefreshDescriptor.sources.find((source) =>
      source.federationSourceId ===
        ARCHITECTURE_SLOT).nativeDocument.revisionId,
    architecture.snapshot.revisionId,
  );
  assert.equal(
    postRefreshDescriptor.sources.find((source) =>
      source.federationSourceId ===
        MEP_SLOT).nativeDocument.revisionId,
    mepAfter.snapshot.revisionId,
  );

  const registry = getReferenceFormatRegistry();
  const admitted = registry.formats
    .filter((format) => format.admitted)
    .map((format) => format.format);
  const held = registry.formats
    .filter((format) => !format.admitted)
    .map((format) => format.format);
  const heldLasRejected = await rejected(
    async () => federation.addReferenceSource({
      format: "las",
    }),
    /source is held/u,
  );
  assert.deepEqual(admitted, ["ifc", "gltf", "glb"]);
  assert.equal(
    registry.formats.every((format) =>
      format.capabilities.write.startsWith("blocked-") &&
      format.capabilities.roundTrip.startsWith("blocked-")),
    true,
  );

  const lifecycle = await federation.dispose();
  await Promise.all([
    architecture.session.dispose(),
    mepBefore.session.dispose(),
    mepAfter.session.dispose(),
    reference.session.dispose(),
  ]);
  await Promise.all([
    architecture.source.dispose(),
    mepBefore.source.dispose(),
    mepAfter.source.dispose(),
    reference.source.dispose(),
  ]);

  return deepFreeze({
    schema: "bim-explorer-federation-qualification/1",
    status: "passed-foundation",
    asOf: "2026-08-04",
    contract: {
      federation: BIM_FEDERATION_CONTRACT,
      source: BIM_FEDERATION_SOURCE_SCHEMA,
      alignment: BIM_FEDERATION_ALIGNMENT_SCHEMA,
      selection: BIM_FEDERATION_SELECTION_SCHEMA,
      savedView: BIM_FEDERATION_SAVED_VIEW_SCHEMA,
      referenceFormats:
        BIM_REFERENCE_FORMAT_REGISTRY_SCHEMA,
      bimSourceProtocol: BIM_SOURCE_PROTOCOL_VERSION,
    },
    federation: {
      federationId: FEDERATION_ID,
      sourceSlots: [
        ARCHITECTURE_SLOT,
        REFERENCE_SLOT,
        MEP_SLOT,
      ],
      disciplines: ["architecture", "reference", "mep"],
      initialSources: initialDescriptor.sources.length,
      sourceIdentityMerged: false,
      duplicateGlobalId:
        architecture.entity.globalId,
      duplicateGlobalIdOccurrences: 2,
      distinctSelectionKeys: selection.items.length,
      sourceVisibility:
        savedView.sourceStates.map((source) => ({
          federationSourceId: source.federationSourceId,
          visible: source.visible,
        })),
    },
    referenceMesh: {
      federationSourceId: REFERENCE_SLOT,
      format: referenceSource.format,
      sourceRole: referenceSource.sourceRole,
      semanticAuthority:
        referenceSource.identityPolicy.semanticAuthority,
      nativeAuthority:
        referenceSource.identityPolicy.nativeAuthority,
      nativeId: reference.entity.nativeId,
      globalId: reference.entity.globalId,
      selected:
        selection.items.some((item) =>
          item.federationSourceId === REFERENCE_SLOT &&
          item.nativeIdentity.nativeId ===
            reference.entity.nativeId),
      alignment: referenceSource.alignment.status,
      write: "blocked-read-only",
      roundTrip: "blocked-not-source-authority",
    },
    coordinates: {
      federationCoordinateSystem: CRS,
      federationOrigin: [...ORIGIN],
      sourceMethod: architectureSource.alignment.method,
      numericPrecision:
        architectureSource.alignment.numericPrecision,
      datumTransformation:
        architectureSource.alignment.datumTransformation,
      explicitAlignmentProvenance:
        explicitAlignment.provenance.kind,
      architectureOrigin,
      mappedSources: 2,
    },
    refresh: {
      partialStateObserved: partial.state === "partial",
      staleStateObserved: stale.state === "stale",
      refreshedSource: refresh.federationSourceId,
      previousRevisionId: refresh.previousRevisionId,
      currentRevisionId: refresh.currentRevisionId,
      unchangedFederationSources:
        refresh.unchangedFederationSources,
      architectureRevisionPreserved:
        architecture.snapshot.revisionId,
      priorIdentityPolicy: refresh.priorIdentityPolicy,
    },
    savedView: {
      schema: savedView.schema,
      selectedSources: savedView.selection.items.length,
      sourceStates: savedView.sourceStates.length,
      crossSource: true,
    },
    referenceFormats: {
      registered: registry.formats.length,
      admitted,
      held,
      nonIfcSemanticAuthority: false,
      allWritesBlocked: true,
      allRoundTripsBlocked: true,
    },
    failClosed: {
      staleSavedViewRejected,
      staleSelectionRejected,
      heldLasRejected,
      referenceSemanticAuthorityRejected:
        referenceSource.identityPolicy.semanticAuthority ===
          "not-bim-authority",
      sourceIdentityMergeRejectedByPolicy:
        initialDescriptor.authority
          .mergeSourceIdentity === false,
      nativeMutationNotGranted:
        initialDescriptor.authority
          .mutateNativeSource === false,
      spatialAuthorityNotGranted:
        initialDescriptor.authority
          .spatialAuthority === false,
    },
    lifecycle: {
      releasedFederationSources:
        lifecycle.releasedSources,
      federationDisposed: lifecycle.disposed,
      sourceSessionsDisposed: 4,
      sourcesDisposed: 4,
    },
    decision: {
      multiIfcFoundation: "passed-synthetic",
      sameCrsAlignment: "passed-ifc-map-conversion",
      actualSpatialConsumer:
        "held-consumer-owned",
      actualMultiFormatUserDemand:
        "held-external-evidence",
      pointCloudCodec:
        "held-codec-crs-scale-evidence",
      gltfGlbCodec:
        "passed-bounded-reference-mesh",
      gis3dTiles:
        "held-engine-network-precision-evidence",
      rvtDgnNativeBridge:
        "held-sdk-rights-reopen-qualification",
      surveyedDatumTransformation:
        "held-survey-evidence",
      productScalePerformance:
        "held-multi-source-fixture",
      productionClaims: false,
    },
  });
}

async function main() {
  const evidence = await qualifyBimFederation();
  const text = `${JSON.stringify(evidence, null, 2)}\n`;
  if (process.argv[2] === "--write") {
    await writeFile(EVIDENCE_PATH, text, "utf8");
    process.stdout.write(
      `Wrote BIM federation evidence: ${EVIDENCE_PATH}\n`,
    );
    return;
  }
  if (process.argv.length > 2) {
    throw new TypeError(
      "usage: node scripts/qualify-bim-federation.mjs [--write]",
    );
  }
  process.stdout.write(text);
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
