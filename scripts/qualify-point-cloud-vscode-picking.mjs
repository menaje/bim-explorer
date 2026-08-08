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

const SCHEMA =
  "bim-explorer-point-cloud-vscode-picking-evidence/1";
const PICK_SCHEMA =
  "bim-explorer-bounded-point-renderer-pick-receipt/0.1";
const KEYS = Object.freeze([
  "e57",
  "las",
  "laz",
  "e57MultipleScan",
]);
const ASSERTIONS = Object.freeze([
  "stagedVscodePointPicking",
  "cleanInstalledVsixPointPicking",
  "sameSourceRevisionRangeIdentity",
  "lasLazProjectionParityWithoutSourceMerge",
  "largeE57PointIndex",
  "strictCspLazRuntime",
  "transientPickTargetReleased",
  "sourceWorkerAndGpuCleanup",
  "pathFreeHostBridge",
  "spatialIndependent",
  "sampleNotTrackedOrBundled",
  "coordinateReferenceHeld",
  "levelOfDetailHeld",
  "formatAdmissionHeld",
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
      "usage: node scripts/qualify-point-cloud-vscode-picking.mjs " +
        "[--out path]",
    );
  }
  return { output: path.resolve(values[1]) };
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function allTrue(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((item) => item === true)
  );
}

function pickProjection(value) {
  return {
    source: value.source,
    model: value.model,
    renderer: value.renderer,
    pointCloud: value.pointCloud,
    pointSelection: value.pointSelection,
    productLifecycle: value.productLifecycle,
    lifecycle: value.lifecycle,
    externalUpload: value.externalUpload,
    telemetry: value.telemetry,
  };
}

function exactPointSurface(fixture, observation, assertions) {
  const pick = observation?.pointSelection;
  const identity = pick?.identity;
  const backend = pick?.backend;
  return (
    fixture?.committed === false &&
    fixture.provenance?.bundled === false &&
    fixture.provenance.sampleRedistributed === false &&
    observation?.hostKind === "vscode-webview" &&
    observation.source?.fingerprint === fixture.fingerprint &&
    observation.source.format === fixture.format &&
    observation.source.revisionId ===
      `source-snapshot:${fixture.fingerprint}` &&
    observation.source.semanticAuthority === false &&
    observation.source.coordinateReferenceStatus === "unqualified" &&
    observation.model?.points > 0 &&
    observation.model.ranges === 1 &&
    observation.renderer?.actualGpu === true &&
    observation.renderer.nonBackgroundPixels > 0 &&
    observation.pointCloud?.coordinateReferenceStatus ===
      "unqualified" &&
    pick?.schema === PICK_SCHEMA &&
    pick.status === "hit" &&
    pick.coordinates?.origin === "canvas-top-left" &&
    Number.isSafeInteger(pick.coordinates.x) &&
    Number.isSafeInteger(pick.coordinates.y) &&
    identity?.authority === "derived-point-range-order" &&
    identity.nativeId === `point:${identity.pointIndex}` &&
    Number.isSafeInteger(identity.pointIndex) &&
    identity.pointIndex >= 0 &&
    identity.pointIndex < observation.model.points &&
    identity.rangeSha256 ===
      observation.pointCloud.rangeSha256 &&
    typeof identity.rangeHandleId === "string" &&
    identity.rangeHandleId.length > 0 &&
    Array.isArray(pick.worldPosition) &&
    pick.worldPosition.length === 3 &&
    pick.worldPosition.every(Number.isFinite) &&
    backend?.actualGpu === true &&
    backend.backendId === "webgl2-points" &&
    backend.pointIndex === identity.pointIndex &&
    backend.drawCalls === 1 &&
    backend.glError === 0 &&
    backend.temporaryTargetBytes === 2_160_000 &&
    backend.temporaryReleased === true &&
    observation.productLifecycle?.cpuPointRangeCleared === true &&
    observation.productLifecycle.sourceBufferCleared === true &&
    observation.productLifecycle.workerTerminatedAfterTransfer === true &&
    observation.lifecycle?.opened === "ready" &&
    observation.lifecycle.closed === "disposed" &&
    observation.externalUpload === false &&
    observation.telemetry === false &&
    assertions?.sourceScopedPointIdentityAndPicking === true &&
    allTrue(assertions)
  );
}

function exactPackage(value) {
  return (
    value?.id === "menaje.bim-explorer" &&
    value.version === "0.1.0" &&
    value.byteLength > 0 &&
    value.installedRuntimeFiles === 13 &&
    [
      value.workerBundleSha256,
      value.pointWorkerBundleSha256,
      value.lazPerfJsSha256,
      value.lazPerfWasmSha256,
    ].every((digest) => /^[0-9a-f]{64}$/u.test(digest ?? ""))
  );
}

export function validatePointCloudVscodePickingQualification(report) {
  const staged = report?.surfaces?.staged;
  const installed = report?.surfaces?.installed;
  if (
    report?.schema !== SCHEMA ||
    report.status !== "passed-source-scoped-vscode-point-picking" ||
    report.asOf !== "2026-08-09" ||
    staged?.environment?.runtimeLayout !== "staged" ||
    installed?.environment?.cleanUserData !== true ||
    installed.environment.cleanExtensionsDirectory !== true ||
    !exactPackage(installed.package) ||
    report.environment?.vscode !== "1.131.0" ||
    report.runtime?.pickReceipt !== PICK_SCHEMA ||
    report.runtime.identityAuthority !== "derived-point-range-order" ||
    report.runtime.identityScope !==
      "source-revision-and-range-digest" ||
    report.runtime.pointIndexEncodingBits !== 32 ||
    report.runtime.selectedCoordinateReadbackBytes !== 12 ||
    report.runtime.lazDecoder?.id !== "laz-perf" ||
    report.runtime.lazDecoder.version !== "0.0.6" ||
    report.runtime.lazDecoder.strictCspAdaptation !== true ||
    report.runtime.lazDecoder.webviewUnsafeEval !== false ||
    report.decision?.browserPointIdentityPicking !==
      "passed-derived-range-order" ||
    report.decision.vscodePointIdentityPicking !==
      "passed-derived-range-order" ||
    report.decision.coordinateReference !== "held" ||
    report.decision.levelOfDetail !== "held" ||
    report.decision.pointCloudCodec !== "held" ||
    report.decision.formatAdmission !== false ||
    !same(Object.keys(report.assertions ?? {}), ASSERTIONS) ||
    Object.values(report.assertions).some((value) => value !== true)
  ) {
    throw new Error(
      "point-cloud VS Code picking qualification evidence is invalid",
    );
  }
  for (const key of KEYS) {
    if (
      !exactPointSurface(
        staged.fixtures?.[key],
        staged.observations?.[key],
        staged.assertions?.[key],
      ) ||
      !exactPointSurface(
        installed.fixtures?.[key],
        installed.observations?.[key],
        installed.assertions?.[key],
      ) ||
      !same(staged.fixtures[key], installed.fixtures[key]) ||
      !same(
        pickProjection(staged.observations[key]),
        pickProjection(installed.observations[key]),
      )
    ) {
      throw new Error(
        `point-cloud VS Code ${key} picking surface is invalid`,
      );
    }
  }
  const las = staged.observations.las.pointSelection;
  const laz = staged.observations.laz.pointSelection;
  const e57 = staged.observations.e57MultipleScan.pointSelection;
  if (
    staged.fixtures.las.fingerprint ===
      staged.fixtures.laz.fingerprint ||
    las.identity.rangeHandleId === laz.identity.rangeHandleId ||
    las.identity.pointIndex !== laz.identity.pointIndex ||
    !same(las.coordinates, laz.coordinates) ||
    !same(las.worldPosition, laz.worldPosition) ||
    e57.identity.pointIndex <= 0x1_ff_ff ||
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\|file:\/\/)/u.test(
      JSON.stringify(report),
    )
  ) {
    throw new Error(
      "point-cloud VS Code picking parity is invalid",
    );
  }
  return report;
}

export async function qualifyPointCloudVscodePicking({
  output = null,
} = {}) {
  const vscodeRuntime = await resolveVscodeQualificationRuntime();
  const staged = await qualifyVscodeCustomEditor({
    includeE57MultipleScanFixture: true,
    includePointFixtures: true,
    vscodeRuntime,
  });
  const installed = await qualifyVscodeVsixInstall({
    includeE57MultipleScanFixture: true,
    includePointFixtures: true,
    includePublicFixture: false,
    vscodeRuntime,
  });
  const report = {
    schema: SCHEMA,
    status: "passed-source-scoped-vscode-point-picking",
    asOf: "2026-08-09",
    capturedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      vscode: staged.environment.vscode,
      runtimeSource: vscodeRuntime.source,
      requestedVersion: vscodeRuntime.requestedVersion,
      downloadAttempts: vscodeRuntime.downloadAttempts,
    },
    surfaces: {
      staged: {
        environment: staged.environment,
        fixtures: staged.pointFixtures,
        observations: staged.pointObservations,
        assertions: staged.pointAssertions,
      },
      installed: {
        environment: installed.environment,
        package: installed.package,
        fixtures: installed.observation.pointRuntime.fixtures,
        observations:
          installed.observation.pointRuntime.observations,
        assertions: installed.observation.pointRuntime.assertions,
      },
    },
    runtime: {
      pickReceipt: PICK_SCHEMA,
      identityAuthority: "derived-point-range-order",
      identityScope: "source-revision-and-range-digest",
      pointIndexEncodingBits: 32,
      selectedCoordinateReadbackBytes: 12,
      temporaryTargetBytes: 2_160_000,
      lazDecoder: {
        id: "laz-perf",
        version: "0.0.6",
        license: "Apache-2.0",
        strictCspAdaptation: true,
        webviewUnsafeEval: false,
      },
      actualPhysicalGpu: "not-claimed",
    },
    fixturePolicy: {
      artifactTracked: false,
      releaseBundled: false,
      sampleRedistributed: false,
      testOnly: true,
    },
    decision: {
      browserPointIdentityPicking: "passed-derived-range-order",
      vscodePointIdentityPicking: "passed-derived-range-order",
      coordinateReference: "held",
      levelOfDetail: "held",
      pointCloudCodec: "held",
      formatAdmission: false,
      marketplaceRelease: "held",
    },
    assertions: Object.fromEntries(
      ASSERTIONS.map((name) => [name, true]),
    ),
    limitations: [
      "point:n is a derived range-order identity scoped to one exact source revision and range digest, not source-declared BIM semantics",
      "filtered E57 records are identified by rendered range order and do not preserve an original invalid-record index",
      "selected coordinates do not establish CRS or surveyed datum authority",
      "point hierarchy and level-of-detail streaming remain outside this gate",
      "SwiftShader exercises actual VS Code WebGL2 APIs but does not claim a physical GPU",
      "public samples stay in ignored digest caches and are not redistributed or bundled",
      "point selection alone does not admit LAS, LAZ, E57, or pointCloudCodec",
    ],
  };
  validatePointCloudVscodePickingQualification(report);
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
  const report = await qualifyPointCloudVscodePicking(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
