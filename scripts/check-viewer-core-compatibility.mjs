import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  validateViewerCoreProductEntrypoints,
} from "./check-bim-product-shell-compatibility.mjs";
import {
  validateRepresentativeModelsPhysicalGpuQualification,
} from "./qualify-representative-models-physical-gpu.mjs";

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
  "productEntrypointAdoption",
];
const RELEASE_COMMIT =
  "e225c2c8531e1f5e9677238d85adf6f686203026";
const RELEASE_TAG = "viewer-core-v0.1.2";
const RELEASE_URL =
  "https://github.com/menaje/dwg-viewer/releases/tag/" +
  RELEASE_TAG;
const LICENSE_SHA256 =
  "3f3d9e0024b1921b067d6f7f88deb4a60cbe7a78e76c64e3f1d7fc3b779b9d04";
const SOURCE_SHA256 =
  "400071d0a99f14ef37c46560bde1651965a378e0586b5f470be3fda81e585243";
const PACKAGES = Object.freeze({
  viewerCore: Object.freeze({
    package: "@menaje/viewer-core",
    version: "0.1.2",
    specifier:
      "https://github.com/menaje/dwg-viewer/releases/download/" +
      "viewer-core-v0.1.2/menaje-viewer-core-0.1.2.tgz",
    file: "menaje-viewer-core-0.1.2.tgz",
    sha256:
      "69bedf751ef718eb8e37bb06718d5a956f33f567225bf64468d25e42c5a82c4c",
    bytes: 49_537,
    contentSha256:
      "fd46b69f95a831c518be2ccff5f08d2d0170b5a79f18cfcdfc6c198f78b8af19",
    entries: 31,
    integrity:
      "sha512-REN+i3+b894/pzhjOhT7Al0TXCrzgteBCqrHlmYdrcSI4E6HFA3dGg8x" +
      "XX21Vj//VNgjr3xUDdMqd3USX9Vl7A==",
  }),
  renderProtocol: Object.freeze({
    package: "@menaje/viewer-render-protocol",
    version: "0.1.2",
    specifier:
      "https://github.com/menaje/dwg-viewer/releases/download/" +
      "viewer-core-v0.1.2/menaje-viewer-render-protocol-0.1.2.tgz",
    file: "menaje-viewer-render-protocol-0.1.2.tgz",
    sha256:
      "6534ec7d021e06d3ea616ae15fb995ece57a7c3292fc37e892a28db8e2a91d42",
    bytes: 16_424,
    contentSha256:
      "6b02978d161a61f4ed8b3453b941c13a2c6a7f2f58bb8477e980a0ab34e0d1d2",
    entries: 10,
    integrity:
      "sha512-Vf73Tyd+q0vmlHvsEtXizF3C6Y0nKyxR8jT32yUO2/hUaeUmDYGxObwj" +
      "3D9ETt8eobKoL8t19zaIH8fIUtx0jA==",
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
    release.publishedAt !== "2026-08-04T04:36:50Z" ||
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
  productEvidence,
  physicalEvidence,
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
    validateViewerCoreProductEntrypoints(productEvidence);
    const physicalReport =
      validateRepresentativeModelsPhysicalGpuQualification(
        physicalEvidence,
      );
    const pin = plainRecord(manifest.pin, "Viewer Core pin");
    const releaseProbe = plainRecord(
      observations.releaseArtifactProbe,
      "release artifact probe",
    );
    const productProbe = plainRecord(
      observations.productEntrypointProbe,
      "product entrypoint probe",
    );
    const physicalProbe = plainRecord(
      observations.physicalGpuProductEntrypointProbe,
      "physical GPU product entrypoint probe",
    );
    if (
      manifest.status !== "experimental" ||
      manifest.asOf !== "2026-08-11" ||
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
    if (
      physicalProbe.status !== physicalReport.status ||
      physicalProbe.evidence !==
        "compatibility/evidence/" +
          "bim-product-shell-representative-physical-gpu-" +
          "darwin-arm64-2026-08-11.json" ||
      physicalProbe.admissionEvidence !== true ||
      ![
        "browserIfc",
        "browserGltfGlb",
        "stagedVscodeIfcGltfGlb",
        "cleanVsixIfcGltfGlb",
        "softwareFallbackDisabled",
        "appleMetal",
        "terminalCleanup",
      ].every((key) => physicalProbe[key] === true)
    ) {
      throw new Error(
        "Viewer Core physical GPU product observation is invalid",
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
      productProbe.status !==
        "passed-browser-vscode-ifc-glb" ||
      productProbe.evidence !==
        "compatibility/evidence/" +
          "bim-product-shell-viewer-core-product-entrypoints-" +
          "2026-08-11.json" ||
      productProbe.admissionEvidence !== true ||
      ![
        "browserIfc",
        "browserGltfGlb",
        "stagedVscodeIfc",
        "stagedVscodeGltfGlb",
        "cleanVsixIfc",
        "cleanVsixGltfGlb",
        "rangeReadThroughPublicSession",
        "selectionHostLifecycle",
        "terminalCleanup",
      ].every((key) => productProbe[key] === true)
    ) {
      throw new Error(
        "Viewer Core product entrypoint observation is invalid",
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
  const productEvidence = JSON.parse(
    await readFile(
      path.join(
        process.cwd(),
        manifest.observations.productEntrypointProbe.evidence,
      ),
      "utf8",
    ),
  );
  const physicalEvidence = JSON.parse(
    await readFile(
      path.join(
        process.cwd(),
        manifest.observations.physicalGpuProductEntrypointProbe
          .evidence,
      ),
      "utf8",
    ),
  );
  const report = validateViewerCoreManifest(
    manifest,
    evidence,
    productEvidence,
    physicalEvidence,
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
