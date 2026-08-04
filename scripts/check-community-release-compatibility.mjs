import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const EXPECTED_EVIDENCE_PATH =
  "compatibility/evidence/" +
  "community-release-v0.1.0-2026-08-04.json";
const REMOTE_GATES = Object.freeze([
  "macosTagBuild",
  "linuxTagBuild",
  "crossPlatformByteIdentity",
  "publicRepository",
  "privateVulnerabilityReporting",
  "taggedRelease",
  "artifactAttestation",
  "publishedAssetsVerified",
]);
const RELEASE_ARTIFACTS = Object.freeze([
  "LICENSE",
  "NOTICE",
  "RELEASE_NOTES.md",
  "SHA256SUMS",
  "SOURCE_OFFER.md",
  "THIRD_PARTY_NOTICES.md",
  "TRADEMARKS.md",
  "bim-explorer-0.1.0-source.spdx.json",
  "bim-explorer-0.1.0-source.tar.gz",
  "bim-explorer-0.1.0.spdx.json",
  "bim-explorer-0.1.0.vsix",
  "release-manifest.json",
]);
const RELEASE_ASSERTIONS = Object.freeze([
  "repositoryPublic",
  "privateVulnerabilityReportingEnabled",
  "releaseImmutable",
  "annotatedTagExact",
  "macosBuildPassed",
  "linuxBuildPassed",
  "crossPlatformByteIdentical",
  "runtimeAuditClean",
  "fullConformancePassed",
  "allReleaseAssetsAttested",
  "releaseIntegrityVerified",
  "downloadedAssetsMatchChecksums",
  "sourceAndNoticesPublished",
  "accountFreeReadOnlyBoundaryPreserved",
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

export function validateCommunityReleaseEvidence(evidence) {
  plainRecord(evidence, "Community release evidence");
  if (
    evidence.schema !==
      "bim-explorer-community-release-evidence/1" ||
    evidence.capturedAt !== "2026-08-04T06:12:54Z" ||
    evidence.source?.repository !== "menaje/bim-explorer" ||
    evidence.source.commit !==
      "c6978e1516a993fa4443e24d9ebe5a64ce540104" ||
    evidence.source.tag !== "v0.1.0" ||
    evidence.source.annotatedTagObject !==
      "1718eb4268ee2b9954960b40b515d35add45a46e" ||
    evidence.source.tagSignature !== "unsigned-annotated" ||
    evidence.source.releaseProvenanceSigned !== true
  ) {
    throw new Error("Community release source evidence is invalid");
  }
  if (
    evidence.repository?.visibility !== "public" ||
    evidence.repository.license !== "MPL-2.0" ||
    evidence.repository.privateVulnerabilityReporting !== true ||
    evidence.repository.immutableReleases !== true
  ) {
    throw new Error("Community release repository evidence is invalid");
  }
  if (
    evidence.workflow?.runId !== 30883173341 ||
    evidence.workflow.runUrl !==
      "https://github.com/menaje/bim-explorer/actions/runs/30883173341" ||
    evidence.workflow.conclusion !== "success" ||
    evidence.workflow.sourceRef !== "refs/tags/v0.1.0" ||
    evidence.workflow.linuxJob?.id !== 91908656875 ||
    evidence.workflow.linuxJob.conclusion !== "success" ||
    evidence.workflow.macosJob?.id !== 91908656894 ||
    evidence.workflow.macosJob.conclusion !== "success" ||
    evidence.workflow.publishJob?.id !== 91908749836 ||
    evidence.workflow.publishJob.conclusion !== "success" ||
    evidence.workflow.fullConformanceTests !== 193 ||
    evidence.workflow.runtimeAuditVulnerabilities !== 0 ||
    evidence.workflow.crossPlatformByteIdentity !== true
  ) {
    throw new Error("Community release workflow evidence is invalid");
  }
  if (
    evidence.release?.url !==
      "https://github.com/menaje/bim-explorer/releases/tag/v0.1.0" ||
    evidence.release.version !== "0.1.0" ||
    evidence.release.draft !== false ||
    evidence.release.prerelease !== false ||
    evidence.release.immutable !== true ||
    evidence.release.assets !== RELEASE_ARTIFACTS.length ||
    evidence.release.releaseIntegrityVerified !== true ||
    evidence.release.downloadedChecksumsVerified !== true
  ) {
    throw new Error("Community release publication evidence is invalid");
  }
  if (
    evidence.supplyChain?.runtimeSpdxPackages !== 6 ||
    evidence.supplyChain.sourceSpdxPackages !== 362 ||
    evidence.supplyChain.unknownRuntimeLicenses !== 0 ||
    evidence.supplyChain.exactNpmLock !== true ||
    evidence.supplyChain.buildProvenanceAttested !== true ||
    evidence.supplyChain.releaseAttestationVerified !== true ||
    evidence.supplyChain.vsixAttestationVerified !== true ||
    evidence.supplyChain.sourceArchiveAttestationVerified !== true ||
    evidence.supplyChain.runtimeSbomAttestationVerified !== true ||
    evidence.supplyChain.signerWorkflow !==
      "menaje/bim-explorer/.github/workflows/release.yml" ||
    evidence.supplyChain.sigstorePublicTransparencyLog !== true
  ) {
    throw new Error("Community release supply-chain evidence is invalid");
  }
  if (
    evidence.privacy?.historyCommits !== 48 ||
    evidence.privacy.historyUniquePaths !== 279 ||
    evidence.privacy.customerOrModelArtifacts !== 0 ||
    evidence.privacy.credentialPatternFiles !== 0
  ) {
    throw new Error("Community release privacy evidence is invalid");
  }

  if (
    !Array.isArray(evidence.artifacts) ||
    evidence.artifacts.length !== RELEASE_ARTIFACTS.length
  ) {
    throw new Error("Community release artifact evidence is incomplete");
  }
  const artifactNames = evidence.artifacts
    .map((artifact) => artifact?.name)
    .sort();
  if (
    JSON.stringify(artifactNames) !==
      JSON.stringify([...RELEASE_ARTIFACTS].sort()) ||
    evidence.artifacts.some((artifact) =>
      !Number.isSafeInteger(artifact?.byteLength) ||
      artifact.byteLength <= 0 ||
      !/^[a-f0-9]{64}$/u.test(artifact?.sha256 ?? ""),
    ) ||
    new Set(
      evidence.artifacts.map((artifact) => artifact.sha256),
    ).size !== RELEASE_ARTIFACTS.length ||
    evidence.artifacts.find((artifact) =>
      artifact.name === "bim-explorer-0.1.0.vsix")?.sha256 !==
      "b8ab966b28f5ecdfcf3941930b53bb68287bbaacce0c52ad252132789b9e9d56"
  ) {
    throw new Error("Community release artifact evidence is invalid");
  }

  const assertions = plainRecord(
    evidence.assertions,
    "Community release assertions",
  );
  if (
    JSON.stringify(Object.keys(assertions).sort()) !==
      JSON.stringify([...RELEASE_ASSERTIONS].sort()) ||
    !Object.values(assertions).every((value) => value === true)
  ) {
    throw new Error("Community release assertions are incomplete");
  }
  if (/(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
    JSON.stringify(evidence),
  )) {
    throw new Error("Community release evidence contains a local path");
  }
  return Object.freeze({
    artifacts: evidence.artifacts.length,
    assertions: Object.keys(assertions).length,
  });
}

export function validateCommunityReleaseCompatibility(
  manifest,
  evidence = null,
) {
  plainRecord(manifest, "Community release manifest");
  if (
    manifest.schema !==
      "bim-explorer-community-release-compatibility/1" ||
    !["release-candidate", "qualified"].includes(manifest.status) ||
    manifest.asOf !== "2026-08-04" ||
    manifest.release?.version !== "0.1.0" ||
    manifest.release.expectedTag !== "v0.1.0" ||
    manifest.release.implementationLicense !== "MPL-2.0" ||
    manifest.release.specificationLicense !== "Apache-2.0"
  ) {
    throw new Error("Community release identity is invalid");
  }
  const gates = plainRecord(manifest.gates, "Community release gates");
  if (
    Object.keys(gates).length !== 24 ||
    Object.values(gates).some((value) =>
      typeof value !== "boolean")
  ) {
    throw new Error("Community release gates are incomplete");
  }
  const policy = plainRecord(
    manifest.policy,
    "Community release policy",
  );
  if (
    policy.readOnly !== true ||
    policy.localFirst !== true ||
    policy.accountRequired !== false ||
    policy.telemetry !== false ||
    policy.cloudUpload !== false ||
    policy.nativeWrite !== false ||
    policy.paidSupport !== false ||
    policy.spatialAuthority !== false ||
    policy.claimProductionBim !== false
  ) {
    throw new Error("Community release policy overclaims authority");
  }
  if (manifest.status === "release-candidate") {
    const failed = Object.entries(gates)
      .filter(([, value]) => value === false)
      .map(([name]) => name)
      .sort();
    if (
      JSON.stringify(failed) !==
        JSON.stringify([...REMOTE_GATES].sort()) ||
      manifest.evidence?.releaseEvidence !== null ||
      !Array.isArray(manifest.held) ||
      manifest.held.length !== 7
    ) {
      throw new Error(
        "release candidate may hold only remote publication gates",
      );
    }
  } else if (
    !Object.values(gates).every(Boolean) ||
    manifest.evidence?.releaseEvidence !== EXPECTED_EVIDENCE_PATH ||
    !Array.isArray(manifest.held) ||
    manifest.held.length !== 0
  ) {
    throw new Error("qualified release is missing publication evidence");
  } else {
    if (evidence === null) {
      throw new Error("qualified release is missing publication evidence");
    }
    validateCommunityReleaseEvidence(evidence);
  }
  if (/(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
    JSON.stringify(manifest),
  )) {
    throw new Error("Community release manifest contains a local path");
  }
  return Object.freeze({
    status: manifest.status,
    passed: Object.values(gates).filter(Boolean).length,
    held: Object.values(gates).filter((value) => !value).length,
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const manifest = JSON.parse(
    await readFile(
      path.join(ROOT, "compatibility", "community-release.json"),
      "utf8",
    ),
  );
  let evidence = null;
  if (manifest.status === "qualified") {
    evidence = JSON.parse(
      await readFile(
        path.join(ROOT, manifest.evidence.releaseEvidence),
        "utf8",
      ),
    );
  }
  const result = validateCommunityReleaseCompatibility(
    manifest,
    evidence,
  );
  process.stdout.write(
    `Community release compatibility check passed: ` +
      `${result.status}, ${result.passed} passed and ` +
      `${result.held} held gates\n`,
  );
}
