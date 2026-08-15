import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  loadPublicGltfResourceBundleManifest,
} from "./public-gltf-resource-bundle-fixture.mjs";
import {
  resolveVscodeQualificationRuntime,
} from "./vscode-qualification-runtime.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const GLTF_RESOURCE_BUNDLE_PRODUCTS_EVIDENCE_PATH =
  "compatibility/evidence/" +
  "gltf-reference-source-external-resource-products-" +
  "darwin-arm64-2026-08-11.json";
const OUTPUT = path.join(
  ROOT,
  GLTF_RESOURCE_BUNDLE_PRODUCTS_EVIDENCE_PATH,
);
const FINGERPRINT =
  "sha256:9da0e06d14a1c601099f04c4756c50c6" +
  "28665b22fb14641c150f4ba72e487549";
const MODEL = Object.freeze({
  entities: 1,
  geometryRecords: 1,
  instances: 1,
  triangles: 12,
  ranges: 1,
});
const RESOURCE_BUNDLE = Object.freeze({
  schema: "bim-explorer-gltf-local-resource-bundle/0.1",
  documentBytes: 2_898,
  externalResourceBytes: 648,
  externalResources: 1,
  networkAtRuntime: false,
});

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
    JSON.stringify(value.model) === JSON.stringify(MODEL) &&
    value.resources?.sourceBytes === 3_546 &&
    value.resources?.documentBytes === 2_898 &&
    value.resources?.externalResourceBytes === 648 &&
    value.resources?.externalResources === 1 &&
    value.resources?.geometryBytes === 756 &&
    value.resources?.detailBytes === 0 &&
    value.resources?.detailRanges === 0 &&
    value.resources?.ranges === 1 &&
    value.resources?.products === 0 &&
    value.resources?.referenceEntities === 1 &&
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
      "khronos-gltf-sample-assets-box-external-buffer" &&
    value.committed === false &&
    value.format === "gltf" &&
    value.sourceBytes === 3_546 &&
    value.fingerprint === FINGERPRINT &&
    value.gltfVersion === "2.0" &&
    value.nativeId === "node:1/mesh:0/primitive:0" &&
    JSON.stringify(value.resourceBundle) ===
      JSON.stringify(RESOURCE_BUNDLE) &&
    value.provenance?.repository ===
      "https://github.com/KhronosGroup/glTF-Sample-Assets" &&
    value.provenance?.commit ===
      "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf" &&
    value.provenance?.license === "CC-BY-4.0" &&
    value.provenance?.bundled === false
  );
}

export function validateGltfResourceBundleProductsQualification(value) {
  if (
    value?.schema !==
      "bim-explorer-gltf-resource-bundle-products-qualification/1" ||
    value.environment?.platform !== "darwin-arm64" ||
    value.environment?.rendererMode !== "physical" ||
    value.environment?.softwareFallback !== false ||
    !exactFixture(value.fixture) ||
    !exactSurface(value.surfaces?.browser, "browser") ||
    !exactSurface(
      value.surfaces?.stagedVscode,
      "vscode-webview",
    ) ||
    !exactSurface(
      value.surfaces?.installedVsix,
      "vscode-webview",
    ) ||
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
    !/^[0-9a-f]{64}$/u.test(
      value.package?.workerBundleSha256 ?? "",
    ) ||
    !everyTrue(value.assertions) ||
    value.held?.arbitraryUri !== false ||
    value.held?.networkFetch !== false ||
    value.held?.externalImages !== false ||
    value.held?.requiredExtensions !== false ||
    value.held?.federatedSurfaceV02 !== false ||
    value.held?.crossPlatformPhysicalGpu !== false ||
    value.held?.productionSupport !== false ||
    value.decision?.localExternalBufferBundle !==
      "passed-experimental" ||
    value.decision?.federatedSurfaceV02 !== "not-backported" ||
    value.decision?.productionClaims !== false
  ) {
    throw new Error(
      "glTF resource bundle product evidence is invalid",
    );
  }
  const serialized = JSON.stringify(value);
  if (
    serialized.includes("/Users/") ||
    serialized.includes("/Volumes/") ||
    serialized.includes("file://")
  ) {
    throw new Error(
      "glTF resource bundle product evidence contains a local path",
    );
  }
  return Object.freeze({
    status: "passed-darwin-arm64-apple-metal-local-bundle",
    surfaces: 3,
    sourceBytes: 3_546,
    externalResources: 1,
  });
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

export async function qualifyGltfResourceBundleProducts({
  output = OUTPUT,
  write = false,
} = {}) {
  const manifest = await loadPublicGltfResourceBundleManifest();
  const vscodeRuntime = await resolveVscodeQualificationRuntime();
  const browser = await qualifyBimProductShell({
    fixture: "gltf-external-public",
    rendererMode: "physical",
  });
  const staged = await qualifyVscodeCustomEditor({
    includeExternalResourceFixture: true,
    rendererMode: "physical",
    vscodeRuntime,
  });
  const installed = await qualifyVscodeVsixInstall({
    includeExternalResourceFixture: true,
    includePublicFixture: false,
    rendererMode: "physical",
    vscodeRuntime,
  });
  const fixture = {
    ...browser.fixture,
    manifest: {
      documentSha256: manifest.document.sha256,
      resourceSha256: manifest.resources[0].sha256,
      artifactsTracked: false,
      releaseBundled: false,
      sampleRedistributed: false,
    },
  };
  const evidence = {
    schema:
      "bim-explorer-gltf-resource-bundle-products-qualification/1",
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
        staged.externalReferenceObservation,
        staged.externalReferenceFixture,
      ),
      installedVsix: surface(
        installed.observation.externalReferenceRuntime,
        installed.observation.externalReferenceRuntime.fixture,
      ),
    },
    package: installed.package,
    assertions: {
      exactPublicBytes:
        manifest.document.sha256 ===
          "4a0d69eecfce0672a50b71dc218cbacec6c53fe2445040c235c6314b1b2c41b9" &&
        manifest.resources[0].sha256 ===
          "3266a8e39b9f425b3341cbe5eec7849f44310256bfa651e6b8b40c85ce0ccafb",
      exactCompositeIdentity:
        [
          browser.fixture.fingerprint,
          staged.externalReferenceFixture.fingerprint,
          installed.observation.externalReferenceRuntime.fixture
            .fingerprint,
        ].every((fingerprint) => fingerprint === FINGERPRINT),
      exactThreeSurfaceProjection:
        [
          browser.observation,
          staged.externalReferenceObservation,
          installed.observation.externalReferenceRuntime,
        ].every((value) =>
          JSON.stringify(value.model) === JSON.stringify(MODEL) &&
          value.resources.sourceBytes === 3_546 &&
          value.resources.documentBytes === 2_898 &&
          value.resources.externalResourceBytes === 648 &&
          value.resources.externalResources === 1 &&
          value.renderer.sourceReadBytes === 756 &&
          value.renderer.uploadedBytes === 800),
      physicalAppleMetal:
        [
          browser.observation.gpu,
          staged.externalReferenceObservation.gpu,
          installed.observation.externalReferenceRuntime.gpu,
        ].every(physicalAppleMetal),
      localOnly:
        browser.observation.network.externalOrigins.length === 0 &&
        staged.externalReferenceObservation.externalUpload === false &&
        staged.externalReferenceObservation.telemetry === false &&
        installed.observation.externalReferenceRuntime.externalUpload ===
          false &&
        installed.observation.externalReferenceRuntime.telemetry === false,
      deterministicCleanup:
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
        browser.assertions.fixtureIdentity === true &&
        staged.externalReferenceAssertions
          ?.externalReferenceHasNoBimAuthority === true &&
        installed.assertions
          .installedPackageOpensExternalReference === true &&
        [
          browser.observation,
          staged.externalReferenceObservation,
          installed.observation.externalReferenceRuntime,
        ].every((value) =>
          value.reference?.globalId === null),
      sampleCacheOnly:
        manifest.tracking.artifactsTracked === false &&
        manifest.tracking.releaseBundled === false &&
        manifest.tracking.networkAtRuntime === false,
    },
    held: {
      arbitraryUri: false,
      networkFetch: false,
      externalImages: false,
      requiredExtensions: false,
      federatedSurfaceV02: false,
      crossPlatformPhysicalGpu: false,
      productionSupport: false,
    },
    decision: {
      localExternalBufferBundle: "passed-experimental",
      requiredExtensions: "held",
      federatedSurfaceV02: "not-backported",
      productionClaims: false,
    },
  };
  validateGltfResourceBundleProductsQualification(evidence);
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
      "usage: node scripts/qualify-gltf-resource-bundle-products.mjs " +
      "[--write]",
    );
  }
  const evidence = await qualifyGltfResourceBundleProducts({ write });
  process.stdout.write(`${JSON.stringify({
    schema: evidence.schema,
    capturedAt: evidence.capturedAt,
    fixture: evidence.fixture.id,
    surfaces: Object.keys(evidence.surfaces),
    assertions: evidence.assertions,
    decision: evidence.decision,
  }, null, 2)}\n`);
}
