import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT = Object.freeze({
  federation: "bim-explorer-federation/0.1",
  source: "bim-explorer-federation-source/0.1",
  alignment: "bim-explorer-federation-alignment/0.1",
  selection: "bim-explorer-federation-selection/0.1",
  savedView: "bim-explorer-federation-saved-view/0.1",
  referenceFormats:
    "bim-explorer-reference-format-registry/0.1",
  bimSourceProtocol: "bim-explorer-bim-source/0.2",
});
const TRUE_GATES = Object.freeze([
  "multiIfcSourceSlots",
  "nativeSourceIdentityIsolation",
  "perSourceVisibility",
  "sameCrsFloat64Alignment",
  "explicitAlignmentProvenance",
  "partialSourceState",
  "staleSourceState",
  "incrementalSingleSourceRefresh",
  "crossSourceSelection",
  "crossSourceSavedView",
  "staleRevisionFailClosed",
  "referenceFormatCapabilityMatrix",
  "ifcAndGltfReferenceAdmission",
  "referenceNativeIdentityIsolation",
  "gltfGlbCodec",
  "boundedLifecycle",
]);
const HELD_GATES = Object.freeze([
  "actualSpatialConsumerConformance",
  "actualMultiFormatUserDemand",
  "surveyedCoordinateDatumEvidence",
  "productScaleFederationPerformance",
  "pointCloudCodec",
  "gis3dTilesEngine",
  "rvtDgnNativeBridge",
]);
const HELD_FORMATS = Object.freeze([
  "las",
  "laz",
  "e57",
  "3d-tiles",
  "rvt",
  "dgn",
]);

function plainRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sourceRevision(value) {
  return /^source-snapshot:sha256:[0-9a-f]{64}$/u.test(
    value ?? "",
  );
}

export function validateBimFederationEvidence(evidence) {
  plainRecord(evidence, "BIM federation evidence");
  if (
    evidence.schema !==
      "bim-explorer-federation-qualification/1" ||
    evidence.status !== "passed-foundation" ||
    evidence.asOf !== "2026-08-04" ||
    !equalJson(evidence.contract, CONTRACT)
  ) {
    throw new Error(
      "BIM federation evidence identity is invalid",
    );
  }
  if (
    evidence.federation?.federationId !==
      "federation:synthetic-campus" ||
    !equalJson(evidence.federation.sourceSlots, [
      "source-slot:architecture",
      "source-slot:glb-reference",
      "source-slot:mep",
    ]) ||
    !equalJson(evidence.federation.disciplines, [
      "architecture",
      "reference",
      "mep",
    ]) ||
    evidence.federation.initialSources !== 3 ||
    evidence.federation.sourceIdentityMerged !== false ||
    evidence.federation.duplicateGlobalId !==
      "0AAAAAAAAAAAAAAAAAAA16" ||
    evidence.federation.duplicateGlobalIdOccurrences !== 2 ||
    evidence.federation.distinctSelectionKeys !== 3 ||
    !equalJson(evidence.federation.sourceVisibility, [
      {
        federationSourceId: "source-slot:architecture",
        visible: true,
      },
      {
        federationSourceId: "source-slot:glb-reference",
        visible: true,
      },
      {
        federationSourceId: "source-slot:mep",
        visible: false,
      },
    ])
  ) {
    throw new Error(
      "BIM federation source identity evidence is invalid",
    );
  }
  if (
    evidence.referenceMesh?.federationSourceId !==
      "source-slot:glb-reference" ||
    evidence.referenceMesh.format !== "glb" ||
    evidence.referenceMesh.sourceRole !==
      "derived-or-reference-mesh" ||
    evidence.referenceMesh.semanticAuthority !==
      "not-bim-authority" ||
    evidence.referenceMesh.nativeAuthority !==
      "external-reference-mesh" ||
    evidence.referenceMesh.nativeId !==
      "node:0/mesh:0/primitive:0" ||
    evidence.referenceMesh.globalId !== null ||
    evidence.referenceMesh.selected !== true ||
    evidence.referenceMesh.alignment !== "unaligned" ||
    evidence.referenceMesh.write !== "blocked-read-only" ||
    evidence.referenceMesh.roundTrip !==
      "blocked-not-source-authority"
  ) {
    throw new Error(
      "BIM federation reference mesh evidence is invalid",
    );
  }
  if (
    evidence.coordinates?.federationCoordinateSystem !==
      "EPSG:32652" ||
    !equalJson(evidence.coordinates.federationOrigin, [
      500000,
      4100000,
      100,
    ]) ||
    evidence.coordinates.sourceMethod !==
      "projected-same-crs" ||
    evidence.coordinates.numericPrecision !== "float64" ||
    evidence.coordinates.datumTransformation !==
      "not-performed" ||
    evidence.coordinates.explicitAlignmentProvenance !==
      "explicit-user-input" ||
    !equalJson(evidence.coordinates.architectureOrigin, [
      0,
      0,
      0,
    ]) ||
    evidence.coordinates.mappedSources !== 2
  ) {
    throw new Error(
      "BIM federation coordinate evidence is invalid",
    );
  }
  if (
    evidence.refresh?.partialStateObserved !== true ||
    evidence.refresh.staleStateObserved !== true ||
    evidence.refresh.refreshedSource !== "source-slot:mep" ||
    !sourceRevision(evidence.refresh.previousRevisionId) ||
    !sourceRevision(evidence.refresh.currentRevisionId) ||
    evidence.refresh.previousRevisionId ===
      evidence.refresh.currentRevisionId ||
    evidence.refresh.unchangedFederationSources !== 2 ||
    !sourceRevision(
      evidence.refresh.architectureRevisionPreserved,
    ) ||
    evidence.refresh.priorIdentityPolicy !==
      "all-prior-source-selections-are-stale"
  ) {
    throw new Error(
      "BIM federation refresh evidence is invalid",
    );
  }
  if (
    evidence.savedView?.schema !== CONTRACT.savedView ||
    evidence.savedView.selectedSources !== 3 ||
    evidence.savedView.sourceStates !== 3 ||
    evidence.savedView.crossSource !== true
  ) {
    throw new Error(
      "BIM federation saved view evidence is invalid",
    );
  }
  if (
    evidence.referenceFormats?.registered !== 9 ||
    !equalJson(
      evidence.referenceFormats.admitted,
      ["ifc", "gltf", "glb"],
    ) ||
    !equalJson(
      evidence.referenceFormats.held,
      HELD_FORMATS,
    ) ||
    evidence.referenceFormats.nonIfcSemanticAuthority !==
      false ||
    evidence.referenceFormats.allWritesBlocked !== true ||
    evidence.referenceFormats.allRoundTripsBlocked !== true
  ) {
    throw new Error(
      "BIM federation reference format evidence is invalid",
    );
  }
  if (
    Object.values(plainRecord(
      evidence.failClosed,
      "BIM federation fail-closed evidence",
    )).some((value) => value !== true) ||
    evidence.lifecycle?.releasedFederationSources !== 3 ||
    evidence.lifecycle.federationDisposed !== true ||
    evidence.lifecycle.sourceSessionsDisposed !== 4 ||
    evidence.lifecycle.sourcesDisposed !== 4
  ) {
    throw new Error(
      "BIM federation fail-closed or lifecycle evidence is invalid",
    );
  }
  if (
    evidence.decision?.multiIfcFoundation !==
      "passed-synthetic" ||
    evidence.decision.sameCrsAlignment !==
      "passed-ifc-map-conversion" ||
    evidence.decision.actualSpatialConsumer !==
      "held-consumer-owned" ||
    evidence.decision.actualMultiFormatUserDemand !==
      "held-external-evidence" ||
    evidence.decision.pointCloudCodec !==
      "held-codec-crs-scale-evidence" ||
    evidence.decision.gltfGlbCodec !==
      "passed-bounded-reference-mesh" ||
    evidence.decision.gis3dTiles !==
      "held-engine-network-precision-evidence" ||
    evidence.decision.rvtDgnNativeBridge !==
      "held-sdk-rights-reopen-qualification" ||
    evidence.decision.surveyedDatumTransformation !==
      "held-survey-evidence" ||
    evidence.decision.productScalePerformance !==
      "held-multi-source-fixture" ||
    evidence.decision.productionClaims !== false
  ) {
    throw new Error(
      "BIM federation decision evidence is invalid",
    );
  }
  if (/(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
    JSON.stringify(evidence),
  )) {
    throw new Error(
      "BIM federation evidence contains a local path",
    );
  }
}

export function validateBimFederationCompatibility(
  manifest,
  evidence,
) {
  plainRecord(manifest, "BIM federation manifest");
  validateBimFederationEvidence(evidence);
  if (
    manifest.schema !==
      "bim-explorer-federation-compatibility/1" ||
    manifest.status !== "experimental" ||
    manifest.asOf !== "2026-08-04" ||
    !equalJson(manifest.contract, CONTRACT)
  ) {
    throw new Error(
      "BIM federation compatibility identity is invalid",
    );
  }
  const gates = plainRecord(
    manifest.gates,
    "BIM federation gates",
  );
  for (const gate of TRUE_GATES) {
    if (gates[gate] !== true) {
      throw new Error(
        `BIM federation gate ${gate} must pass`,
      );
    }
  }
  for (const gate of HELD_GATES) {
    if (gates[gate] !== false) {
      throw new Error(
        `BIM federation gate ${gate} must remain held`,
      );
    }
  }
  if (
    Object.keys(gates).length !==
      TRUE_GATES.length + HELD_GATES.length ||
    !Array.isArray(manifest.blockers) ||
    manifest.blockers.length !== HELD_GATES.length ||
    !Array.isArray(manifest.limitations) ||
    manifest.limitations.length < 5 ||
    manifest.evidence?.syntheticFederation !==
      "compatibility/evidence/" +
        "bim-federation-synthetic-2026-08-04.json" ||
    manifest.evidence?.sourceMetadata !==
      "compatibility/evidence/" +
        "bim-model-source-metadata-2026-08-04.json" ||
    manifest.evidence?.gltfReferenceSource !==
      "compatibility/evidence/" +
        "gltf-reference-source-khronos-box-2026-08-04.json" ||
    manifest.evidence?.gltfBrowserWebGl2 !==
      "compatibility/evidence/" +
        "gltf-reference-source-khronos-box-browser-webgl2-2026-08-04.json"
  ) {
    throw new Error(
      "BIM federation Gate inventory is invalid",
    );
  }
  const policy = plainRecord(
    manifest.policy,
    "BIM federation policy",
  );
  if (
    policy.readOnly !== true ||
    policy.mergeNativeIdentity !== false ||
    policy.allowImplicitDatumTransformation !== false ||
    policy.allowNonIfcSemanticAuthority !== false ||
    policy.claimQualifiedGltfCodec !== true ||
    policy.claimUnqualifiedReferenceCodec !== false ||
    policy.claimActualSpatialConsumer !== false ||
    policy.claimUserDemand !== false ||
    policy.claimProductionFederation !== false ||
    policy.nativeWrite !== false ||
    policy.roundTrip !== false
  ) {
    throw new Error(
      "BIM federation policy overclaims capability",
    );
  }
  return Object.freeze({
    status: manifest.status,
    passedGates: TRUE_GATES.length,
    heldGates: HELD_GATES.length,
    registeredFormats:
      evidence.referenceFormats.registered,
  });
}

async function main() {
  const [manifest, evidence] = await Promise.all([
    readFile(
      "compatibility/bim-federation.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "bim-federation-synthetic-2026-08-04.json",
      "utf8",
    ).then(JSON.parse),
  ]);
  const result = validateBimFederationCompatibility(
    manifest,
    evidence,
  );
  process.stdout.write(
    `BIM federation compatibility check passed: ` +
      `${result.status}, ${result.passedGates} passed, ` +
      `${result.heldGates} held and ` +
      `${result.registeredFormats} registered formats\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
