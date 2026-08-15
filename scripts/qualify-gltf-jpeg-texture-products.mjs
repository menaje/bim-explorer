import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  acquirePublicGltfJpegTextureBundle,
  loadPublicGltfJpegTextureBundleManifest,
  PUBLIC_GLTF_JPEG_TEXTURE_BUNDLE_MANIFEST,
} from "./public-gltf-resource-bundle-fixture.mjs";
import {
  qualifyBimProductShell,
} from "./qualify-bim-product-shell.mjs";
import {
  qualifyGltfTextureCore,
} from "./qualify-gltf-texture-products.mjs";
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
export const GLTF_JPEG_TEXTURE_PRODUCTS_EVIDENCE_PATH =
  "compatibility/evidence/" +
  "gltf-reference-source-jpeg-base-color-texture-products-" +
  "darwin-arm64-2026-08-11.json";
const OUTPUT = path.join(
  ROOT,
  GLTF_JPEG_TEXTURE_PRODUCTS_EVIDENCE_PATH,
);
const FINGERPRINT =
  "sha256:d5c12ec788905483237e59b380c4c974888930390fce44d150958c861a770340";
const RANGE_SHA256 =
  "19193a36e4f5773d6d8dc6fa0729669ec25b983877b163f1f7b65ee89cec8dc5";
const IMMUTABLE_V02_SHA256 =
  "22e243fa8426d0648f1f3ca70c5fa015356f656084b1b95d3fdb21bcb8187847";
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
    value.opened.source?.rangeBytesRead === 1_756 &&
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
    value.resources?.sourceBytes === 4_274 &&
    value.resources?.documentBytes === 2_685 &&
    value.resources?.externalResourceBytes === 1_589 &&
    value.resources?.externalResources === 2 &&
    value.resources?.externalBufferResources === 1 &&
    value.resources?.externalImageResources === 1 &&
    value.resources?.geometryBytes === 1_756 &&
    value.resources?.textureSourceBytes === 749 &&
    value.resources?.textureDecodedBytes === 16_384 &&
    value.resources?.textures === 1 &&
    value.renderer?.actualGpu === true &&
    value.renderer?.nonBackgroundPixels > 0 &&
    value.renderer?.sourceReadBytes === 1_756 &&
    value.renderer?.uploadedBytes === 22_836 &&
    value.renderer?.textureSourceBytes === 749 &&
    value.renderer?.textureDecodedBytes === 16_384 &&
    value.renderer?.textureGpuBytes === 21_844 &&
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

function surface(value, fixture, externalOrigins = null) {
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

export function validateGltfJpegTextureProductsQualification(value) {
  if (
    value?.schema !==
      "bim-explorer-gltf-jpeg-texture-products-qualification/1" ||
    value.environment?.platform !== "darwin-arm64" ||
    value.environment?.rendererMode !== "physical" ||
    value.environment?.softwareFallback !== false ||
    value.fixture?.id !==
      "khronos-gltf-sample-assets-box-textured-derived-external-jpeg" ||
    value.fixture?.fingerprint !== FINGERPRINT ||
    value.fixture?.committed !== false ||
    value.fixture?.releaseBundled !== false ||
    value.fixture?.sampleRedistributed !== false ||
    value.core?.validator?.issues?.errors !== 0 ||
    value.core?.validator?.issues?.warnings !== 0 ||
    value.core?.validator?.issues?.infos !== 0 ||
    value.core?.validator?.issues?.hints !== 0 ||
    value.core?.source?.fingerprint !== FINGERPRINT ||
    value.core?.source?.appearance?.profile !==
      "base-color-texture-opaque-v0.2" ||
    !same(
      value.core?.source?.appearance?.imageMediaTypes,
      ["image/jpeg"],
    ) ||
    value.core?.geometry?.mediaType !==
      "application/vnd.bim-explorer.geometry-range.v3" ||
    value.core?.geometry?.rangeBytes !== 1_756 ||
    value.core?.geometry?.rangeSha256 !== RANGE_SHA256 ||
    value.core?.geometry?.textureSourceBytes !== 749 ||
    value.core?.geometry?.textureDecodedBytes !== 16_384 ||
    value.core?.geometry?.textureGpuBytes !== 21_844 ||
    value.core?.renderer?.uploadedBytes !== 22_836 ||
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
    value.immutableFederatedSurfaceV02?.jpegBackported !== false ||
    Object.keys(value.assertions ?? {}).length === 0 ||
    Object.values(value.assertions).some((item) => item !== true) ||
    Object.values(value.held ?? {}).some((item) => item !== false) ||
    value.decision?.boundedBaselineJpegBaseColorTexture !==
      "passed-experimental" ||
    value.decision?.federatedSurfaceV02 !== "not-backported" ||
    value.decision?.productionClaims !== false
  ) {
    throw new Error("glTF JPEG texture product evidence is invalid");
  }
  const serialized = JSON.stringify(value);
  if (
    serialized.includes("/Users/") ||
    serialized.includes("/Volumes/") ||
    serialized.includes("file://")
  ) {
    throw new Error("glTF JPEG texture evidence contains a local path");
  }
  return Object.freeze({
    status: "passed-darwin-arm64-apple-metal-jpeg-texture",
    surfaces: 3,
    sourceBytes: 4_274,
    decodedTextureBytes: 16_384,
    gpuTextureBytes: 21_844,
    gpuUploadBytes: 22_836,
  });
}

export async function qualifyGltfJpegTextureProducts({
  output = OUTPUT,
  write = false,
} = {}) {
  const manifest = await loadPublicGltfJpegTextureBundleManifest();
  const acquired = await acquirePublicGltfJpegTextureBundle();
  let core;
  try {
    core = await qualifyGltfTextureCore(acquired, manifest);
  } finally {
    acquired.document.bytes.fill(0);
    for (const resource of acquired.resources) {
      resource.bytes.fill(0);
    }
  }
  const vscodeRuntime = await resolveVscodeQualificationRuntime();
  const browser = await qualifyBimProductShell({
    fixture: "gltf-jpeg-texture-public",
    rendererMode: "physical",
  });
  const staged = await qualifyVscodeCustomEditor({
    externalResourceManifestPath:
      PUBLIC_GLTF_JPEG_TEXTURE_BUNDLE_MANIFEST,
    includeExternalResourceFixture: true,
    rendererMode: "physical",
    vscodeRuntime,
  });
  const installed = await qualifyVscodeVsixInstall({
    externalResourceManifestPath:
      PUBLIC_GLTF_JPEG_TEXTURE_BUNDLE_MANIFEST,
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
      derivedCacheOnly: true,
      artifactsTracked: false,
      releaseBundled: false,
    },
  };
  const browserSurface = surface(
    browser.observation,
    browser.fixture,
    browser.observation.network.externalOrigins,
  );
  const stagedSurface = surface(
    staged.externalReferenceObservation,
    staged.externalReferenceFixture,
  );
  const installedRuntime =
    installed.observation.externalReferenceRuntime;
  const installedSurface = surface(
    installedRuntime,
    installedRuntime.fixture,
  );
  const evidence = {
    schema:
      "bim-explorer-gltf-jpeg-texture-products-qualification/1",
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
      browser: browserSurface,
      stagedVscode: stagedSurface,
      installedVsix: installedSurface,
    },
    package: installed.package,
    immutableFederatedSurfaceV02: {
      byteLength: immutableBytes.byteLength,
      sha256: sha256(immutableBytes),
      jpegBackported: false,
    },
    assertions: {
      officialValidatorZeroIssues:
        Object.values(core.validator.issues).every(
          (item) => item === 0 || item === false,
        ),
      exactPublicInputs:
        manifest.resources[1].sha256 ===
          "6074b0780e45a9c32a727e29aed7d45413cdd807d3157ea9413fd828ac0676b1",
      exactReproducibleDerivation:
        manifest.document.sha256 ===
          "2abddfe7399b2ee9c8b911c1f6b2ba82a2af0c7df31b256fa2082333a6b41155",
      exactCoreProjection:
        core.source.fingerprint === FINGERPRINT &&
        core.geometry.rangeSha256 === RANGE_SHA256 &&
        core.renderer.uploadedBytes === 22_836,
      independentJpegValidation:
        core.source.appearance.imageMediaTypes[0] === "image/jpeg" &&
        core.geometry.mediaType ===
          "application/vnd.bim-explorer.geometry-range.v3",
      exactThreeSurfaceProjection: [
        browserSurface,
        stagedSurface,
        installedSurface,
      ].every((value) => exactSurface(value, value.hostKind)),
      physicalAppleMetal: [
        browserSurface.gpu,
        stagedSurface.gpu,
        installedSurface.gpu,
      ].every(physicalAppleMetal),
      localOnly:
        browserSurface.externalOrigins.length === 0 &&
        stagedSurface.externalUpload === false &&
        installedSurface.externalUpload === false,
      deterministicCleanup:
        core.cleanup.activeBackendBytes === 0 &&
        [
          browserSurface,
          stagedSurface,
          installedSurface,
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
          browserSurface,
          stagedSurface,
          installedSurface,
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
      progressiveJpeg: false,
      alphaModes: false,
      otherMaterialTextures: false,
      textureTransform: false,
      federatedSurfaceV02: false,
      crossPlatformPhysicalGpu: false,
      productionSupport: false,
    },
    decision: {
      boundedBaselineJpegBaseColorTexture: "passed-experimental",
      federatedSurfaceV02: "not-backported",
      productionClaims: false,
    },
  };
  immutableBytes.fill(0);
  validateGltfJpegTextureProductsQualification(evidence);
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
  const unknown = process.argv.slice(2).filter(
    (value) => value !== "--write",
  );
  if (unknown.length > 0) {
    throw new TypeError(
      "usage: node scripts/qualify-gltf-jpeg-texture-products.mjs " +
        "[--write]",
    );
  }
  const evidence = await qualifyGltfJpegTextureProducts({ write });
  process.stdout.write(`${JSON.stringify({
    schema: evidence.schema,
    capturedAt: evidence.capturedAt,
    fixture: evidence.fixture.id,
    surfaces: Object.keys(evidence.surfaces),
    assertions: evidence.assertions,
    decision: evidence.decision,
  }, null, 2)}\n`);
}
