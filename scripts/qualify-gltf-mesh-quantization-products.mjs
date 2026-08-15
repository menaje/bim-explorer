import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import validator from "gltf-validator";

import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createGltfReferenceSource,
} from "../packages/gltf-reference-source/src/index.mjs";
import {
  createBounded3dRenderer,
  createHeadless3dBackend,
} from "../packages/bim-renderer-3d/src/index.mjs";
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
  acquirePublicQuantizedGltfFixture,
} from "./public-gltf-quantized-fixture.mjs";
import {
  resolveVscodeQualificationRuntime,
} from "./vscode-qualification-runtime.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const GLTF_MESH_QUANTIZATION_PRODUCTS_EVIDENCE_PATH =
  "compatibility/evidence/" +
  "gltf-reference-source-khr-mesh-quantization-products-" +
  "darwin-arm64-2026-08-11.json";
const OUTPUT = path.join(
  ROOT,
  GLTF_MESH_QUANTIZATION_PRODUCTS_EVIDENCE_PATH,
);
const VALIDATOR_VERSION = "2.0.0-dev.3.10";
const VALIDATOR_INTEGRITY =
  "sha512-odJ4k0tRkGXiDGn78yDBg+fBbAIvBnXxh3RwAta0emSxGtyag" +
  "FE8B4xELB1oYe3S5RD8Ci3uZAsZaascH2LAEQ==";
const FINGERPRINT =
  "sha256:7a98046be5a8f6a07dd46035fd274190" +
  "315e08a2afbedb0b2f7037ed6df34357";
const EXTENSIONS = Object.freeze(["KHR_mesh_quantization"]);
const MODEL = Object.freeze({
  entities: 1,
  geometryRecords: 1,
  instances: 1,
  triangles: 12,
  ranges: 1,
});
const IMMUTABLE_V02_SHA256 =
  "22e243fa8426d0648f1f3ca70c5fa015" +
  "356f656084b1b95d3fdb21bcb8187847";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function everyTrue(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((item) => item === true)
  );
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function physicalAppleMetal(value) {
  return (
    value?.schema === "bim-explorer-webgl2-gpu-identity/1" &&
    value.webgl2 === true &&
    value.debugRendererInfo === true &&
    /\bApple\b/u.test(value.unmaskedVendor ?? "") &&
    /ANGLE Metal Renderer: Apple/u.test(
      value.unmaskedRenderer ?? "",
    ) &&
    !/(?:swiftshader|subzero|llvmpipe|lavapipe|software)/iu.test(
      JSON.stringify(value),
    )
  );
}

function viewerCoreDisposed(value) {
  return (
    value?.opened?.adopted === true &&
    value.opened.version === "0.1.2" &&
    value.opened.source?.rangeBytesRead === 756 &&
    value.disposed?.disposed === true &&
    value.disposed.host?.disposed === true &&
    value.disposed.source?.disposed === true &&
    value.disposed.source?.sessionDisposed === true &&
    value.disposed.presentation?.borrowedSessionDisposed === true &&
    value.disposed.presentation?.borrowedWorkerDisposed === true &&
    value.disposed.presentation?.disposalStatus === "disposed"
  );
}

function exactSurface(value, hostKind) {
  return (
    value?.hostKind === hostKind &&
    physicalAppleMetal(value.gpu) &&
    same(value.model, MODEL) &&
    value.resources?.sourceBytes === 1_632 &&
    value.resources?.documentBytes === 1_632 &&
    value.resources?.externalResourceBytes === 0 &&
    value.resources?.externalResources === 0 &&
    value.resources?.geometryBytes === 756 &&
    value.renderer?.actualGpu === true &&
    value.renderer?.nonBackgroundPixels === 86_486 &&
    value.renderer?.sourceReadBytes === 756 &&
    value.renderer?.uploadedBytes === 800 &&
    value.reference?.globalId === null &&
    value.reference?.selectedNativeId ===
      "node:1/mesh:0/primitive:0" &&
    value.lifecycle?.opened === "ready" &&
    value.lifecycle?.closed === "disposed" &&
    viewerCoreDisposed(value.viewerCore)
  );
}

function exactFixture(value) {
  return (
    value?.id ===
      "khronos-box-derived-khr-mesh-quantization" &&
    value.committed === false &&
    value.format === "glb" &&
    value.sourceBytes === 1_632 &&
    value.fingerprint === FINGERPRINT &&
    value.gltfVersion === "2.0" &&
    value.nativeId === "node:1/mesh:0/primitive:0" &&
    same(value.extensionsUsed, EXTENSIONS) &&
    same(value.extensionsRequired, EXTENSIONS) &&
    value.provenance?.repository ===
      "https://github.com/KhronosGroup/glTF-Sample-Assets" &&
    value.provenance?.commit ===
      "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf" &&
    value.provenance?.license === "CC-BY-4.0" &&
    value.provenance?.bundled === false
  );
}

export function validateGltfMeshQuantizationProductsQualification(
  value,
) {
  if (
    value?.schema !==
      "bim-explorer-gltf-mesh-quantization-products-qualification/1" ||
    value.environment?.platform !== "darwin-arm64" ||
    value.environment?.rendererMode !== "physical" ||
    value.environment?.softwareFallback !== false ||
    !exactFixture(value.fixture) ||
    value.fixture?.manifest?.sourceArtifactTracked !== false ||
    value.fixture?.manifest?.derivedArtifactTracked !== false ||
    value.fixture?.manifest?.releaseBundled !== false ||
    value.core?.validator?.version !== VALIDATOR_VERSION ||
    value.core?.validator?.integrity !== VALIDATOR_INTEGRITY ||
    !everyTrue(value.core?.validator?.issues) ||
    value.core?.source?.fingerprint !== FINGERPRINT ||
    !same(value.core?.source?.extensionsUsed, EXTENSIONS) ||
    !same(value.core?.source?.extensionsRequired, EXTENSIONS) ||
    value.core?.geometry?.rangeBytes !== 756 ||
    value.core?.geometry?.rangeSha256 !==
      "fad09eb7fae2d5754aa2aeb6db6a8383f4086c6a082e2ec5530e66aee47c2694" ||
    value.core?.renderer?.uploadedBytes !== 800 ||
    value.core?.cleanup?.activeBackendBytes !== 0 ||
    value.core?.cleanup?.rendererDisposed !== true ||
    value.core?.cleanup?.sessionDisposed !== true ||
    value.core?.cleanup?.sourceDisposed !== true ||
    !exactSurface(value.surfaces?.browser, "browser") ||
    !exactSurface(value.surfaces?.stagedVscode, "vscode-webview") ||
    !exactSurface(value.surfaces?.installedVsix, "vscode-webview") ||
    value.surfaces.browser.externalOrigins?.length !== 0 ||
    value.surfaces.stagedVscode.externalUpload !== false ||
    value.surfaces.stagedVscode.telemetry !== false ||
    value.surfaces.installedVsix.externalUpload !== false ||
    value.surfaces.installedVsix.telemetry !== false ||
    value.package?.id !== "menaje.bim-explorer" ||
    value.package?.version !== "0.1.0" ||
    !Number.isSafeInteger(value.package?.byteLength) ||
    value.package.byteLength <= 0 ||
    value.package?.installedRuntimeFiles !== 31 ||
    value.immutableFederatedSurfaceV02?.byteLength !== 461_431 ||
    value.immutableFederatedSurfaceV02?.sha256 !==
      IMMUTABLE_V02_SHA256 ||
    value.immutableFederatedSurfaceV02?.bundleSupportBackported !==
      false ||
    value.immutableFederatedSurfaceV02
      ?.meshQuantizationBackported !== false ||
    !everyTrue(value.assertions) ||
    value.held?.otherRequiredExtensions !== false ||
    value.held?.compressionExtensions !== false ||
    value.held?.externalImageDecode !== false ||
    value.held?.morphTargets !== false ||
    value.held?.federatedSurfaceV02 !== false ||
    value.held?.crossPlatformPhysicalGpu !== false ||
    value.held?.productionSupport !== false ||
    value.decision?.khrMeshQuantization !==
      "passed-experimental" ||
    value.decision?.genericRequiredExtensions !== false ||
    value.decision?.runtimeCodecAdded !== false ||
    value.decision?.federatedSurfaceV02 !== "not-backported" ||
    value.decision?.productionClaims !== false
  ) {
    throw new Error(
      "KHR_mesh_quantization product evidence is invalid",
    );
  }
  const serialized = JSON.stringify(value);
  if (
    serialized.includes("/Users/") ||
    serialized.includes("/Volumes/") ||
    serialized.includes("file://")
  ) {
    throw new Error(
      "KHR_mesh_quantization product evidence contains a local path",
    );
  }
  return Object.freeze({
    status: "passed-darwin-arm64-apple-metal-khr-mesh-quantization",
    surfaces: 3,
    sourceBytes: 1_632,
    extension: "KHR_mesh_quantization",
  });
}

async function readGeometry(session, snapshot) {
  const handle = snapshot.layers[0].rangeHandles[0];
  const bytes = new Uint8Array(handle.byteLength);
  let offset = 0;
  while (offset < bytes.byteLength) {
    const length = Math.min(
      handle.maximumRequestBytes,
      bytes.byteLength - offset,
    );
    bytes.set(
      await session.readRange(handle, offset, length),
      offset,
    );
    offset += length;
  }
  return bytes;
}

async function qualifyCore(fixture, validatorPackage) {
  const validation = await validator.validateBytes(fixture.bytes, {
    format: "glb",
    maxIssues: 100,
    uri: fixture.manifest.entry.name,
    writeTimestamp: false,
  });
  if (
    validation.issues.numErrors !== 0 ||
    validation.issues.numWarnings !== 0 ||
    validation.issues.numInfos !== 0 ||
    validation.issues.numHints !== 0 ||
    validation.issues.truncated !== false
  ) {
    throw new Error("official Validator rejected quantized Box");
  }
  const source = await createGltfReferenceSource(fixture.bytes, {
    maximumRequestBytes: 256,
    sessionReadBudgetBytes: 1_512,
  });
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const backend = createHeadless3dBackend();
  const renderer = createBounded3dRenderer({ backend });
  const mounted = await renderer.mount({ session, snapshot });
  const geometry = await readGeometry(session, snapshot);
  const rendererDisposed = await renderer.dispose();
  const sessionDisposed = await session.dispose();
  const sourceDisposed = await source.dispose();
  const result = {
    validator: {
      package: "gltf-validator",
      version: validatorPackage.version,
      license: validatorPackage.license,
      integrity: validatorPackage.integrity,
      issues: {
        errorsZero: validation.issues.numErrors === 0,
        warningsZero: validation.issues.numWarnings === 0,
        infosZero: validation.issues.numInfos === 0,
        hintsZero: validation.issues.numHints === 0,
        notTruncated: validation.issues.truncated === false,
      },
      projection: {
        gltfVersion: validation.info.version,
        extensionsUsed: validation.info.extensionsUsed,
        extensionsRequired: validation.info.extensionsRequired,
        vertices: validation.info.totalVertexCount,
        triangles: validation.info.totalTriangleCount,
      },
    },
    source: {
      fingerprint: snapshot.source.fingerprint,
      format: snapshot.source.format,
      gltfVersion: snapshot.source.gltfVersion,
      extensionsUsed: snapshot.referenceMetadata.extensionsUsed,
      extensionsRequired:
        snapshot.referenceMetadata.extensionsRequired,
      sourceRole: snapshot.source.sourceRole,
      semanticAuthority: snapshot.source.semanticAuthority,
      writeAuthority: snapshot.source.writeAuthority,
      roundTripAuthority: snapshot.source.roundTripAuthority,
    },
    geometry: {
      ...snapshot.geometry,
      rangeBytes: geometry.byteLength,
      rangeSha256: sha256(geometry),
    },
    renderer: {
      backend: mounted.backend.backendId,
      geometryRecords: mounted.metrics.geometryRecords,
      instances: mounted.metrics.instances,
      triangles: mounted.metrics.instancedTriangles,
      sourceReadBytes: mounted.metrics.sourceReadBytes,
      uploadedBytes: mounted.backend.uploadedBytes,
    },
    cleanup: {
      rendererDisposed,
      sessionDisposed,
      sourceDisposed,
      activeBackendBytes: backend.state.activeBytes,
      residentRanges: backend.state.residentRanges,
    },
  };
  geometry.fill(0);
  return result;
}

function surface(value, fixture, { externalOrigins = null } = {}) {
  return {
    hostKind: value.hostKind,
    gpu: value.gpu,
    model: value.model,
    resources: value.resources,
    renderer: value.renderer,
    reference: value.reference,
    lifecycle: value.lifecycle,
    viewerCore: value.viewerCore,
    externalUpload: value.externalUpload ?? false,
    telemetry: value.telemetry ?? false,
    ...(externalOrigins === null ? {} : { externalOrigins }),
    fixture,
  };
}

export async function qualifyGltfMeshQuantizationProducts({
  output = OUTPUT,
  write = false,
} = {}) {
  const lock = JSON.parse(
    await readFile(path.join(ROOT, "package-lock.json"), "utf8"),
  );
  const validatorPackage =
    lock.packages?.["node_modules/gltf-validator"];
  if (
    validatorPackage?.version !== VALIDATOR_VERSION ||
    validatorPackage.license !== "Apache-2.0" ||
    validatorPackage.integrity !== VALIDATOR_INTEGRITY ||
    validator.version() !== VALIDATOR_VERSION
  ) {
    throw new Error("official glTF Validator artifact is not exact");
  }
  const fixture = await acquirePublicQuantizedGltfFixture();
  const core = await qualifyCore(fixture, validatorPackage);
  fixture.bytes.fill(0);
  const vscodeRuntime = await resolveVscodeQualificationRuntime();
  const browser = await qualifyBimProductShell({
    fixture: "gltf-quantized-public",
    rendererMode: "physical",
  });
  const staged = await qualifyVscodeCustomEditor({
    includeQuantizedFixture: true,
    rendererMode: "physical",
    vscodeRuntime,
  });
  const installed = await qualifyVscodeVsixInstall({
    includePublicFixture: false,
    includeQuantizedFixture: true,
    rendererMode: "physical",
    vscodeRuntime,
  });
  const immutableRuntime = new Uint8Array(await readFile(path.join(
    ROOT,
    "packages/federated-bim-surface/runtime/index.mjs",
  )));
  const immutableRuntimeSha256 = sha256(immutableRuntime);
  const immutableRuntimeBytes = immutableRuntime.byteLength;
  immutableRuntime.fill(0);
  const evidence = {
    schema:
      "bim-explorer-gltf-mesh-quantization-products-qualification/1",
    capturedAt: new Date().toISOString(),
    environment: {
      platform: `${process.platform}-${process.arch}`,
      node: process.version,
      browser: browser.environment.browser,
      vscode: staged.environment.vscode,
      rendererMode: "physical",
      softwareFallback: false,
    },
    fixture: {
      ...browser.fixture,
      manifest: {
        sourceSha256: fixture.manifest.provenance.sourceSha256,
        derivedSha256: fixture.manifest.entry.sha256,
        specificationCommit:
          fixture.manifest.extension.specificationCommit,
        sourceArtifactTracked: false,
        derivedArtifactTracked: false,
        releaseBundled: false,
        sampleRedistributed: false,
      },
    },
    core,
    surfaces: {
      browser: surface(
        browser.observation,
        browser.fixture,
        {
          externalOrigins:
            browser.observation.network.externalOrigins,
        },
      ),
      stagedVscode: surface(
        staged.quantizedReferenceObservation,
        staged.quantizedReferenceFixture,
      ),
      installedVsix: surface(
        installed.observation.quantizedReferenceRuntime,
        installed.observation.quantizedReferenceRuntime.fixture,
      ),
    },
    package: installed.package,
    immutableFederatedSurfaceV02: {
      byteLength: immutableRuntimeBytes,
      sha256: immutableRuntimeSha256,
      bundleSupportBackported: false,
      meshQuantizationBackported: false,
    },
    assertions: {
      officialSpecPinned:
        fixture.manifest.extension.name ===
          "KHR_mesh_quantization" &&
        fixture.manifest.extension.status === "ratified" &&
        fixture.manifest.extension.specificationCommit ===
          "2b29723d025a995971726f2989697cdc49b1222a",
      officialValidatorZeroIssues:
        everyTrue(core.validator.issues),
      sourceAndDerivedDigestExact:
        fixture.receipt.sourceDigestVerified === true &&
        fixture.receipt.derivedDigestVerified === true,
      exactHeadlessProjection:
        core.source.fingerprint === FINGERPRINT &&
        core.geometry.rangeBytes === 756 &&
        core.geometry.rangeSha256 ===
          fixture.manifest.expected.geometryRangeSha256 &&
        core.renderer.uploadedBytes === 800,
      exactThreeSurfaceProjection:
        [
          browser.observation,
          staged.quantizedReferenceObservation,
          installed.observation.quantizedReferenceRuntime,
        ].every((value) =>
          same(value.model, MODEL) &&
          value.resources.sourceBytes === 1_632 &&
          value.renderer.nonBackgroundPixels === 86_486 &&
          value.renderer.sourceReadBytes === 756 &&
          value.renderer.uploadedBytes === 800),
      physicalAppleMetal:
        [
          browser.observation.gpu,
          staged.quantizedReferenceObservation.gpu,
          installed.observation.quantizedReferenceRuntime.gpu,
        ].every(physicalAppleMetal),
      requiredExtensionIdentity:
        [
          browser.fixture,
          staged.quantizedReferenceFixture,
          installed.observation.quantizedReferenceRuntime.fixture,
        ].every((value) =>
          same(value.extensionsUsed, EXTENSIONS) &&
          same(value.extensionsRequired, EXTENSIONS)),
      localOnly:
        browser.observation.network.externalOrigins.length === 0 &&
        staged.quantizedReferenceObservation.externalUpload === false &&
        staged.quantizedReferenceObservation.telemetry === false &&
        installed.observation.quantizedReferenceRuntime.externalUpload ===
          false &&
        installed.observation.quantizedReferenceRuntime.telemetry === false,
      deterministicCleanup:
        core.cleanup.activeBackendBytes === 0 &&
        [
          browser.observation,
          staged.quantizedReferenceObservation,
          installed.observation.quantizedReferenceRuntime,
        ].every((value) => viewerCoreDisposed(value.viewerCore)),
      cleanVsix:
        installed.assertions.installedPackageOpensQuantizedReference ===
          true &&
        installed.assertions.installedQuantizedReferenceIdentityExact ===
          true &&
        installed.assertions.installedQuantizedRequiredExtensionExact ===
          true,
      noBimAuthority:
        core.source.semanticAuthority === false &&
        core.source.writeAuthority === false &&
        core.source.roundTripAuthority === false &&
        [
          browser.observation,
          staged.quantizedReferenceObservation,
          installed.observation.quantizedReferenceRuntime,
        ].every((value) => value.reference?.globalId === null),
      sampleCacheOnly:
        fixture.manifest.tracking.sourceArtifactTracked === false &&
        fixture.manifest.tracking.derivedArtifactTracked === false &&
        fixture.manifest.tracking.releaseBundled === false,
      federatedV02Unchanged:
        immutableRuntimeBytes === 461_431 &&
        immutableRuntimeSha256 === IMMUTABLE_V02_SHA256,
    },
    held: {
      otherRequiredExtensions: false,
      compressionExtensions: false,
      externalImageDecode: false,
      morphTargets: false,
      federatedSurfaceV02: false,
      crossPlatformPhysicalGpu: false,
      productionSupport: false,
    },
    decision: {
      khrMeshQuantization: "passed-experimental",
      genericRequiredExtensions: false,
      runtimeCodecAdded: false,
      federatedSurfaceV02: "not-backported",
      productionClaims: false,
    },
  };
  validateGltfMeshQuantizationProductsQualification(evidence);
  if (write) {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(
      output,
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    );
  }
  return Object.freeze(evidence);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const write = process.argv.slice(2).includes("--write");
  const unknown = process.argv.slice(2).filter((value) =>
    value !== "--write");
  if (unknown.length > 0) {
    throw new TypeError(
      "usage: node " +
        "scripts/qualify-gltf-mesh-quantization-products.mjs " +
        "[--write]",
    );
  }
  const evidence = await qualifyGltfMeshQuantizationProducts({ write });
  process.stdout.write(`${JSON.stringify({
    schema: evidence.schema,
    capturedAt: evidence.capturedAt,
    fixture: evidence.fixture.id,
    surfaces: Object.keys(evidence.surfaces),
    assertions: evidence.assertions,
    decision: evidence.decision,
  }, null, 2)}\n`);
}
