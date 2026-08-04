import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
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

export function validateCommunityReleaseCompatibility(manifest) {
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
    typeof manifest.evidence?.releaseEvidence !== "string" ||
    manifest.evidence.releaseEvidence.length === 0 ||
    !Array.isArray(manifest.held) ||
    manifest.held.length !== 0
  ) {
    throw new Error("qualified release is missing publication evidence");
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
  const result = validateCommunityReleaseCompatibility(manifest);
  process.stdout.write(
    `Community release compatibility check passed: ` +
      `${result.status}, ${result.passed} passed and ` +
      `${result.held} held gates\n`,
  );
}
