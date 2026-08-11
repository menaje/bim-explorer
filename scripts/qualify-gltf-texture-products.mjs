import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  decodeBimTexturedGeometryRange,
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
  acquirePublicGltfTextureBundle,
  loadPublicGltfTextureBundleManifest,
  PUBLIC_GLTF_TEXTURE_BUNDLE_MANIFEST,
} from "./public-gltf-resource-bundle-fixture.mjs";
import {
  resolveVscodeQualificationRuntime,
} from "./vscode-qualification-runtime.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const GLTF_TEXTURE_PRODUCTS_EVIDENCE_PATH =
  "compatibility/evidence/" +
  "gltf-reference-source-base-color-texture-products-" +
  "darwin-arm64-2026-08-11.json";
const OUTPUT = path.join(ROOT, GLTF_TEXTURE_PRODUCTS_EVIDENCE_PATH);
const VALIDATOR_VERSION = "2.0.0-dev.3.10";
const VALIDATOR_INTEGRITY =
  "sha512-odJ4k0tRkGXiDGn78yDBg+fBbAIvBnXxh3RwAta0emSxGtyag" +
  "FE8B4xELB1oYe3S5RD8Ci3uZAsZaascH2LAEQ==";
const FINGERPRINT =
  "sha256:dac1296f1fdbc45722b08a9cdf441b126822e839fd3061315d75750b960f37e8";
const RANGE_SHA256 =
  "ce04af8c146d03daf9e08e5b26f54e2f44fbe5a5203df50f0d642e459509a3cd";
const IMMUTABLE_V02_SHA256 =
  "22e243fa8426d0648f1f3ca70c5fa015356f656084b1b95d3fdb21bcb8187847";
const DECODED_TEXTURE_BYTES = 262_144;
const GPU_TEXTURE_BYTES = 349_524;
const GPU_UPLOAD_BYTES = 350_516;
const MODEL = Object.freeze({
  entities: 1,
  geometryRecords: 1,
  instances: 1,
  triangles: 12,
  ranges: 1,
});

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
    value.opened.source?.rangeBytesRead === 4_756 &&
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
    value.resources?.sourceBytes === 8_285 &&
    value.resources?.documentBytes === 3_695 &&
    value.resources?.externalResourceBytes === 4_590 &&
    value.resources?.externalResources === 2 &&
    value.resources?.externalBufferResources === 1 &&
    value.resources?.externalImageResources === 1 &&
    value.resources?.geometryBytes === 4_756 &&
    value.resources?.textureSourceBytes === 3_750 &&
    value.resources?.textureDecodedBytes === DECODED_TEXTURE_BYTES &&
    value.resources?.textures === 1 &&
    value.renderer?.actualGpu === true &&
    value.renderer?.nonBackgroundPixels > 0 &&
    value.renderer?.sourceReadBytes === 4_756 &&
    value.renderer?.uploadedBytes === GPU_UPLOAD_BYTES &&
    value.renderer?.textureSourceBytes === 3_750 &&
    value.renderer?.textureDecodedBytes === DECODED_TEXTURE_BYTES &&
    value.renderer?.textureGpuBytes === GPU_TEXTURE_BYTES &&
    value.renderer?.textures === 1 &&
    value.renderer?.gpuTextures === 1 &&
    value.reference?.globalId === null &&
    value.reference?.selectedNativeId ===
      "node:1/mesh:0/primitive:0" &&
    value.lifecycle?.opened === "ready" &&
    value.lifecycle?.closed === "disposed" &&
    viewerCoreDisposed(value.viewerCore)
  );
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

export function validateGltfTextureProductsQualification(value) {
  if (
    value?.schema !==
      "bim-explorer-gltf-texture-products-qualification/1" ||
    value.environment?.platform !== "darwin-arm64" ||
    value.environment?.rendererMode !== "physical" ||
    value.environment?.softwareFallback !== false ||
    value.fixture?.id !==
      "khronos-gltf-sample-assets-box-textured-external-png" ||
    value.fixture?.fingerprint !== FINGERPRINT ||
    value.fixture?.committed !== false ||
    value.fixture?.releaseBundled !== false ||
    value.fixture?.sampleRedistributed !== false ||
    value.core?.validator?.version !== VALIDATOR_VERSION ||
    value.core?.validator?.integrity !== VALIDATOR_INTEGRITY ||
    value.core?.validator?.issues?.errors !== 0 ||
    value.core?.validator?.issues?.warnings !== 0 ||
    value.core?.validator?.issues?.infos !== 0 ||
    value.core?.validator?.issues?.hints !== 0 ||
    value.core?.source?.fingerprint !== FINGERPRINT ||
    value.core?.source?.appearance?.textures !== 1 ||
    value.core?.geometry?.mediaType !==
      "application/vnd.bim-explorer.geometry-range.v2" ||
    value.core?.geometry?.rangeBytes !== 4_756 ||
    value.core?.geometry?.rangeSha256 !== RANGE_SHA256 ||
    value.core?.geometry?.textureDecodedBytes !== DECODED_TEXTURE_BYTES ||
    value.core?.geometry?.textureGpuBytes !== GPU_TEXTURE_BYTES ||
    value.core?.renderer?.textureGpuBytes !== GPU_TEXTURE_BYTES ||
    value.core?.renderer?.textureBytes !== GPU_TEXTURE_BYTES ||
    value.core?.renderer?.uploadedBytes !== GPU_UPLOAD_BYTES ||
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
    value.immutableFederatedSurfaceV02?.byteLength !== 461_431 ||
    value.immutableFederatedSurfaceV02?.sha256 !==
      IMMUTABLE_V02_SHA256 ||
    value.immutableFederatedSurfaceV02?.textureBackported !== false ||
    !everyTrue(value.assertions) ||
    Object.values(value.held ?? {}).some((item) => item !== false) ||
    value.decision?.boundedExternalPngBaseColorTexture !==
      "passed-experimental" ||
    value.decision?.federatedSurfaceV02 !== "not-backported" ||
    value.decision?.productionClaims !== false
  ) {
    throw new Error("glTF texture product evidence is invalid");
  }
  const serialized = JSON.stringify(value);
  if (
    serialized.includes("/Users/") ||
    serialized.includes("/Volumes/") ||
    serialized.includes("file://")
  ) {
    throw new Error("glTF texture evidence contains a local path");
  }
  return Object.freeze({
    status: "passed-darwin-arm64-apple-metal-texture",
    surfaces: 3,
    sourceBytes: 8_285,
    decodedTextureBytes: DECODED_TEXTURE_BYTES,
    gpuTextureBytes: GPU_TEXTURE_BYTES,
    gpuUploadBytes: GPU_UPLOAD_BYTES,
  });
}

async function qualifyCore(acquired, manifest) {
  const resources = acquired.resources.map((resource) => ({
    uri: resource.uri,
    bytes: resource.bytes,
  }));
  const resourceByUri = new Map(
    resources.map((resource) => [resource.uri, resource.bytes]),
  );
  const validation = await validator.validateBytes(
    acquired.document.bytes,
    {
      externalResourceFunction: async (uri) => {
        const bytes = resourceByUri.get(uri);
        if (bytes === undefined) {
          throw new Error("Validator requested an undeclared resource");
        }
        return Uint8Array.from(bytes);
      },
      format: "gltf",
      maxIssues: 100,
      uri: manifest.document.name,
      writeTimestamp: false,
    },
  );
  const backend = createHeadless3dBackend();
  const source = await createGltfReferenceSource(
    acquired.document.bytes,
    {
      resources,
      sessionReadBudgetBytes: 16 * 1024 * 1024,
    },
  );
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const handle = snapshot.layers[0].rangeHandles[0];
  const range = await session.readRange(
    handle,
    0,
    handle.byteLength,
  );
  const decoded = decodeBimTexturedGeometryRange(range);
  const renderer = createBounded3dRenderer({ backend });
  const mounted = await renderer.mount({ session, snapshot });
  const rangeSha256 = sha256(range);
  const rendererDisposed = await renderer.dispose();
  const sessionDisposed = await session.dispose();
  const sourceDisposed = await source.dispose();
  range.fill(0);
  return {
    validator: {
      package: "gltf-validator",
      version: validator.version(),
      integrity: VALIDATOR_INTEGRITY,
      externalResourcesValidated: validation.info.resources.length,
      issues: {
        errors: validation.issues.numErrors,
        warnings: validation.issues.numWarnings,
        infos: validation.issues.numInfos,
        hints: validation.issues.numHints,
        truncated: validation.issues.truncated,
      },
      projection: {
        vertices: validation.info.totalVertexCount,
        triangles: validation.info.totalTriangleCount,
        textures: validation.info.hasTextures,
        maximumUvSets: validation.info.maxUVs,
      },
    },
    source: {
      fingerprint: snapshot.source.fingerprint,
      resourceBundle: snapshot.referenceMetadata.resourceBundle,
      appearance: snapshot.referenceMetadata.appearance,
      semanticAuthority: snapshot.source.semanticAuthority,
      writeAuthority: snapshot.source.writeAuthority,
      roundTripAuthority: snapshot.source.roundTripAuthority,
    },
    geometry: {
      mediaType: handle.mediaType,
      rangeBytes: handle.byteLength,
      rangeSha256,
      geometryPayloadBytes: decoded.geometryPayloadBytes,
      textureSourceBytes: decoded.textureSourceBytes,
      textureDecodedBytes: decoded.textureDecodedBytes,
      textureGpuBytes: decoded.textureGpuBytes,
      textures: decoded.textureCount,
      vertices: decoded.vertices,
      triangles: decoded.triangles,
    },
    renderer: {
      ...mounted.metrics,
      uploadedBytes: mounted.backend.uploadedBytes,
      textureBytes: mounted.backend.textureBytes,
    },
    cleanup: {
      rendererDisposed,
      sessionDisposed,
      sourceDisposed,
      activeBackendBytes: backend.state.activeBytes,
    },
  };
}

export async function qualifyGltfTextureProducts({
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
  const manifest = await loadPublicGltfTextureBundleManifest();
  const acquired = await acquirePublicGltfTextureBundle();
  let core;
  try {
    core = await qualifyCore(acquired, manifest);
  } finally {
    acquired.document.bytes.fill(0);
    for (const resource of acquired.resources) {
      resource.bytes.fill(0);
    }
  }
  const vscodeRuntime = await resolveVscodeQualificationRuntime();
  const browser = await qualifyBimProductShell({
    fixture: "gltf-texture-public",
    rendererMode: "physical",
  });
  const staged = await qualifyVscodeCustomEditor({
    externalResourceManifestPath: PUBLIC_GLTF_TEXTURE_BUNDLE_MANIFEST,
    includeExternalResourceFixture: true,
    rendererMode: "physical",
    vscodeRuntime,
  });
  const installed = await qualifyVscodeVsixInstall({
    externalResourceManifestPath: PUBLIC_GLTF_TEXTURE_BUNDLE_MANIFEST,
    includeExternalResourceFixture: true,
    includePublicFixture: false,
    rendererMode: "physical",
    vscodeRuntime,
  });
  const immutableBytes = new Uint8Array(await readFile(path.join(
    ROOT,
    "packages/federated-bim-surface/runtime/index.mjs",
  )));
  const fixture = {
    ...browser.fixture,
    fingerprint: FINGERPRINT,
    releaseBundled: false,
    sampleRedistributed: false,
    manifest: {
      documentSha256: manifest.document.sha256,
      resourceSha256: manifest.resources.map((item) => item.sha256),
      license: manifest.license.spdx,
      artifactsTracked: false,
      releaseBundled: false,
    },
  };
  const evidence = {
    schema: "bim-explorer-gltf-texture-products-qualification/1",
    capturedAt: new Date().toISOString(),
    environment: {
      platform: `${process.platform}-${process.arch}`,
      node: process.version,
      browser: browser.environment.browser,
      vscode: staged.environment.vscode,
      rendererMode: "physical",
      softwareFallback: false,
    },
    fixture,
    core,
    surfaces: {
      browser: surface(browser.observation, browser.fixture, {
        externalOrigins: browser.observation.network.externalOrigins,
      }),
      stagedVscode: surface(
        staged.externalReferenceObservation,
        staged.externalReferenceFixture,
      ),
      installedVsix: surface(
        installed.observation.externalReferenceRuntime,
        installed.observation.externalReferenceRuntime.fixture,
      ),
    },
    package: installed.package,
    immutableFederatedSurfaceV02: {
      byteLength: immutableBytes.byteLength,
      sha256: sha256(immutableBytes),
      textureBackported: false,
    },
    assertions: {
      officialValidatorZeroIssues:
        core.validator.issues.errors === 0 &&
        core.validator.issues.warnings === 0 &&
        core.validator.issues.infos === 0 &&
        core.validator.issues.hints === 0,
      exactPublicInputs:
        manifest.document.sha256 ===
          "1e9003a4a2a8822ff60da529357bd8e4dec4a59b1a479017993e7e2ad5fcebef" &&
        manifest.resources[1].sha256 ===
          "9c22b05c5b136d03c5621a8765e50a8322be6c35b9de53e9fe22685840d7f469",
      exactCoreProjection:
        core.source.fingerprint === FINGERPRINT &&
        core.geometry.rangeSha256 === RANGE_SHA256 &&
        core.renderer.uploadedBytes === GPU_UPLOAD_BYTES &&
        core.renderer.textureGpuBytes === GPU_TEXTURE_BYTES,
      actualTextureProjection:
        core.source.appearance.textures === 1 &&
        core.geometry.textureDecodedBytes === DECODED_TEXTURE_BYTES &&
        core.geometry.textureGpuBytes === GPU_TEXTURE_BYTES,
      exactThreeSurfaceProjection: [
        browser.observation,
        staged.externalReferenceObservation,
        installed.observation.externalReferenceRuntime,
      ].every((value) => exactSurface(value, value.hostKind)),
      physicalAppleMetal: [
        browser.observation.gpu,
        staged.externalReferenceObservation.gpu,
        installed.observation.externalReferenceRuntime.gpu,
      ].every(physicalAppleMetal),
      localOnly:
        browser.observation.network.externalOrigins.length === 0 &&
        staged.externalReferenceObservation.externalUpload === false &&
        installed.observation.externalReferenceRuntime.externalUpload ===
          false,
      deterministicCleanup:
        core.cleanup.activeBackendBytes === 0 &&
        [
          browser.observation,
          staged.externalReferenceObservation,
          installed.observation.externalReferenceRuntime,
        ].every((value) => viewerCoreDisposed(value.viewerCore)),
      cleanVsix:
        installed.assertions.installedPackageOpensExternalReference ===
          true &&
        installed.assertions.installedExternalReferenceBundleExact ===
          true &&
        installed.assertions.installedExternalReferenceUsesNoNetwork ===
          true,
      noBimAuthority:
        core.source.semanticAuthority === false &&
        core.source.writeAuthority === false &&
        core.source.roundTripAuthority === false &&
        [
          browser.observation,
          staged.externalReferenceObservation,
          installed.observation.externalReferenceRuntime,
        ].every((value) => value.reference.globalId === null),
      sampleCacheOnly:
        manifest.tracking.artifactsTracked === false &&
        manifest.tracking.releaseBundled === false &&
        manifest.tracking.networkAtRuntime === false,
      immutableFederatedV02Unchanged:
        immutableBytes.byteLength === 461_431 &&
        sha256(immutableBytes) === IMMUTABLE_V02_SHA256,
    },
    held: {
      jpegImages: false,
      alphaModes: false,
      embeddedImageProjection: false,
      otherMaterialTextures: false,
      textureTransform: false,
      federatedSurfaceV02: false,
      crossPlatformPhysicalGpu: false,
      productionSupport: false,
    },
    decision: {
      boundedExternalPngBaseColorTexture: "passed-experimental",
      federatedSurfaceV02: "not-backported",
      productionClaims: false,
    },
  };
  immutableBytes.fill(0);
  validateGltfTextureProductsQualification(evidence);
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
      "usage: node scripts/qualify-gltf-texture-products.mjs [--write]",
    );
  }
  const evidence = await qualifyGltfTextureProducts({ write });
  process.stdout.write(`${JSON.stringify({
    schema: evidence.schema,
    capturedAt: evidence.capturedAt,
    fixture: evidence.fixture.id,
    surfaces: Object.keys(evidence.surfaces),
    assertions: evidence.assertions,
    decision: evidence.decision,
  }, null, 2)}\n`);
}
