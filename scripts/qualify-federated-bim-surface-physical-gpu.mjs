import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  runBrowserQualification,
} from "./browser-qualification-runtime.mjs";
import {
  isEvidenceTimestampAtOrAfter,
} from "./evidence-timestamp.mjs";
import {
  validatePhysicalGpuIdentity,
} from "./gpu-qualification-profile.mjs";
import {
  qualifyVscodeCustomEditor,
} from "./qualify-vscode-custom-editor.mjs";
import {
  qualifyVscodeVsixInstall,
} from "./qualify-vscode-vsix-install.mjs";
import {
  createFederatedBimSurfaceBrowserProbeServer,
} from "./serve-federated-bim-surface-browser-probe.mjs";
import {
  resolveVscodeQualificationRuntime,
} from "./vscode-qualification-runtime.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const EXEC_FILE = promisify(execFile);
const AS_OF = "2026-08-11";
const SCHEMA =
  "bim-explorer-federated-bim-surface-physical-gpu-qualification/1";
export const FEDERATED_BIM_SURFACE_PHYSICAL_GPU_EVIDENCE_PATH =
  "compatibility/evidence/" +
  "federated-bim-surface-physical-gpu-darwin-arm64-" +
  "2026-08-11.json";

const ASSERTION_KEYS = Object.freeze([
  "browserAppleMetal",
  "browserTwoRunParity",
  "browserThreeSourceComposition",
  "browserExactSurfaceAnchors",
  "browserTerminalCleanup",
  "stagedVscodeAppleMetal",
  "cleanInstalledVsixAppleMetal",
  "vscodeProductParity",
  "softwareFallbackDisabled",
  "generatedLocalOnly",
  "authorityFree",
  "publicPackageRuntimeUnchanged",
  "noVsixPublication",
]);

const CLEANUP = Object.freeze({
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
});

const BROWSER_CLEANUP = Object.freeze({
  surfaceStatus: "disposed",
  rendererDisposed: true,
  backendDisposed: true,
  backendActiveBytes: 0,
  backendResidentRanges: 0,
  retainedGeometryBytes: 0,
  projectionCachesReleased: true,
  transferredSessionsReleased: true,
  sourceSessionsDisposed: true,
  repeatedDispose: false,
});

const BROWSER_REPORT_EXPRESSION = `(() => {
  const report = globalThis.__federatedBimSurfaceBrowserReport;
  if (!report || report.status === "running") {
    return null;
  }
  const gl = document.querySelector("#model-canvas")
    ?.getContext("webgl2");
  const debug = gl?.getExtension("WEBGL_debug_renderer_info");
  return {
    report,
    gpu: {
      schema: "bim-explorer-webgl2-gpu-identity/1",
      webgl2: Boolean(gl),
      debugRendererInfo: Boolean(debug),
      vendor: gl?.getParameter(gl.VENDOR) ?? null,
      renderer: gl?.getParameter(gl.RENDERER) ?? null,
      unmaskedVendor: debug
        ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
        : null,
      unmaskedRenderer: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : null,
      version: gl?.getParameter(gl.VERSION) ?? null,
      shadingLanguageVersion:
        gl?.getParameter(gl.SHADING_LANGUAGE_VERSION) ?? null,
      contextAttributes: gl?.getContextAttributes() ?? null
    }
  };
})()`;

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function allFalse(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((item) => item === false);
}

function allTrue(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((item) => item === true);
}

function summarizeBrowser(runtime) {
  const report = runtime.report?.report;
  const gpu = runtime.report?.gpu;
  validatePhysicalGpuIdentity(gpu, { platform: runtime.platform });
  if (
    runtime.gpuMode !== "physical" ||
    report?.status !== "passed" ||
    report.composition?.sourceCount !== 3 ||
    !same(report.composition.formats, ["glb", "ifc", "glb"]) ||
    !same(report.composition.sourceRoles, [
      "geometric-reference",
      "semantic-base",
      "consumer-overlay",
    ]) ||
    report.composition.identityMerged !== false ||
    report.semantics?.returned !== 2 ||
    report.selection?.items !== 3 ||
    report.selection.distinctKeys !== 3 ||
    report.selection.mergeAcrossSources !== false ||
    report.renderer?.backend !== "webgl2" ||
    report.renderer.actualGpu !== true ||
    report.renderer.nonBackgroundPixels <= 0 ||
    report.renderer.surfaceHits !== 3 ||
    report.renderer.retainedGeometryBytes !== 0 ||
    report.picks?.length !== 3 ||
    report.picks.some((pick) =>
      pick.surfaceHitCapability !== "source-local-surface-hit" ||
      pick.locator?.kind !== "triangle-barycentric" ||
      pick.verification?.actualGpuDepth !== true ||
      pick.verification.exactGeometryDigest !== true ||
      pick.verification.nearestUniqueTriangle !== true ||
      !allFalse(pick.authority)) ||
    report.anchors?.length !== 3 ||
    report.anchors.some((anchor) =>
      anchor.stability !== "derived" ||
      anchor.locator?.kind !== "triangle-barycentric" ||
      !allFalse(anchor.authority)) ||
    report.ranges?.unchangedBySurfaceResolution !== true ||
    !same(report.cleanup, BROWSER_CLEANUP) ||
    !allFalse(report.authority) ||
    runtime.externalOrigins.length !== 0 ||
    runtime.runtimeErrors.length !== 0
  ) {
    throw new Error("physical Browser Surface observation is invalid");
  }
  return Object.freeze({
    browser: runtime.browserVersion,
    platform: runtime.platform,
    headless: true,
    gpuMode: runtime.gpuMode,
    gpu,
    composition: report.composition,
    renderer: report.renderer,
    selection: report.selection,
    picks: report.picks.map((pick) => ({
      sourceSlot: pick.sourceSlot,
      surfaceHitCapability: pick.surfaceHitCapability,
      locatorKind: pick.locator.kind,
      actualGpuDepth: pick.verification.actualGpuDepth,
      exactGeometryDigest: pick.verification.exactGeometryDigest,
      nearestUniqueTriangle:
        pick.verification.nearestUniqueTriangle,
      retainedGeometryBytes: pick.resources.retainedGeometryBytes,
      temporaryGeometryReleased:
        pick.resources.temporaryGeometryReleased,
    })),
    anchors: report.anchors.map((anchor) => ({
      sourceSlot: anchor.sourceSlot,
      format: anchor.format,
      stability: anchor.stability,
      locatorKind: anchor.locator.kind,
    })),
    ranges: report.ranges,
    cleanup: report.cleanup,
    network: {
      externalOrigins: runtime.externalOrigins,
      runtimeErrors: runtime.runtimeErrors,
      requestCount: runtime.requestedUrls.length,
    },
  });
}

async function qualifyBrowserRun() {
  const server =
    await createFederatedBimSurfaceBrowserProbeServer();
  return summarizeBrowser(await runBrowserQualification({
    server,
    reportExpression: BROWSER_REPORT_EXPRESSION,
    timeoutMs: 30_000,
    userDataPrefix: "bex-physical-gpu-",
    gpuMode: "physical",
  }));
}

function summarizeVscodeSurface({
  environment,
  fixture,
  observation,
  assertions,
  layout,
  packageEvidence = null,
}) {
  const ready = observation?.ready;
  const qualified = observation?.qualified;
  validatePhysicalGpuIdentity(ready?.gpu, {
    platform: environment.platform,
  });
  if (
    environment.rendererMode !== "physical" ||
    fixture?.id !==
      "generated-ifc-glb-glb-vscode-surface-v0.2" ||
    fixture.sourceCount !== 3 ||
    !same(fixture.formats, ["glb", "ifc", "glb"]) ||
    observation?.hostKind !== "vscode-webview" ||
    observation.externalUpload !== false ||
    observation.telemetry !== false ||
    ready?.composition?.sourceCount !== 3 ||
    !same(ready.composition.formats, ["glb", "ifc", "glb"]) ||
    ready.composition.identityMerged !== false ||
    ready.renderer?.actualGpu !== true ||
    ready.renderer.context !== "webgl2" ||
    ready.renderer.nonBackgroundPixels <= 0 ||
    qualified?.selection?.items !== 3 ||
    qualified.selection.distinctKeys !== 3 ||
    qualified.selection.mergeAcrossSources !== false ||
    qualified.renderer?.surfaceHits !== 3 ||
    qualified.renderer.retainedGeometryBytes !== 0 ||
    qualified.picks?.length !== 3 ||
    qualified.anchors?.length !== 3 ||
    qualified.ranges?.unchangedBySurfaceResolution !== true ||
    !allFalse(qualified.authority) ||
    !same(observation.cleanup, CLEANUP) ||
    !same(observation.lifecycle, {
      opened: "ready",
      anchors: "qualified",
      disposed: "disposed",
      editorClosed: true,
    }) ||
    !allTrue(assertions)
  ) {
    throw new Error("physical VS Code Surface observation is invalid");
  }
  return Object.freeze({
    layout,
    vscode: environment.vscode,
    platform: environment.platform,
    rendererMode: environment.rendererMode,
    gpu: ready.gpu,
    composition: ready.composition,
    renderer: qualified.renderer,
    selection: qualified.selection,
    pickCount: qualified.picks.length,
    anchorCount: qualified.anchors.length,
    ranges: qualified.ranges,
    cleanup: observation.cleanup,
    lifecycle: observation.lifecycle,
    ...(packageEvidence === null
      ? {}
      : { package: packageEvidence }),
  });
}

async function hardwareProfile() {
  if (`${process.platform}-${process.arch}` !== "darwin-arm64") {
    throw new Error(
      "physical GPU evidence is currently scoped to darwin-arm64",
    );
  }
  const { stdout } = await EXEC_FILE(
    "system_profiler",
    ["-json", "SPDisplaysDataType"],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  const gpu = JSON.parse(stdout).SPDisplaysDataType?.[0];
  if (
    gpu?._name !== "Apple M2" ||
    gpu.sppci_cores !== "8" ||
    gpu.spdisplays_mtlgpufamilysupport !== "spdisplays_metal4"
  ) {
    throw new Error("qualified Apple GPU hardware profile changed");
  }
  return Object.freeze({
    chipset: gpu._name,
    cores: Number(gpu.sppci_cores),
    vendor: "Apple",
    metalSupport: "Metal 4",
  });
}

async function sha256(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

function validateSurfaceParity(left, right) {
  return same(left.composition, right.composition) &&
    same(left.renderer, right.renderer) &&
    same(left.selection, right.selection) &&
    left.pickCount === right.pickCount &&
    left.anchorCount === right.anchorCount &&
    same(left.ranges, right.ranges) &&
    same(left.cleanup, right.cleanup) &&
    same(left.lifecycle, right.lifecycle) &&
    same(left.gpu, right.gpu);
}

export function validateFederatedBimSurfacePhysicalGpuQualification(
  evidence,
) {
  const browserRuns = evidence?.browser?.runs;
  const staged = evidence?.vscode?.staged;
  const installed = evidence?.vscode?.installed;
  if (
    evidence?.schema !== SCHEMA ||
    evidence.status !== "passed-darwin-arm64-apple-metal-products" ||
    evidence.asOf !== AS_OF ||
    !isEvidenceTimestampAtOrAfter(evidence.capturedAt, AS_OF) ||
    !same(evidence.hardware, {
      chipset: "Apple M2",
      cores: 8,
      vendor: "Apple",
      metalSupport: "Metal 4",
    }) ||
    evidence.contract?.surface !==
      "bim-explorer-bim-surface/0.2" ||
    evidence.contract.package !==
      "@bim-explorer/federated-bim-surface@0.2.0" ||
    evidence.contract.runtimeSha256 !==
      "22e243fa8426d0648f1f3ca70c5fa015356f656084b1b95d3fdb21bcb8187847" ||
    evidence.contract.publicPackageSha256 !==
      "3bdb747d5eb38a45e0e753a14c8a9557b200c69a5469b416210293ac1dec63cb" ||
    evidence.contract.publicPackageBytes !== 97_623 ||
    !same(evidence.launchPolicy, {
      angle: "metal",
      softwareRasterizerDisabled: true,
      gpuBlocklistIgnored: true,
      browserHeadless: true,
      vscodePublication: false,
    }) ||
    !Array.isArray(browserRuns) ||
    browserRuns.length !== 2 ||
    !same(browserRuns[0], browserRuns[1]) ||
    browserRuns.some((run) =>
      run.browser !== "Google Chrome 151.0.7922.108" ||
      run.platform !== "darwin-arm64" ||
      run.headless !== true ||
      run.gpuMode !== "physical" ||
      run.composition?.sourceCount !== 3 ||
      run.renderer?.nonBackgroundPixels !== 8_286 ||
      run.renderer.uploadedBytes !== 1_608 ||
      run.renderer.surfaceHits !== 3 ||
      run.picks?.length !== 3 ||
      run.anchors?.length !== 3 ||
      !same(run.cleanup, BROWSER_CLEANUP)) ||
    staged?.layout !== "staged" ||
    installed?.layout !== "clean-installed-vsix" ||
    staged.vscode !== "1.132.0" ||
    installed.vscode !== "1.132.0" ||
    staged.platform !== "darwin-arm64" ||
    installed.platform !== "darwin-arm64" ||
    staged.rendererMode !== "physical" ||
    installed.rendererMode !== "physical" ||
    !validateSurfaceParity(staged, installed) ||
    staged.renderer?.nonBackgroundPixels !== 8_286 ||
    staged.renderer.uploadedBytes !== 1_608 ||
    staged.renderer.surfaceHits !== 3 ||
    installed.package?.id !== "menaje.bim-explorer" ||
    installed.package.version !== "0.1.0" ||
    installed.package.byteLength !== 1_568_103 ||
    installed.package.installedRuntimeFiles !== 24 ||
    installed.package.workerBundleSha256 !==
      "d7bf7bd53fb45616b986ab6ecb1b5adaa39cf63dfadd3f51c29f17faadd6e02f" ||
    installed.package.pointWorkerBundleSha256 !==
      "3d9d64d03801a40ec493596822b38affda1e0d51ae5ebd2e7362797192e7e977" ||
    installed.package.lazPerfJsSha256 !==
      "c13003dde28886f1986b83e7f7e23c217f6dc4ccd5835bf29b611036c985f104" ||
    installed.package.lazPerfWasmSha256 !==
      "7f4eacd83856610d42ba36e1c6f4a4019d07d9750827919c0c9b91397b862260" ||
    !same(evidence.fixturePolicy, {
      source: "generated-test-only",
      formats: ["glb", "ifc", "glb"],
      artifactTracked: false,
      releaseBundled: false,
      redistributed: false,
      externalUpload: false,
      telemetry: false,
    }) ||
    !same(Object.keys(evidence.assertions ?? {}), ASSERTION_KEYS) ||
    Object.values(evidence.assertions).some((value) => value !== true) ||
    !same(evidence.held, {
      crossPlatformPhysicalGpu: false,
      spatialVsixBundledBimRuntime: false,
      productionSupport: false,
    }) ||
    evidence.decision?.physicalGpuProductQualification !==
      "passed-darwin-arm64-apple-metal" ||
    evidence.decision.newVsixPublication !== false ||
    evidence.decision.productionClaims !== false ||
    !Array.isArray(evidence.limitations) ||
    evidence.limitations.length < 4 ||
    /(?:\/(?:Users|Volumes|private|tmp|home)\/|[A-Z]:\\|file:\/\/)/iu
      .test(JSON.stringify(evidence))
  ) {
    throw new Error(
      "federated BIM Surface physical GPU evidence is invalid",
    );
  }
  validatePhysicalGpuIdentity(browserRuns[0].gpu, {
    platform: browserRuns[0].platform,
  });
  validatePhysicalGpuIdentity(staged.gpu, {
    platform: staged.platform,
  });
  validatePhysicalGpuIdentity(installed.gpu, {
    platform: installed.platform,
  });
  return Object.freeze({
    status: evidence.status,
    browserRuns: browserRuns.length,
    vscodeLayouts: 2,
    renderer: browserRuns[0].gpu.unmaskedRenderer,
  });
}

export async function qualifyFederatedBimSurfacePhysicalGpu() {
  const [hardware, browserFirst, browserSecond] = await Promise.all([
    hardwareProfile(),
    qualifyBrowserRun(),
    qualifyBrowserRun(),
  ]);
  if (!same(browserFirst, browserSecond)) {
    throw new Error("physical Browser runs are not byte-stable");
  }
  const vscodeRuntime = await resolveVscodeQualificationRuntime();
  const stagedEvidence = await qualifyVscodeCustomEditor({
    includeFederatedSurfaceFixture: true,
    rendererMode: "physical",
    vscodeRuntime,
  });
  const installedEvidence = await qualifyVscodeVsixInstall({
    includeFederatedSurfaceFixture: true,
    includePublicFixture: false,
    rendererMode: "physical",
    vscodeRuntime,
  });
  const staged = summarizeVscodeSurface({
    environment: stagedEvidence.environment,
    fixture: stagedEvidence.federatedSurfaceFixture,
    observation: stagedEvidence.federatedSurfaceObservation,
    assertions: stagedEvidence.federatedSurfaceAssertions,
    layout: "staged",
  });
  const installedRuntime =
    installedEvidence.observation.federatedSurfaceRuntime;
  const installed = summarizeVscodeSurface({
    environment: installedEvidence.observation.runtime.environment,
    fixture: installedRuntime.fixture,
    observation: installedRuntime.observation,
    assertions: installedRuntime.assertions,
    layout: "clean-installed-vsix",
    packageEvidence: installedEvidence.package,
  });
  if (!validateSurfaceParity(staged, installed)) {
    throw new Error(
      "staged and clean-installed physical VS Code surfaces diverged",
    );
  }
  const releaseEvidence = JSON.parse(await readFile(
    path.join(
      ROOT,
      "compatibility/evidence/" +
        "federated-bim-surface-release-v0.2.0-2026-08-11.json",
    ),
    "utf8",
  ));
  const runtimeSha256 = await sha256(path.join(
    ROOT,
    "packages/federated-bim-surface/runtime/index.mjs",
  ));
  const publicPackage = releaseEvidence.artifacts.find((artifact) =>
    artifact.name ===
      "bim-explorer-federated-bim-surface-0.2.0.tgz");
  if (
    runtimeSha256 !== releaseEvidence.supplyChain.runtimeSha256 ||
    publicPackage?.byteLength !== 97_623 ||
    publicPackage.sha256 !==
      "3bdb747d5eb38a45e0e753a14c8a9557b200c69a5469b416210293ac1dec63cb"
  ) {
    throw new Error("public package runtime identity changed");
  }
  const evidence = {
    schema: SCHEMA,
    status: "passed-darwin-arm64-apple-metal-products",
    asOf: AS_OF,
    capturedAt: new Date().toISOString(),
    hardware,
    contract: {
      surface: "bim-explorer-bim-surface/0.2",
      surfaceHit: "bim-explorer-bim-surface-hit/0.1",
      referenceAnchor: "bim-explorer-reference-anchor/0.1",
      package: "@bim-explorer/federated-bim-surface@0.2.0",
      runtimeSha256,
      publicReleaseTag: "bim-surface-v0.2.0",
      publicPackageBytes: publicPackage.byteLength,
      publicPackageSha256: publicPackage.sha256,
    },
    launchPolicy: {
      angle: "metal",
      softwareRasterizerDisabled: true,
      gpuBlocklistIgnored: true,
      browserHeadless: true,
      vscodePublication: false,
    },
    browser: {
      runs: [browserFirst, browserSecond],
    },
    vscode: {
      staged,
      installed,
    },
    fixturePolicy: {
      source: "generated-test-only",
      formats: ["glb", "ifc", "glb"],
      artifactTracked: false,
      releaseBundled: false,
      redistributed: false,
      externalUpload: false,
      telemetry: false,
    },
    assertions: Object.fromEntries(
      ASSERTION_KEYS.map((name) => [name, true]),
    ),
    held: {
      crossPlatformPhysicalGpu: false,
      spatialVsixBundledBimRuntime: false,
      productionSupport: false,
    },
    decision: {
      physicalGpuProductQualification:
        "passed-darwin-arm64-apple-metal",
      newVsixPublication: false,
      productionClaims: false,
    },
    limitations: [
      "the physical GPU qualification is local macOS arm64 Apple M2 and does not claim Linux or Windows hardware coverage",
      "the Browser and VS Code product surfaces use generated test-only IFC4 and GLB sources rather than customer models",
      "GPU allocation receipts are bounded API accounting and do not claim OS-level peak GPU memory telemetry",
      "the derived display-geometry locator does not claim native source face identity, surveyed CRS or datum authority",
      "the clean-installed VSIX is local qualification output only and was not uploaded or published",
      "Spatial VSIX BIM runtime integration, actual adoption and production support remain separate Gates"
    ],
  };
  validateFederatedBimSurfacePhysicalGpuQualification(evidence);
  return Object.freeze(evidence);
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
      "usage: node scripts/qualify-federated-bim-surface-physical-gpu.mjs " +
        "[--out path]",
    );
  }
  return path.resolve(values[1]);
}

async function main() {
  const output = outputArgument(process.argv.slice(2));
  const evidence = await qualifyFederatedBimSurfacePhysicalGpu();
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (output === null) {
    process.stdout.write(serialized);
    return;
  }
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, serialized, "utf8");
  process.stdout.write(`Wrote ${path.relative(ROOT, output)}\n`);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
