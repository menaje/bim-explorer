import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TRUE_GATES = Object.freeze([
  "versionedHostNeutralContract",
  "singlePackageEntrypoint",
  "sourceIdentityPreserved",
  "boundedRendererSemanticComposition",
  "deterministicLifecycleCleanup",
  "standaloneAuthorityFree",
  "zeroRuntimeDependencies",
  "deterministicPack",
  "offlineCleanInstall",
  "browserProductComposition",
  "vscodeProductComposition",
  "optionalSpatialProviderContract",
]);
const HELD_GATES = Object.freeze([
  "immutablePublicReleaseAsset",
  "registryPublication",
  "actualSpatialConsumerConformance",
  "stableProductionSupport",
]);
const CONTRACT = Object.freeze({
  package: "@bim-explorer/bim-surface",
  version: "0.1.0",
  surface: "bim-explorer-bim-surface/0.1",
  receipt: "bim-explorer-bim-surface-receipt/0.1",
  sourceProtocol: "bim-explorer-bim-source/0.2",
  renderer: "bim-explorer-bim-renderer-3d/0.1",
  semanticExplorer:
    "bim-explorer-bim-semantic-explorer/0.1",
  optionalSpatialIntegration:
    "bim-explorer-spatial-integration/0.1",
});
const EXPECTED_FILES = Object.freeze([
  "LICENSE",
  "NOTICE",
  "README.md",
  "SOURCE_OFFER.md",
  "package.json",
  "runtime/index.mjs",
]);
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validateEvidence(evidence, runtimeBytes) {
  plainRecord(evidence, "BIM surface package evidence");
  const candidate = plainRecord(
    evidence.package,
    "BIM surface package candidate",
  );
  if (
    evidence.schema !==
      "bim-explorer-bim-surface-package-qualification/1" ||
    evidence.status !== "passed-release-candidate" ||
    evidence.asOf !== "2026-08-09" ||
    candidate.name !== CONTRACT.package ||
    candidate.version !== CONTRACT.version ||
    candidate.filename !==
      "bim-explorer-bim-surface-0.1.0.tgz" ||
    !(candidate.byteLength > 0) ||
    !(candidate.unpackedSize > candidate.byteLength) ||
    !/^[0-9a-f]{64}$/u.test(candidate.sha256 ?? "") ||
    !/^[0-9a-f]{64}$/u.test(
      candidate.runtimeSha256 ?? "",
    ) ||
    !/^sha512-[A-Za-z0-9+/]+=*$/u.test(
      candidate.integrity ?? "",
    ) ||
    !equalJson(candidate.files, EXPECTED_FILES) ||
    candidate.runtimeDependencies !== 0 ||
    candidate.repositoryManifestPrivate !== true ||
    sha256(runtimeBytes) !== candidate.runtimeSha256
  ) {
    throw new Error(
      "BIM surface package evidence identity is invalid",
    );
  }
  const reproducibility = plainRecord(
    evidence.reproducibility,
    "BIM surface package reproducibility",
  );
  if (
    reproducibility.independentPackRuns !== 2 ||
    reproducibility.byteIdentical !== true ||
    reproducibility.firstSha256 !== candidate.sha256 ||
    reproducibility.secondSha256 !== candidate.sha256
  ) {
    throw new Error(
      "BIM surface package reproducibility evidence is invalid",
    );
  }
  const consumer = plainRecord(
    evidence.consumer?.lifecycle,
    "BIM surface clean-install consumer",
  );
  const requiredExports = [
    "createBimModelSource",
    "createBimSurface",
    "createBounded3dRenderer",
    "createHeadless3dBackend",
    "createBimSpatialIntegration",
  ];
  if (
    evidence.consumer?.install !== "offline-local-tarball" ||
    evidence.consumer.cleanProject !== true ||
    !requiredExports.every((name) =>
      consumer.exports?.includes(name)) ||
    consumer.exports?.includes(
      "createBoundedPointCloudRenderer",
    ) ||
    consumer.packageVersion !== CONTRACT.version ||
    consumer.contract !== CONTRACT.surface ||
    consumer.receipt !== CONTRACT.receipt ||
    consumer.source?.fingerprint !== SOURCE_FINGERPRINT ||
    consumer.source.revisionId !==
      `source-snapshot:${SOURCE_FINGERPRINT}` ||
    consumer.source.products !== 2 ||
    consumer.selection?.expressId !== 40 ||
    consumer.selection.globalId !==
      "0AAAAAAAAAAAAAAAAAAA16" ||
    consumer.search?.loaded !== 2 ||
    consumer.search.total !== 2 ||
    !(consumer.renderer?.uploadedBytes > 0) ||
    !(consumer.renderer?.sourceReadBytes > 0)
  ) {
    throw new Error(
      "BIM surface clean-install consumer evidence is invalid",
    );
  }
  const authority = plainRecord(
    consumer.authority,
    "BIM surface authority",
  );
  if (
    !equalJson(Object.keys(authority), [
      "workspace",
      "canonicalEntityId",
      "sourceMutation",
      "revisionMutation",
      "acceptance",
      "publish",
      "export",
    ]) ||
    Object.values(authority).some((value) => value !== false) ||
    consumer.spatial?.contract !==
      CONTRACT.optionalSpatialIntegration ||
    consumer.spatial.availability !== "standalone" ||
    consumer.spatial.workspaceId !== null ||
    consumer.spatial.disposed !== true
  ) {
    throw new Error(
      "BIM surface authority or optional Spatial evidence is invalid",
    );
  }
  const cleanup = plainRecord(
    consumer.cleanup,
    "BIM surface consumer cleanup",
  );
  if (
    cleanup.surfaceStatus !== "disposed" ||
    cleanup.explorerDisposed !== true ||
    cleanup.rendererDisposed !== true ||
    cleanup.sourceSessionDisposed !== true ||
    cleanup.sourceDisposed !== true ||
    cleanup.backendBytes !== 0 ||
    cleanup.backendDisposed !== true
  ) {
    throw new Error(
      "BIM surface cleanup evidence is invalid",
    );
  }
  if (
    evidence.productComposition?.browserEntrypoint !==
      "apps/bim-explorer-web/app.mjs" ||
    evidence.productComposition.browserUsesSurfaceRuntime !==
      true ||
    evidence.productComposition.vscodeSharedEntrypoint !== true ||
    evidence.productComposition.vscodeStagesSurfaceRuntime !==
      true ||
    Object.values(evidence.claims ?? {}).some(
      (value) => value !== false,
    ) ||
    Object.keys(evidence.claims ?? {}).length !== 4 ||
    /\/Users\/|\/Volumes\/|[A-Z]:\\/u.test(
      JSON.stringify(evidence),
    )
  ) {
    throw new Error(
      "BIM surface product composition or claims are invalid",
    );
  }
  return candidate;
}

export function validateBimSurfaceCompatibility(
  manifest,
  evidence,
  runtimeBytes,
) {
  plainRecord(manifest, "BIM surface compatibility manifest");
  const candidate = validateEvidence(evidence, runtimeBytes);
  if (
    manifest.schema !==
      "bim-explorer-bim-surface-compatibility/1" ||
    manifest.status !== "experimental" ||
    manifest.asOf !== "2026-08-09" ||
    !equalJson(manifest.contract, CONTRACT)
  ) {
    throw new Error(
      "BIM surface compatibility identity is invalid",
    );
  }
  const artifact = plainRecord(
    manifest.artifact,
    "BIM surface artifact",
  );
  if (
    artifact.channel !== "release-candidate" ||
    artifact.filename !== candidate.filename ||
    artifact.sha256 !== candidate.sha256 ||
    artifact.runtimeSha256 !== candidate.runtimeSha256 ||
    artifact.runtimeDependencies !== 0 ||
    artifact.repositoryManifestPrivate !== true
  ) {
    throw new Error(
      "BIM surface compatibility artifact is invalid",
    );
  }
  const gates = plainRecord(
    manifest.gates,
    "BIM surface gates",
  );
  for (const gate of TRUE_GATES) {
    if (gates[gate] !== true) {
      throw new Error(
        `BIM surface gate ${gate} must pass`,
      );
    }
  }
  for (const gate of HELD_GATES) {
    if (gates[gate] !== false) {
      throw new Error(
        `BIM surface gate ${gate} must remain held`,
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
    manifest.evidence?.package !==
      "compatibility/evidence/" +
        "bim-surface-package-2026-08-09.json"
  ) {
    throw new Error(
      "BIM surface gate inventory is invalid",
    );
  }
  const policy = plainRecord(
    manifest.policy,
    "BIM surface policy",
  );
  if (
    policy.readOnly !== true ||
    policy.hostNeutral !== true ||
    policy.spatialAuthority !== false ||
    policy.allowSpatialPrivateDependency !== false ||
    policy.repositoryPublishDisabled !== true ||
    policy.claimReleaseCandidate !== true ||
    policy.claimPublicPackage !== false ||
    policy.claimActualSpatialConsumer !== false ||
    policy.claimProductionSupport !== false
  ) {
    throw new Error(
      "BIM surface policy overclaims compatibility",
    );
  }
  return Object.freeze({
    status: manifest.status,
    passedGates: TRUE_GATES.length,
    heldGates: HELD_GATES.length,
    blockers: manifest.blockers.length,
    packageSha256: candidate.sha256,
  });
}

async function main() {
  const [manifest, evidence, runtimeBytes] = await Promise.all([
    readFile("compatibility/bim-surface.json", "utf8")
      .then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "bim-surface-package-2026-08-09.json",
      "utf8",
    ).then(JSON.parse),
    readFile("packages/bim-surface/runtime/index.mjs"),
  ]);
  const result = validateBimSurfaceCompatibility(
    manifest,
    evidence,
    runtimeBytes,
  );
  process.stdout.write(
    `BIM surface compatibility check passed: ` +
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
