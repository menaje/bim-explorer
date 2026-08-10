export const SPATIAL_CONSUMER_EVIDENCE_PATH =
  "compatibility/evidence/" +
  "federated-bim-surface-spatial-consumer-2026-08-11.json";

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
