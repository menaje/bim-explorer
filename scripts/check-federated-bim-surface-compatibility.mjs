import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT = Object.freeze({
  package: "@bim-explorer/federated-bim-surface",
  packageVersion: "0.0.0",
  surface: "bim-explorer-bim-surface/0.2",
  receipt: "bim-explorer-bim-surface-receipt/0.2",
  refresh: "bim-explorer-bim-surface-refresh/0.2",
  selection: "bim-explorer-bim-surface-selection/0.2",
  referenceAnchor: "bim-explorer-reference-anchor/0.1",
  federation: "bim-explorer-federation/0.1",
  source: "bim-explorer-bim-source/0.2",
});
const EVIDENCE_CONTRACT = Object.freeze({
  surface: CONTRACT.surface,
  receipt: CONTRACT.receipt,
  refresh: CONTRACT.refresh,
  selection: CONTRACT.selection,
  referenceAnchor: CONTRACT.referenceAnchor,
  federation: CONTRACT.federation,
  source: CONTRACT.source,
});
const TRUE_GATES = Object.freeze([
  "isolatedV02PackageBoundary",
  "boundedAlignedSourceComposition",
  "callerProvidedSourceRoles",
  "sourceScopedSemantics",
  "crossSourceSelectionIsolation",
  "sourceLocalReferenceAnchors",
  "staleAnchorFailClosed",
  "singleSourceRefreshIsolation",
  "unchangedSourceRangeReplay",
  "transferredBorrowedLifecycle",
  "deterministicCleanup",
  "authorityFree",
  "headlessGeneratedConformance",
]);
const HELD_GATES = Object.freeze([
  "actualBrowserSurfaceNormal",
  "actualBrowserAnchor",
  "actualVscodeSurface",
  "actualSpatialConsumer",
  "publicV02Package",
  "productionSupport",
]);
const EVIDENCE_PATH =
  "compatibility/evidence/" +
  "federated-bim-surface-headless-2026-08-09.json";
const AUTHORITY_KEYS = Object.freeze([
  "workspace",
  "canonicalEntityId",
  "sourceMutation",
  "revisionMutation",
  "geometryMutation",
  "constraintMutation",
  "acceptance",
  "publish",
  "export",
]);
const ANCHOR_AUTHORITY_KEYS = Object.freeze(
  AUTHORITY_KEYS.filter((key) => key !== "revisionMutation"),
);

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

function fingerprint(value) {
  return /^sha256:[0-9a-f]{64}$/u.test(value ?? "");
}

function revision(value) {
  return /^source-snapshot:sha256:[0-9a-f]{64}$/u.test(
    value ?? "",
  );
}

function allFalse(value, keys, label) {
  const authority = plainRecord(value, label);
  if (
    !equalJson(Object.keys(authority), keys) ||
    Object.values(authority).some((item) => item !== false)
  ) {
    throw new Error(`${label} overclaims authority`);
  }
}

export function validateFederatedBimSurfaceEvidence(evidence) {
  plainRecord(evidence, "federated BIM Surface evidence");
  if (
    evidence.schema !==
      "bim-explorer-federated-bim-surface-qualification/1" ||
    evidence.status !== "passed-headless-foundation" ||
    evidence.asOf !== "2026-08-09" ||
    !equalJson(evidence.contract, EVIDENCE_CONTRACT)
  ) {
    throw new Error(
      "federated BIM Surface evidence identity is invalid",
    );
  }
  const composition = plainRecord(
    evidence.composition,
    "federated BIM Surface composition evidence",
  );
  if (
    composition.federationId !==
      "federation:surface-v0.2-qualification" ||
    composition.sourceCount !== 2 ||
    !equalJson(composition.formats, ["glb", "ifc"]) ||
    !equalJson(composition.sourceRoles, [
      "geometric-reference",
      "semantic-base",
    ]) ||
    !equalJson(composition.lifecycleOwnership, [
      "borrowed",
      "transferred",
    ]) ||
    !equalJson(composition.semanticAvailability, [false, true]) ||
    !fingerprint(composition.compositeProjectionFingerprint) ||
    !Array.isArray(composition.sourceProjectionFingerprints) ||
    composition.sourceProjectionFingerprints.length !== 2 ||
    !composition.sourceProjectionFingerprints.every(fingerprint) ||
    new Set(composition.sourceProjectionFingerprints).size !== 2 ||
    composition.identityMerged !== false
  ) {
    throw new Error(
      "federated BIM Surface composition evidence is invalid",
    );
  }
  if (
    evidence.semantics?.sourceScoped !== true ||
    evidence.semantics.queriedSource !==
      "source-slot:z-semantic" ||
    evidence.semantics.query !== "wall" ||
    evidence.semantics.returned !== 2 ||
    evidence.semantics.referenceSemanticsRejected !== true
  ) {
    throw new Error(
      "federated BIM Surface semantic evidence is invalid",
    );
  }
  if (
    evidence.selection?.schema !== CONTRACT.selection ||
    evidence.selection.items !== 2 ||
    !equalJson(evidence.selection.sourceSlots, [
      "source-slot:a-reference",
      "source-slot:z-semantic",
    ]) ||
    evidence.selection.distinctKeys !== 2 ||
    evidence.selection.mergeAcrossSources !== false ||
    evidence.selection.savedViewSchema !==
      "bim-explorer-bim-surface-saved-view/0.2"
  ) {
    throw new Error(
      "federated BIM Surface selection evidence is invalid",
    );
  }
  const anchors = plainRecord(
    evidence.anchors,
    "federated BIM Surface anchor evidence",
  );
  if (
    anchors.unsupportedWithoutSourceLocalHit !== true ||
    anchors.reference?.sourceSlot !==
      "source-slot:a-reference" ||
    anchors.reference.format !== "glb" ||
    anchors.reference.identityKind !== "glb-native-id" ||
    anchors.reference.nativeId !==
      "node:0/mesh:0/primitive:0" ||
    anchors.reference.globalId !== null ||
    anchors.reference.coordinateSpace !== "source-local" ||
    anchors.reference.stability !== "point-only" ||
    anchors.semantic?.sourceSlot !==
      "source-slot:z-semantic" ||
    anchors.semantic.format !== "ifc" ||
    anchors.semantic.identityKind !== "ifc-global-id" ||
    anchors.semantic.nativeId !==
      `ifc-globalid:${anchors.semantic.globalId}` ||
    anchors.semantic.globalId !== "0AAAAAAAAAAAAAAAAAAA16" ||
    anchors.semantic.coordinateSpace !== "source-local" ||
    anchors.semantic.stability !== "point-only" ||
    anchors.afterRefresh?.refreshedSource !== "stale" ||
    anchors.afterRefresh.unchangedSource !== "current" ||
    anchors.afterRefresh.active !== 1 ||
    anchors.afterRefresh.stale !== 1
  ) {
    throw new Error(
      "federated BIM Surface anchor evidence is invalid",
    );
  }
  allFalse(
    anchors.reference.authority,
    ANCHOR_AUTHORITY_KEYS,
    "reference anchor authority",
  );
  allFalse(
    anchors.semantic.authority,
    ANCHOR_AUTHORITY_KEYS,
    "semantic anchor authority",
  );
  const refresh = plainRecord(
    evidence.refresh,
    "federated BIM Surface refresh evidence",
  );
  if (
    refresh.schema !== CONTRACT.refresh ||
    refresh.refreshedSource !== "source-slot:a-reference" ||
    !revision(refresh.previousRevisionId) ||
    !revision(refresh.currentRevisionId) ||
    refresh.previousRevisionId === refresh.currentRevisionId ||
    refresh.unchangedFederationSources !== 1 ||
    !equalJson(refresh.invalidated, {
      selectionItems: 1,
      anchors: 1,
      savedViews: 1,
    }) ||
    refresh.retainedSelectionItems !== 1 ||
    refresh.retainedSelectionSource !==
      "source-slot:z-semantic" ||
    refresh.replayCacheReleased !== true ||
    refresh.previousProjectionDisposed !== true ||
    refresh.unchangedSourceRangeReadsBefore !== 1 ||
    refresh.unchangedSourceRangeReadsAfter !== 1 ||
    refresh.oldBorrowedRevision !== refresh.previousRevisionId
  ) {
    throw new Error(
      "federated BIM Surface refresh evidence is invalid",
    );
  }
  const lifecycle = plainRecord(
    evidence.lifecycle,
    "federated BIM Surface lifecycle evidence",
  );
  if (
    lifecycle.rendererMounts !== 2 ||
    lifecycle.rendererPicks !== 2 ||
    lifecycle.rendererDisposed !== true ||
    lifecycle.rendererActiveBytes !== 0 ||
    lifecycle.projectionDisposed !== true ||
    lifecycle.federationDisposed !== true ||
    lifecycle.semanticExplorersDisposed !== true ||
    lifecycle.transferredSessionReleased !== true ||
    lifecycle.transferredWorkerReleased !== true ||
    lifecycle.borrowedSessionReleased !== false ||
    lifecycle.borrowedRevisionAfterDispose !==
      refresh.currentRevisionId ||
    lifecycle.oldBorrowedRevisionAfterRefresh !==
      refresh.previousRevisionId ||
    lifecycle.projectionCachesReleased !== true ||
    lifecycle.repeatedDispose !== false
  ) {
    throw new Error(
      "federated BIM Surface lifecycle evidence is invalid",
    );
  }
  allFalse(
    evidence.authority,
    AUTHORITY_KEYS,
    "federated BIM Surface authority",
  );
  const held = plainRecord(
    evidence.held,
    "federated BIM Surface held evidence",
  );
  if (
    !equalJson(Object.keys(held), HELD_GATES) ||
    Object.values(held).some((value) => value !== false) ||
    evidence.decision?.internalSurfaceImplementation !==
      "passed-headless-generated" ||
    evidence.decision.browserSurfaceNormal !==
      "held-renderer-pick-has-no-normal-or-triangle-locator" ||
    evidence.decision.browserProductComposition !==
      "held-no-v0.2-entrypoint" ||
    evidence.decision.vscodeProductComposition !==
      "held-no-v0.2-entrypoint" ||
    evidence.decision.actualSpatialConsumer !==
      "held-consumer-owned" ||
    evidence.decision.publicV02Package !==
      "held-qualification-and-release" ||
    evidence.decision.productionClaims !== false
  ) {
    throw new Error(
      "federated BIM Surface held decision is invalid",
    );
  }
  return Object.freeze({
    sourceCount: composition.sourceCount,
    anchors: 2,
    refreshedSources: 1,
  });
}

export function validateFederatedBimSurfaceCompatibility(
  manifest,
  evidence,
) {
  plainRecord(manifest, "federated BIM Surface manifest");
  if (
    manifest.schema !==
      "bim-explorer-federated-bim-surface-compatibility/1" ||
    manifest.status !== "experimental" ||
    manifest.asOf !== "2026-08-09" ||
    !equalJson(manifest.contract, CONTRACT)
  ) {
    throw new Error(
      "federated BIM Surface manifest identity is invalid",
    );
  }
  const gates = plainRecord(
    manifest.gates,
    "federated BIM Surface gates",
  );
  if (TRUE_GATES.some((gate) => gates[gate] !== true)) {
    throw new Error(
      "federated BIM Surface passed Gate is missing",
    );
  }
  if (HELD_GATES.some((gate) => gates[gate] !== false)) {
    throw new Error(
      "federated BIM Surface held Gate must remain false",
    );
  }
  if (
    Object.keys(gates).length !==
      TRUE_GATES.length + HELD_GATES.length ||
    manifest.evidence?.headlessGenerated !== EVIDENCE_PATH ||
    !Array.isArray(manifest.blockers) ||
    manifest.blockers.length !== HELD_GATES.length ||
    !Array.isArray(manifest.limitations) ||
    manifest.limitations.length < 6
  ) {
    throw new Error(
      "federated BIM Surface Gate inventory is invalid",
    );
  }
  const policy = plainRecord(
    manifest.policy,
    "federated BIM Surface policy",
  );
  if (
    policy.readOnly !== true ||
    policy.mergeNativeIdentity !== false ||
    policy.allowImplicitAlignment !== false ||
    policy.allowRoleDerivedCapability !== false ||
    policy.requireSourceLocalAnchorHit !== true ||
    policy.repositoryPublishDisabled !== true ||
    policy.claimHeadlessFoundation !== true ||
    policy.claimBrowserAnchor !== false ||
    policy.claimVscodeSurface !== false ||
    policy.claimActualSpatialConsumer !== false ||
    policy.claimPublicV02Package !== false ||
    policy.claimProductionSupport !== false
  ) {
    throw new Error(
      "federated BIM Surface policy overclaims capability",
    );
  }
  const result = validateFederatedBimSurfaceEvidence(evidence);
  return Object.freeze({
    status: manifest.status,
    passedGates: TRUE_GATES.length,
    heldGates: HELD_GATES.length,
    sourceCount: result.sourceCount,
    anchors: result.anchors,
  });
}

async function main() {
  const [manifest, evidence] = await Promise.all([
    readFile(
      "compatibility/federated-bim-surface.json",
      "utf8",
    ).then(JSON.parse),
    readFile(EVIDENCE_PATH, "utf8").then(JSON.parse),
  ]);
  const result = validateFederatedBimSurfaceCompatibility(
    manifest,
    evidence,
  );
  process.stdout.write(
    `Federated BIM Surface compatibility check passed: ` +
      `${result.status}, ${result.passedGates} passed, ` +
      `${result.heldGates} held, ${result.sourceCount} sources and ` +
      `${result.anchors} anchors\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
