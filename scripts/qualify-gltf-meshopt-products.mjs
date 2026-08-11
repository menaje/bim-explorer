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
  acquirePublicMeshoptGltfFixture,
} from "./public-gltf-meshopt-fixture.mjs";
import {
  resolveVscodeQualificationRuntime,
} from "./vscode-qualification-runtime.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const GLTF_MESHOPT_PRODUCTS_EVIDENCE_PATH =
  "compatibility/evidence/" +
  "gltf-reference-source-ext-meshopt-products-" +
  "darwin-arm64-2026-08-11.json";
const OUTPUT = path.join(ROOT, GLTF_MESHOPT_PRODUCTS_EVIDENCE_PATH);
const VALIDATOR_VERSION = "2.0.0-dev.3.10";
const VALIDATOR_INTEGRITY =
  "sha512-odJ4k0tRkGXiDGn78yDBg+fBbAIvBnXxh3RwAta0emSxGtyag" +
  "FE8B4xELB1oYe3S5RD8Ci3uZAsZaascH2LAEQ==";
const MESHOPT_VERSION = "1.2.0";
const MESHOPT_INTEGRITY =
  "sha512-davRZeIJbxJrE24cwQle7ZDsxjdk/OphNOV83oX+" +
  "efQinyoHY9Jcyz3MHbaoG0qySZajldGztNZ1RN/T19PZsg==";
const FINGERPRINT =
  "sha256:fb499f1a3b6b68c16100e0b71624a39" +
  "bb9230854f5b3af5927fdab8e63d0e2f5";
const EXTENSIONS = Object.freeze(["EXT_meshopt_compression"]);
const MODES = Object.freeze(["ATTRIBUTES", "TRIANGLES"]);
const FILTERS = Object.freeze(["NONE"]);
const KNOWN_VALIDATOR_INFOS = Object.freeze([
  Object.freeze({
    code: "UNSUPPORTED_EXTENSION",
    pointer: "/extensionsUsed/0",
    severity: 2,
  }),
  Object.freeze({
    code: "UNUSED_OBJECT",
    pointer: "/buffers/0",
    severity: 2,
  }),
]);
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

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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

function physicalAppleMetal(value) {
  return (
    value?.schema === "bim-explorer-webgl2-gpu-identity/1" &&
    value.webgl2 === true &&
    value.debugRendererInfo === true &&
    /\bApple\b/u.test(value.unmaskedVendor ?? "") &&
    /ANGLE Metal Renderer: Apple/u.test(value.unmaskedRenderer ?? "") &&
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

function exactFixture(value) {
  return (
    value?.id === "khronos-box-derived-ext-meshopt" &&
    value.committed === false &&
    value.format === "glb" &&
    value.sourceBytes === 1_696 &&
    value.fingerprint === FINGERPRINT &&
    value.gltfVersion === "2.0" &&
    value.nativeId === "node:1/mesh:0/primitive:0" &&
    same(value.extensionsUsed, EXTENSIONS) &&
    same(value.extensionsRequired, EXTENSIONS) &&
    value.provenance?.repository ===
      "https://github.com/KhronosGroup/glTF-Sample-Assets" &&
    value.provenance?.commit ===
      "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf" &&
    value.provenance?.extension === "EXT_meshopt_compression" &&
    value.provenance?.codec === "meshoptimizer" &&
    value.provenance?.codecVersion === MESHOPT_VERSION &&
    value.provenance?.license === "CC-BY-4.0" &&
    value.provenance?.bundled === false &&
    value.provenance?.sampleRedistributed === false
  );
}

function exactSurface(value, hostKind) {
  return (
    value?.hostKind === hostKind &&
    physicalAppleMetal(value.gpu) &&
    same(value.model, MODEL) &&
    value.resources?.sourceBytes === 1_696 &&
    value.resources?.documentBytes === 1_696 &&
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

function exactCompression(value) {
  return (
    value?.extension === "EXT_meshopt_compression" &&
    value.bufferViews === 2 &&
    value.compressedBytes === 192 &&
    value.decodedBytes === 648 &&
    value.decoder?.id === "meshoptimizer" &&
    value.decoder?.version === MESHOPT_VERSION &&
    value.decoder?.runtime === "embedded-wasm-single-thread" &&
    value.fallbackBuffers === 1 &&
    value.fallbackMarkers === 1 &&
    same(value.filters, FILTERS) &&
    same(value.modes, MODES)
  );
}

function exactValidator(value) {
  return (
    value?.version === VALIDATOR_VERSION &&
    value.integrity === VALIDATOR_INTEGRITY &&
    value.counts?.errors === 0 &&
    value.counts?.warnings === 0 &&
    value.counts?.infos === 2 &&
    value.counts?.hints === 0 &&
    value.counts?.truncated === false &&
    same(value.knownInfos, KNOWN_VALIDATOR_INFOS)
  );
}

export function validateGltfMeshoptProductsQualification(value) {
  if (
    value?.schema !==
      "bim-explorer-gltf-meshopt-products-qualification/1" ||
    value.environment?.platform !== "darwin-arm64" ||
    value.environment?.rendererMode !== "physical" ||
    value.environment?.softwareFallback !== false ||
    !exactFixture(value.fixture) ||
    value.fixture?.manifest?.sourceArtifactTracked !== false ||
    value.fixture?.manifest?.derivedArtifactTracked !== false ||
    value.fixture?.manifest?.releaseBundled !== false ||
    !exactValidator(value.core?.validator) ||
    value.core?.source?.fingerprint !== FINGERPRINT ||
    !same(value.core?.source?.extensionsUsed, EXTENSIONS) ||
    !same(value.core?.source?.extensionsRequired, EXTENSIONS) ||
    !exactCompression(value.core?.source?.compression) ||
    value.core?.geometry?.rangeBytes !== 756 ||
    value.core?.geometry?.rangeSha256 !==
      "e4270028699c6f6302320a31008c316bfc1886ec9a1f431ae39d2ba966408766" ||
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
    value.decoder?.package !== "meshoptimizer" ||
    value.decoder?.version !== MESHOPT_VERSION ||
    value.decoder?.integrity !== MESHOPT_INTEGRITY ||
    value.decoder?.license !== "MIT" ||
    value.decoder?.runtime !== "embedded-wasm-single-thread" ||
    value.decoder?.bundledWorkerRuntime !== true ||
    value.immutableFederatedSurfaceV02?.byteLength !== 461_431 ||
    value.immutableFederatedSurfaceV02?.sha256 !==
      IMMUTABLE_V02_SHA256 ||
    value.immutableFederatedSurfaceV02?.meshoptBackported !== false ||
    !everyTrue(value.assertions) ||
    value.held?.otherMeshoptFilters !== false ||
    value.held?.dracoCompression !== false ||
    value.held?.otherRequiredExtensions !== false ||
    value.held?.externalImageDecode !== false ||
    value.held?.morphTargets !== false ||
    value.held?.federatedSurfaceV02 !== false ||
    value.held?.crossPlatformPhysicalGpu !== false ||
    value.held?.productionSupport !== false ||
    value.decision?.extMeshoptCompression !==
      "passed-experimental" ||
    value.decision?.filterNoneOnly !== true ||
    value.decision?.runtimeCodec !==
      "meshoptimizer-1.2.0-embedded-wasm" ||
    value.decision?.federatedSurfaceV02 !== "not-backported" ||
    value.decision?.productionClaims !== false
  ) {
    throw new Error("EXT_meshopt_compression product evidence is invalid");
  }
  const serialized = JSON.stringify(value);
  if (
    serialized.includes("/Users/") ||
    serialized.includes("/Volumes/") ||
    serialized.includes("file://")
  ) {
    throw new Error(
      "EXT_meshopt_compression product evidence contains a local path",
    );
  }
  return Object.freeze({
    status: "passed-darwin-arm64-apple-metal-ext-meshopt",
    surfaces: 3,
    sourceBytes: 1_696,
    extension: "EXT_meshopt_compression",
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
    bytes.set(await session.readRange(handle, offset, length), offset);
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
  const knownInfos = validation.issues.messages.map((message) => ({
    code: message.code,
    pointer: message.pointer,
    severity: message.severity,
  }));
  const counts = {
    errors: validation.issues.numErrors,
    warnings: validation.issues.numWarnings,
    infos: validation.issues.numInfos,
    hints: validation.issues.numHints,
    truncated: validation.issues.truncated,
  };
  if (!same(counts, {
    errors: 0,
    warnings: 0,
    infos: 2,
    hints: 0,
    truncated: false,
  }) || !same(knownInfos, KNOWN_VALIDATOR_INFOS)) {
    throw new Error("official Validator meshopt diagnostics changed");
  }
  const source = await createGltfReferenceSource(fixture.bytes, {
    limits: {
      maximumMeshoptDecodedBytes: 648,
      maximumMeshoptCompressionRatio: 4,
    },
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
      counts,
      knownInfos,
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
      compression: snapshot.referenceMetadata.compression,
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

export async function qualifyGltfMeshoptProducts({
  output = OUTPUT,
  write = false,
} = {}) {
  const lock = JSON.parse(
    await readFile(path.join(ROOT, "package-lock.json"), "utf8"),
  );
  const validatorPackage = lock.packages?.["node_modules/gltf-validator"];
  const decoderPackage = lock.packages?.["node_modules/meshoptimizer"];
  if (
    validatorPackage?.version !== VALIDATOR_VERSION ||
    validatorPackage.license !== "Apache-2.0" ||
    validatorPackage.integrity !== VALIDATOR_INTEGRITY ||
    validator.version() !== VALIDATOR_VERSION
  ) {
    throw new Error("official glTF Validator artifact is not exact");
  }
  if (
    decoderPackage?.version !== MESHOPT_VERSION ||
    decoderPackage.license !== "MIT" ||
    decoderPackage.integrity !== MESHOPT_INTEGRITY
  ) {
    throw new Error("meshoptimizer decoder artifact is not exact");
  }
  const fixture = await acquirePublicMeshoptGltfFixture();
  const core = await qualifyCore(fixture, validatorPackage);
  fixture.bytes.fill(0);
  const vscodeRuntime = await resolveVscodeQualificationRuntime();
  const browser = await qualifyBimProductShell({
    fixture: "gltf-meshopt-public",
    rendererMode: "physical",
  });
  const staged = await qualifyVscodeCustomEditor({
    includeMeshoptFixture: true,
    rendererMode: "physical",
    vscodeRuntime,
  });
  const installed = await qualifyVscodeVsixInstall({
    includePublicFixture: false,
    includeMeshoptFixture: true,
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
  const stagedRuntime = staged.meshoptReferenceObservation;
  const installedRuntime = installed.observation.meshoptReferenceRuntime;
  const evidence = {
    schema: "bim-explorer-gltf-meshopt-products-qualification/1",
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
    decoder: {
      package: "meshoptimizer",
      version: decoderPackage.version,
      integrity: decoderPackage.integrity,
      license: decoderPackage.license,
      sourceCommit: fixture.manifest.codec.sourceCommit,
      runtime: fixture.manifest.codec.runtime,
      bundledWorkerRuntime: true,
      lazyInitialization: true,
      singleThreaded: true,
    },
    core,
    surfaces: {
      browser: surface(browser.observation, browser.fixture, {
        externalOrigins: browser.observation.network.externalOrigins,
      }),
      stagedVscode: surface(
        stagedRuntime,
        staged.meshoptReferenceFixture,
      ),
      installedVsix: surface(
        installedRuntime,
        installedRuntime.fixture,
      ),
    },
    package: installed.package,
    immutableFederatedSurfaceV02: {
      byteLength: immutableRuntimeBytes,
      sha256: immutableRuntimeSha256,
      meshoptBackported: false,
    },
    assertions: {
      officialSpecPinned:
        fixture.manifest.extension.name ===
          "EXT_meshopt_compression" &&
        fixture.manifest.extension.status === "ratified" &&
        fixture.manifest.extension.specificationCommit ===
          "2b29723d025a995971726f2989697cdc49b1222a",
      decoderArtifactExact:
        decoderPackage.version === MESHOPT_VERSION &&
        decoderPackage.integrity === MESHOPT_INTEGRITY &&
        decoderPackage.license === "MIT",
      officialValidatorKnownInfosExact: exactValidator(core.validator),
      sourceAndDerivedDigestExact:
        fixture.receipt.sourceDigestVerified === true &&
        fixture.receipt.derivedDigestVerified === true,
      exactHeadlessDecode:
        core.source.fingerprint === FINGERPRINT &&
        exactCompression(core.source.compression) &&
        core.geometry.rangeBytes === 756 &&
        core.geometry.rangeSha256 ===
          fixture.manifest.expected.geometryRangeSha256 &&
        core.renderer.uploadedBytes === 800,
      exactThreeSurfaceProjection:
        [browser.observation, stagedRuntime, installedRuntime]
          .every((value) =>
            same(value.model, MODEL) &&
            value.resources.sourceBytes === 1_696 &&
            value.renderer.nonBackgroundPixels === 86_486 &&
            value.renderer.sourceReadBytes === 756 &&
            value.renderer.uploadedBytes === 800),
      physicalAppleMetal:
        [browser.observation.gpu, stagedRuntime.gpu, installedRuntime.gpu]
          .every(physicalAppleMetal),
      requiredExtensionIdentity:
        [
          browser.fixture,
          staged.meshoptReferenceFixture,
          installedRuntime.fixture,
        ].every((value) =>
          same(value.extensionsUsed, EXTENSIONS) &&
          same(value.extensionsRequired, EXTENSIONS)),
      localOnly:
        browser.observation.network.externalOrigins.length === 0 &&
        stagedRuntime.externalUpload === false &&
        stagedRuntime.telemetry === false &&
        installedRuntime.externalUpload === false &&
        installedRuntime.telemetry === false,
      deterministicCleanup:
        core.cleanup.activeBackendBytes === 0 &&
        [browser.observation, stagedRuntime, installedRuntime]
          .every((value) => viewerCoreDisposed(value.viewerCore)),
      cleanVsix:
        installed.assertions.installedPackageOpensMeshoptReference ===
          true &&
        installed.assertions.installedMeshoptReferenceIdentityExact ===
          true &&
        installed.assertions.installedMeshoptRequiredExtensionExact ===
          true,
      noBimAuthority:
        core.source.semanticAuthority === false &&
        core.source.writeAuthority === false &&
        core.source.roundTripAuthority === false &&
        [browser.observation, stagedRuntime, installedRuntime]
          .every((value) => value.reference?.globalId === null),
      sampleCacheOnly:
        fixture.manifest.tracking.sourceArtifactTracked === false &&
        fixture.manifest.tracking.derivedArtifactTracked === false &&
        fixture.manifest.tracking.releaseBundled === false,
      federatedV02Unchanged:
        immutableRuntimeBytes === 461_431 &&
        immutableRuntimeSha256 === IMMUTABLE_V02_SHA256,
    },
    held: {
      otherMeshoptFilters: false,
      dracoCompression: false,
      otherRequiredExtensions: false,
      externalImageDecode: false,
      morphTargets: false,
      federatedSurfaceV02: false,
      crossPlatformPhysicalGpu: false,
      productionSupport: false,
    },
    decision: {
      extMeshoptCompression: "passed-experimental",
      filterNoneOnly: true,
      runtimeCodec: "meshoptimizer-1.2.0-embedded-wasm",
      federatedSurfaceV02: "not-backported",
      productionClaims: false,
    },
  };
  validateGltfMeshoptProductsQualification(evidence);
  if (write) {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
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
      "usage: node scripts/qualify-gltf-meshopt-products.mjs [--write]",
    );
  }
  const evidence = await qualifyGltfMeshoptProducts({ write });
  process.stdout.write(`${JSON.stringify({
    schema: evidence.schema,
    capturedAt: evidence.capturedAt,
    fixture: evidence.fixture.id,
    surfaces: Object.keys(evidence.surfaces),
    assertions: evidence.assertions,
    decision: evidence.decision,
  }, null, 2)}\n`);
}
