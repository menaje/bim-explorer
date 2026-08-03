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

export function validateViewerCoreManifest(value) {
  const manifest = plainRecord(value, "Viewer Core compatibility manifest");
  if (manifest.schema !== "bim-explorer-viewer-core-compatibility/1") {
    throw new Error("unsupported Viewer Core compatibility schema");
  }
  if (!ALLOWED_STATUSES.has(manifest.status)) {
    throw new Error("invalid Viewer Core compatibility status");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(manifest.asOf)) {
    throw new Error("Viewer Core compatibility asOf must be an ISO date");
  }
  plainRecord(manifest.consumer, "consumer");
  const upstream = plainRecord(manifest.upstream, "upstream");
  plainRecord(upstream.viewerCore, "upstream Viewer Core");
  plainRecord(upstream.renderProtocol, "upstream render protocol");
  plainRecord(upstream.distribution, "upstream distribution");
  const gates = plainRecord(manifest.admissionGates, "admission gates");
  for (const gate of REQUIRED_GATES) {
    if (typeof gates[gate] !== "boolean") {
      throw new Error(`admission gate ${gate} must be boolean`);
    }
  }
  if (
    !Array.isArray(manifest.blockers) ||
    manifest.blockers.length === 0 ||
    !manifest.blockers.every(
      (blocker) => typeof blocker === "string" && blocker.length > 0,
    )
  ) {
    throw new Error("Viewer Core blockers must be a non-empty string list");
  }
  const policy = plainRecord(manifest.policy, "compatibility policy");
  for (const key of [
    "allowRelativeCheckoutDependency",
    "allowCopiedViewerCore",
    "claimCompatibility",
  ]) {
    if (typeof policy[key] !== "boolean") {
      throw new Error(`compatibility policy ${key} must be boolean`);
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
      throw new Error("unresolved Viewer Core compatibility cannot have a pin");
    }
    if (Object.values(gates).some(Boolean)) {
      throw new Error(
        "unresolved Viewer Core compatibility cannot claim passed admission gates",
      );
    }
    if (
      policy.allowRelativeCheckoutDependency ||
      policy.allowCopiedViewerCore ||
      policy.claimCompatibility
    ) {
      throw new Error(
        "unresolved Viewer Core compatibility must fail closed",
      );
    }
  } else if (manifest.pin === null) {
    throw new Error(`${manifest.status} Viewer Core compatibility requires a pin`);
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
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const report = validateViewerCoreManifest(manifest);
  console.log(
    `Viewer Core compatibility check passed: ${report.status}, ` +
      `${report.blockerCount} blockers, ${report.passedGates} passed gates`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
