import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  isEvidenceTimestampAtOrAfter,
} from "./evidence-timestamp.mjs";
import {
  validatePhysicalGpuIdentity,
} from "./gpu-qualification-profile.mjs";
import {
  qualifyBimProductShell,
} from "./qualify-bim-product-shell.mjs";
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
const EXEC_FILE = promisify(execFile);
const AS_OF = "2026-08-11";
const SCHEMA =
  "bim-explorer-representative-point-clouds-physical-gpu-qualification/1";
export const REPRESENTATIVE_POINT_CLOUDS_PHYSICAL_GPU_EVIDENCE_PATH =
  "compatibility/evidence/" +
  "bim-product-shell-representative-point-clouds-physical-gpu-" +
  "darwin-arm64-2026-08-11.json";

const PROFILES = Object.freeze({
  las: Object.freeze({
    browserFixture: "las-public",
    fixtureId: "loaders-gl-ripple-las-laz-las",
    format: "las",
    sourceBytes: 347_061,
    fingerprint:
      "sha256:dbe194dd8529300f341a591e0b2e2ac5" +
      "7a96880db6dffa120dc1a41465026852",
    pointFormat: 3,
    points: 10_201,
    decodedPointBytes: 346_834,
    rangeBytes: 163_264,
    payloadBytes: 163_216,
    rangeSha256:
      "8383abce84d57b8f50ee1f39aa1d442a" +
      "7f258cd759ab9812aff1a0625ab10449",
    decoder: "las-point-record-reader",
    chunks: 1,
    levels: 1,
    finalLevel: 0,
  }),
  laz: Object.freeze({
    browserFixture: "laz-public",
    fixtureId: "loaders-gl-ripple-las-laz-laz",
    format: "laz",
    sourceBytes: 53_952,
    fingerprint:
      "sha256:64cc16cf7b38d3ec3d13e96b7af66bf" +
      "887be2a5d35d55e86c41fd38fa79c9034",
    pointFormat: 3,
    points: 10_201,
    decodedPointBytes: 346_834,
    rangeBytes: 163_264,
    payloadBytes: 163_216,
    rangeSha256:
      "8383abce84d57b8f50ee1f39aa1d442a" +
      "7f258cd759ab9812aff1a0625ab10449",
    decoder: "laz-perf",
    chunks: 1,
    levels: 1,
    finalLevel: 0,
  }),
  e57: Object.freeze({
    browserFixture: "e57-public",
    fixtureId: "libe57format-coloured-cube-float-e57",
    format: "e57",
    sourceBytes: 118_784,
    fingerprint:
      "sha256:6dbf7972b358bd7dd0864c7893a4aa7b" +
      "61a339fd6ee27c71b3031f763c977d33",
    pointFormat: "cartesian-xyz-rgb",
    points: 7_680,
    decodedPointBytes: 215_040,
    rangeBytes: 122_928,
    payloadBytes: 122_880,
    rangeSha256:
      "dcc6868c55c79a51d315bfc4b287ca38" +
      "f8217e3d572554ef56b0da77359cd6aa",
    decoder: "bim-explorer-e57-bitpack-reader",
    chunks: 1,
    levels: 1,
    finalLevel: 0,
  }),
  e57MultipleScan: Object.freeze({
    browserFixture: "e57-multiple-scan-public",
    fixtureId: "e57-example-pump-no-invalid-multiple-scan",
    format: "e57",
    sourceBytes: 22_146_048,
    fingerprint:
      "sha256:5b85b18fe9860e9f9a2f397434530f2d" +
      "403fefcc15cf1ff92d75d96d274ff5a5",
    pointFormat: "cartesian-xyz-rgb-multiple-scan",
    points: 1_213_990,
    decodedPointBytes: 35_205_710,
    rangeBytes: 19_423_888,
    payloadBytes: 19_423_840,
    rangeSha256:
      "4dd5bbef38ffd815c00a01cf3feaa07a8" +
      "5b40fa7019b2a6dad448e373381e697",
    decoder: "bim-explorer-e57-bitpack-reader",
    chunks: 51,
    levels: 3,
    finalLevel: 2,
  }),
});

const PROFILE_NAMES = Object.freeze(Object.keys(PROFILES));
const ASSERTION_KEYS = Object.freeze([
  "browserLasAppleMetal",
  "browserLazAppleMetal",
  "browserE57AppleMetal",
  "browserE57MultipleScanAppleMetal",
  "stagedVscodePointCloudsAppleMetal",
  "cleanInstalledVsixPointCloudsAppleMetal",
  "stagedAndInstalledPointProjectionParity",
  "exactSourceAndRangeIdentity",
  "boundedPointGpuUploads",
  "sourceScopedPointPicking",
  "derivedHierarchyLodLifecycle",
  "terminalWorkerCpuAndGpuCleanup",
  "softwareFallbackDisabled",
  "cacheOnlySamplesNotBundledOrRedistributed",
  "localOnlyNoTelemetry",
  "coordinateAndSemanticAuthorityHeld",
  "formatAdmissionHeld",
  "noSpatialAuthority",
  "noVsixPublication",
]);

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

function sameGpuDevice(left, right) {
  return left?.unmaskedVendor === right?.unmaskedVendor &&
    left?.unmaskedRenderer === right?.unmaskedRenderer;
}

async function hardwareProfile() {
  if (`${process.platform}-${process.arch}` !== "darwin-arm64") {
    throw new Error(
      "point-cloud physical GPU qualification requires darwin-arm64",
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
    throw new Error("representative point-cloud GPU profile changed");
  }
  return Object.freeze({
    chipset: "Apple M2",
    cores: 8,
    vendor: "Apple",
    metalSupport: "Metal 4",
  });
}

function exactFixture(value, profile) {
  return value?.id === profile.fixtureId &&
    value.committed === false &&
    value.format === profile.format &&
    value.sourceBytes === profile.sourceBytes &&
    value.fingerprint === profile.fingerprint &&
    value.formatVersion === (profile.format === "e57" ? "1.0" : "1.2") &&
    value.pointFormat === profile.pointFormat &&
    value.provenance?.bundled === false &&
    value.provenance.sampleRedistributed === false;
}

function exactPointPick(value, profile) {
  return value?.schema ===
      "bim-explorer-bounded-point-renderer-pick-receipt/0.1" &&
    value.status === "hit" &&
    value.coordinates?.origin === "canvas-top-left" &&
    Number.isSafeInteger(value.coordinates.x) &&
    Number.isSafeInteger(value.coordinates.y) &&
    value.identity?.authority === "derived-point-range-order" &&
    Number.isSafeInteger(value.identity.pointIndex) &&
    value.identity.nativeId === `point:${value.identity.pointIndex}` &&
    value.identity.rangeSha256 === profile.rangeSha256 &&
    value.identity.renderedRangeSha256 ===
      value.pointRangeSha256ForValidation &&
    Array.isArray(value.worldPosition) &&
    value.worldPosition.length === 3 &&
    value.worldPosition.every(Number.isFinite) &&
    value.backend?.actualGpu === true &&
    value.backend.backendId === "webgl2-points" &&
    value.backend.drawCalls === 1 &&
    value.backend.glError === 0 &&
    value.backend.temporaryReleased === true;
}

function validatePointPick(value, profile, renderedRangeSha256) {
  const candidate = {
    ...value,
    pointRangeSha256ForValidation: renderedRangeSha256,
  };
  if (!exactPointPick(candidate, profile)) {
    throw new Error(
      `representative ${profile.format.toUpperCase()} point pick is invalid`,
    );
  }
}

function exactPointProfile(surface, name, hostKind) {
  const profile = PROFILES[name];
  const observation = surface?.observation;
  validatePhysicalGpuIdentity(observation?.gpu, {
    platform: "darwin-arm64",
  });
  const model = observation?.model;
  const resources = observation?.resources;
  const renderer = observation?.renderer;
  const pointCloud = observation?.pointCloud;
  const lifecycle = observation?.lifecycle;
  if (
    !exactFixture(surface?.fixture, profile) ||
    !allTrue(surface?.assertions) ||
    observation.hostKind !== hostKind ||
    model?.points !== profile.points ||
    model.ranges !== 1 ||
    model.chunks !== profile.chunks ||
    model.levels !== profile.levels ||
    resources?.decodedPointBytes !== profile.decodedPointBytes ||
    resources.pointRangeBytes !== profile.rangeBytes ||
    resources.pointRangePayloadBytes !== profile.payloadBytes ||
    resources.sourceBytes !== profile.sourceBytes ||
    renderer?.actualGpu !== true ||
    renderer.nonBackgroundPixels <= 0 ||
    renderer.sourceReadBytes !== profile.rangeBytes ||
    renderer.uploadedBytes !== profile.payloadBytes ||
    pointCloud?.coordinateReferenceStatus !== "unqualified" ||
    pointCloud.decoder?.id !== profile.decoder ||
    pointCloud.pointPrimitive !== "POINTS" ||
    pointCloud.pointSize !== 3 ||
    pointCloud.rangeSha256 !== profile.rangeSha256 ||
    pointCloud.renderedRangeSha256 !== profile.rangeSha256 ||
    pointCloud.lod?.fullDetail !== true ||
    pointCloud.lod.levelIndex !== profile.finalLevel ||
    pointCloud.lod.pointCount !== profile.points ||
    observation.productLifecycle?.cpuPointRangeCleared !== true ||
    observation.productLifecycle.sourceBufferCleared !== true ||
    observation.productLifecycle.workerTerminatedAfterTransfer !== true ||
    lifecycle?.opened !== "ready" ||
    lifecycle.closed !== "disposed"
  ) {
    throw new Error(
      `representative ${name} physical product profile is invalid`,
    );
  }
  validatePointPick(
    observation.pointSelection,
    profile,
    profile.rangeSha256,
  );
  if (
    hostKind === "browser" &&
    (
      observation.network?.externalOrigins?.length !== 0 ||
      observation.runtimeErrors?.length !== 0 ||
      lifecycle.backendDisposed !== true ||
      lifecycle.clientDisposed !== true ||
      lifecycle.pointRangeCleared !== true ||
      lifecycle.rendererDisposed !== true ||
      lifecycle.workerTerminatedAfterTransfer !== true
    )
  ) {
    throw new Error(`representative ${name} Browser cleanup is invalid`);
  }
  if (
    hostKind === "vscode-webview" &&
    (
      observation.externalUpload !== false ||
      observation.telemetry !== false
    )
  ) {
    throw new Error(`representative ${name} VS Code policy is invalid`);
  }
  if (name !== "e57MultipleScan") {
    if (
      observation.initialPointLod !== null &&
      observation.initialPointLod !== undefined
    ) {
      throw new Error(`representative ${name} unexpectedly used LOD`);
    }
    if ((observation.lodTransitions?.length ?? 0) !== 0) {
      throw new Error(`representative ${name} LOD transitions are invalid`);
    }
    return true;
  }
  const hierarchy = pointCloud.hierarchy;
  const initial = observation.initialPointLod;
  if (
    hierarchy?.contract !==
      "bim-explorer-derived-point-hierarchy/0.1" ||
    (hierarchy.chunkCount ?? hierarchy.chunks?.length) !== 51 ||
    hierarchy.levels?.length !== 3 ||
    initial?.lod?.fullDetail !== false ||
    initial.lod.levelIndex !== 0 ||
    initial.lod.pointCount !== 31_971 ||
    initial.renderer?.actualGpu !== true ||
    initial.renderer.nonBackgroundPixels <= 0 ||
    initial.renderer.sourceReadBytes !== 511_584 ||
    initial.renderer.uploadedBytes !== 511_536 ||
    observation.lodTransitions?.length !== 2 ||
    observation.lodTransitions[0]?.toLevelId !== "lod:1" ||
    observation.lodTransitions[1]?.toLevelId !== "lod:2" ||
    observation.productLifecycle.hierarchyCleanup?.disposed !== true
  ) {
    throw new Error("representative multiple-scan LOD profile is invalid");
  }
  validatePointPick(
    initial.pointSelection,
    profile,
    initial.renderedRangeSha256,
  );
  return true;
}

function stableProfile(value) {
  const { performance: _performance, ...observation } =
    value.observation;
  return {
    fixture: value.fixture,
    observation,
    assertions: value.assertions,
  };
}

function exactPackage(value) {
  return value?.id === "menaje.bim-explorer" &&
    value.version === "0.1.0" &&
    Number.isSafeInteger(value.byteLength) &&
    value.byteLength > 0 &&
    value.installedRuntimeFiles === 31 &&
    [
      value.workerBundleSha256,
      value.pointWorkerBundleSha256,
      value.viewerCoreProductBundleSha256,
      value.lazPerfJsSha256,
      value.lazPerfWasmSha256,
    ].every((digest) => /^[0-9a-f]{64}$/u.test(digest ?? ""));
}

export function validateRepresentativePointCloudsPhysicalGpuQualification(
  evidence,
) {
  if (
    evidence?.schema !== SCHEMA ||
    evidence.status !==
      "passed-darwin-arm64-apple-metal-representative-point-clouds" ||
    evidence.asOf !== AS_OF ||
    !isEvidenceTimestampAtOrAfter(evidence.capturedAt, AS_OF) ||
    !same(evidence.hardware, {
      chipset: "Apple M2",
      cores: 8,
      vendor: "Apple",
      metalSupport: "Metal 4",
    }) ||
    !same(evidence.launchPolicy, {
      angle: "metal",
      softwareRasterizerDisabled: true,
      gpuBlocklistIgnored: true,
      failIfMajorPerformanceCaveat: true,
      powerPreference: "high-performance",
      browserHeadless: true,
      vscodePublication: false,
    }) ||
    !same(evidence.fixturePolicy, {
      source: "pinned-public-cache-only",
      artifactTracked: false,
      releaseBundled: false,
      redistributed: false,
      externalUpload: false,
      telemetry: false,
      testOnly: true,
    })
  ) {
    throw new Error(
      "representative point-cloud physical GPU identity is invalid",
    );
  }
  for (const name of PROFILE_NAMES) {
    const browser = evidence.browser?.[name];
    if (
      browser?.schema !==
        "bim-explorer-product-shell-browser-evidence/1" ||
      browser.environment?.browser !==
        "Google Chrome 151.0.7922.108" ||
      browser.environment.headless !== true ||
      browser.environment.platform !== "darwin-arm64" ||
      browser.environment.rendererMode !== "physical" ||
      browser.decision?.actualPhysicalGpu !==
        "passed-observed-apple-metal" ||
      !same(browser.environment.gpu, browser.observation?.gpu)
    ) {
      throw new Error(
        `representative ${name} physical Browser evidence is invalid`,
      );
    }
    validatePhysicalGpuIdentity(browser.environment.gpu, {
      platform: browser.environment.platform,
    });
    exactPointProfile(browser, name, "browser");
  }
  const staged = evidence.vscode?.staged;
  const installed = evidence.vscode?.installed;
  for (const [surface, layout] of [
    [staged, "staged"],
    [installed, "clean-installed-vsix"],
  ]) {
    if (
      surface?.vscode !== "1.132.0" ||
      surface.platform !== "darwin-arm64" ||
      surface.rendererMode !== "physical" ||
      surface.layout !== layout ||
      !allTrue(surface.assertions)
    ) {
      throw new Error(
        `representative point-cloud ${layout} evidence is invalid`,
      );
    }
    validatePhysicalGpuIdentity(surface.gpu, {
      platform: surface.platform,
    });
    for (const name of PROFILE_NAMES) {
      const profile = surface.profiles?.[name];
      exactPointProfile(profile, name, "vscode-webview");
      if (!sameGpuDevice(surface.gpu, profile.observation.gpu)) {
        throw new Error(
          `representative ${name} ${layout} GPU identity diverged`,
        );
      }
    }
  }
  if (!exactPackage(installed?.package)) {
    throw new Error("representative point-cloud VSIX identity is invalid");
  }
  for (const name of PROFILE_NAMES) {
    if (!same(
      stableProfile(staged.profiles[name]),
      stableProfile(installed.profiles[name]),
    )) {
      throw new Error(
        `representative staged and installed ${name} profiles diverged`,
      );
    }
  }
  if (
    !same(Object.keys(evidence.assertions ?? {}), ASSERTION_KEYS) ||
    Object.values(evidence.assertions).some((value) => value !== true) ||
    !same(evidence.held, {
      crossPlatformPhysicalGpu: false,
      coordinateReference: false,
      formatAdmission: false,
      sourceNativePointHierarchy: false,
      sourceNativePointSemantics: false,
      osLevelPeakGpuMemory: false,
      productionSupport: false,
    }) ||
    evidence.decision?.pointCloudPhysicalGpuQualification !==
      "passed-las-laz-e57-apple-metal-product-surfaces" ||
    evidence.decision.coordinateReference !== "held" ||
    evidence.decision.formatAdmission !== false ||
    evidence.decision.newVsixPublication !== false ||
    evidence.decision.productionClaims !== false ||
    !Array.isArray(evidence.limitations) ||
    evidence.limitations.length < 7 ||
    /(?:\/(?:Users|Volumes|private|tmp|home)\/|[A-Z]:\\|file:\/\/)/iu
      .test(JSON.stringify(evidence))
  ) {
    throw new Error(
      "representative point-cloud physical GPU evidence is invalid",
    );
  }
  return Object.freeze({
    status: evidence.status,
    profiles: PROFILE_NAMES.length,
    surfaces: PROFILE_NAMES.length * 3,
    maximumPoints: PROFILES.e57MultipleScan.points,
  });
}

function vscodePointSurface(evidence, layout) {
  const installed = layout === "clean-installed-vsix";
  const runtime = installed
    ? evidence.observation?.runtime
    : evidence;
  const pointRuntime = installed
    ? evidence.observation?.pointRuntime
    : {
        fixtures: evidence.pointFixtures,
        observations: evidence.pointObservations,
        assertions: evidence.pointAssertions,
      };
  return Object.freeze({
    layout,
    vscode: runtime.environment?.vscode,
    platform: runtime.environment?.platform,
    rendererMode: runtime.environment?.rendererMode,
    gpu: runtime.environment?.gpu,
    ...(installed ? { package: evidence.package } : {}),
    profiles: Object.fromEntries(PROFILE_NAMES.map((name) => [
      name,
      {
        fixture: pointRuntime.fixtures?.[name],
        observation: pointRuntime.observations?.[name],
        assertions: pointRuntime.assertions?.[name],
      },
    ])),
    assertions: evidence.assertions,
  });
}

export async function qualifyRepresentativePointCloudsPhysicalGpu() {
  const hardware = await hardwareProfile();
  const browser = {};
  for (const name of PROFILE_NAMES) {
    browser[name] = await qualifyBimProductShell({
      fixture: PROFILES[name].browserFixture,
      rendererMode: "physical",
    });
  }
  const vscodeRuntime = await resolveVscodeQualificationRuntime();
  const staged = vscodePointSurface(
    await qualifyVscodeCustomEditor({
      includePointFixtures: true,
      includeE57MultipleScanFixture: true,
      rendererMode: "physical",
      vscodeRuntime,
    }),
    "staged",
  );
  const installed = vscodePointSurface(
    await qualifyVscodeVsixInstall({
      includePointFixtures: true,
      includeE57MultipleScanFixture: true,
      includePublicFixture: false,
      rendererMode: "physical",
      vscodeRuntime,
    }),
    "clean-installed-vsix",
  );
  const evidence = {
    schema: SCHEMA,
    status:
      "passed-darwin-arm64-apple-metal-representative-point-clouds",
    asOf: AS_OF,
    capturedAt: new Date().toISOString(),
    hardware,
    launchPolicy: {
      angle: "metal",
      softwareRasterizerDisabled: true,
      gpuBlocklistIgnored: true,
      failIfMajorPerformanceCaveat: true,
      powerPreference: "high-performance",
      browserHeadless: true,
      vscodePublication: false,
    },
    fixturePolicy: {
      source: "pinned-public-cache-only",
      artifactTracked: false,
      releaseBundled: false,
      redistributed: false,
      externalUpload: false,
      telemetry: false,
      testOnly: true,
    },
    browser,
    vscode: { staged, installed },
    assertions: Object.fromEntries(
      ASSERTION_KEYS.map((name) => [name, true]),
    ),
    held: {
      crossPlatformPhysicalGpu: false,
      coordinateReference: false,
      formatAdmission: false,
      sourceNativePointHierarchy: false,
      sourceNativePointSemantics: false,
      osLevelPeakGpuMemory: false,
      productionSupport: false,
    },
    decision: {
      pointCloudPhysicalGpuQualification:
        "passed-las-laz-e57-apple-metal-product-surfaces",
      coordinateReference: "held",
      formatAdmission: false,
      newVsixPublication: false,
      productionClaims: false,
    },
    limitations: [
      "the physical GPU result is limited to local macOS arm64 Apple M2 and does not claim Linux or Windows hardware coverage",
      "LAS, LAZ, compact E57 and multiple-scan E57 were opened in separate bounded product sessions and do not claim simultaneous federation",
      "the public samples are pinned cache-only test inputs and are not tracked, redistributed or bundled in Git, VSIX or release artifacts",
      "point identities remain derived source-revision and range-order identities without source-native point semantics",
      "derived hierarchy and LOD evidence does not claim source-native E57, LAS or LAZ hierarchy support",
      "sample coordinates and E57 scan poses do not establish CRS or surveyed datum authority",
      "physical rendering does not admit E57, LAS or LAZ formats and does not establish production support",
      "GPU receipts are bounded renderer accounting and do not claim OS-level peak GPU memory telemetry",
      "the clean-installed VSIX is local qualification output only and was not uploaded or published",
      "Spatial integration and point-cloud federation remain separate Gates"
    ],
  };
  validateRepresentativePointCloudsPhysicalGpuQualification(evidence);
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
      "usage: node " +
        "scripts/qualify-representative-point-clouds-physical-gpu.mjs " +
        "[--out path]",
    );
  }
  return path.resolve(values[1]);
}

async function main() {
  const output = outputArgument(process.argv.slice(2));
  const evidence =
    await qualifyRepresentativePointCloudsPhysicalGpu();
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
