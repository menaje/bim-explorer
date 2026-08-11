export const SPATIAL_CONSUMER_EVIDENCE_PATH =
  "compatibility/evidence/" +
  "federated-bim-surface-spatial-consumer-2026-08-11.json";
export const SPATIAL_RELEASE_READY_CONSUMER_EVIDENCE_PATH =
  "compatibility/evidence/" +
  "federated-bim-surface-spatial-release-ready-consumer-" +
  "2026-08-11.json";
export const SPATIAL_PUBLIC_ARTIFACT_CONSUMER_EVIDENCE_PATH =
  "compatibility/evidence/" +
  "federated-bim-surface-spatial-public-artifact-consumer-" +
  "2026-08-11.json";

const PACKAGE_NAME = "@bim-explorer/federated-bim-surface";
const PACKAGE_VERSION = "0.2.0";
const SOURCE_COMMIT =
  "b666c80fb147c49d4254d73e78d93baeeed56781";
const PACKAGE_SHA256 =
  "c652a4cd1843e26f98c9ff5ecfa701ef94acd7229453a1a13ff70a86a2b052af";
const RUNTIME_SHA256 =
  "22e243fa8426d0648f1f3ca70c5fa015356f656084b1b95d3fdb21bcb8187847";
const MANIFEST_FINGERPRINT =
  "ee1617ad2a19e9e2f9be75dfefb42632edad1b9b9529b413da7a9306addf6caf";

function exactTrueRecord(value, keys) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value)) === JSON.stringify(keys) &&
    Object.values(value).every((item) => item === true);
}

export function validateSpatialConsumerAdmission(evidence) {
  if (
    evidence?.schema !==
      "bim-explorer-federated-bim-surface-spatial-consumer-admission/1" ||
    evidence.status !== "passed-private-candidate-actual-consumer" ||
    evidence.asOf !== "2026-08-11" ||
    evidence.source?.repository !==
      "https://github.com/menaje/coni-spatial" ||
    evidence.source.commit !==
      "ef9b92d6b054d1329856ecfdd0c6913d83d09538" ||
    evidence.source.issue !==
      "https://github.com/menaje/coni-spatial/issues/22" ||
    evidence.source.evidencePath !==
      "compatibility/evidence/" +
        "spatial-federated-bim-surface-consumer-" +
        "darwin-arm64-2026-08-11.json" ||
    evidence.source.evidenceUrl !==
      "https://github.com/menaje/coni-spatial/blob/" +
        "ef9b92d6b054d1329856ecfdd0c6913d83d09538/" +
        "compatibility/evidence/" +
        "spatial-federated-bim-surface-consumer-" +
        "darwin-arm64-2026-08-11.json" ||
    evidence.source.evidenceSha256 !==
      "e05040bab052e19c1481042312acac9fc0fe59a1fbd26b52849232f783b489a7" ||
    evidence.candidate?.packageName !== PACKAGE_NAME ||
    evidence.candidate.packageVersion !== PACKAGE_VERSION ||
    evidence.candidate.sourceCommit !== SOURCE_COMMIT ||
    evidence.candidate.packageSha256 !== PACKAGE_SHA256 ||
    evidence.candidate.runtimeSha256 !== RUNTIME_SHA256 ||
    evidence.candidate.packageManifestFingerprint !==
      MANIFEST_FINGERPRINT ||
    evidence.candidate.surfaceContract !==
      "bim-explorer-bim-surface/0.2" ||
    evidence.candidate.referenceAnchorContract !==
      "bim-explorer-reference-anchor/0.1" ||
    !exactTrueRecord(evidence.result, [
      "cleanInstalledPackageImport",
      "externalBaseAndSpatialOverlay",
      "sourceScopedIfcQuery",
      "bidirectionalCanonicalSelection",
      "durableWorkspaceAnchor",
      "staleWithoutAutomaticRemap",
      "terminalCleanup",
      "authorityFree",
    ]) ||
    JSON.stringify(evidence.claims) !== JSON.stringify({
      actualSpatialConsumer: true,
      privateCandidateOnly: true,
      publicPackage: false,
      spatialVsixBundledRuntime: false,
      productionSupport: false,
    }) ||
    !Array.isArray(evidence.limitations) ||
    evidence.limitations.length < 4
  ) {
    throw new Error("Spatial consumer admission evidence is invalid");
  }
  return Object.freeze({
    status: evidence.status,
    sourceCommit: evidence.source.commit,
    packageSha256: evidence.candidate.packageSha256,
    runtimeSha256: evidence.candidate.runtimeSha256,
  });
}

export function validateSpatialReleaseReadyConsumerAdmission(
  evidence,
) {
  if (
    evidence?.schema !==
      "bim-explorer-federated-bim-surface-spatial-" +
        "release-ready-consumer-admission/1" ||
    evidence.status !==
      "passed-release-ready-package-consumer-revalidation" ||
    evidence.asOf !== "2026-08-11" ||
    evidence.source?.repository !==
      "https://github.com/menaje/coni-spatial" ||
    evidence.source.commit !==
      "ef0c1ea80dae3b5696274542a0e0ff9f263ae4e5" ||
    evidence.source.issue !==
      "https://github.com/menaje/coni-spatial/issues/22" ||
    evidence.source.issueComment !==
      "https://github.com/menaje/coni-spatial/issues/22" +
        "#issuecomment-5247541631" ||
    evidence.source.evidencePath !==
      "compatibility/evidence/" +
        "spatial-federated-bim-surface-release-ready-consumer-" +
        "darwin-arm64-2026-08-11.json" ||
    evidence.source.evidenceUrl !==
      "https://github.com/menaje/coni-spatial/blob/" +
        "ef0c1ea80dae3b5696274542a0e0ff9f263ae4e5/" +
        "compatibility/evidence/" +
        "spatial-federated-bim-surface-release-ready-consumer-" +
        "darwin-arm64-2026-08-11.json" ||
    evidence.source.evidenceSha256 !==
      "b14d3844c271a9d6fd0de2c1b7c9b80b75ec554dc6f1c826f11bd771e8693d54" ||
    evidence.candidate?.packageName !== PACKAGE_NAME ||
    evidence.candidate.packageVersion !== PACKAGE_VERSION ||
    evidence.candidate.sourceCommit !==
      "94c3c29927cec4539f7f77ad000dd6eb373f14cd" ||
    evidence.candidate.packageBytes !== 97623 ||
    evidence.candidate.packageSha256 !==
      "3bdb747d5eb38a45e0e753a14c8a9557b200c69a5469b416210293ac1dec63cb" ||
    evidence.candidate.runtimeSha256 !== RUNTIME_SHA256 ||
    evidence.candidate.packageManifestFingerprint !==
      MANIFEST_FINGERPRINT ||
    evidence.candidate.surfaceContract !==
      "bim-explorer-bim-surface/0.2" ||
    evidence.candidate.sourceContract !==
      "bim-explorer-bim-source/0.2" ||
    evidence.candidate.referenceAnchorContract !==
      "bim-explorer-reference-anchor/0.1" ||
    !exactTrueRecord(evidence.result, [
      "exactGitObjectArchive",
      "cleanInstalledPackageImport",
      "exactPackageBytes",
      "exactRuntimeBytes",
      "threeSourceComposition",
      "sourceScopedIfcQuery",
      "bidirectionalCanonicalSelection",
      "durableWorkspaceAnchor",
      "staleWithoutAutomaticRemap",
      "terminalCleanup",
      "authorityFree",
    ]) ||
    JSON.stringify(evidence.claims) !== JSON.stringify({
      releaseReadyPackageConsumerRevalidation: true,
      privateCandidateOnly: true,
      publicPackage: false,
      spatialVsixBundledRuntime: false,
      productionSupport: false,
    }) ||
    !Array.isArray(evidence.limitations) ||
    evidence.limitations.length < 4
  ) {
    throw new Error(
      "Spatial release-ready consumer admission evidence is invalid",
    );
  }
  return Object.freeze({
    status: evidence.status,
    sourceCommit: evidence.source.commit,
    packageSourceCommit: evidence.candidate.sourceCommit,
    packageBytes: evidence.candidate.packageBytes,
    packageSha256: evidence.candidate.packageSha256,
    runtimeSha256: evidence.candidate.runtimeSha256,
  });
}

export function validateSpatialPublicArtifactConsumerAdmission(
  evidence,
) {
  if (
    evidence?.schema !==
      "bim-explorer-federated-bim-surface-spatial-" +
        "public-artifact-consumer-admission/1" ||
    evidence.status !== "passed-public-artifact-spatial-admission" ||
    evidence.asOf !== "2026-08-11" ||
    evidence.source?.repository !==
      "https://github.com/menaje/coni-spatial" ||
    evidence.source.commit !==
      "55d96e86bcda274964f6ceb8540a1a93355a975e" ||
    evidence.source.issue !==
      "https://github.com/menaje/coni-spatial/issues/22" ||
    evidence.source.issueComment !==
      "https://github.com/menaje/coni-spatial/issues/22" +
        "#issuecomment-5248220876" ||
    evidence.source.ciComment !==
      "https://github.com/menaje/coni-spatial/issues/22" +
        "#issuecomment-5248238473" ||
    evidence.source.evidencePath !==
      "compatibility/evidence/" +
        "spatial-federated-bim-surface-public-v0.2.0-consumer-" +
        "darwin-arm64-2026-08-11.json" ||
    evidence.source.evidenceUrl !==
      "https://github.com/menaje/coni-spatial/blob/" +
        "55d96e86bcda274964f6ceb8540a1a93355a975e/" +
        "compatibility/evidence/" +
        "spatial-federated-bim-surface-public-v0.2.0-consumer-" +
        "darwin-arm64-2026-08-11.json" ||
    evidence.source.evidenceBytes !== 8379 ||
    evidence.source.evidenceSha256 !==
      "a8db52a6907b6b76a242177aaeed6c8550a21f4e5ca77c663ebd322afc07c8a9" ||
    evidence.publicArtifact?.packageName !== PACKAGE_NAME ||
    evidence.publicArtifact.packageVersion !== PACKAGE_VERSION ||
    evidence.publicArtifact.releaseTag !== "bim-surface-v0.2.0" ||
    evidence.publicArtifact.annotatedTagObject !==
      "111df108f964edbf5ba3621da0e9c3321c64d820" ||
    evidence.publicArtifact.releaseCommit !==
      "13f02b8b30a3aa236f8052b458462bc1d0f1bc09" ||
    evidence.publicArtifact.packageBytes !== 97623 ||
    evidence.publicArtifact.packageSha256 !==
      "3bdb747d5eb38a45e0e753a14c8a9557b200c69a5469b416210293ac1dec63cb" ||
    evidence.publicArtifact.runtimeSha256 !== RUNTIME_SHA256 ||
    evidence.publicArtifact.packageManifestFingerprint !==
      MANIFEST_FINGERPRINT ||
    evidence.publicArtifact.explorerReleaseEvidence?.sourceCommit !==
      "7f7ae13ed85046c2d14316f18fcba7a8ab48f88a" ||
    evidence.publicArtifact.explorerReleaseEvidence.path !==
      "compatibility/evidence/" +
        "federated-bim-surface-release-v0.2.0-2026-08-11.json" ||
    evidence.publicArtifact.explorerReleaseEvidence.byteLength !== 5247 ||
    evidence.publicArtifact.explorerReleaseEvidence.sha256 !==
      "1b6b321e4e395a35f7dc0cb492e0d792fd444a15b2d71c2aadf62e0d89ad113f" ||
    !exactTrueRecord(evidence.result, [
      "anonymousDownload",
      "explorerCheckoutIndependent",
      "offlineCleanInstall",
      "annotatedTagAndAssetIntegrity",
      "checksumLicenseNoticeSourceOfferSpdx",
      "githubBuildProvenance",
      "exactPackageBytes",
      "exactRuntimeBytes",
      "threeSourceComposition",
      "bidirectionalCanonicalSelection",
      "anchorExactThenStaleNoRemap",
      "terminalCleanup",
      "authorityFree",
      "existingSpatialVsixRegression",
    ]) ||
    JSON.stringify(evidence.qualification) !== JSON.stringify({
      platform: "darwin-arm64",
      nodeTests: 362,
      conformanceTests: 66,
      vscodeVersion: "1.132",
      publicArtifactEvidenceByteIdenticalRuns: 2,
    }) ||
    JSON.stringify(evidence.hostedCi) !== JSON.stringify({
      runId: 31451635328,
      attempts: 2,
      runnerAssigned: false,
      stepsStarted: false,
      externalInfrastructureFailure: true,
    }) ||
    JSON.stringify(evidence.claims) !== JSON.stringify({
      publicArtifactSpatialAdmission: true,
      actualSpatialConsumer: true,
      publicGithubReleaseArtifact: true,
      npmRegistryPackage: false,
      spatialVsixBundledRuntime: false,
      actualBrowserOrVscodeBimPixels: false,
      crossPlatformConsumer: false,
      productionSupport: false,
    }) ||
    !Array.isArray(evidence.limitations) ||
    evidence.limitations.length < 5
  ) {
    throw new Error(
      "Spatial public-artifact consumer admission evidence is invalid",
    );
  }
  return Object.freeze({
    status: evidence.status,
    sourceCommit: evidence.source.commit,
    releaseCommit: evidence.publicArtifact.releaseCommit,
    packageBytes: evidence.publicArtifact.packageBytes,
    packageSha256: evidence.publicArtifact.packageSha256,
    runtimeSha256: evidence.publicArtifact.runtimeSha256,
    explorerReleaseEvidenceSha256:
      evidence.publicArtifact.explorerReleaseEvidence.sha256,
  });
}
