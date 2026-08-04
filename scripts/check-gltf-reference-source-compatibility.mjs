import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(
  path.join(
    ROOT,
    "compatibility",
    "gltf-reference-source.json",
  ),
  "utf8",
));
const evidence = JSON.parse(await readFile(
  path.join(ROOT, manifest.evidence.publicKhronosBox),
  "utf8",
));
const fixture = JSON.parse(await readFile(
  path.join(ROOT, manifest.evidence.fixtureManifest),
  "utf8",
));

const trueGates = [
  "gltf2Container",
  "glb2Container",
  "embeddedBufferOnly",
  "boundedParser",
  "boundedRangeSession",
  "nodeHierarchyTransforms",
  "indexedTriangleGeometry",
  "sourceNativeIdentity",
  "noInventedIfcGlobalId",
  "referenceOnlyAuthority",
  "genericHeadlessRenderer",
  "officialKhronosValidator",
  "publicKhronosFixture",
  "dependencyLicenseAndIntegrity",
  "deterministicCleanup",
];
const heldGates = [
  "browserWebGl2",
  "federationReferenceAdmission",
  "browserProductOpen",
  "vscodeProductOpen",
  "externalResourceBundle",
  "requiredExtensions",
  "write",
  "roundTrip",
  "bimSemanticAuthority",
];
const assertions = [
  "officialValidatorZeroIssues",
  "exactValidatorArtifact",
  "publicFixtureDigestVerified",
  "boundedRangeReads",
  "geometryPrimitiveConformance",
  "sourceNativeIdentity",
  "noInventedIfcGlobalId",
  "referenceOnlyAuthority",
  "headlessRendererMount",
  "deterministicCleanup",
  "artifactNotTrackedOrBundled",
  "pathFreeEvidence",
];
if (
  manifest.schema !==
    "bim-explorer-gltf-reference-source-compatibility/1" ||
  manifest.status !== "experimental" ||
  manifest.contract !==
    "bim-explorer-gltf-reference-source/0.1" ||
  trueGates.some((name) => manifest.gates[name] !== true) ||
  heldGates.some((name) => manifest.gates[name] !== false) ||
  manifest.policy.readOnly !== true ||
  manifest.policy.networkAtRuntime !== false ||
  manifest.policy.allowExternalUri !== false ||
  manifest.policy.inventIfcGlobalId !== false ||
  manifest.policy.allowBimSemanticAuthority !== false ||
  manifest.policy.nativeWrite !== false ||
  manifest.policy.roundTrip !== false ||
  manifest.policy.claimProductSupport !== false ||
  manifest.policy.claimProduction !== false ||
  !Array.isArray(manifest.blockers) ||
  manifest.blockers.length !== 5 ||
  evidence.schema !==
    "bim-explorer-gltf-reference-source-qualification/1" ||
  evidence.contract !== manifest.contract ||
  evidence.fixture.sha256 !== fixture.entry.sha256 ||
  evidence.fixture.commit !== fixture.provenance.commit ||
  evidence.fixture.license !== fixture.license.spdx ||
  evidence.fixture.artifactTracked !== false ||
  evidence.fixture.releaseBundled !== false ||
  evidence.validator.package !== "gltf-validator" ||
  evidence.validator.version !== "2.0.0-dev.3.10" ||
  evidence.validator.license !== "Apache-2.0" ||
  evidence.validator.issues.errors !== 0 ||
  evidence.validator.issues.warnings !== 0 ||
  evidence.validator.issues.infos !== 0 ||
  evidence.validator.issues.hints !== 0 ||
  evidence.validator.issues.truncated !== false ||
  evidence.source.format !== "glb" ||
  evidence.source.sourceRole !==
    "derived-or-reference-mesh" ||
  evidence.source.semanticAuthority !== false ||
  evidence.source.writeAuthority !== false ||
  evidence.source.roundTripAuthority !== false ||
  evidence.geometry.records !== 1 ||
  evidence.geometry.instances !== 1 ||
  evidence.geometry.vertices !== 24 ||
  evidence.geometry.triangles !== 12 ||
  evidence.identity.globalId !== null ||
  evidence.identity.entityResolved !== true ||
  evidence.identity.pickResolved !== true ||
  evidence.renderer.backend !== "headless" ||
  evidence.renderer.rendered !== false ||
  evidence.renderer.instances !== 1 ||
  evidence.renderer.instancedTriangles !== 12 ||
  evidence.cleanup.rendererDisposed !== true ||
  evidence.cleanup.sessionDisposed !== true ||
  evidence.cleanup.sourceDisposed !== true ||
  evidence.cleanup.activeBackendBytes !== 0 ||
  evidence.cleanup.residentRanges !== 0 ||
  assertions.some((name) =>
    evidence.assertions[name] !== true)
) {
  throw new Error(
    "glTF reference source compatibility check failed",
  );
}
const serialized = JSON.stringify(evidence);
if (
  serialized.includes("/Users/") ||
  serialized.includes("/Volumes/") ||
  serialized.includes("\\\\")
) {
  throw new Error(
    "glTF reference source evidence contains a local path",
  );
}
console.log(
  "glTF reference source compatibility check passed: " +
  `${trueGates.length} passed and ${heldGates.length} held gates`,
);
