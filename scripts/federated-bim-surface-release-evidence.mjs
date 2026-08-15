export const FEDERATED_BIM_SURFACE_RELEASE_EVIDENCE_PATH =
  "compatibility/evidence/" +
  "federated-bim-surface-release-v0.2.0-2026-08-11.json";

const PACKAGE_SHA256 =
  "3bdb747d5eb38a45e0e753a14c8a9557b200c69a5469b416210293ac1dec63cb";
const EXPECTED_ARTIFACTS = Object.freeze([
  Object.freeze({
    name: "LICENSE",
    byteLength: 16725,
    sha256:
      "1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5",
  }),
  Object.freeze({
    name: "NOTICE",
    byteLength: 489,
    sha256:
      "e14dfca45b0329948c16a3fdcc1f9cd6f9777f17825a359a14729b1d05735cf5",
  }),
  Object.freeze({
    name: "RELEASE_NOTES.md",
    byteLength: 1383,
    sha256:
      "1b25d4d9e587dc27b9021171a65637dd91fbb2e71d43b7f7bcea8176cb1b9a47",
  }),
  Object.freeze({
    name: "SHA256SUMS",
    byteLength: 708,
    sha256:
      "fc60b067c5e8c401f108ae161eb75aef189ac397b1dbe13e68cb0fbba1a246a8",
  }),
  Object.freeze({
    name: "SOURCE_OFFER.md",
    byteLength: 1042,
    sha256:
      "13b2a8e34147e2f0e47018712f63cc95e6c5752331b65efe2de7bc1c7d624980",
  }),
  Object.freeze({
    name: "TRADEMARKS.md",
    byteLength: 878,
    sha256:
      "10907d65e6bdf5e8e69c9d484c3e0ff24451f9dc62bd5d05329028670746531d",
  }),
  Object.freeze({
    name: "bim-explorer-federated-bim-surface-0.2.0.spdx.json",
    byteLength: 1290,
    sha256:
      "f6befdf5ca7393e9b3c600a17c2f79aafa6bd494a02874856d117db6bcd091db",
  }),
  Object.freeze({
    name: "bim-explorer-federated-bim-surface-0.2.0.tgz",
    byteLength: 97623,
    sha256: PACKAGE_SHA256,
  }),
  Object.freeze({
    name: "release-manifest.json",
    byteLength: 3875,
    sha256:
      "63c59f2cb7c6825a81ec918451744c9fde73f867c9b3785cd8ac59184ddb67e8",
  }),
]);

function exactTrueRecord(value, keys) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value)) === JSON.stringify(keys) &&
    Object.values(value).every((item) => item === true);
}

export function validateFederatedBimSurfaceReleaseEvidence(evidence) {
  if (
    evidence?.schema !==
      "bim-explorer-federated-bim-surface-release-evidence/1" ||
    evidence.status !== "passed-immutable-public-package-prerelease" ||
    evidence.capturedAt !== "2026-08-11T00:56:41Z" ||
    evidence.source?.repository !== "menaje/bim-explorer" ||
    evidence.source.commit !==
      "13f02b8b30a3aa236f8052b458462bc1d0f1bc09" ||
    evidence.source.branch !== "prerelease" ||
    evidence.source.tag !== "bim-surface-v0.2.0" ||
    evidence.source.annotatedTagObject !==
      "111df108f964edbf5ba3621da0e9c3321c64d820" ||
    evidence.source.tagSignature !== "unsigned-annotated" ||
    evidence.source.tagExactPrereleaseHead !== true ||
    evidence.repository?.visibility !== "public" ||
    evidence.repository.license !== "MPL-2.0" ||
    evidence.repository.anonymousRepositoryAccess !== true ||
    evidence.repository.immutableReleases !== true ||
    evidence.workflow?.name !== "BIM Surface Release" ||
    evidence.workflow.runId !== 31447505218 ||
    evidence.workflow.attempt !== 1 ||
    evidence.workflow.runUrl !==
      "https://github.com/menaje/bim-explorer/actions/runs/31447505218" ||
    evidence.workflow.conclusion !== "success" ||
    evidence.workflow.event !== "push" ||
    evidence.workflow.sourceRef !==
      "refs/tags/bim-surface-v0.2.0" ||
    evidence.workflow.linuxJob?.id !== 93644766822 ||
    evidence.workflow.linuxJob.conclusion !== "success" ||
    evidence.workflow.macosJob?.id !== 93644766878 ||
    evidence.workflow.macosJob.conclusion !== "success" ||
    evidence.workflow.publishJob?.id !== 93644961158 ||
    evidence.workflow.publishJob.conclusion !== "success" ||
    evidence.workflow.node !== "24" ||
    evidence.workflow.fullConformanceTestsPerPlatform !== 380 ||
    evidence.workflow.runtimeAuditVulnerabilities !== 0 ||
    evidence.workflow.crossPlatformByteIdentity !== true ||
    evidence.workflow.publicationAuthorized !== true ||
    evidence.release?.databaseId !== 368275424 ||
    evidence.release.url !==
      "https://github.com/menaje/bim-explorer/releases/tag/" +
        "bim-surface-v0.2.0" ||
    evidence.release.name !== "BIM Surface v0.2.0" ||
    evidence.release.version !== "0.2.0" ||
    evidence.release.draft !== false ||
    evidence.release.prerelease !== true ||
    evidence.release.immutable !== true ||
    evidence.release.publishedAt !== "2026-08-11T00:54:09Z" ||
    evidence.release.assets !== EXPECTED_ARTIFACTS.length ||
    evidence.release.anonymousPageAccess !== true ||
    evidence.release.anonymousPackageDownload !== true ||
    evidence.release.releaseIntegrityVerified !== true ||
    evidence.release.packageAssetVerified !== true ||
    evidence.release.downloadedChecksumsVerified !== true ||
    evidence.release.communityLatestPreserved !== true ||
    evidence.supplyChain?.spdxPackages !== 1 ||
    evidence.supplyChain.unknownRuntimeLicenses !== 0 ||
    evidence.supplyChain.runtimeDependencies !== 0 ||
    evidence.supplyChain.packageSha256 !== PACKAGE_SHA256 ||
    evidence.supplyChain.packageIntegrity !==
      "sha512-QoGdmKuP/VLva+WGHwGhfKO6e8yKrbJt1/iClIsM86aQbdFmKSbd6+oCc4mJEPo+3GMUpcgQnex6LKEYvs0d5w==" ||
    evidence.supplyChain.runtimeSha256 !==
      "22e243fa8426d0648f1f3ca70c5fa015356f656084b1b95d3fdb21bcb8187847" ||
    evidence.supplyChain.buildProvenanceAttested !== true ||
    evidence.supplyChain.buildProvenanceSubjects !== 3 ||
    evidence.supplyChain.releaseAttestationVerified !== true ||
    evidence.supplyChain.packageBuildAttestationVerified !== true ||
    evidence.supplyChain.packageReleaseAttestationVerified !== true ||
    evidence.supplyChain.releaseSigner !==
      "https://dotcom.releases.github.com" ||
    evidence.supplyChain.buildSignerWorkflow !==
      "menaje/bim-explorer/.github/workflows/" +
        "bim-surface-release.yml" ||
    JSON.stringify(evidence.artifacts) !==
      JSON.stringify(EXPECTED_ARTIFACTS) ||
    !exactTrueRecord(evidence.assertions, [
      "repositoryPublic",
      "anonymousRepositoryAccessible",
      "anonymousPackageDownloadVerified",
      "releaseImmutable",
      "annotatedTagExact",
      "prereleaseHeadExact",
      "macosBuildPassed",
      "linuxBuildPassed",
      "fullConformancePassed",
      "runtimeAuditClean",
      "crossPlatformByteIdentical",
      "downloadedAssetsMatchChecksums",
      "releaseAttestationVerified",
      "packageAssetVerified",
      "buildProvenanceAttested",
      "sourceAndNoticesPublished",
      "communityLatestPreserved",
      "authorityFreeBoundaryPreserved",
    ]) ||
    JSON.stringify(evidence.held) !== JSON.stringify({
      publicRegistryPublication: false,
      publicArtifactSpatialAdmission: false,
      spatialVsixBundledRuntime: false,
      stableProductionSupport: false,
    })
  ) {
    throw new Error(
      "federated BIM Surface public release evidence is invalid",
    );
  }
  return Object.freeze({
    status: evidence.status,
    version: evidence.release.version,
    commit: evidence.source.commit,
    assets: evidence.release.assets,
    packageBytes: EXPECTED_ARTIFACTS[7].byteLength,
    packageSha256: evidence.supplyChain.packageSha256,
  });
}
