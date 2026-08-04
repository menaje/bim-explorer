import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TRUE_GATES = [
  "bcfXml30BoundedLocalImport",
  "bcfXml30DeterministicLocalExport",
  "bcfIssueMetadata",
  "bcfCameraClippingVisibilitySelection",
  "sourceBoundBcfResolution",
  "missingBcfComponentDiagnostics",
  "ids10DocumentExploration",
  "idsTriStateResult",
  "idsProvenanceBoundary",
  "idsFailingEntitySelection",
  "bsddUriVersionPreservation",
  "explicitBsddNetworkLookup",
  "offlineMissingVocabulary",
  "staleSourceRejection",
  "authorityFreeExploration",
];
const HELD_GATES = [
  "fullBcfXsdValidation",
  "nativeIdsIfcValidation",
  "liveBsddServiceQualification",
  "spatialRevisionDiagnosticLinkage",
  "bcfCollaborationApi",
  "publicOpenBimPackage",
];
const EXPECTED_LIMITS = Object.freeze({
  maximumBcfArchiveBytes: 8_388_608,
  maximumBcfUncompressedBytes: 16_777_216,
  maximumBcfEntryBytes: 2_097_152,
  maximumBcfEntries: 128,
  maximumBcfTopics: 64,
  maximumBcfViewpoints: 256,
  maximumBcfComponents: 5_000,
  maximumBcfClippingPlanes: 6,
  maximumIdsBytes: 2_097_152,
  maximumIdsSpecifications: 1_000,
  maximumIdsResultEntities: 20_000,
  maximumBsddResponseBytes: 524_288,
  maximumBsddCacheEntries: 128,
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

export function validateOpenBimCompatibility(
  manifest,
  evidence,
) {
  plainRecord(manifest, "openBIM compatibility manifest");
  plainRecord(evidence, "openBIM evidence");
  if (
    manifest.schema !==
      "bim-explorer-openbim-compatibility/1" ||
    manifest.status !== "experimental" ||
    manifest.asOf !== "2026-08-04" ||
    evidence.schema !==
      "bim-explorer-openbim-qualification/1" ||
    evidence.status !== "passed-experimental" ||
    evidence.asOf !== manifest.asOf
  ) {
    throw new Error("openBIM evidence identity is invalid");
  }
  if (
    manifest.contract?.explorer !==
      "bim-explorer-openbim-explorer/0.1" ||
    manifest.contract.sourceProtocol !==
      "bim-explorer-bim-source/0.2" ||
    manifest.contract.bcfProfile !== "BCF XML 3.0" ||
    manifest.contract.idsProfile !== "IDS 1.0" ||
    manifest.contract.bsddApiProfile !==
      "Class/Property REST v1" ||
    evidence.contract?.explorer !==
      manifest.contract.explorer ||
    evidence.contract?.sourceProtocol !==
      manifest.contract.sourceProtocol
  ) {
    throw new Error("openBIM contract is invalid");
  }
  const gates = plainRecord(
    manifest.gates,
    "openBIM compatibility gates",
  );
  for (const gate of TRUE_GATES) {
    if (gates[gate] !== true) {
      throw new Error(`openBIM gate ${gate} must pass`);
    }
  }
  for (const gate of HELD_GATES) {
    if (gates[gate] !== false) {
      throw new Error(`openBIM gate ${gate} must remain held`);
    }
  }
  if (
    Object.keys(gates).length !==
      TRUE_GATES.length + HELD_GATES.length ||
    !equalJson(manifest.limits, EXPECTED_LIMITS) ||
    !Array.isArray(manifest.blockers) ||
    manifest.blockers.length !== HELD_GATES.length ||
    manifest.evidence?.synthetic !==
      "compatibility/evidence/" +
        "openbim-explorer-synthetic-2026-08-04.json"
  ) {
    throw new Error(
      "openBIM gate, limit, blocker, or evidence index is invalid",
    );
  }
  const policy = manifest.policy;
  if (
    policy?.readOnly !== true ||
    policy.localFirst !== true ||
    policy.automaticNetwork !== false ||
    policy.sourceMutation !== false ||
    policy.spatialAuthority !== false ||
    policy.acceptance !== false ||
    policy.publish !== false ||
    policy.claimFullBcfValidation !== false ||
    policy.claimNativeIdsValidation !== false ||
    policy.claimLiveBsddQualification !== false ||
    policy.claimProductionOpenBim !== false
  ) {
    throw new Error("openBIM policy overclaims authority");
  }
  if (
    evidence.standards?.bcf?.profile !== "BCF XML 3.0" ||
    evidence.standards.bcf.buildingSmartBranch !==
      "release_3_0" ||
    evidence.standards.bcf.buildingSmartCommit !==
      "bc48611d0d7a1587f028a2b69677a1aafd5cd0a8" ||
    evidence.standards?.ids?.profile !== "IDS 1.0" ||
    evidence.standards.ids.buildingSmartRelease !==
      "v1.0.0" ||
    evidence.standards?.bsdd?.apiHost !==
      "api.bsdd.buildingsmart.org" ||
    evidence.dependencies?.fflate?.version !== "0.8.3" ||
    evidence.dependencies.fflate.license !== "MIT" ||
    evidence.dependencies?.saxes?.version !== "6.0.0" ||
    evidence.dependencies.saxes.license !== "ISC"
  ) {
    throw new Error(
      "openBIM standard or dependency identity is invalid",
    );
  }
  if (
    evidence.source?.fingerprint !== SOURCE_FINGERPRINT ||
    evidence.source.revisionId !==
      `source-snapshot:${SOURCE_FINGERPRINT}` ||
    evidence.source.schema !== "IFC4" ||
    evidence.source.profile !== "ReferenceView_V1.2" ||
    evidence.source.products !== 2
  ) {
    throw new Error("openBIM source identity is invalid");
  }
  if (
    evidence.bcf?.archiveBytes <= 0 ||
    evidence.bcf.archiveBytes >
      EXPECTED_LIMITS.maximumBcfArchiveBytes ||
    evidence.bcf.uncompressedBytes >
      EXPECTED_LIMITS.maximumBcfUncompressedBytes ||
    evidence.bcf.entries !== 3 ||
    evidence.bcf.topics !== 1 ||
    evidence.bcf.viewpoints !== 1 ||
    evidence.bcf.deterministicExport !== true ||
    evidence.bcf.camera?.projection !== "perspective" ||
    !equalJson(evidence.bcf.camera.target, [2, 3, 1.5]) ||
    evidence.bcf.clippingPlanes !== 1 ||
    !equalJson(evidence.bcf.selected, [40]) ||
    !equalJson(evidence.bcf.visibilityExceptions, [40]) ||
    !evidence.bcf.diagnostics.includes(
      "component-global-id-not-found",
    ) ||
    evidence.bcf.canApply !== false ||
    evidence.bcf.networkRequests !== 0 ||
    evidence.bcf.staleSourceRejected !== true ||
    evidence.bcf.unsafeArchiveRejected !== true
  ) {
    throw new Error("openBIM BCF evidence is invalid");
  }
  if (
    evidence.ids?.title !== "Envelope requirements" ||
    evidence.ids.specifications !== 1 ||
    !equalJson(evidence.ids.applicability, ["entity"]) ||
    !equalJson(
      evidence.ids.requirements,
      ["classification", "property"],
    ) ||
    !equalJson(evidence.ids.resultCounts, {
      pass: 1,
      fail: 2,
      "not-evaluated": 1,
    }) ||
    evidence.ids.provenance?.kind !== "external" ||
    !equalJson(evidence.ids.selected, [40]) ||
    !evidence.ids.diagnostics.includes(
      "failing-entity-global-id-not-found",
    ) ||
    evidence.ids.completeResolution !== false ||
    evidence.ids.schemaValidated !== false ||
    evidence.ids.evaluatesIfcRequirements !== false ||
    evidence.ids.networkRequests !== 0 ||
    evidence.ids.staleSourceRejected !== true ||
    evidence.ids.doctypeRejected !== true
  ) {
    throw new Error("openBIM IDS evidence is invalid");
  }
  if (
    !equalJson(
      evidence.ids.vocabularyReferences,
      [
        {
          kind: "class",
          version: "4.3",
          code: "IfcWall",
        },
        {
          kind: "property",
          version: "4.3",
          code: "FireRating",
        },
      ],
    ) ||
    evidence.bsdd?.reference?.version !== "4.3" ||
    evidence.bsdd.reference.kind !== "class" ||
    evidence.bsdd.offlineStatus !== "offline-missing" ||
    evidence.bsdd.explicitLookupStatus !== "resolved" ||
    evidence.bsdd.cachedStatus !== "cached" ||
    evidence.bsdd.networkRequests !== 1 ||
    evidence.bsdd.cacheEntries !== 1 ||
    evidence.bsdd.request?.credentials !== "omit" ||
    !evidence.bsdd.endpoint.startsWith(
      "https://api.bsdd.buildingsmart.org/api/Class/v1?",
    )
  ) {
    throw new Error("openBIM bSDD evidence is invalid");
  }
  if (
    evidence.lifecycle?.beforeDispose?.bcfImports !== 1 ||
    evidence.lifecycle.beforeDispose.bcfExports !== 2 ||
    evidence.lifecycle.beforeDispose.idsImports !== 1 ||
    evidence.lifecycle.beforeDispose.idsResultImports !== 1 ||
    evidence.lifecycle.explorerDisposed !== true ||
    evidence.lifecycle.sessionDisposed !== true ||
    evidence.lifecycle.sourceDisposed !== true ||
    !equalJson(evidence.authority, {
      sourceMutation: false,
      acceptance: false,
      publish: false,
      spatialRevision: false,
    }) ||
    evidence.decision?.localReadOnlyExploration !==
      "passed-synthetic-source" ||
    evidence.decision.fullBcfSchemaValidation !== "held" ||
    evidence.decision.nativeIdsValidation !== "held" ||
    evidence.decision.automaticBsddLookup !== "prohibited" ||
    evidence.decision.spatialRevisionDiagnosticLinkage !==
      "held-spatial-owned" ||
    evidence.decision.publicPackage !==
      "held-independent-package-admission" ||
    evidence.decision.productionClaims !== false
  ) {
    throw new Error(
      "openBIM lifecycle, authority, or decision is invalid",
    );
  }
  if (
    /\/Users\/|\/Volumes\/|[A-Z]:\\/u.test(
      JSON.stringify(evidence),
    )
  ) {
    throw new Error("openBIM evidence exposes a local path");
  }
  return true;
}

async function main() {
  const root = process.cwd();
  const manifest = JSON.parse(await readFile(
    path.join(root, "compatibility/openbim-explorer.json"),
    "utf8",
  ));
  const evidence = JSON.parse(await readFile(
    path.join(
      root,
      "compatibility/evidence/" +
        "openbim-explorer-synthetic-2026-08-04.json",
    ),
    "utf8",
  ));
  validateOpenBimCompatibility(manifest, evidence);
  process.stdout.write(
    "openBIM compatibility check passed: " +
      `${TRUE_GATES.length} passed, ` +
      `${HELD_GATES.length} held\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
