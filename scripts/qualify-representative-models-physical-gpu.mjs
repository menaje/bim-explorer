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
  "bim-explorer-representative-models-physical-gpu-qualification/1";
export const REPRESENTATIVE_MODELS_PHYSICAL_GPU_EVIDENCE_PATH =
  "compatibility/evidence/" +
  "bim-product-shell-representative-physical-gpu-darwin-arm64-" +
  "2026-08-11.json";

const IFC_FIXTURE = Object.freeze({
  id: "public-schependomlaan-complete-ifc2x3",
  format: "ifc",
  sourceBytes: 46_766_968,
  fingerprint:
    "sha256:5c73cdd02b3add09b30cf437eb3fe01bc4631e5a60dbaf30c0b8a7b817585bb4",
  schema: "IFC2X3",
  repository:
    "buildingsmart-community/Community-Sample-Test-Files",
  commit: "7ddf57a201f88a0c213d5322b02ed15e94a60a40",
  license: "CC-BY-4.0",
});

const GLB_FIXTURE = Object.freeze({
  id: "khronos-gltf-sample-assets-a-beautiful-game-glb",
  format: "glb",
  sourceBytes: 42_977_928,
  fingerprint:
    "sha256:bd7133b4b322aae97c589b8839dae8155ad2546acb35ae32a127e722a959d007",
  gltfVersion: "2.0",
  nativeId: "node:0/mesh:0/primitive:0",
  repository:
    "https://github.com/KhronosGroup/glTF-Sample-Assets",
  commit: "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf",
  license: "CC-BY-4.0",
});

const IFC_MODEL = Object.freeze({
  products: 3_569,
  treeNodes: 3_578,
  triangles: 261_424,
  ranges: 3,
});

const GLB_MODEL = Object.freeze({
  entities: 49,
  geometryRecords: 15,
  instances: 49,
  triangles: 573_952,
  ranges: 1,
});

const IFC_RENDERER = Object.freeze({
  actualGpu: true,
  nonBackgroundPixels: 39_864,
  sourceReadBytes: 4_193_868,
  uploadedBytes: 4_399_252,
});

const GLB_RENDERER = Object.freeze({
  actualGpu: true,
  nonBackgroundPixels: 48_762,
  sourceReadBytes: 16_896_412,
  uploadedBytes: 16_900_016,
});

const ASSERTION_KEYS = Object.freeze([
  "browserIfcAppleMetal",
  "browserGlbAppleMetal",
  "browserRepresentativeIdentityExact",
  "browserReadOnlyInteraction",
  "browserTerminalCleanup",
  "stagedVscodeAppleMetal",
  "cleanInstalledVsixAppleMetal",
  "vscodeRepresentativeParity",
  "softwareFallbackDisabled",
  "cacheOnlySamplesNotBundled",
  "localOnlyNoTelemetry",
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

async function hardwareProfile() {
  if (`${process.platform}-${process.arch}` !== "darwin-arm64") {
    throw new Error(
      "representative physical GPU qualification requires darwin-arm64",
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
    throw new Error("representative Apple GPU profile changed");
  }
  return Object.freeze({
    chipset: "Apple M2",
    cores: 8,
    vendor: "Apple",
    metalSupport: "Metal 4",
  });
}

function normalizedFixture(value, expected) {
  const fixture = {
    id: value?.id,
    committed: value?.committed,
    format: value?.format ?? "ifc",
    sourceBytes: value?.sourceBytes,
    fingerprint: value?.fingerprint,
    ...(expected.format === "ifc"
      ? { schema: value?.schema ?? value?.ifcSchema }
      : {
          gltfVersion: value?.gltfVersion,
          nativeId: value?.nativeId,
        }),
    provenance: {
      repository: value?.provenance?.repository,
      commit: value?.provenance?.commit,
      license: value?.provenance?.license,
      bundled: value?.provenance?.bundled,
    },
  };
  if (
    fixture.id !== expected.id ||
    fixture.committed !== false ||
    fixture.format !== expected.format ||
    fixture.sourceBytes !== expected.sourceBytes ||
    fixture.fingerprint !== expected.fingerprint ||
    fixture.provenance.repository !== expected.repository ||
    fixture.provenance.commit !== expected.commit ||
    fixture.provenance.license !== expected.license ||
    fixture.provenance.bundled !== false ||
    (
      expected.format === "ifc"
        ? fixture.schema !== expected.schema
        : (
            fixture.gltfVersion !== expected.gltfVersion ||
            fixture.nativeId !== expected.nativeId
          )
    )
  ) {
    throw new Error("representative fixture identity is invalid");
  }
  return Object.freeze(fixture);
}

function normalizedProduct(observation, format) {
  const expectedModel = format === "ifc" ? IFC_MODEL : GLB_MODEL;
  const expectedRenderer = format === "ifc"
    ? IFC_RENDERER
    : GLB_RENDERER;
  const lifecycle = observation?.lifecycle;
  if (
    observation?.hostKind === undefined ||
    !same(observation.model, expectedModel) ||
    !same(observation.renderer, expectedRenderer) ||
    lifecycle?.opened !== "ready" ||
    lifecycle.closed !== "disposed" ||
    (
      observation.externalUpload !== undefined &&
      observation.externalUpload !== false
    ) ||
    (
      observation.telemetry !== undefined &&
      observation.telemetry !== false
    )
  ) {
    throw new Error(
      `representative ${format.toUpperCase()} product observation is invalid`,
    );
  }
  return Object.freeze({
    hostKind: observation.hostKind,
    model: observation.model,
    resources: observation.resources,
    renderer: observation.renderer,
    ...(format === "ifc"
      ? { semantic: observation.semantic }
      : { reference: observation.reference }),
    lifecycle,
    ...(observation.externalUpload === undefined
      ? {}
      : { externalUpload: observation.externalUpload }),
    ...(observation.telemetry === undefined
      ? {}
      : { telemetry: observation.telemetry }),
  });
}

function normalizedBrowser(evidence, format) {
  const expected = format === "ifc" ? IFC_FIXTURE : GLB_FIXTURE;
  validatePhysicalGpuIdentity(evidence?.environment?.gpu, {
    platform: evidence?.environment?.platform,
  });
  if (
    evidence?.schema !==
      "bim-explorer-product-shell-browser-evidence/1" ||
    evidence.environment.browser !== "Google Chrome 151.0.7922.108" ||
    evidence.environment.headless !== true ||
    evidence.environment.platform !== "darwin-arm64" ||
    evidence.environment.rendererMode !== "physical" ||
    evidence.decision?.actualPhysicalGpu !==
      "passed-observed-apple-metal" ||
    !allTrue(evidence.assertions) ||
    evidence.observation?.network?.externalOrigins?.length !== 0 ||
    evidence.observation?.runtimeErrors?.length !== 0 ||
    evidence.observation?.lifecycle?.backendDisposed !== true ||
    evidence.observation?.lifecycle?.clientDisposed !== true
  ) {
    throw new Error("representative physical Browser evidence is invalid");
  }
  if (
    format === "ifc" &&
    (
      evidence.observation.interaction?.searchResults !== 25 ||
      evidence.observation.interaction.selectedExpressId !== 317_690 ||
      evidence.observation.interaction.selectionOrigin !== "3d"
    )
  ) {
    throw new Error("representative IFC interaction is invalid");
  }
  if (
    format === "glb" &&
    (
      evidence.observation.interaction?.searchResults !== 1 ||
      evidence.observation.interaction.selectedNativeId !==
        "node:4/mesh:4/primitive:0" ||
      evidence.observation.interaction.selectionOrigin !== "3d"
    )
  ) {
    throw new Error("representative GLB interaction is invalid");
  }
  return Object.freeze({
    browser: evidence.environment.browser,
    platform: evidence.environment.platform,
    rendererMode: evidence.environment.rendererMode,
    gpu: evidence.environment.gpu,
    fixture: normalizedFixture(evidence.fixture, expected),
    product: normalizedProduct(evidence.observation, format),
    interaction: evidence.observation.interaction,
    network: evidence.observation.network,
  });
}

function normalizedVscode(evidence, layout) {
  const installed = layout === "clean-installed-vsix";
  const runtime = installed ? evidence?.observation?.runtime : evidence;
  const federated = installed
    ? evidence?.observation?.federatedSurfaceRuntime
    : {
        observation: evidence?.federatedSurfaceObservation,
        assertions: evidence?.federatedSurfaceAssertions,
      };
  const publicRuntime = installed
    ? evidence?.observation?.publicRuntime
    : {
        fixture: evidence?.publicFixture,
        ...evidence?.publicObservation,
      };
  const glbRuntime = installed
    ? evidence?.observation?.productScaleReferenceRuntime
    : {
        fixture: evidence?.productScaleReferenceFixture,
        ...evidence?.productScaleReferenceObservation,
      };
  const gpu = federated?.observation?.ready?.gpu;
  validatePhysicalGpuIdentity(gpu, {
    platform: runtime?.environment?.platform,
  });
  if (
    evidence?.schema !== (
      installed
        ? "bim-explorer-vscode-vsix-install-evidence/1"
        : "bim-explorer-vscode-custom-editor-evidence/1"
    ) ||
    runtime?.environment?.vscode !== "1.132.0" ||
    runtime.environment.platform !== "darwin-arm64" ||
    runtime.environment.rendererMode !== "physical" ||
    runtime.environment.runtimeLayout !== (
      installed ? "installed-vsix" : "staged"
    ) ||
    !allTrue(evidence.assertions) ||
    !allTrue(federated.assertions) ||
    (
      !installed &&
      (
        !allTrue(evidence.publicAssertions) ||
        !allTrue(evidence.productScaleReferenceAssertions)
      )
    )
  ) {
    throw new Error("representative physical VS Code evidence is invalid");
  }
  const result = {
    layout,
    vscode: runtime.environment.vscode,
    platform: runtime.environment.platform,
    rendererMode: runtime.environment.rendererMode,
    gpu,
    ifc: {
      fixture: normalizedFixture(publicRuntime.fixture, IFC_FIXTURE),
      product: normalizedProduct(publicRuntime, "ifc"),
    },
    glb: {
      fixture: normalizedFixture(glbRuntime.fixture, GLB_FIXTURE),
      product: normalizedProduct(glbRuntime, "glb"),
    },
  };
  if (installed) {
    const packageEvidence = evidence.package;
    if (
      packageEvidence?.id !== "menaje.bim-explorer" ||
      packageEvidence.version !== "0.1.0" ||
      !Number.isSafeInteger(packageEvidence.byteLength) ||
      packageEvidence.byteLength <= 0 ||
      packageEvidence.installedRuntimeFiles !== 24 ||
      packageEvidence.workerBundleSha256 !==
        "d7bf7bd53fb45616b986ab6ecb1b5adaa39cf63dfadd3f51c29f17faadd6e02f" ||
      packageEvidence.pointWorkerBundleSha256 !==
        "3d9d64d03801a40ec493596822b38affda1e0d51ae5ebd2e7362797192e7e977" ||
      packageEvidence.lazPerfJsSha256 !==
        "c13003dde28886f1986b83e7f7e23c217f6dc4ccd5835bf29b611036c985f104" ||
      packageEvidence.lazPerfWasmSha256 !==
        "7f4eacd83856610d42ba36e1c6f4a4019d07d9750827919c0c9b91397b862260"
    ) {
      throw new Error("representative physical VSIX identity is invalid");
    }
    result.package = packageEvidence;
  }
  return Object.freeze(result);
}

function vscodeParity(value) {
  return Object.freeze({
    vscode: value.vscode,
    platform: value.platform,
    rendererMode: value.rendererMode,
    gpu: value.gpu,
    ifc: value.ifc,
    glb: value.glb,
  });
}

export function validateRepresentativeModelsPhysicalGpuQualification(
  evidence,
) {
  const browserIfc = evidence?.browser?.ifc;
  const browserGlb = evidence?.browser?.glb;
  const staged = evidence?.vscode?.staged;
  const installed = evidence?.vscode?.installed;
  if (
    evidence?.schema !== SCHEMA ||
    evidence.status !==
      "passed-darwin-arm64-apple-metal-representative-products" ||
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
      simultaneousComposition: false,
      simultaneousReason:
        "combined source bytes exceed the 64 MiB aggregate product bound",
    }) ||
    !same(browserIfc?.fixture, normalizedFixture(
      browserIfc?.fixture,
      IFC_FIXTURE,
    )) ||
    !same(browserGlb?.fixture, normalizedFixture(
      browserGlb?.fixture,
      GLB_FIXTURE,
    )) ||
    !same(browserIfc?.product?.model, IFC_MODEL) ||
    !same(browserGlb?.product?.model, GLB_MODEL) ||
    !same(browserIfc?.product?.renderer, IFC_RENDERER) ||
    !same(browserGlb?.product?.renderer, GLB_RENDERER) ||
    browserIfc.browser !== "Google Chrome 151.0.7922.108" ||
    browserGlb.browser !== "Google Chrome 151.0.7922.108" ||
    browserIfc.rendererMode !== "physical" ||
    browserGlb.rendererMode !== "physical" ||
    staged?.layout !== "staged" ||
    installed?.layout !== "clean-installed-vsix" ||
    !same(vscodeParity(staged), vscodeParity(installed)) ||
    !same(staged.ifc.product.model, IFC_MODEL) ||
    !same(staged.glb.product.model, GLB_MODEL) ||
    !same(staged.ifc.product.renderer, IFC_RENDERER) ||
    !same(staged.glb.product.renderer, GLB_RENDERER) ||
    !same(Object.keys(evidence.assertions ?? {}), ASSERTION_KEYS) ||
    Object.values(evidence.assertions).some((value) => value !== true) ||
    !same(evidence.held, {
      crossPlatformPhysicalGpu: false,
      osLevelPeakGpuMemory: false,
      simultaneousRepresentativeIfcGlb: false,
      productionSupport: false,
    }) ||
    evidence.decision?.physicalGpuQualification !==
      "passed-representative-ifc-and-glb-apple-metal" ||
    evidence.decision.newVsixPublication !== false ||
    evidence.decision.productionClaims !== false ||
    !Array.isArray(evidence.limitations) ||
    evidence.limitations.length < 5 ||
    /(?:\/(?:Users|Volumes|private|tmp|home)\/|[A-Z]:\\|file:\/\/)/iu
      .test(JSON.stringify(evidence))
  ) {
    throw new Error(
      "representative model physical GPU evidence is invalid",
    );
  }
  for (const [gpu, platform] of [
    [browserIfc.gpu, browserIfc.platform],
    [browserGlb.gpu, browserGlb.platform],
    [staged.gpu, staged.platform],
    [installed.gpu, installed.platform],
  ]) {
    validatePhysicalGpuIdentity(gpu, { platform });
  }
  return Object.freeze({
    status: evidence.status,
    products: 2,
    surfaces: 6,
    ifcProducts: IFC_MODEL.products,
    glbTriangles: GLB_MODEL.triangles,
  });
}

export async function qualifyRepresentativeModelsPhysicalGpu() {
  const hardware = await hardwareProfile();
  const browserIfc = normalizedBrowser(
    await qualifyBimProductShell({
      fixture: "public",
      rendererMode: "physical",
    }),
    "ifc",
  );
  const browserGlb = normalizedBrowser(
    await qualifyBimProductShell({
      fixture: "gltf-product-scale",
      rendererMode: "physical",
    }),
    "glb",
  );
  const vscodeRuntime = await resolveVscodeQualificationRuntime();
  const staged = normalizedVscode(
    await qualifyVscodeCustomEditor({
      includeFederatedSurfaceFixture: true,
      includeProductScaleFixture: true,
      includePublicFixture: true,
      rendererMode: "physical",
      vscodeRuntime,
    }),
    "staged",
  );
  const installed = normalizedVscode(
    await qualifyVscodeVsixInstall({
      includeFederatedSurfaceFixture: true,
      includeProductScaleFixture: true,
      includePublicFixture: true,
      rendererMode: "physical",
      vscodeRuntime,
    }),
    "clean-installed-vsix",
  );
  if (!same(vscodeParity(staged), vscodeParity(installed))) {
    throw new Error(
      "representative staged and installed VS Code products diverged",
    );
  }
  const evidence = {
    schema: SCHEMA,
    status: "passed-darwin-arm64-apple-metal-representative-products",
    asOf: AS_OF,
    capturedAt: new Date().toISOString(),
    hardware,
    launchPolicy: {
      angle: "metal",
      softwareRasterizerDisabled: true,
      gpuBlocklistIgnored: true,
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
      simultaneousComposition: false,
      simultaneousReason:
        "combined source bytes exceed the 64 MiB aggregate product bound",
    },
    browser: {
      ifc: browserIfc,
      glb: browserGlb,
    },
    vscode: {
      staged,
      installed,
    },
    assertions: Object.fromEntries(
      ASSERTION_KEYS.map((name) => [name, true]),
    ),
    held: {
      crossPlatformPhysicalGpu: false,
      osLevelPeakGpuMemory: false,
      simultaneousRepresentativeIfcGlb: false,
      productionSupport: false,
    },
    decision: {
      physicalGpuQualification:
        "passed-representative-ifc-and-glb-apple-metal",
      newVsixPublication: false,
      productionClaims: false,
    },
    limitations: [
      "the physical GPU result is limited to local macOS arm64 Apple M2 and does not claim Linux or Windows hardware coverage",
      "the two pinned public samples were opened in separate product sessions because their combined source bytes exceed the 64 MiB aggregate product bound",
      "the public IFC2X3 sample remains a representative performance fixture and does not promote IFC2X3 profile admission",
      "the public GLB remains reference geometry without BIM semantic authority",
      "GPU receipts are bounded renderer accounting and do not claim OS-level peak GPU memory telemetry",
      "the cached samples are not tracked, redistributed or bundled in the VSIX or release",
      "the clean-installed VSIX is local qualification output only and was not uploaded or published",
      "Spatial integration and production support remain separate Gates"
    ],
  };
  validateRepresentativeModelsPhysicalGpuQualification(evidence);
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
      "usage: node scripts/qualify-representative-models-physical-gpu.mjs " +
        "[--out path]",
    );
  }
  return path.resolve(values[1]);
}

async function main() {
  const output = outputArgument(process.argv.slice(2));
  const evidence = await qualifyRepresentativeModelsPhysicalGpu();
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
