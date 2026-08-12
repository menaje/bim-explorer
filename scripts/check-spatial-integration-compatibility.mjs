import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TRUE_GATES = [
  "exactViewerPackagePin",
  "versionedBridgeContract",
  "bimBaseSpatialLayerComposition",
  "sourceIdentityCanonicalMapping",
  "synchronized2d3dSelection",
  "opaqueContextReference",
  "semanticAndRenderDiffReview",
  "staleSourceAndRevisionRejection",
  "optionalAuthorityFreeHandoff",
  "standaloneExplorer",
];
const HELD_GATES = [
  "actualSpatialConsumerConformance",
  "standaloneSpatialBundle",
  "publicBimIntegrationPackage",
];
const CONTRACT = Object.freeze({
  integration: "bim-explorer-spatial-integration/0.1",
  handoff: "bim-explorer-spatial-handoff/0.1",
  selection: "bim-explorer-spatial-selection-sync/0.1",
  context: "bim-explorer-spatial-context-reference/0.1",
  review: "bim-explorer-spatial-review/0.1",
  bimSourceProtocol: "bim-explorer-bim-source/0.2",
  viewerCorePackageVersion: "0.1.2",
  renderProtocolPackageVersion: "0.1.2",
  renderProtocolId:
    "menaje-viewer-render-protocol/0.1.0",
  spatialProtocolVersion: "0.1.0",
});
const SOURCE_FINGERPRINT =
  "sha256:400071d0a99f14ef37c46560bde1651965a378e0586b5f470be3fda81e585243";

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

function validateEvidence(evidence) {
  plainRecord(evidence, "Spatial integration evidence");
  if (
    evidence.schema !==
      "bim-explorer-spatial-integration-qualification/1" ||
    evidence.status !== "passed-experimental" ||
    evidence.asOf !== "2026-08-04" ||
    !equalJson(evidence.contract, {
      integration: CONTRACT.integration,
      handoff: CONTRACT.handoff,
      selection: CONTRACT.selection,
      context: CONTRACT.context,
      review: CONTRACT.review,
      viewerCorePackageVersion:
        CONTRACT.viewerCorePackageVersion,
      renderProtocolPackageVersion:
        CONTRACT.renderProtocolPackageVersion,
      renderProtocolId: CONTRACT.renderProtocolId,
      spatialProtocolVersion:
        CONTRACT.spatialProtocolVersion,
    })
  ) {
    throw new Error(
      "Spatial integration evidence identity is invalid",
    );
  }
  if (
    evidence.source?.fingerprint !== SOURCE_FINGERPRINT ||
    evidence.source?.revisionId !==
      `source-snapshot:${SOURCE_FINGERPRINT}` ||
    evidence.source?.schema !== "IFC4" ||
    evidence.source?.profile !== "ReferenceView_V1.2" ||
    evidence.source?.products !== 2 ||
    evidence.standalone?.availability !== "standalone" ||
    evidence.standalone?.disposed !== true ||
    evidence.standalone?.contextReference !== null ||
    evidence.standalone?.authority?.acceptance !== false ||
    evidence.standalone?.authority?.publish !== false ||
    evidence.standalone?.authority?.sourceMutation !== false
  ) {
    throw new Error(
      "Spatial integration standalone evidence is invalid",
    );
  }
  if (
    evidence.selection?.mappingStatus !== "exact" ||
    evidence.selection?.canonicalId !==
      "entity:synthetic/main-wall" ||
    evidence.selection?.sourceFingerprint !==
      SOURCE_FINGERPRINT ||
    evidence.selection?.sourceRevisionId !==
      `source-snapshot:${SOURCE_FINGERPRINT}` ||
    !equalJson(
      evidence.selection.views?.map((view) => view.view),
      ["2d", "3d"],
    )
  ) {
    throw new Error(
      "Spatial integration selection evidence is invalid",
    );
  }
  if (
    evidence.context?.schema !== CONTRACT.context ||
    !/^cadctx:\/\/local\/[A-Za-z0-9_-]{32,128}$/u.test(
      evidence.context?.uri ?? "",
    ) ||
    evidence.context?.authority !==
      "opaque-service-record" ||
    evidence.context?.requestContainsCanonicalId !==
      false ||
    evidence.context?.requestContainsPathOrCredential !==
      false
  ) {
    throw new Error(
      "Spatial integration Context Reference evidence is invalid",
    );
  }
  const diff = evidence.review?.diff;
  if (
    evidence.review?.schema !== CONTRACT.review ||
    evidence.review?.bimBaseLayers !== 1 ||
    evidence.review?.spatialLayers?.length !== 3 ||
    ![
      "semantic",
      "geometry",
      "representation",
      "render",
      "requirement",
    ].every((category) =>
      /^sha256:[0-9a-f]{64}$/u.test(
        diff?.[category]?.digest ?? "",
      ) &&
      diff[category].changedEntities === 1) ||
    evidence.review?.authority?.bimBase !==
      "bim-explorer-read-only-source" ||
    evidence.review?.authority?.spatialRevision !==
      "coni-spatial-service" ||
    evidence.review?.authority?.acceptPublish !==
      "not-granted"
  ) {
    throw new Error(
      "Spatial integration review evidence is invalid",
    );
  }
  if (
    evidence.handoff?.schema !== CONTRACT.handoff ||
    evidence.handoff?.byteLength <= 0 ||
    evidence.handoff?.byteLength > 32 * 1024 ||
    evidence.handoff?.target?.product !== "coni-spatial" ||
    evidence.handoff?.target?.minimumSpatialProtocol !==
      "0.1.0" ||
    evidence.handoff?.authority?.acceptance !== false ||
    evidence.handoff?.authority?.publish !== false ||
    evidence.handoff?.authority?.sourceMutation !== false ||
    evidence.handoff?.containsPathOrCredential !== false ||
    evidence.failClosed?.staleSourceRejected !== true ||
    evidence.failClosed?.staleSpatialRevisionRejected !==
      true
  ) {
    throw new Error(
      "Spatial integration handoff or stale evidence is invalid",
    );
  }
  if (
    evidence.lifecycle?.beforeStale?.mappings !== 1 ||
    evidence.lifecycle.beforeStale.contexts !== 1 ||
    evidence.lifecycle.beforeStale.reviews !== 1 ||
    evidence.lifecycle.beforeStale.handoffs !== 1 ||
    evidence.lifecycle?.bridge?.released !== true ||
    evidence.lifecycle.bridge.mappingRequests !== 1 ||
    evidence.lifecycle.bridge.contextRequests !== 1 ||
    evidence.lifecycle.bridge.reviewRequests !== 1 ||
    evidence.lifecycle.integrationDisposed !== true ||
    evidence.lifecycle.sessionDisposed !== true ||
    evidence.lifecycle.sourceDisposed !== true ||
    evidence.decision?.explorerProviderContract !==
      "passed-synthetic-bridge" ||
    evidence.decision?.actualSpatialConsumer !==
      "held-consumer-owned" ||
    evidence.decision?.publicBimPackage !==
      "held-consumer-package-admission" ||
    evidence.decision?.spatialBundleIndependence !==
      "held-spatial-product-evidence" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error(
      "Spatial integration lifecycle or decision is invalid",
    );
  }
  if (
    /\/Users\/|\/Volumes\/|[A-Z]:\\/u.test(
      JSON.stringify(evidence),
    )
  ) {
    throw new Error(
      "Spatial integration evidence exposes a local path",
    );
  }
}

export function validateSpatialIntegrationCompatibility(
  manifest,
  evidence,
) {
  plainRecord(manifest, "Spatial integration manifest");
  validateEvidence(evidence);
  if (
    manifest.schema !==
      "bim-explorer-spatial-integration-compatibility/1" ||
    manifest.status !== "experimental" ||
    manifest.asOf !== "2026-08-11" ||
    !equalJson(manifest.contract, CONTRACT)
  ) {
    throw new Error(
      "Spatial integration compatibility identity is invalid",
    );
  }
  const contractScope = plainRecord(
    manifest.contractScope,
    "Spatial integration contract scope",
  );
  if (
    contractScope.profile !==
      "legacy-single-source-optional-bridge-v0.1" ||
    contractScope.consumerAdmission !==
      "not-observed-for-this-v0.1-bridge" ||
    contractScope.federatedV02Admission !==
      "separate-contract-line" ||
    contractScope.federatedV02Manifest !==
      "compatibility/federated-bim-surface.json" ||
    contractScope.statusMeaning !==
      "actualSpatialConsumerConformance applies only to the " +
        "optional integration/0.1 bridge"
  ) {
    throw new Error(
      "Spatial integration contract scope is ambiguous",
    );
  }
  const gates = plainRecord(
    manifest.gates,
    "Spatial integration gates",
  );
  for (const gate of TRUE_GATES) {
    if (gates[gate] !== true) {
      throw new Error(
        `Spatial integration gate ${gate} must pass`,
      );
    }
  }
  for (const gate of HELD_GATES) {
    if (gates[gate] !== false) {
      throw new Error(
        `Spatial integration gate ${gate} must remain held`,
      );
    }
  }
  if (
    Object.keys(gates).length !==
      TRUE_GATES.length + HELD_GATES.length ||
    !Array.isArray(manifest.blockers) ||
    manifest.blockers.length !== HELD_GATES.length ||
    !Array.isArray(manifest.limitations) ||
    manifest.limitations.length < 3 ||
    manifest.evidence?.syntheticBridge !==
      "compatibility/evidence/" +
        "spatial-integration-synthetic-2026-08-04.json" ||
    manifest.evidence?.viewerCoreRelease !==
      "compatibility/evidence/" +
        "viewer-core-release-2026-08-04.json"
  ) {
    throw new Error(
      "Spatial integration gate inventory is invalid",
    );
  }
  const policy = plainRecord(
    manifest.policy,
    "Spatial integration policy",
  );
  if (
    policy.readOnly !== true ||
    policy.spatialAuthority !== false ||
    policy.allowSpatialPrivateDependency !== false ||
    policy.allowInstalledExtensionDependency !== false ||
    policy.claimExplorerProviderContract !== true ||
    policy.consumerAdmissionScope !==
      "legacy-single-source-optional-bridge-v0.1" ||
    policy.claimActualSpatialConsumer !== false ||
    policy.claimPublicPackage !== false ||
    policy.claimProductionIntegration !== false
  ) {
    throw new Error(
      "Spatial integration policy overclaims compatibility",
    );
  }
  return Object.freeze({
    status: manifest.status,
    passedGates: TRUE_GATES.length,
    heldGates: HELD_GATES.length,
    blockers: manifest.blockers.length,
  });
}

async function main() {
  const [manifest, evidence] = await Promise.all([
    readFile(
      "compatibility/spatial-integration.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "spatial-integration-synthetic-2026-08-04.json",
      "utf8",
    ).then(JSON.parse),
  ]);
  const result =
    validateSpatialIntegrationCompatibility(
      manifest,
      evidence,
    );
  process.stdout.write(
    `Spatial integration compatibility check passed: ` +
      `${result.status}, ${result.passedGates} passed and ` +
      `${result.heldGates} held gates\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
