import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  qualifyBimProductShell,
} from "./qualify-bim-product-shell.mjs";

const SCHEMA =
  "bim-explorer-point-cloud-browser-picking-evidence/1";
const PICK_SCHEMA =
  "bim-explorer-bounded-point-renderer-pick-receipt/0.1";
const RANGE_SHA = Object.freeze({
  las:
    "8383abce84d57b8f50ee1f39aa1d442a" +
    "7f258cd759ab9812aff1a0625ab10449",
  laz:
    "8383abce84d57b8f50ee1f39aa1d442a" +
    "7f258cd759ab9812aff1a0625ab10449",
  e57:
    "4dd5bbef38ffd815c00a01cf3feaa07a" +
    "85b40fa7019b2a6dad448e373381e697",
});
const EXPECTED = Object.freeze({
  las: Object.freeze({ points: 10_201, sourceBytes: 347_061 }),
  laz: Object.freeze({ points: 10_201, sourceBytes: 53_952 }),
  e57: Object.freeze({
    points: 1_213_990,
    sourceBytes: 22_146_048,
  }),
});
const ASSERTIONS = Object.freeze([
  "actualBrowserWebGl2",
  "sourceRevisionScopedIdentity",
  "rangeDigestScopedIdentity",
  "fullPointIndexEncoding",
  "lasLazProjectionParityWithoutSourceMerge",
  "largeE57PointIndex",
  "selectedCoordinateGpuReadback",
  "transientPickTargetReleased",
  "sourceWorkerAndGpuCleanup",
  "localOnly",
  "pathFree",
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
      "usage: node scripts/qualify-point-cloud-browser-picking.mjs " +
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

function exactSurface(surface, format) {
  const expected = EXPECTED[format];
  const pick = surface?.observation?.pointSelection;
  const identity = pick?.identity;
  const backend = pick?.backend;
  return (
    surface?.schema ===
      "bim-explorer-product-shell-browser-evidence/1" &&
    surface.environment?.headless === true &&
    typeof surface.environment.browser === "string" &&
    surface.fixture?.format === format &&
    surface.fixture.committed === false &&
    surface.fixture.sourceBytes === expected.sourceBytes &&
    surface.fixture.provenance?.bundled === false &&
    surface.fixture.provenance.sampleRedistributed === false &&
    same(surface.observation?.model, {
      points: expected.points,
      ranges: 1,
    }) &&
    surface.observation.pointCloud?.rangeSha256 ===
      RANGE_SHA[format] &&
    surface.observation.pointCloud.coordinateReferenceStatus ===
      "unqualified" &&
    surface.observation.renderer?.actualGpu === true &&
    surface.observation.renderer.nonBackgroundPixels > 0 &&
    pick?.schema === PICK_SCHEMA &&
    pick.status === "hit" &&
    pick.source?.fingerprint === surface.fixture.fingerprint &&
    pick.source.format === format &&
    pick.source.revisionId ===
      `source-snapshot:${surface.fixture.fingerprint}` &&
    pick.source.semanticAuthority === false &&
    pick.source.coordinateReferenceStatus === "unqualified" &&
    pick.range?.sha256 === RANGE_SHA[format] &&
    identity?.authority === "derived-point-range-order" &&
    identity.nativeId === `point:${identity.pointIndex}` &&
    Number.isSafeInteger(identity.pointIndex) &&
    identity.pointIndex >= 0 &&
    identity.pointIndex < expected.points &&
    identity.rangeSha256 === RANGE_SHA[format] &&
    identity.rangeHandleId === pick.range.handleId &&
    pick.coordinates?.origin === "canvas-top-left" &&
    Number.isSafeInteger(pick.coordinates.x) &&
    Number.isSafeInteger(pick.coordinates.y) &&
    Array.isArray(pick.worldPosition) &&
    pick.worldPosition.length === 3 &&
    pick.worldPosition.every(Number.isFinite) &&
    backend?.actualGpu === true &&
    backend.backendId === "webgl2-points" &&
    backend.hit === true &&
    backend.pointIndex === identity.pointIndex &&
    backend.drawCalls === 1 &&
    backend.temporaryTargetBytes === 2_160_000 &&
    backend.temporaryReleased === true &&
    backend.glError === 0 &&
    same(backend.worldPosition, pick.worldPosition) &&
    surface.observation.interaction?.selectedNativeId ===
      identity.nativeId &&
    surface.observation.interaction.pointIndex ===
      identity.pointIndex &&
    surface.observation.interaction.selectionOrigin === "3d" &&
    surface.observation.interaction.pickDisabled === false &&
    surface.observation.lifecycle?.closed === "disposed" &&
    surface.observation.lifecycle.backendDisposed === true &&
    surface.observation.lifecycle.clientDisposed === true &&
    surface.observation.lifecycle.pointRangeCleared === true &&
    surface.observation.lifecycle.rendererDisposed === true &&
    surface.observation.lifecycle.workerTerminatedAfterTransfer ===
      true &&
    surface.observation.runtimeErrors?.length === 0 &&
    surface.observation.network?.externalOrigins?.length === 0 &&
    allTrue(surface.assertions)
  );
}

export function validatePointCloudBrowserPickingQualification(report) {
  const las = report?.surfaces?.las;
  const laz = report?.surfaces?.laz;
  const e57 = report?.surfaces?.e57MultipleScan;
  const lasPick = las?.observation?.pointSelection;
  const lazPick = laz?.observation?.pointSelection;
  const e57Pick = e57?.observation?.pointSelection;
  if (
    report?.schema !== SCHEMA ||
    report.status !== "passed-source-scoped-browser-point-picking" ||
    report.asOf !== "2026-08-09" ||
    !exactSurface(las, "las") ||
    !exactSurface(laz, "laz") ||
    !exactSurface(e57, "e57") ||
    las.fixture.fingerprint === laz.fixture.fingerprint ||
    lasPick.source.fingerprint === lazPick.source.fingerprint ||
    lasPick.identity.rangeHandleId === lazPick.identity.rangeHandleId ||
    lasPick.identity.pointIndex !== lazPick.identity.pointIndex ||
    !same(lasPick.coordinates, lazPick.coordinates) ||
    !same(lasPick.worldPosition, lazPick.worldPosition) ||
    e57Pick.identity.pointIndex <= 0x1_ff_ff ||
    report.runtime?.identityAuthority !==
      "derived-point-range-order" ||
    report.runtime.identityScope !==
      "source-revision-and-range-digest" ||
    report.runtime.pointIndexEncodingBits !== 32 ||
    report.runtime.selectedCoordinateReadbackBytes !== 12 ||
    report.decision?.browserPointIdentityPicking !==
      "passed-derived-range-order" ||
    report.decision.vscodePointIdentityPicking !== "held" ||
    report.decision.coordinateReference !== "held" ||
    report.decision.levelOfDetail !== "held" ||
    report.decision.pointCloudCodec !== "held" ||
    report.decision.formatAdmission !== false ||
    !same(Object.keys(report.assertions ?? {}), ASSERTIONS) ||
    Object.values(report.assertions).some((value) => value !== true) ||
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\|file:\/\/)/u.test(
      JSON.stringify(report),
    )
  ) {
    throw new Error(
      "point-cloud Browser picking qualification evidence is invalid",
    );
  }
  return report;
}

export async function qualifyPointCloudBrowserPicking({
  output = null,
} = {}) {
  const las = await qualifyBimProductShell({ fixture: "las-public" });
  const laz = await qualifyBimProductShell({ fixture: "laz-public" });
  const e57MultipleScan = await qualifyBimProductShell({
    fixture: "e57-multiple-scan-public",
  });
  const report = {
    schema: SCHEMA,
    status: "passed-source-scoped-browser-point-picking",
    asOf: "2026-08-09",
    capturedAt: new Date().toISOString(),
    surfaces: { las, laz, e57MultipleScan },
    runtime: {
      pickReceipt: PICK_SCHEMA,
      identityAuthority: "derived-point-range-order",
      identityScope: "source-revision-and-range-digest",
      pointIndexEncodingBits: 32,
      selectedCoordinateReadbackBytes: 12,
      temporaryTargetBytes: 2_160_000,
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
      vscodePointIdentityPicking: "held",
      coordinateReference: "held",
      levelOfDetail: "held",
      pointCloudCodec: "held",
      formatAdmission: false,
    },
    assertions: Object.fromEntries(
      ASSERTIONS.map((name) => [name, true]),
    ),
    limitations: [
      "point:n is a derived range-order identity scoped to one exact source revision and range digest, not source-declared BIM semantics",
      "filtered E57 records are identified by rendered range order and do not preserve an original invalid-record index",
      "selected coordinates preserve the projected point value but do not establish CRS or surveyed datum authority",
      "the pick pass does not implement point-cloud hierarchy or level-of-detail streaming",
      "SwiftShader exercises actual Browser WebGL2 APIs but does not claim a physical GPU",
      "public samples stay in ignored digest caches and are not redistributed or bundled",
      "point selection alone does not admit LAS, LAZ, E57, or pointCloudCodec",
    ],
  };
  validatePointCloudBrowserPickingQualification(report);
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
  const report = await qualifyPointCloudBrowserPicking(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
