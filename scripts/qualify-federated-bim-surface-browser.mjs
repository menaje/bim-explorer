import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  runBrowserQualification,
} from "./browser-qualification-runtime.mjs";
import {
  createFederatedBimSurfaceBrowserProbeServer,
} from "./serve-federated-bim-surface-browser-probe.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const AS_OF = "2026-08-09";
const ASSERTION_KEYS = Object.freeze([
  "actualBrowserWebGl2",
  "threeSourceComposition",
  "sourceScopedSemantics",
  "sourceScopedSelection",
  "exactSurfaceNormals",
  "derivedTriangleAnchors",
  "unchangedSourceReads",
  "zeroRetainedCpuGeometry",
  "deterministicCleanup",
  "localOnly",
  "noRuntimeErrors",
  "authorityFree",
  "generatedTestOnly",
  "physicalGpuNotClaimed",
]);

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function allFalse(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).length > 0 &&
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
    typeof value.primitiveId === "string" &&
    value.primitiveId.length > 0 &&
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

function qualificationAssertions(report, runtime) {
  const picks = report.picks ?? [];
  const anchors = report.anchors ?? [];
  return Object.freeze({
    actualBrowserWebGl2:
      report.status === "passed" &&
      report.renderer?.backend === "webgl2" &&
      report.renderer.actualGpu === true &&
      report.renderer.context === "webgl2" &&
      report.renderer.nonBackgroundPixels > 0,
    threeSourceComposition:
      report.composition?.sourceCount === 3 &&
      same(report.composition.formats, ["glb", "ifc", "glb"]) &&
      same(report.composition.sourceRoles, [
        "geometric-reference",
        "semantic-base",
        "consumer-overlay",
      ]) &&
      same(report.composition.semanticAvailability, [
        false,
        true,
        false,
      ]) &&
      report.composition.identityMerged === false,
    sourceScopedSemantics:
      report.semantics?.queriedSource ===
        "source-slot:m-semantic" &&
      report.semantics.query === "wall" &&
      report.semantics.returned === 2 &&
      report.semantics.referenceSemanticsRejected === true,
    sourceScopedSelection:
      report.selection?.items === 3 &&
      report.selection.distinctKeys === 3 &&
      same(report.selection.sourceSlots, [
        "source-slot:a-reference",
        "source-slot:m-semantic",
        "source-slot:z-overlay",
      ]) &&
      report.selection.mergeAcrossSources === false,
    exactSurfaceNormals:
      picks.length === 3 &&
      picks.every((pick) =>
        pick.surfaceHitCapability ===
          "source-local-surface-hit" &&
        pick.coordinateSpace === "projection-local" &&
        triangleLocator(pick.locator) &&
        pick.verification?.actualGpuDepth === true &&
        pick.verification.exactGeometryDigest === true &&
        pick.verification.identityBound === true &&
        pick.verification.nearestUniqueTriangle === true &&
        pick.verification.depthBits === 15 &&
        pick.verification.gpuDepthError <=
          pick.verification.gpuDepthTolerance &&
        allFalse(pick.authority)),
    derivedTriangleAnchors:
      anchors.length === 3 &&
      anchors.every((anchor) =>
        ["glb", "ifc"].includes(anchor.format) &&
        unitVector(anchor.normal) &&
        Array.isArray(anchor.point) &&
        anchor.point.length === 3 &&
        anchor.point.every(Number.isFinite) &&
        anchor.stability === "derived" &&
        triangleLocator(anchor.locator) &&
        allFalse(anchor.authority)),
    unchangedSourceReads:
      report.ranges?.unchangedBySurfaceResolution === true &&
      same(report.ranges.sourceRangeReads, {
        reference: 1,
        semantic: 1,
        overlay: 1,
      }),
    zeroRetainedCpuGeometry:
      report.renderer?.retainedGeometryBytes === 0 &&
      picks.every((pick) =>
        pick.resources?.retainedGeometryBytes === 0 &&
        pick.resources.temporaryGeometryReleased === true),
    deterministicCleanup:
      report.cleanup?.surfaceStatus === "disposed" &&
      report.cleanup.rendererDisposed === true &&
      report.cleanup.backendDisposed === true &&
      report.cleanup.backendActiveBytes === 0 &&
      report.cleanup.backendResidentRanges === 0 &&
      report.cleanup.retainedGeometryBytes === 0 &&
      report.cleanup.projectionCachesReleased === true &&
      report.cleanup.transferredSessionsReleased === true &&
      report.cleanup.sourceSessionsDisposed === true &&
      report.cleanup.repeatedDispose === false,
    localOnly: runtime.externalOrigins.length === 0,
    noRuntimeErrors: runtime.runtimeErrors.length === 0,
    authorityFree:
      allFalse(report.authority) &&
      picks.every((pick) => allFalse(pick.authority)) &&
      anchors.every((anchor) => allFalse(anchor.authority)),
    generatedTestOnly: true,
    physicalGpuNotClaimed: true,
  });
}

export function validateFederatedBimSurfaceBrowserQualification(
  evidence,
) {
  if (
    evidence?.schema !==
      "bim-explorer-federated-bim-surface-browser-qualification/1" ||
    evidence.status !== "passed-browser-surface-anchor" ||
    evidence.asOf !== AS_OF ||
    !same(Object.keys(evidence.assertions ?? {}), ASSERTION_KEYS) ||
    Object.values(evidence.assertions).some((value) => value !== true)
  ) {
    throw new Error(
      "federated BIM Surface Browser qualification is invalid",
    );
  }
  return evidence;
}

export async function qualifyFederatedBimSurfaceBrowser() {
  const server =
    await createFederatedBimSurfaceBrowserProbeServer();
  const runtime = await runBrowserQualification({
    server,
    reportExpression: `(() => {
      const report =
        globalThis.__federatedBimSurfaceBrowserReport;
      if (!report || report.status === "running") {
        return null;
      }
      return report;
    })()`,
    timeoutMs: 30_000,
    userDataPrefix: "bim-explorer-surface-browser-",
  });
  const browser = runtime.report;
  if (browser?.status !== "passed") {
    throw new Error(
      "federated BIM Surface Browser probe failed: " +
        JSON.stringify(browser?.error ?? { code: "UNKNOWN" }),
    );
  }
  const assertions = qualificationAssertions(browser, runtime);
  if (Object.values(assertions).some((value) => value !== true)) {
    throw new Error(
      "federated BIM Surface Browser assertions failed: " +
        JSON.stringify(assertions),
    );
  }
  return validateFederatedBimSurfaceBrowserQualification({
    schema:
      "bim-explorer-federated-bim-surface-browser-qualification/1",
    status: "passed-browser-surface-anchor",
    asOf: AS_OF,
    capturedAt: new Date().toISOString(),
    contract: {
      surface: "bim-explorer-bim-surface/0.2",
      surfaceHit: "bim-explorer-bim-surface-hit/0.1",
      surfaceHitReceipt:
        "bim-explorer-bim-surface-hit-receipt/0.1",
      referenceAnchor: "bim-explorer-reference-anchor/0.1",
      source: "bim-explorer-bim-source/0.2",
    },
    fixture: {
      source: "generated-test-only",
      formats: ["glb", "ifc", "glb"],
      artifactTracked: false,
      releaseBundled: false,
      redistributed: false,
      testOnly: true,
    },
    environment: {
      browser: runtime.browserVersion,
      platform: runtime.platform,
      headless: true,
      api: "actual WebGL2",
      physicalGpuClaimed: false,
    },
    composition: browser.composition,
    semantics: browser.semantics,
    selection: browser.selection,
    renderer: browser.renderer,
    picks: browser.picks,
    anchors: browser.anchors,
    ranges: browser.ranges,
    cleanup: browser.cleanup,
    authority: browser.authority,
    network: {
      externalOrigins: runtime.externalOrigins,
      runtimeErrors: runtime.runtimeErrors,
      requestCount: runtime.requestedUrls.length,
    },
    assertions,
    held: {
      actualVscodeSurface: false,
      actualSpatialConsumer: false,
      publicV02Package: false,
      productionSupport: false,
    },
    decision: {
      browserSurfaceNormal:
        "passed-exact-geometry-webgl2-depth",
      browserAnchor:
        "passed-derived-source-local-triangle-anchor",
      vscodeProductComposition: "held-no-v0.2-entrypoint",
      actualSpatialConsumer: "held-consumer-owned",
      publicV02Package: "held-qualification-and-release",
      productionClaims: false,
    },
    limitations: [
      "the Browser qualification uses generated test-only IFC4 and GLB sources",
      "SwiftShader WebGL2 qualifies the actual API path but does not claim a physical GPU",
      "the triangle-barycentric locator is derived from the exact display geometry and is not a native source face identity",
      "the resolved normal and point do not claim source precision, CRS or datum authority",
      "the actual VS Code Webview and Coni Spatial consumer remain separately held",
      "the private v0.2 implementation does not change the immutable public BIM Surface v0.1 artifact"
    ],
  });
}

function outputArgument(values) {
  if (values.length === 0) {
    return null;
  }
  if (
    values.length !== 2 ||
    !["--out", "--output"].includes(values[0]) ||
    typeof values[1] !== "string" ||
    values[1].startsWith("-")
  ) {
    throw new TypeError(
      "usage: node scripts/qualify-federated-bim-surface-browser.mjs " +
        "[--out path]",
    );
  }
  return path.resolve(values[1]);
}

async function main() {
  const output = outputArgument(process.argv.slice(2));
  const report = await qualifyFederatedBimSurfaceBrowser();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output === null) {
    process.stdout.write(serialized);
  } else {
    await writeFile(output, serialized, "utf8");
    process.stdout.write(`Wrote ${path.relative(ROOT, output)}\n`);
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
