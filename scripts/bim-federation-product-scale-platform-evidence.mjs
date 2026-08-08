import { createHash } from "node:crypto";

import {
  canonicalJson,
} from "../packages/ifc-engine-contract/src/index.mjs";

export const BIM_FEDERATION_PRODUCT_SCALE_PLATFORM_MATRIX_SCHEMA =
  "bim-explorer-federation-product-scale-platform-matrix/1";

const EXPECTED_PLATFORMS = Object.freeze([
  "darwin-arm64",
  "linux-x64",
]);
const PORTABLE_PROJECTION = Object.freeze([
  "contract",
  "fixture",
  "federation",
  "expected",
  "headless-renderer-range-cleanup-and-budgets",
  "browser-render-range-cleanup-and-local-only-runtime",
  "source-cleanup",
  "assertions",
  "decision",
  "limitations",
]);
const DECISION = Object.freeze({
  macosProductScaleFederation: "passed-experimental",
  linuxProductScaleFederation: "passed-experimental",
  crossPlatformProductScaleFederation: "passed-experimental",
  physicalGpu: "not-claimed",
  surveyedDatumTransformation: "not-claimed",
  actualSpatialConsumer: "not-qualified-by-this-evidence",
  actualMultiFormatUserDemand: "not-qualified-by-this-evidence",
  productionClaims: false,
});
const LIMITATIONS = Object.freeze([
  "the two IFC sources are generated qualification fixtures, while A Beautiful Game is product-scale reference geometry and not a BIM semantic model",
  "the matrix compares macOS arm64 and Linux x64 CI observations through the same portable projection",
  "platform-specific resident memory and elapsed time are retained as bounded observations and excluded from projection equality",
  "SwiftShader proves the Browser WebGL2 API path and makes no physical GPU claim",
  "this evidence does not establish actual Coni Spatial consumer conformance, customer-model demand or surveyed datum transformation",
  "native mutation, write, round-trip and production federation claims remain blocked",
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

function portableProjection(observation) {
  const projection = structuredClone(observation);
  delete projection.browser.environment.browser;
  delete projection.browser.environment.platform;
  projection.headless.memory = {
    budgetBytes: projection.headless.memory.budgetBytes,
  };
  projection.headless.performance = {
    limits: projection.headless.performance.limits,
  };
  return projection;
}

function validatePlatformObservation(
  observation,
  expectedPlatform,
  validateObservation,
) {
  plainRecord(observation, `${expectedPlatform} federation observation`);
  validateObservation(observation);
  const environment = observation.browser?.environment;
  if (
    environment?.platform !== expectedPlatform ||
    !/^Google Chrome \d+\.\d+\.\d+\.\d+$/u.test(
      environment?.browser ?? "",
    ) ||
    environment?.headless !== true ||
    environment?.webgl2 !==
      "actual Browser API via SwiftShader" ||
    environment?.physicalGpuClaimed !== false
  ) {
    throw new Error(
      `${expectedPlatform} product-scale federation environment is invalid`,
    );
  }
}

function validateIdentity({ commit, runId, validateObservation }) {
  if (
    !Number.isSafeInteger(runId) ||
    runId <= 0 ||
    !/^[0-9a-f]{40}$/u.test(commit) ||
    typeof validateObservation !== "function"
  ) {
    throw new TypeError(
      "federation platform CI identity or validator is invalid",
    );
  }
}

export function assembleBimFederationProductScalePlatformMatrix({
  commit,
  linux,
  macos,
  runId,
  validateObservation,
}) {
  validateIdentity({ commit, runId, validateObservation });
  const platforms = [
    structuredClone(macos),
    structuredClone(linux),
  ];
  for (let index = 0; index < EXPECTED_PLATFORMS.length; index += 1) {
    validatePlatformObservation(
      platforms[index],
      EXPECTED_PLATFORMS[index],
      validateObservation,
    );
  }
  const projections = platforms.map(portableProjection);
  if (!sameJson(projections[0], projections[1])) {
    throw new Error(
      "macOS and Linux product-scale federation projections differ",
    );
  }
  const projectionSha256 = createHash("sha256")
    .update(canonicalJson(projections[0]))
    .digest("hex");
  return Object.freeze({
    schema: BIM_FEDERATION_PRODUCT_SCALE_PLATFORM_MATRIX_SCHEMA,
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
      requiredPlatforms: EXPECTED_PLATFORMS,
      fixtureId:
        "khronos-gltf-sample-assets-a-beautiful-game-glb",
      federationSources: 3,
      federationInstances: 53,
      portableProjection: PORTABLE_PROJECTION,
      portableProjectionIdentical: true,
      portableProjectionSha256: projectionSha256,
    },
    decision: DECISION,
    limitations: LIMITATIONS,
  });
}

export function validateBimFederationProductScalePlatformMatrix(
  matrix,
  { commit, runId, validateObservation },
) {
  validateIdentity({ commit, runId, validateObservation });
  plainRecord(matrix, "product-scale federation platform matrix");
  if (
    matrix.schema !==
      BIM_FEDERATION_PRODUCT_SCALE_PLATFORM_MATRIX_SCHEMA ||
    matrix.status !== "experimental" ||
    matrix.source?.repository !== "menaje/bim-explorer" ||
    matrix.source?.workflow !== "CI" ||
    matrix.source?.runId !== runId ||
    matrix.source?.runUrl !==
      `https://github.com/menaje/bim-explorer/actions/runs/${runId}` ||
    matrix.source?.commit !== commit ||
    !Array.isArray(matrix.platforms) ||
    matrix.platforms.length !== EXPECTED_PLATFORMS.length
  ) {
    throw new Error(
      "product-scale federation platform matrix identity differs",
    );
  }
  for (let index = 0; index < EXPECTED_PLATFORMS.length; index += 1) {
    validatePlatformObservation(
      matrix.platforms[index],
      EXPECTED_PLATFORMS[index],
      validateObservation,
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
      EXPECTED_PLATFORMS,
    ) ||
    matrix.crossPlatform?.fixtureId !==
      "khronos-gltf-sample-assets-a-beautiful-game-glb" ||
    matrix.crossPlatform?.federationSources !== 3 ||
    matrix.crossPlatform?.federationInstances !== 53 ||
    !sameJson(
      matrix.crossPlatform?.portableProjection,
      PORTABLE_PROJECTION,
    ) ||
    matrix.crossPlatform?.portableProjectionIdentical !== true ||
    matrix.crossPlatform?.portableProjectionSha256 !==
      projectionSha256 ||
    !sameJson(matrix.decision, DECISION) ||
    !sameJson(matrix.limitations, LIMITATIONS) ||
    /(?:\/Users\/|\/Volumes\/|\/home\/runner\/|[A-Z]:\\)/u.test(
      JSON.stringify(matrix),
    )
  ) {
    throw new Error(
      "product-scale federation cross-platform evidence is incomplete or overclaims",
    );
  }
  return Object.freeze({
    passedPlatforms: EXPECTED_PLATFORMS.length,
    federationSources: matrix.crossPlatform.federationSources,
    federationInstances: matrix.crossPlatform.federationInstances,
    projectionSha256,
    status: matrix.status,
  });
}
