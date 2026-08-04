import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ALLOWED_STATUSES = new Set([
  "unresolved",
  "experimental",
  "qualified",
  "blocked",
]);
const REQUIRED_GATES = [
  "durableArtifact",
  "licenseMetadata",
  "neutralNamespaceDecision",
  "bimRenderSourceConformance",
  "threeDimensionalRendererConformance",
  "browserHostLifecycle",
  "vscodeHostLifecycle",
  "crossRepositoryCI",
];
const RELEASE_COMMIT =
  "fb25718468f1f0b1a9bac666035a0c8277f51a19";
const RELEASE_TAG = "viewer-core-v0.1.0";
const RELEASE_URL =
  "https://github.com/menaje/dwg-viewer/releases/tag/" +
  RELEASE_TAG;
const LICENSE_SHA256 =
  "eb5d29267fb807449697736cbcff74acfeebf36f9cb5305417dc440545a1fef9";
const SOURCE_SHA256 =
  "400071d0a99f14ef37c46560bde1651965a378e0586b5f470be3fda81e585243";
const PACKAGES = Object.freeze({
  viewerCore: Object.freeze({
    package: "@menaje/viewer-core",
    version: "0.1.0",
    specifier:
      "https://github.com/menaje/dwg-viewer/releases/download/" +
      "viewer-core-v0.1.0/menaje-viewer-core-0.1.0.tgz",
    file: "menaje-viewer-core-0.1.0.tgz",
    sha256:
      "2a04c367b5b2cf5870f5f18f33e2a1d8e545f099f0dd735c7e5d90f8224b698d",
    bytes: 44_323,
    contentSha256:
      "db4edb620f5f34c355d3030a16b703fed0f76f4f602d03737303683ce8269adb",
    entries: 30,
    integrity:
      "sha512-GPHRWsXuE5feI/+gTeBuBFIrEmG0pNSYr83qRFkFCDYQHQ5wuH7U/" +
      "g5RktH1H9inpjr83AZRTtiKtW9R5K9oBA==",
  }),
  renderProtocol: Object.freeze({
    package: "@menaje/viewer-render-protocol",
    version: "0.1.0",
    specifier:
      "https://github.com/menaje/dwg-viewer/releases/download/" +
      "viewer-core-v0.1.0/menaje-viewer-render-protocol-0.1.0.tgz",
    file: "menaje-viewer-render-protocol-0.1.0.tgz",
    sha256:
      "60e952677c17333fbdb07193ef87cafb1a0be9923573ac5366297a19cfc8b9ed",
    bytes: 11_158,
    contentSha256:
      "cf86c55a3d6f1afc64d42d3de6e80f5796fbe00b0b8e3eb0b15af465e0f78c09",
    entries: 9,
    integrity:
      "sha512-oVO2anfxt7TUv4JTdeZ/Lca+Y9khLuSkjztlQXxzYkjR8JAg8WLiiZXd4I8a" +
      "vQGuiGbqKrUACwl5yLAo9PptMQ==",
  }),
});

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

function allTrue(value, label) {
  const record = plainRecord(value, label);
  if (
    Object.keys(record).length === 0 ||
    !Object.values(record).every((item) => item === true)
  ) {
    throw new Error(`${label} must all pass`);
  }
}

function validatePackageEvidence(value, expected, label) {
  const packageEvidence = plainRecord(value, label);
  const releaseAsset = plainRecord(
    packageEvidence.releaseAsset,
    `${label} release asset`,
  );
  const lock = plainRecord(
    packageEvidence.lock,
    `${label} lock`,
  );
  const installed = plainRecord(
    packageEvidence.installedContent,
    `${label} installed content`,
  );
  if (
    packageEvidence.package !== expected.package ||
    packageEvidence.version !== expected.version ||
    packageEvidence.public !== true ||
    packageEvidence.license !== "MPL-2.0" ||
    packageEvidence.licenseSha256 !== LICENSE_SHA256 ||
    releaseAsset.file !== expected.file ||
    releaseAsset.url !== expected.specifier ||
    releaseAsset.publishedSha256 !== expected.sha256 ||
    releaseAsset.publishedBytes !== expected.bytes ||
    lock.resolved !== expected.specifier ||
    lock.integrity !== expected.integrity ||
    installed.entries !== expected.entries ||
    installed.sha256 !== expected.contentSha256
  ) {
    throw new Error(`${label} release identity is invalid`);
  }
}

function validateHost(value, expectedHost) {
  const host = plainRecord(value, `${expectedHost} host evidence`);
  const source = plainRecord(
    host.source,
    `${expectedHost} source evidence`,
  );
  const renderer = plainRecord(
    host.renderer,
    `${expectedHost} renderer evidence`,
  );
  const identity = plainRecord(
    host.identity,
    `${expectedHost} identity evidence`,
  );
  const cleanup = plainRecord(
    host.cleanup,
    `${expectedHost} cleanup evidence`,
  );
  if (
    host.host !== expectedHost ||
    host.protocolVersion !== "0.1.0" ||
    host.representation !== "3d" ||
    source.sha256 !== SOURCE_SHA256 ||
    source.ifcSchema !== "IFC4" ||
    source.profile !== "ReferenceView_V1.2" ||
    source.sourceBytes !== 4_028 ||
    source.geometryRangeBytes !== 996 ||
    renderer.backend !== "headless" ||
    renderer.actualGpu !== false ||
    JSON.stringify(renderer.rangeIds) !==
      JSON.stringify(["range:ifc:geometry:0"]) ||
    renderer.geometryRecords !== 1 ||
    renderer.instances !== 2 ||
    renderer.instancedTriangles !== 24 ||
    renderer.drawCalls !== 2 ||
    renderer.uploadedBytes !== 1_120 ||
    identity.expressId !== 40 ||
    identity.renderId !==
      "render:ifc:400071d0a99f14ef:40" ||
    identity.pickId !== "pick:ifc:400071d0a99f14ef:40" ||
    identity.externalIdentityToken !==
      `ifc-globalid:sha256:${SOURCE_SHA256}:` +
        "0AAAAAAAAAAAAAAAAAAA16" ||
    host.stalePick?.rejected !== true ||
    host.stalePick?.code !==
      "VIEWER_RENDER_STALE_REVISION" ||
    host.hostEvents !== 1 ||
    cleanup.runtimeDisposed !== true ||
    cleanup.hostDisposed !== true ||
    cleanup.sourceDisposed !== true ||
    cleanup.sourceSessionDisposed !== true ||
    cleanup.rendererDisposed !== true ||
    cleanup.rendererUnmounts !== 1 ||
    cleanup.backendDisposed !== true ||
    cleanup.backendUnmounts !== 1 ||
    cleanup.backendActiveBytes !== 0 ||
    cleanup.repeatedDisposalIdempotent !== true
  ) {
    throw new Error(
      `${expectedHost} actual BIM Viewer Core conformance is invalid`,
    );
  }
}

export function validateViewerCoreEvidence(value) {
  const evidence = plainRecord(
    value,
    "Viewer Core release evidence",
  );
  if (
    evidence.schema !==
      "bim-explorer-viewer-core-release-qualification/1" ||
    evidence.status !== "passed-public-preview" ||
    evidence.asOf !== "2026-08-04"
  ) {
    throw new Error("Viewer Core release evidence identity is invalid");
  }
  const release = plainRecord(
    evidence.release,
    "Viewer Core release",
  );
  if (
    release.repository !== "menaje/dwg-viewer" ||
    release.tag !== RELEASE_TAG ||
    release.tagCommit !== RELEASE_COMMIT ||
    release.releaseUrl !== RELEASE_URL ||
    release.publishedAt !== "2026-08-03T21:35:56Z" ||
    release.releaseStage !== "prerelease" ||
    release.tagPublicationApproved !== true ||
    release.automaticStablePromotion !== false
  ) {
    throw new Error("Viewer Core release pin is invalid");
  }
  const packageEvidence = plainRecord(
    evidence.packages,
    "Viewer Core package evidence",
  );
  for (const [key, expected] of Object.entries(PACKAGES)) {
    validatePackageEvidence(
      packageEvidence[key],
      expected,
      key,
    );
  }
  if (
    evidence.identities?.viewerCoreApi !==
      "menaje-viewer-core/0.1" ||
    evidence.identities?.renderProtocol !==
      "menaje-viewer-render-protocol/0.1.0" ||
    evidence.identities?.consumerPackage !==
      "@bim-explorer/viewer-core-consumer" ||
    evidence.identities?.bimSourceProtocol !==
      "bim-explorer-bim-source/0.2" ||
    evidence.identities?.bimRendererContract !==
      "bim-explorer-bim-renderer-3d/0.1"
  ) {
    throw new Error("Viewer Core contract identities are invalid");
  }
  const conformance = plainRecord(
    evidence.conformance,
    "Viewer Core conformance",
  );
  if (
    conformance.mockLifecycle?.disposed !== true ||
    conformance.mockLifecycle?.rangeBytes !== 4 ||
    conformance.mockDelta?.disposed !== true ||
    conformance.mockDelta?.deltaCount !== 2 ||
    conformance.mockDelta?.staleRejected !== true ||
    conformance.actualBimLifecycle?.disposed !== true ||
    conformance.actualBimLifecycle?.rangeBytes !== 4 ||
    conformance.actualBimLifecycle?.revisionId !==
      `source-snapshot:sha256:${SOURCE_SHA256}` ||
    !Array.isArray(conformance.actualBimRendererHosts) ||
    conformance.actualBimRendererHosts.length !== 2
  ) {
    throw new Error("Viewer Core source conformance is invalid");
  }
  validateHost(
    conformance.actualBimRendererHosts[0],
    "browser",
  );
  validateHost(
    conformance.actualBimRendererHosts[1],
    "vscode",
  );
  allTrue(
    conformance.assertions,
    "Viewer Core conformance assertions",
  );
  if (
    evidence.decision?.compatibility !==
      "passed-public-preview" ||
    evidence.decision?.productionStableRelease !==
      "held-upstream-prerelease" ||
    evidence.decision?.actualGpuQualification !==
      "held-existing-product-evidence-only" ||
    evidence.decision?.coniSpatialConsumerQualification !==
      "held-consumer-owned" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error("Viewer Core compatibility decision is invalid");
  }
  if (
    /\/Users\/|\/Volumes\/|[A-Z]:\\/u.test(
      JSON.stringify(evidence),
    )
  ) {
    throw new Error("Viewer Core evidence exposes a local path");
  }
  return Object.freeze({
    status: evidence.status,
    releaseTag: release.tag,
    hostCount: conformance.actualBimRendererHosts.length,
  });
}

export function validateViewerCoreManifest(
  value,
  evidence,
) {
  const manifest = plainRecord(
    value,
    "Viewer Core compatibility manifest",
  );
  if (
    manifest.schema !==
      "bim-explorer-viewer-core-compatibility/1"
  ) {
    throw new Error("unsupported Viewer Core compatibility schema");
  }
  if (!ALLOWED_STATUSES.has(manifest.status)) {
    throw new Error("invalid Viewer Core compatibility status");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(manifest.asOf)) {
    throw new Error(
      "Viewer Core compatibility asOf must be an ISO date",
    );
  }
  plainRecord(manifest.consumer, "consumer");
  const upstream = plainRecord(manifest.upstream, "upstream");
  const viewerCore = plainRecord(
    upstream.viewerCore,
    "upstream Viewer Core",
  );
  const renderProtocol = plainRecord(
    upstream.renderProtocol,
    "upstream render protocol",
  );
  const distribution = plainRecord(
    upstream.distribution,
    "upstream distribution",
  );
  const gates = plainRecord(
    manifest.admissionGates,
    "admission gates",
  );
  for (const gate of REQUIRED_GATES) {
    if (typeof gates[gate] !== "boolean") {
      throw new Error(`admission gate ${gate} must be boolean`);
    }
  }
  if (
    Object.keys(gates).length !== REQUIRED_GATES.length ||
    !Array.isArray(manifest.blockers) ||
    manifest.blockers.length === 0 ||
    !manifest.blockers.every(
      (blocker) =>
        typeof blocker === "string" && blocker.length > 0,
    )
  ) {
    throw new Error(
      "Viewer Core gate inventory or blockers are invalid",
    );
  }
  const policy = plainRecord(
    manifest.policy,
    "compatibility policy",
  );
  for (const key of [
    "allowRelativeCheckoutDependency",
    "allowCopiedViewerCore",
    "claimCompatibility",
    "productionClaims",
  ]) {
    if (typeof policy[key] !== "boolean") {
      throw new Error(
        `compatibility policy ${key} must be boolean`,
      );
    }
  }
  const observations = plainRecord(
    manifest.observations,
    "compatibility observations",
  );
  const localProbe = plainRecord(
    observations.localWorkspaceProbe,
    "local workspace probe",
  );
  if (
    localProbe.status !== "passed-local-workspace-only" ||
    localProbe.admissionEvidence !== false
  ) {
    throw new Error(
      "local workspace probe must remain non-admission evidence",
    );
  }

  if (manifest.status === "unresolved") {
    if (manifest.pin !== null) {
      throw new Error(
        "unresolved Viewer Core compatibility cannot have a pin",
      );
    }
    if (Object.values(gates).some(Boolean)) {
      throw new Error(
        "unresolved Viewer Core compatibility cannot claim passed gates",
      );
    }
    if (
      policy.allowRelativeCheckoutDependency ||
      policy.allowCopiedViewerCore ||
      policy.claimCompatibility ||
      policy.productionClaims
    ) {
      throw new Error(
        "unresolved Viewer Core compatibility must fail closed",
      );
    }
  } else {
    const evidenceReport = validateViewerCoreEvidence(evidence);
    const pin = plainRecord(manifest.pin, "Viewer Core pin");
    const releaseProbe = plainRecord(
      observations.releaseArtifactProbe,
      "release artifact probe",
    );
    if (
      manifest.status !== "experimental" ||
      manifest.asOf !== "2026-08-04" ||
      upstream.repository !== "menaje/dwg-viewer" ||
      upstream.observedCommit !== RELEASE_COMMIT ||
      viewerCore.package !== PACKAGES.viewerCore.package ||
      viewerCore.version !== PACKAGES.viewerCore.version ||
      viewerCore.api !== "menaje-viewer-core/0.1" ||
      viewerCore.private !== false ||
      renderProtocol.package !==
        PACKAGES.renderProtocol.package ||
      renderProtocol.version !==
        PACKAGES.renderProtocol.version ||
      renderProtocol.protocol !==
        "menaje-viewer-render-protocol/0.1.0" ||
      renderProtocol.private !== false ||
      distribution.kind !== "github-release-asset" ||
      distribution.published !== true ||
      distribution.releaseStage !== "prerelease" ||
      distribution.tag !== RELEASE_TAG ||
      distribution.releaseUrl !== RELEASE_URL ||
      distribution.tagPublicationApproved !== true ||
      distribution.automaticStablePromotion !== false
    ) {
      throw new Error(
        "experimental Viewer Core upstream identity is invalid",
      );
    }
    for (const [key, expected] of Object.entries(PACKAGES)) {
      const packagePin = plainRecord(
        pin[key],
        `${key} compatibility pin`,
      );
      if (
        packagePin.specifier !== expected.specifier ||
        packagePin.sha256 !== expected.sha256 ||
        packagePin.bytes !== expected.bytes ||
        packagePin.contentSha256 !==
          expected.contentSha256 ||
        packagePin.integrity !== expected.integrity
      ) {
        throw new Error(`${key} compatibility pin is invalid`);
      }
    }
    if (!Object.values(gates).every(Boolean)) {
      throw new Error(
        "experimental Viewer Core admission gates must all pass",
      );
    }
    if (
      releaseProbe.status !== evidenceReport.status ||
      releaseProbe.evidence !==
        "compatibility/evidence/" +
          "viewer-core-release-2026-08-04.json" ||
      releaseProbe.admissionEvidence !== true ||
      ![
        "immutableReleaseInstall",
        "actualBimRenderSource",
        "actualBimRenderer",
        "externalIdentity",
        "orderedDelta",
        "staleRejected",
        "browserHostDisposal",
        "vscodeHostDisposal",
      ].every((key) => releaseProbe[key] === true)
    ) {
      throw new Error(
        "Viewer Core release admission observation is invalid",
      );
    }
    if (
      policy.allowRelativeCheckoutDependency ||
      policy.allowCopiedViewerCore ||
      policy.claimCompatibility !== true ||
      policy.productionClaims !== false
    ) {
      throw new Error(
        "experimental Viewer Core policy must remain preview-only",
      );
    }
  }

  return Object.freeze({
    schema: manifest.schema,
    status: manifest.status,
    upstreamCommit: upstream.observedCommit,
    blockerCount: manifest.blockers.length,
    passedGates: Object.values(gates).filter(Boolean).length,
    localProbe: localProbe.status,
  });
}

async function main() {
  const manifestPath = path.join(
    process.cwd(),
    "compatibility",
    "viewer-core.json",
  );
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  );
  const evidencePath = path.join(
    process.cwd(),
    manifest.observations.releaseArtifactProbe.evidence,
  );
  const evidence = JSON.parse(
    await readFile(evidencePath, "utf8"),
  );
  const report = validateViewerCoreManifest(
    manifest,
    evidence,
  );
  console.log(
    `Viewer Core compatibility check passed: ${report.status}, ` +
      `${report.blockerCount} blockers, ` +
      `${report.passedGates} passed gates`,
  );
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
