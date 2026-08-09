import { createHash } from "node:crypto";

import {
  canonicalJson,
} from "../packages/ifc-engine-contract/src/index.mjs";
import {
  isEvidenceTimestampAtOrAfter,
} from "./evidence-timestamp.mjs";

export const GLTF_PRODUCT_PLATFORM_MATRIX_SCHEMA =
  "bim-explorer-gltf-product-platform-matrix/1";
export const GLTF_PRODUCT_QUALIFICATION_SCHEMA =
  "bim-explorer-gltf-product-surfaces-qualification/2";

const FIXTURE_ID = "khronos-gltf-sample-assets-box-glb";
const FIXTURE_FINGERPRINT =
  "sha256:ed52f7192b8311d700ac0ce80644e385" +
  "2cd01537e4d62241b9acba023da3d54e";
const NATIVE_ID = "node:1/mesh:0/primitive:0";
const MODEL = Object.freeze({
  entities: 1,
  geometryRecords: 1,
  instances: 1,
  triangles: 12,
  ranges: 1,
});
const COMMON_RESOURCES = Object.freeze({
  sourceBytes: 1_664,
  geometryBytes: 756,
  metadataBytes: 1_093,
  detailBytes: 0,
  detailRanges: 0,
  largestDetailRangeBytes: 0,
  ranges: 1,
  products: 0,
  referenceEntities: 1,
  wasmHeapCapacityBytes: null,
});
const BROWSER_RESOURCES = Object.freeze({
  ...COMMON_RESOURCES,
  propertyDetailBytes: 0,
  propertyDetailRanges: 0,
});
const ASSERTION_NAMES = Object.freeze([
  "browser",
  "vscode",
  "cleanInstall",
  "sameFixtureIdentity",
  "localOnly",
  "physicalGpuNotClaimed",
]);

function plainRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function exactReferenceFixture(value, { cacheHit }) {
  return (
    value?.id === FIXTURE_ID &&
    value?.committed === false &&
    value?.format === "glb" &&
    value?.sourceBytes === 1_664 &&
    value?.fingerprint === FIXTURE_FINGERPRINT &&
    value?.gltfVersion === "2.0" &&
    value?.nativeId === NATIVE_ID &&
    value?.provenance?.repository ===
      "https://github.com/KhronosGroup/glTF-Sample-Assets" &&
    value?.provenance?.commit ===
      "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf" &&
    value?.provenance?.license === "CC-BY-4.0" &&
    value?.provenance?.bundled === false &&
    (
      cacheHit === "required"
        ? typeof value.provenance.cacheHit === "boolean"
        : value.provenance.cacheHit === undefined
    )
  );
}

function exactSurface(value, { browser }) {
  const expectedResources = browser
    ? BROWSER_RESOURCES
    : COMMON_RESOURCES;
  const common =
    sameJson(value?.model, MODEL) &&
    sameJson(value?.resources, expectedResources) &&
    value?.renderer?.actualGpu === true &&
    value.renderer.nonBackgroundPixels > 0 &&
    value.renderer.sourceReadBytes === 756 &&
    value.renderer.uploadedBytes === 800 &&
    value?.reference?.globalId === null &&
    value.reference.selectedNativeId === NATIVE_ID &&
    value.reference.treeRows === 1 &&
    value.reference.maximumDomRows === 64 &&
    value?.lifecycle?.opened === "ready" &&
    value.lifecycle.closed === "disposed";
  if (!common) {
    return false;
  }
  return browser
    ? (
        value.hostKind === "browser" &&
        value.lifecycle.backendDisposed === true &&
        value.lifecycle.clientDisposed === true &&
        sameJson(value.externalOrigins, []) &&
        sameJson(value.runtimeErrors, [])
      )
    : (
        value.hostKind === "vscode-webview" &&
        value.externalUpload === false &&
        value.telemetry === false
      );
}

function exactAssertions(value) {
  return (
    sameJson(Object.keys(value ?? {}), ASSERTION_NAMES) &&
    Object.values(value).every((item) => item === true)
  );
}

function normalizedFixture(value) {
  const fixture = structuredClone(value);
  delete fixture.provenance.cacheHit;
  return fixture;
}

function normalizedSurface(value) {
  const surface = structuredClone(value);
  delete surface.evidence;
  return surface;
}

function platformEntry(receipt) {
  return Object.freeze({
    capturedAt: receipt.capturedAt,
    environment: receipt.environment,
    fixtureCacheHit:
      receipt.fixture.provenance.cacheHit,
    fixture: normalizedFixture(receipt.fixture),
    browser: normalizedSurface(receipt.browser),
    vscode: normalizedSurface(receipt.vscode),
    vscodeInstall:
      normalizedSurface(receipt.vscodeInstall),
    assertions: receipt.assertions,
  });
}

function portableProjection(entry) {
  return Object.freeze({
    fixture: entry.fixture,
    browser: entry.browser,
    vscode: entry.vscode,
    vscodeInstall: entry.vscodeInstall,
  });
}

function validatePlatformEntry(entry, expectedPlatform) {
  plainRecord(entry, `${expectedPlatform} platform evidence`);
  const environment = entry.environment;
  if (
    !isEvidenceTimestampAtOrAfter(
      entry.capturedAt,
      "2026-08-08",
    ) ||
    environment?.platform !== expectedPlatform ||
    !/^v24\.\d+\.\d+$/u.test(environment?.node ?? "") ||
    !/^Google Chrome \d+\.\d+\.\d+\.\d+$/u.test(
      environment?.browser ?? "",
    ) ||
    environment?.browserHeadless !== true ||
    environment?.vscode !== "1.131.0" ||
    !Number.isSafeInteger(
      environment?.vscodeDownloadAttempts,
    ) ||
    environment.vscodeDownloadAttempts < 1 ||
    environment.vscodeDownloadAttempts > 3 ||
    environment?.vscodeRuntimeSource !== "exact-download" ||
    environment?.vscodeRequestedVersion !== "1.131.0" ||
    environment?.physicalGpuClaimed !== false ||
    environment?.rendererQualification !==
      "SwiftShader WebGL2" ||
    typeof entry.fixtureCacheHit !== "boolean" ||
    !exactReferenceFixture(entry.fixture, {
      cacheHit: "forbidden",
    }) ||
    !exactSurface(entry.browser, { browser: true }) ||
    !exactReferenceFixture(entry.vscode?.fixture, {
      cacheHit: "forbidden",
    }) ||
    !exactSurface(entry.vscode, { browser: false }) ||
    entry.vscodeInstall?.package?.id !==
      "menaje.bim-explorer" ||
    entry.vscodeInstall.package.version !== "0.1.0" ||
    entry.vscodeInstall.package.byteLength <= 0 ||
    entry.vscodeInstall.package.installedRuntimeFiles !== 7 ||
    !/^[0-9a-f]{64}$/u.test(
      entry.vscodeInstall.package.workerBundleSha256 ?? "",
    ) ||
    !exactReferenceFixture(entry.vscodeInstall?.fixture, {
      cacheHit: "forbidden",
    }) ||
    !exactSurface(entry.vscodeInstall, {
      browser: false,
    }) ||
    !exactAssertions(entry.assertions)
  ) {
    throw new Error(
      `${expectedPlatform} glTF product evidence is incomplete`,
    );
  }
}

export function validateGltfProductQualification(
  receipt,
  expectedPlatform,
) {
  plainRecord(receipt, "glTF product qualification");
  if (
    receipt.schema !== GLTF_PRODUCT_QUALIFICATION_SCHEMA ||
    receipt.status !== "passed" ||
    !exactReferenceFixture(receipt.fixture, {
      cacheHit: "required",
    }) ||
    receipt.decision?.platformProductOpen !==
      "passed-experimental" ||
    receipt.decision?.actualPhysicalGpu !== "not-claimed" ||
    receipt.decision?.productScaleReference !== "held" ||
    receipt.decision?.productionClaims !== false
  ) {
    throw new Error("glTF product qualification is invalid");
  }
  const entry = platformEntry(receipt);
  validatePlatformEntry(entry, expectedPlatform);
  return entry;
}

export function assembleGltfProductPlatformMatrix({
  commit,
  linux,
  macos,
  runId,
}) {
  if (
    !Number.isSafeInteger(runId) ||
    runId <= 0 ||
    !/^[0-9a-f]{40}$/u.test(commit)
  ) {
    throw new TypeError("CI run identity is invalid");
  }
  const platforms = [
    validateGltfProductQualification(
      macos,
      "darwin-arm64",
    ),
    validateGltfProductQualification(
      linux,
      "linux-x64",
    ),
  ];
  const projections = platforms.map(portableProjection);
  if (!sameJson(projections[0], projections[1])) {
    throw new Error(
      "macOS and Linux product observations differ",
    );
  }
  const projectionSha256 = createHash("sha256")
    .update(canonicalJson(projections[0]))
    .digest("hex");
  return Object.freeze({
    schema: GLTF_PRODUCT_PLATFORM_MATRIX_SCHEMA,
    status: "experimental",
    source: {
      repository: "menaje/bim-explorer",
      workflow: "CI",
      runId,
      runUrl:
        `https://github.com/menaje/bim-explorer/actions/runs/${runId}`,
      commit,
    },
    platforms,
    crossPlatform: {
      requiredPlatforms: [
        "darwin-arm64",
        "linux-x64",
      ],
      productSurfaces: [
        "browser-local-file",
        "staged-vscode-custom-editor",
        "clean-installed-vsix",
      ],
      portableProjection: [
        "fixture",
        "browser",
        "vscode",
        "vscodeInstall",
      ],
      portableProjectionIdentical: true,
      portableProjectionSha256: projectionSha256,
    },
    decision: {
      macosProductSurfaces: "passed-experimental",
      linuxProductSurfaces: "passed-experimental",
      crossPlatformGltfProductOpen: "passed-experimental",
      actualPhysicalGpu: "blocked",
      productScaleReference: "blocked",
      productionClaims: false,
    },
    limits: [
      "Both runners use software WebGL2 through SwiftShader; physical GPU hardware is not qualified.",
      "The Khronos Box GLB is a 1664-byte core-profile reference fixture, not product-scale geometry.",
      "The matrix covers local Browser, staged VS Code and clean-installed VSIX read-only opens only.",
      "External resources, required extensions, BIM semantic authority, write and round-trip remain blocked.",
    ],
  });
}

export function validateGltfProductPlatformMatrix(
  matrix,
  { commit, runId },
) {
  plainRecord(matrix, "glTF product platform matrix");
  if (
    matrix.schema !== GLTF_PRODUCT_PLATFORM_MATRIX_SCHEMA ||
    matrix.status !== "experimental" ||
    matrix.source?.repository !== "menaje/bim-explorer" ||
    matrix.source?.workflow !== "CI" ||
    matrix.source?.runId !== runId ||
    matrix.source?.runUrl !==
      `https://github.com/menaje/bim-explorer/actions/runs/${runId}` ||
    matrix.source?.commit !== commit ||
    !Array.isArray(matrix.platforms) ||
    matrix.platforms.length !== 2
  ) {
    throw new Error("glTF product platform identity differs");
  }
  const expectedPlatforms = [
    "darwin-arm64",
    "linux-x64",
  ];
  for (let index = 0; index < expectedPlatforms.length; index += 1) {
    validatePlatformEntry(
      matrix.platforms[index],
      expectedPlatforms[index],
    );
  }
  const projections = matrix.platforms.map(portableProjection);
  const projectionSha256 = createHash("sha256")
    .update(canonicalJson(projections[0]))
    .digest("hex");
  if (
    !sameJson(projections[0], projections[1]) ||
    !sameJson(
      matrix.crossPlatform?.requiredPlatforms,
      expectedPlatforms,
    ) ||
    !sameJson(matrix.crossPlatform?.productSurfaces, [
      "browser-local-file",
      "staged-vscode-custom-editor",
      "clean-installed-vsix",
    ]) ||
    !sameJson(matrix.crossPlatform?.portableProjection, [
      "fixture",
      "browser",
      "vscode",
      "vscodeInstall",
    ]) ||
    matrix.crossPlatform?.portableProjectionIdentical !== true ||
    matrix.crossPlatform?.portableProjectionSha256 !==
      projectionSha256 ||
    matrix.decision?.macosProductSurfaces !==
      "passed-experimental" ||
    matrix.decision?.linuxProductSurfaces !==
      "passed-experimental" ||
    matrix.decision?.crossPlatformGltfProductOpen !==
      "passed-experimental" ||
    matrix.decision?.actualPhysicalGpu !== "blocked" ||
    matrix.decision?.productScaleReference !== "blocked" ||
    matrix.decision?.productionClaims !== false ||
    !Array.isArray(matrix.limits) ||
    matrix.limits.length !== 4 ||
    /(?:\/Users\/|\/Volumes\/|\/home\/runner\/|[A-Z]:\\)/u.test(
      JSON.stringify(matrix),
    )
  ) {
    throw new Error(
      "glTF product cross-platform evidence is incomplete or overclaims",
    );
  }
  return Object.freeze({
    passedPlatforms: expectedPlatforms.length,
    productSurfaces:
      matrix.crossPlatform.productSurfaces.length,
    projectionSha256,
    status: matrix.status,
  });
}
