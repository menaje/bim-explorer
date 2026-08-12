import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  acquirePublicGltfBufferViewTextureBundle,
  loadPublicGltfBufferViewTextureBundleManifest,
  PUBLIC_GLTF_BUFFER_VIEW_TEXTURE_BUNDLE_MANIFEST,
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
export const GLTF_BUFFER_VIEW_TEXTURE_PRODUCTS_EVIDENCE_PATH =
  "compatibility/evidence/" +
  "gltf-reference-source-external-buffer-view-texture-products-" +
  "darwin-arm64-2026-08-11.json";
const OUTPUT = path.join(
  ROOT,
  GLTF_BUFFER_VIEW_TEXTURE_PRODUCTS_EVIDENCE_PATH,
);
const FINGERPRINT =
  "sha256:aa95f4e57e2bc0cbd196c460e87081a60d92025629e9dcb164056c7e1aefd945";
const RANGE_SHA256 =
  "ce04af8c146d03daf9e08e5b26f54e2f44fbe5a5203df50f0d642e459509a3cd";
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
    value.resources?.sourceBytes === 7_306 &&
    value.resources?.documentBytes === 2_714 &&
    value.resources?.externalResourceBytes === 4_592 &&
    value.resources?.externalResources === 1 &&
    value.resources?.externalBufferResources === 1 &&
    value.resources?.externalBufferViewImageResources === 1 &&
    value.resources?.embeddedImageBytes === 3_750 &&
    value.resources?.embeddedImageResources === 1 &&
    value.resources?.geometryBytes === 4_756 &&
    value.resources?.textureSourceBytes === 3_750 &&
    value.resources?.textureDecodedBytes === 262_144 &&
    value.resources?.textures === 1 &&
    value.renderer?.actualGpu === true &&
    value.renderer?.nonBackgroundPixels > 0 &&
    value.renderer?.sourceReadBytes === 4_756 &&
    value.renderer?.uploadedBytes === 350_516 &&
    value.renderer?.textureSourceBytes === 3_750 &&
    value.renderer?.textureDecodedBytes === 262_144 &&
    value.renderer?.textureGpuBytes === 349_524 &&
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

export function validateGltfBufferViewTextureProductsQualification(
  value,
) {
  if (
    value?.schema !==
      "bim-explorer-gltf-external-buffer-view-texture-products-" +
        "qualification/1" ||
    value.environment?.platform !== "darwin-arm64" ||
    value.environment?.rendererMode !== "physical" ||
    value.environment?.softwareFallback !== false ||
    value.fixture?.id !==
      "khronos-gltf-sample-assets-box-textured-derived-" +
        "external-buffer-view-png" ||
    value.fixture?.fingerprint !== FINGERPRINT ||
    value.fixture?.committed !== false ||
    value.fixture?.releaseBundled !== false ||
    value.fixture?.sampleRedistributed !== false ||
    value.core?.validator?.issues?.errors !== 0 ||
    value.core?.validator?.issues?.warnings !== 0 ||
    value.core?.validator?.issues?.infos !== 0 ||
    value.core?.validator?.issues?.hints !== 0 ||
    value.core?.source?.fingerprint !== FINGERPRINT ||
    value.core?.source?.resourceBundle
      ?.externalBufferViewImageResources !== 1 ||
    value.core?.source?.resourceBundle?.embeddedImageBytes !== 3_750 ||
    value.core?.source?.resourceBundle?.embeddedImageResources !== 1 ||
    !same(
      value.core?.source?.appearance?.imageStorageProfiles,
      ["gltf-external-buffer-view"],
    ) ||
    value.core?.geometry?.mediaType !==
      "application/vnd.bim-explorer.geometry-range.v2" ||
    value.core?.geometry?.rangeBytes !== 4_756 ||
    value.core?.geometry?.rangeSha256 !== RANGE_SHA256 ||
    value.core?.geometry?.textureSourceBytes !== 3_750 ||
    value.core?.geometry?.textureDecodedBytes !== 262_144 ||
    value.core?.geometry?.textureGpuBytes !== 349_524 ||
    value.core?.renderer?.uploadedBytes !== 350_516 ||
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
    value.immutableFederatedSurfaceV02
      ?.externalBufferViewTextureBackported !== false ||
    Object.keys(value.assertions ?? {}).length === 0 ||
    Object.values(value.assertions).some((item) => item !== true) ||
    Object.values(value.held ?? {}).some((item) => item !== false) ||
    value.decision?.boundedExternalBufferViewPngBaseColorTexture !==
      "passed-experimental" ||
    value.decision?.federatedSurfaceV02 !== "not-backported" ||
    value.decision?.productionClaims !== false
  ) {
    throw new Error(
      "glTF external-buffer bufferView texture product evidence is invalid",
    );
  }
  const serialized = JSON.stringify(value);
  if (
    serialized.includes("/Users/") ||
    serialized.includes("/Volumes/") ||
    serialized.includes("file://")
  ) {
    throw new Error(
      "glTF external-buffer bufferView texture evidence contains a local path",
    );
  }
  return Object.freeze({
    status:
      "passed-darwin-arm64-apple-metal-external-buffer-view-texture",
    surfaces: 3,
    sourceBytes: 7_306,
    decodedTextureBytes: 262_144,
    gpuTextureBytes: 349_524,
    gpuUploadBytes: 350_516,
  });
}

export async function qualifyGltfBufferViewTextureProducts({
  output = OUTPUT,
  write = false,
} = {}) {
  const manifest =
    await loadPublicGltfBufferViewTextureBundleManifest();
  const acquired = await acquirePublicGltfBufferViewTextureBundle();
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
    fixture: "gltf-buffer-view-texture-public",
    rendererMode: "physical",
  });
  const staged = await qualifyVscodeCustomEditor({
    externalResourceManifestPath:
      PUBLIC_GLTF_BUFFER_VIEW_TEXTURE_BUNDLE_MANIFEST,
    includeExternalResourceFixture: true,
    rendererMode: "physical",
    vscodeRuntime,
  });
  const installed = await qualifyVscodeVsixInstall({
    externalResourceManifestPath:
      PUBLIC_GLTF_BUFFER_VIEW_TEXTURE_BUNDLE_MANIFEST,
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
      sourceSha256: manifest.derivation.sourceEntry.sha256,
      documentSha256: manifest.document.sha256,
      resourceSha256: manifest.resources[0].sha256,
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
      "bim-explorer-gltf-external-buffer-view-texture-products-" +
      "qualification/1",
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
      externalBufferViewTextureBackported: false,
    },
    assertions: {
      officialValidatorZeroIssues:
        Object.values(core.validator.issues).every(
          (item) => item === 0 || item === false,
        ),
      exactPublicInput:
        manifest.derivation.sourceEntry.sha256 ===
          "b510eca2e2ef33f62f9ed57d6e7ce2d10ebb2bdebc4a8e59d347719ba81abdf4",
      exactReproducibleDerivation:
        manifest.document.sha256 ===
          "a74967a0dc458b389688e08376aa58b646eab0c84d6ca31e1aee259d454d1b1e" &&
        manifest.resources[0].sha256 ===
          "63020f9126359bdecef03f990049a3781917670029bf9c0ea6bf4077dc473e8d",
      exactCoreProjection:
        core.source.fingerprint === FINGERPRINT &&
        core.geometry.rangeSha256 === RANGE_SHA256 &&
        core.renderer.uploadedBytes === 350_516,
      exactExternalBufferViewProjection:
        core.source.resourceBundle.externalResources === 1 &&
        core.source.resourceBundle.externalBufferResources === 1 &&
        core.source.resourceBundle
          .externalBufferViewImageResources === 1 &&
        core.source.resourceBundle.embeddedImageBytes === 3_750 &&
        same(
          core.source.appearance.imageStorageProfiles,
          ["gltf-external-buffer-view"],
        ),
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
      dataUriBufferImage: false,
      arbitraryUri: false,
      alphaModes: false,
      otherMaterialTextures: false,
      textureTransform: false,
      federatedSurfaceV02: false,
      crossPlatformPhysicalGpu: false,
      productionSupport: false,
    },
    decision: {
      boundedExternalBufferViewPngBaseColorTexture:
        "passed-experimental",
      federatedSurfaceV02: "not-backported",
      productionClaims: false,
    },
  };
  immutableBytes.fill(0);
  validateGltfBufferViewTextureProductsQualification(evidence);
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
      "usage: node " +
      "scripts/qualify-gltf-buffer-view-texture-products.mjs " +
      "[--write]",
    );
  }
  const evidence = await qualifyGltfBufferViewTextureProducts({
    write,
  });
  process.stdout.write(`${JSON.stringify({
    schema: evidence.schema,
    capturedAt: evidence.capturedAt,
    fixture: evidence.fixture.id,
    surfaces: Object.keys(evidence.surfaces),
    assertions: evidence.assertions,
    decision: evidence.decision,
  }, null, 2)}\n`);
}
