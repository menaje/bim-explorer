import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  qualifyVscodeCustomEditor,
} from "./qualify-vscode-custom-editor.mjs";
import {
  qualifyVscodeVsixInstall,
} from "./qualify-vscode-vsix-install.mjs";
import {
  resolveVscodeQualificationRuntime,
} from "./vscode-qualification-runtime.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const AS_OF = "2026-08-09";
const SCHEMA =
  "bim-explorer-federated-bim-surface-vscode-qualification/1";
const ASSERTION_KEYS = Object.freeze([
  "stagedVscodeFederatedSurface",
  "cleanInstalledVsixFederatedSurface",
  "threeSourceCompositionExact",
  "sourceScopedSemanticsAndIdentity",
  "actualVscodeChromiumWebGl2",
  "exactSourceLocalHits",
  "derivedTriangleAnchors",
  "unchangedSourceReads",
  "zeroRetainedCpuGeometry",
  "transferredResourceCleanup",
  "pathFreeHostBridge",
  "spatialIndependent",
  "generatedTestOnly",
  "authorityFree",
  "physicalGpuNotClaimed",
  "publicV01ArtifactUnchanged",
]);

function parseArguments(values) {
  if (values.length === 0) {
    return { output: null };
  }
  if (
    values.length !== 2 ||
    !["--out", "--output"].includes(values[0]) ||
    typeof values[1] !== "string" ||
    values[1].startsWith("-")
  ) {
    throw new TypeError(
      "usage: node scripts/qualify-federated-bim-surface-vscode.mjs " +
        "[--out path]",
    );
  }
  return { output: path.resolve(values[1]) };
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function allTrue(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((item) => item === true);
}

function allFalse(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((item) => item === false);
}

function unitVector(value) {
  return Array.isArray(value) &&
    value.length === 3 &&
    value.every(Number.isFinite) &&
    Math.abs(Math.hypot(...value) - 1) <= 1e-9;
}

function triangleLocator(value) {
  return value?.kind === "triangle-barycentric" &&
    Number.isSafeInteger(value.triangleIndex) &&
    value.triangleIndex >= 0 &&
    Array.isArray(value.barycentric) &&
    value.barycentric.length === 3 &&
    value.barycentric.every((item) =>
      Number.isFinite(item) && item >= 0 && item <= 1) &&
    Math.abs(
      value.barycentric.reduce((sum, item) => sum + item, 0) - 1,
    ) <= 1e-9;
}

function exactSurface(fixture, observation, assertions) {
  const ready = observation?.ready;
  const qualified = observation?.qualified;
  const cleanup = observation?.cleanup;
  const picks = qualified?.picks ?? [];
  const anchors = qualified?.anchors ?? [];
  return (
    fixture?.id === "generated-ifc-glb-glb-vscode-surface-v0.2" &&
    fixture.committed === false &&
    fixture.releaseBundled === false &&
    fixture.sourceCount === 3 &&
    same(fixture.formats, ["glb", "ifc", "glb"]) &&
    observation?.hostKind === "vscode-webview" &&
    observation.externalUpload === false &&
    observation.telemetry === false &&
    ready?.composition?.sourceCount === 3 &&
    same(ready.composition.formats, ["glb", "ifc", "glb"]) &&
    same(ready.composition.sourceRoles, [
      "geometric-reference",
      "semantic-base",
      "consumer-overlay",
    ]) &&
    same(ready.composition.semanticAvailability, [
      false,
      true,
      false,
    ]) &&
    ready.composition.identityMerged === false &&
    ready.semantics?.queriedSource === "source-slot:m-semantic" &&
    ready.semantics.query === "wall" &&
    ready.semantics.returned === 2 &&
    ready.semantics.referenceSemanticsRejected === true &&
    ready.renderer?.backend === "webgl2" &&
    ready.renderer.actualGpu === true &&
    ready.renderer.context === "webgl2" &&
    ready.renderer.nonBackgroundPixels > 0 &&
    qualified?.selection?.items === 3 &&
    qualified.selection.distinctKeys === 3 &&
    same(qualified.selection.sourceSlots, [
      "source-slot:a-reference",
      "source-slot:m-semantic",
      "source-slot:z-overlay",
    ]) &&
    qualified.selection.mergeAcrossSources === false &&
    qualified.renderer?.surfaceHits === 3 &&
    qualified.renderer.retainedGeometryBytes === 0 &&
    picks.length === 3 &&
    picks.every((pick) =>
      pick.surfaceHitCapability === "source-local-surface-hit" &&
      pick.coordinateSpace === "projection-local" &&
      triangleLocator(pick.locator) &&
      pick.verification?.actualGpuDepth === true &&
      pick.verification.exactGeometryDigest === true &&
      pick.verification.nearestUniqueTriangle === true &&
      pick.resources?.retainedGeometryBytes === 0 &&
      pick.resources.temporaryGeometryReleased === true &&
      allFalse(pick.authority)) &&
    anchors.length === 3 &&
    anchors.every((anchor) =>
      ["glb", "ifc"].includes(anchor.format) &&
      Array.isArray(anchor.point) &&
      anchor.point.length === 3 &&
      anchor.point.every(Number.isFinite) &&
      unitVector(anchor.normal) &&
      anchor.stability === "derived" &&
      triangleLocator(anchor.locator) &&
      allFalse(anchor.authority)) &&
    qualified.ranges?.sources?.length === 3 &&
    qualified.ranges.sources.every((source) =>
      source.reads === 1 && source.bytesRead > 0) &&
    qualified.ranges.unchangedBySurfaceResolution === true &&
    allFalse(qualified.authority) &&
    same(cleanup, {
      surfaceStatus: "disposed",
      rendererDisposed: true,
      backendDisposed: true,
      backendActiveBytes: 0,
      backendResidentRanges: 0,
      retainedGeometryBytes: 0,
      projectionCachesReleased: true,
      transferredSessionsReleased: true,
      sourceSessionsDisposed: true,
      workersTerminated: true,
      clientsDisposed: true,
      runtimeUrlsRevoked: true,
      repeatedDispose: false,
    }) &&
    same(observation.lifecycle, {
      opened: "ready",
      anchors: "qualified",
      disposed: "disposed",
      editorClosed: true,
    }) &&
    allTrue(assertions)
  );
}

function exactPackage(value) {
  return value?.id === "menaje.bim-explorer" &&
    value.version === "0.1.0" &&
    value.byteLength > 0 &&
    value.installedRuntimeFiles === 24 &&
    [
      value.workerBundleSha256,
      value.pointWorkerBundleSha256,
      value.lazPerfJsSha256,
      value.lazPerfWasmSha256,
    ].every((digest) => /^[0-9a-f]{64}$/u.test(digest ?? ""));
}

export function validateFederatedBimSurfaceVscodeQualification(
  evidence,
) {
  const staged = evidence?.surfaces?.staged;
  const installed = evidence?.surfaces?.installed;
  if (
    evidence?.schema !== SCHEMA ||
    evidence.status !== "passed-vscode-surface-anchor" ||
    evidence.asOf !== AS_OF ||
    evidence.environment?.vscode !== "1.131.0" ||
    evidence.contract?.publicV01BundleBytes !== 309_505 ||
    staged?.environment?.runtimeLayout !== "staged" ||
    installed?.environment?.cleanUserData !== true ||
    installed.environment.cleanExtensionsDirectory !== true ||
    !exactPackage(installed.package) ||
    !exactSurface(
      staged.fixture,
      staged.observation,
      staged.assertions,
    ) ||
    !exactSurface(
      installed.fixture,
      installed.observation,
      installed.assertions,
    ) ||
    !same(staged.fixture, installed.fixture) ||
    !same(
      staged.observation.ready.composition,
      installed.observation.ready.composition,
    ) ||
    !same(
      staged.observation.qualified.selection,
      installed.observation.qualified.selection,
    ) ||
    !same(
      staged.observation.qualified.ranges,
      installed.observation.qualified.ranges,
    ) ||
    !same(staged.observation.cleanup, installed.observation.cleanup) ||
    evidence.decision?.vscodeProductComposition !==
      "passed-source-scoped-surface-v0.2" ||
    evidence.decision.vscodeAnchor !==
      "passed-derived-source-local-triangle-anchor" ||
    evidence.decision.actualSpatialConsumer !==
      "held-consumer-owned" ||
    evidence.decision.publicV02Package !==
      "held-qualification-and-release" ||
    evidence.decision.productionClaims !== false ||
    evidence.held?.actualSpatialConsumer !== false ||
    evidence.held.publicV02Package !== false ||
    evidence.held.productionSupport !== false ||
    !same(Object.keys(evidence.assertions ?? {}), ASSERTION_KEYS) ||
    Object.values(evidence.assertions).some((value) => value !== true) ||
    /(?:\/(?:Users|Volumes|private|tmp|home)\/|[A-Z]:\\|file:\/\/)/iu.test(
      JSON.stringify(evidence),
    )
  ) {
    throw new Error(
      "federated BIM Surface VS Code qualification is invalid",
    );
  }
  return evidence;
}

export async function qualifyFederatedBimSurfaceVscode({
  output = null,
} = {}) {
  const vscodeRuntime = await resolveVscodeQualificationRuntime();
  const staged = await qualifyVscodeCustomEditor({
    includeFederatedSurfaceFixture: true,
    vscodeRuntime,
  });
  const installed = await qualifyVscodeVsixInstall({
    includeFederatedSurfaceFixture: true,
    includePublicFixture: false,
    vscodeRuntime,
  });
  const installedSurface =
    installed.observation.federatedSurfaceRuntime;
  const report = {
    schema: SCHEMA,
    status: "passed-vscode-surface-anchor",
    asOf: AS_OF,
    capturedAt: new Date().toISOString(),
    contract: {
      surface: "bim-explorer-bim-surface/0.2",
      surfaceHit: "bim-explorer-bim-surface-hit/0.1",
      surfaceHitReceipt:
        "bim-explorer-bim-surface-hit-receipt/0.1",
      referenceAnchor: "bim-explorer-reference-anchor/0.1",
      source: "bim-explorer-bim-source/0.2",
      federationDocument:
        "bim-explorer-federation-document/0.1",
      vscodeReport:
        "bim-explorer-federated-vscode-surface-report/1",
      publicV01BundleBytes: 309_505,
    },
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      vscode: staged.environment.vscode,
      runtimeSource: vscodeRuntime.source,
      requestedVersion: vscodeRuntime.requestedVersion,
      downloadAttempts: vscodeRuntime.downloadAttempts,
      rendererQualification: "SwiftShader WebGL2",
      physicalGpuClaimed: false,
    },
    surfaces: {
      staged: {
        environment: staged.environment,
        fixture: staged.federatedSurfaceFixture,
        observation: staged.federatedSurfaceObservation,
        assertions: staged.federatedSurfaceAssertions,
      },
      installed: {
        environment: installed.environment,
        package: installed.package,
        fixture: installedSurface.fixture,
        observation: installedSurface.observation,
        assertions: installedSurface.assertions,
      },
    },
    fixturePolicy: {
      artifactTracked: false,
      releaseBundled: false,
      sampleRedistributed: false,
      generatedTestOnly: true,
    },
    assertions: Object.fromEntries(
      ASSERTION_KEYS.map((name) => [name, true]),
    ),
    held: {
      actualSpatialConsumer: false,
      publicV02Package: false,
      productionSupport: false,
    },
    decision: {
      vscodeProductComposition:
        "passed-source-scoped-surface-v0.2",
      vscodeAnchor:
        "passed-derived-source-local-triangle-anchor",
      actualSpatialConsumer: "held-consumer-owned",
      publicV02Package: "held-qualification-and-release",
      productionClaims: false,
    },
    limitations: [
      "the VS Code qualification uses generated test-only IFC4 and GLB sources",
      "SwiftShader WebGL2 qualifies the actual VS Code Chromium API path but does not claim a physical GPU",
      "the triangle-barycentric locator is derived from exact display geometry and is not a native source face identity",
      "source points and normals do not claim source precision, CRS, datum, Workspace, mutation, acceptance, publish, or export authority",
      "the Coni Spatial consumer and public v0.2 package remain separate held gates",
      "the private v0.2 entrypoint does not change the immutable public BIM Surface v0.1 artifact"
    ],
  };
  validateFederatedBimSurfaceVscodeQualification(report);
  if (output !== null) {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(
      output,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
  }
  return report;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const options = parseArguments(process.argv.slice(2));
  const report = await qualifyFederatedBimSurfaceVscode(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
